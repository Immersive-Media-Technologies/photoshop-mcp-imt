// ExtendScript snippets that used to compare against names Photoshop localizes
// (layer, action set, font display names). They run here as plain JS against a
// fake Photoshop, with the names in several UI languages.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ recipeBody: '', script: '' as string, run: null as null | ((script: string) => unknown) }));

vi.mock('../src/tools/recipes/_shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/tools/recipes/_shared.js')>();
  return {
    ...actual,
    executeRecipe: async (_connection: unknown, _historyName: string, body: string) => {
      captured.recipeBody = body;
      return { content: [] };
    },
  };
});

vi.mock('../src/api/photoshop-api.js', () => ({
  PhotoshopAPIFactory: class {
    async createAPI() {
      return {
        executeScript: async (script: string) => {
          captured.script = script;
          return captured.run ? captured.run(script) : undefined;
        },
      };
    }
  },
}));

import { ExtendScriptSnippets, resolveFontPostScriptName } from '../src/api/extendscript.js';
import { bindRemoveBackground } from '../src/tools/recipes/remove-background.js';
import { createActionTools } from '../src/tools/action-tools.js';
import { enrichErrorResult } from '../src/errors/envelope.js';
import type { PhotoshopConnection } from '../src/platform/connection.js';

const connection = { ping: async () => true } as unknown as PhotoshopConnection;

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? '').join('');
}

describe('remove_background recipe: Background layer in any UI language', () => {
  // Default names Photoshop gives the background layer and the unlocked layer.
  const languages = [
    { lang: 'en', background: 'Background', unlocked: 'Layer 0' },
    { lang: 'ru', background: 'Фон', unlocked: 'Слой 0' },
    { lang: 'de', background: 'Hintergrund', unlocked: 'Ebene 0' },
    { lang: 'ja', background: '背景', unlocked: 'レイヤー 0' },
  ];

  async function runBody(background: string, unlocked: string) {
    await bindRemoveBackground(connection).handler({});
    const layer = { _bg: true, name: background, id: 1 } as { _bg: boolean; name: string; id: number; isBackgroundLayer: boolean };
    Object.defineProperty(layer, 'isBackgroundLayer', {
      get() {
        return this._bg;
      },
      set(value: boolean) {
        this._bg = value;
        if (!value) this.name = unlocked;
      },
    });
    const doc = { activeLayer: layer };
    const noop = () => undefined;
    class ActionDescriptor {
      putReference = noop;
      putBoolean = noop;
      putEnumerated = noop;
      putObject = noop;
      putInteger = noop;
      putDouble = noop;
    }
    class ActionReference {
      putEnumerated = noop;
    }
    const fn = new Function(
      'app',
      'DialogModes',
      'ActionDescriptor',
      'ActionReference',
      'executeAction',
      'executeActionGet',
      'stringIDToTypeID',
      'charIDToTypeID',
      captured.recipeBody
    );
    // Native Remove Background "succeeds" and leaves a mask: the first branch returns.
    return fn(
      { activeDocument: doc },
      { NO: 3 },
      ActionDescriptor,
      ActionReference,
      noop,
      () => ({ hasKey: () => true }),
      (s: string) => s,
      (s: string) => s
    ) as { ok: boolean; details: { layer_name: string; converted_background: boolean; method: string } };
  }

  it.each(languages)('renames the unlocked background to Subject ($lang)', async ({ background, unlocked }) => {
    const result = await runBody(background, unlocked);
    expect(result.ok).toBe(true);
    expect(result.details.method).toBe('remove_background');
    expect(result.details.converted_background).toBe(true);
    expect(result.details.layer_name).toBe('Subject');
  });

  it('does not compare layer names with English defaults', async () => {
    await bindRemoveBackground(connection).handler({});
    expect(captured.recipeBody).not.toMatch(/name\s*===?\s*'(Background|Layer 0)'/);
    expect(captured.recipeBody).not.toMatch(/previousName/);
  });
});

describe('font resolution prefers the PostScript name', () => {
  function resolve(fonts: Array<{ name: string; postScriptName: string } | 'broken'>, name: string) {
    const list = fonts.map((f) =>
      f === 'broken'
        ? {
            get postScriptName(): string {
              throw new Error('font is unavailable');
            },
            name: 'Broken',
          }
        : f
    );
    const fn = new Function('app', `${resolveFontPostScriptName}\nreturn resolveFontPostScriptName(${JSON.stringify(name)});`);
    return fn({ fonts: list }) as string | null;
  }

  // The display name of a CJK font depends on the UI language; the PostScript name does not.
  const kozuka = { name: '小塚ゴシック Pro R', postScriptName: 'KozGoPro-Regular' };

  it('an exact PostScript match wins over an earlier display-name match', () => {
    const fonts = [
      { name: 'Gothic', postScriptName: 'Other-Regular' },
      { name: 'Something else', postScriptName: 'Gothic' },
    ];
    expect(resolve(fonts, 'Gothic')).toBe('Gothic');
  });

  it('resolves a CJK font by its PostScript name whatever the UI shows', () => {
    expect(resolve(['broken', kozuka], 'KozGoPro-Regular')).toBe('KozGoPro-Regular');
  });

  it('keeps the display name as a fallback', () => {
    expect(resolve([kozuka], '小塚ゴシック Pro R')).toBe('KozGoPro-Regular');
    expect(resolve([{ name: 'Arial', postScriptName: 'ArialMT' }], 'Arial')).toBe('ArialMT');
    expect(resolve([kozuka], 'Kozuka Gothic Pro R')).toBeNull();
  });
});

