import {
  argBool,
  argEnum,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const INTENSITY_OPTIONS = ['low', 'medium', 'high'] as const;
type Intensity = (typeof INTENSITY_OPTIONS)[number];

const RADIUS_BY_INTENSITY: Record<Intensity, number> = {
  low: 2,
  medium: 4,
  high: 7,
};

export const enhancePortraitTemplate: PhotoshopPromptTemplate = {
  name: 'ps.enhance_portrait',
  description:
    'Multi-step retouch plan for a portrait: non-destructive skin smoothing via frequency separation, mild dodge & burn, and auto-tone — wrapped in a single undoable history step. Users often say: smooth skin, retouch portrait, fix blemishes.',
  arguments: [
    {
      name: 'intensity',
      description: 'Retouch strength: low (subtle), medium (default), or high (heavy smoothing).',
      required: false,
    },
    {
      name: 'skin_smoothing',
      description: 'Whether to apply frequency separation skin smoothing. Default true.',
      required: false,
    },
  ],
  handler: (args) => {
    const intensity = argEnum(args, 'intensity', INTENSITY_OPTIONS, 'medium');
    const skinSmoothing = argBool(args, 'skin_smoothing', true);
    const radius = RADIUS_BY_INTENSITY[intensity];

    const skinLine = skinSmoothing
      ? `   - Skin smoothing is ON. The recipe will apply frequency separation with radius ~${radius}px.`
      : `   - Skin smoothing is OFF. The recipe will only do tone/contrast cleanup.`;

    const text = [
      `Goal: Retouch the currently open portrait at "${intensity}" intensity.`,
      ``,
      `Plan (call tools in order; stop after the recipe if the result looks right):`,
      `1. Call \`photoshop_get_state\` to confirm there is an active document and an active layer that is a portrait photo.`,
      `2. Call \`photoshop_recipe_enhance_portrait\` with { intensity: "${intensity}", skin_smoothing: ${skinSmoothing} }.`,
      skinLine,
      `3. Call \`photoshop_get_preview\` once to show the user the result.`,
      `4. If the user asks for more/less smoothing, undo and rerun with a different \`intensity\`. Do NOT chain multiple recipes — they stack non-linearly.`,
      ``,
      `End state: one new layer group named "Enhance Portrait" sitting above the original; original pixels untouched; one undo reverts everything.`,
    ].join('\n');

    return userPrompt(`Enhance the active portrait at "${intensity}" intensity.`, text);
  },
};
