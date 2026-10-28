// Photoshop writes its error messages in the UI language (about 25 of them). The error
// envelope must not depend on that: classification goes by the error number first, and
// the English/Russian text patterns are only a fallback for errors without a number.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { classifyError, enrichErrorResult, extractErrorNumbers } from '../src/errors/envelope.js';
import { isScriptTimeoutError } from '../src/platform/script-timeout.js';
import { buildWindowsBridgeScript } from '../src/platform/windows-script-bridge.js';

describe('classifyError by Photoshop error number', () => {
  // "General Photoshop error … The command "Merge Visible" is not currently available." in several UIs.
  const commandUnavailable = [
    'General Photoshop error occurred. This functionality may not be available in this version of Photoshop.\n- The command “Merge Visible” is not currently available. (number: 8800)',
    'Общая ошибка Photoshop. Возможно, эта функция недоступна в этой версии Photoshop.\n- Команда «Объединить видимые» в данный момент недоступна. (number: 8800)',
    'Allgemeiner Photoshop-Fehler. Diese Funktion ist in dieser Version von Photoshop eventuell nicht verfügbar.\n- Der Befehl „Sichtbare auf eine Ebene reduzieren“ ist derzeit nicht verfügbar. (number: 8800)',
    '一般的な Photoshop エラーが発生しました。この機能は、このバージョンの Photoshop では使用できない可能性があります。\n- 現在、"表示レイヤーを結合" コマンドは使用できません。 (number: 8800)',
    "Impossible de terminer la requête, car le calque est verrouillé. (number: 8800)",
  ];

  it.each(commandUnavailable)('8800 is command_unavailable in any language: %s', (message) => {
    const envelope = classifyError(message);
    expect(envelope.code).toBe('command_unavailable');
    expect(envelope.suggested_next_tool).toBe('photoshop_get_layers');
    expect(envelope.message).toBe(message);
  });

  it('-25920 (UXP batchPlay result) is command_unavailable, even behind the "UXP bridge:" prefix', () => {
    expect(classifyError('UXP bridge: La commande « Créer » n’est pas disponible actuellement. (number: -25920)').code).toBe(
      'command_unavailable'
    );
  });

  it.each([
    'User cancelled the operation. (number: 8007)',
    'Пользователь отменил операцию. (number: 8007)',
    'ユーザーが操作をキャンセルしました。 (number: 8007)',
  ])('8007 is user_cancelled: %s', (message) => {
    const envelope = classifyError(message);
    expect(envelope.code).toBe('user_cancelled');
    expect(envelope.suggested_next_tool).toBe('photoshop_get_state');
  });

  it('ExtendScript file errors are file_not_found in any language', () => {
    expect(classifyError('Файл или папка не существует (number: 48)').code).toBe('file_not_found');
    expect(classifyError('Ссылка на существующий файл или папку ожидается (number: 1233)').code).toBe('file_not_found');
  });

  it('ExtendScript runtime errors are extendscript_runtime_error in any language', () => {
    expect(classifyError('undefined не является объектом (number: 21)').code).toBe('extendscript_runtime_error');
    expect(classifyError('Синтаксическая ошибка (number: 8)').code).toBe('extendscript_runtime_error');
    expect(classifyError('Error 8: Syntax error').code).toBe('extendscript_runtime_error');
  });

  it('8500 "property does not exist" is a runtime error, not file_not_found', () => {
    expect(classifyError('The requested property does not exist. (number: 8500)').code).toBe('extendscript_runtime_error');
  });

  it('an unmapped number falls back to the message text', () => {
    expect(classifyError('Layer not found: Logo (number: 1)').code).toBe('layer_not_found');
    expect(classifyError('something odd (number: 1)').code).toBe('unknown');
  });

  it('scratch disk -25010 is still scratch_disk_full', () => {
    expect(classifyError('Не удаётся выполнить запрос (number: -25010)').code).toBe('scratch_disk_full');
  });
});

describe('classifyError without a number (fallback)', () => {
  it('keeps the English and Russian "not currently available" text', () => {
    expect(classifyError('The command “Select” is not currently available.').code).toBe('command_unavailable');
    expect(classifyError('Команда «Выделить» в данный момент недоступна.').code).toBe('command_unavailable');
  });

  it('keeps our own English messages', () => {
    expect(classifyError(
      'Photoshop busy: it is not responding to scripts'
    ).code).toBe('photoshop_busy');
    expect(classifyError('No active document').code).toBe('no_active_document');
    expect(classifyError('Layer not found: Logo').code).toBe('layer_not_found');
    expect(classifyError('font_not_found: Foo').code).toBe('font_not_found');
    expect(classifyError('Active layer is not a text layer').code).toBe('not_text_layer');
  });
});

describe('enrichErrorResult', () => {
  const result = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

  it('classifies a plain error text that carries a number but not the word "error"', () => {
    const enriched = enrichErrorResult(result('UXP bridge: Команда «Создать» в данный момент недоступна. (number: -25920)'));
    expect(JSON.parse((enriched.content[0] as { text: string }).text).code).toBe('command_unavailable');
  });

  it('leaves a plain text without a number or "error" alone', () => {
    const plain = result('UXP bridge is not connected');
    expect(enrichErrorResult(plain)).toBe(plain);
  });
});