describe('play_action: action set names are localized', () => {
  type ActionSet = { name: string; actions: string[] };
  // The set Photoshop ships, as a Russian UI shows it, plus one the user recorded.
  const russianSets: ActionSet[] = [
    { name: 'Операции по умолчанию', actions: ['Виньетка (выделенная область)', 'Рамка из дерева - 50 пикс.'] },
    { name: 'Мои операции', actions: ['Экспорт'] },
  ];

  function fakePhotoshop(sets: ActionSet[], doAction: (action: string, set: string) => void) {
    class ActionReference {
      parts: Array<[string, number]> = [];
      putIndex(cls: string, index: number) {
        this.parts.push([cls, index]);
      }
    }
    const desc = (values: Record<string, string | number>) => ({
      getString: (key: string) => values[key],
      getInteger: (key: string) => values[key],
      hasKey: (key: string) => key in values,
    });
    function executeActionGet(ref: ActionReference) {
      const setIndex = ref.parts.find(([cls]) => cls === 'ASet')?.[1] ?? 0;
      const actionIndex = ref.parts.find(([cls]) => cls === 'Actn')?.[1];
      const set = sets[setIndex - 1];
      if (!set) throw new Error('Общая ошибка Photoshop');
      if (actionIndex === undefined) return desc({ 'Nm  ': set.name, NmbC: set.actions.length });
      const action = set.actions[actionIndex - 1];
      if (action === undefined) throw new Error('Общая ошибка Photoshop');
      return desc({ 'Nm  ': action });
    }
    const app = { charIDToTypeID: (s: string) => s, stringIDToTypeID: (s: string) => s, doAction };
    // Stands in for the ExtendScript wrapper + executor: a thrown error reaches TS as
    // "message (number: N)".
    return (script: string) => {
      try {
        return new Function('app', 'ActionReference', 'executeActionGet', script)(app, ActionReference, executeActionGet);
      } catch (e) {
        const err = e as Error & { number?: number };
        throw new Error(err.number === undefined ? err.message : `${err.message} (number: ${err.number})`);
      }
    };
  }

  const play = (args: Record<string, unknown>) => createActionTools(connection)[0].handler(args);
  const refuse = () => {
    throw Object.assign(new Error('Объект «операция» в данный момент недоступен.'), { number: 8800 });
  };

  beforeEach(() => {
    captured.run = null;
  });

  it('an unknown set (e.g. "Default Actions" in Russian Photoshop) lists the localized sets', async () => {
    captured.run = fakePhotoshop(russianSets, refuse);
    const result = await play({ actionName: 'Vignette (selection)', actionSetName: 'Default Actions' });
    expect(result.isError).toBe(true);
    const envelope = JSON.parse(textOf(result));
    expect(envelope.code).toBe('invalid_arguments');
    expect(envelope.message).toContain('Action set "Default Actions" not found');
    expect(envelope.message).toContain('"Операции по умолчанию", "Мои операции"');
  });

  it('an unknown action lists the actions of that set', async () => {
    captured.run = fakePhotoshop(russianSets, refuse);
    const result = await play({ actionName: 'Vignette', actionSetName: 'Операции по умолчанию' });
    const envelope = JSON.parse(textOf(result));
    expect(envelope.code).toBe('invalid_arguments');
    expect(envelope.message).toContain('"Виньетка (выделенная область)", "Рамка из дерева - 50 пикс."');
  });

  it('when both names exist, the Photoshop error and its number come through', async () => {
    captured.run = fakePhotoshop(russianSets, refuse);
    const result = await play({ actionName: 'Экспорт', actionSetName: 'Мои операции' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('(number: 8800)');
    expect(JSON.parse(textOf(enrichErrorResult(result))).code).toBe('command_unavailable');
  });

  it('plays a localized action by the names the panel shows', async () => {
    const played: string[] = [];
    captured.run = fakePhotoshop(russianSets, (action, set) => {
      played.push(`${set}/${action}`);
    });
    const result = await play({ actionName: 'Экспорт', actionSetName: 'Мои операции' });
    expect(result.isError).toBeUndefined();
    expect(played).toEqual(['Мои операции/Экспорт']);
  });

  it('escapes the names into the script (quotes cannot break out)', () => {
    const jsx = ExtendScriptSnippets.playAction('A "quoted" name', "it's");
    expect(jsx).toContain('var __actionName = "A \\"quoted\\" name";');
    expect(() => new Function('app', 'ActionReference', 'executeActionGet', jsx)).not.toThrow();
  });
});