describe('extractErrorNumbers', () => {
  it('reads the wrapper form and the ExtendScript "Error N:" form', () => {
    expect(extractErrorNumbers('x (number: 8800) y (number: -25920)')).toEqual([8800, -25920]);
    expect(extractErrorNumbers('Error 1302: No such element')).toEqual([1302]);
    expect(extractErrorNumbers('Error playing action: no number')).toEqual([]);
  });
});

describe('AppleScript timeout in any macOS language', () => {
  const russian =
    'Command failed: osascript "/tmp/a.scpt"\n/tmp/a.scpt: execution error: Ошибка в «Adobe Photoshop 2026»: Истекло время ожидания события AppleEvent. (-1712)';

  it('is detected by errAETimeout (-1712)', () => {
    expect(isScriptTimeoutError(russian)).toBe(true);
    expect(classifyError(russian).code).toBe('extendscript_timeout');
  });

  it('does not treat other AppleScript errors as timeouts', () => {
    expect(isScriptTimeoutError('execution error: Adobe Photoshop 2026 got an error: Connection is invalid. (-609)')).toBe(false);
  });
});

describe('Windows cscript bridge', () => {
  const script = buildWindowsBridgeScript();

  it('retries the transient COM error by number (8800 = 0x80042260), not by English text only', () => {
    expect(script).toContain('Const PS_GENERAL_ERROR = &H80042260');
    expect(script).toContain('If Err.Number <> PS_GENERAL_ERROR And InStr(1, Err.Description, "General Photoshop error", vbTextCompare) = 0 Then Exit Do');
  });

  it('reports the COM error number with the description', () => {
    expect(script).toContain('WriteResult "ERROR: " & Err.Description & " (number: " & Err.Number & ")"');
    expect(script).toMatch(/^[\r\n\t\x20-\x7e]*$/);
  });
});

describe('UXP panel text follows the Photoshop UI language', () => {
  const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../uxp-plugin/index.html', import.meta.url), 'utf8');

  function loadPlugin(host: Record<string, unknown> | undefined) {
    const elements: Record<string, { textContent: string }> = {
      status: { textContent: '' },
      hint: { textContent: '' },
    };
    const documentElement = { lang: 'en' };
    const uxp = {
      host,
      versions: {},
      entrypoints: { setup: () => undefined },
      storage: {
        formats: { utf8: 'utf8' },
        localFileSystem: {
          getEntryWithUrl: async () => {
            throw new Error('no token file');
          },
        },
      },
    };
    const context = vm.createContext({
      require: (name: string) => {
        if (name === 'uxp') return uxp;
        if (name === 'photoshop') return { action: {}, app: {}, core: {} };
        if (name === 'os') return { homedir: () => '/Users/test' };
        throw new Error(`unexpected require ${name}`);
      },
      document: { getElementById: (id: string) => elements[id] ?? null, documentElement },
      // Never answer and never fire: the poll loop parks after its first step.
      fetch: () => new Promise(() => undefined),
      setTimeout: () => 0,
    });
    vm.runInContext(source, context);
    return { context, elements, documentElement };
  }

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('Russian Photoshop gets the Russian text', async () => {
    const { elements, documentElement } = loadPlugin({ uiLocale: 'ru_RU' });
    expect(elements.status.textContent).toBe('Deep Artisan: запуск…');
    expect(elements.hint.textContent).toMatch(/^Запасной транспорт ps-mcp/);
    expect(documentElement.lang).toBe('ru');
    await settle();
    expect(elements.status.textContent).toMatch(/нет токена моста/);
  });

  it.each([{ uiLocale: 'en_US' }, { uiLocale: 'de_DE' }, { uiLocale: 'ja_JP' }, {}, undefined])(
    'any other UI language gets English: %o',
    async (host) => {
      const { elements, documentElement } = loadPlugin(host);
      expect(elements.status.textContent).toBe('Deep Artisan: starting…');
      expect(elements.hint.textContent).toMatch(/^Backup transport for ps-mcp/);
      expect(documentElement.lang).toBe('en');
      await settle();
      expect(elements.status.textContent).toMatch(/no bridge token yet/);
    }
  );

  it('index.html defaults to English', () => {
    expect(html).not.toMatch(/[А-Яа-яЁё]/);
    expect(html).toContain('id="hint"');
  });

  it('bridge errors carry the Photoshop error number', () => {
    const { context } = loadPlugin({ uiLocale: 'ru_RU' });
    const text = vm.runInContext(
      "errorText(Object.assign(new Error('Команда «Создать» в данный момент недоступна.'), { number: -25920 }))",
      context
    ) as string;
    expect(text).toBe('Команда «Создать» в данный момент недоступна. (number: -25920)');
    expect(classifyError(`UXP bridge: ${text}`).code).toBe('command_unavailable');
    expect(vm.runInContext("errorText(Object.assign(new Error('x'), { result: -25920 }))", context)).toBe(
      'x (number: -25920)'
    );
    expect(vm.runInContext("errorText(new Error('no active document'))", context)).toBe('no active document');
  });
});
