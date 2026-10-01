import {
  argEnum,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const PRESET_OPTIONS = ['auto_levels', 'brightness_contrast'] as const;

export const colorCorrectTemplate: PhotoshopPromptTemplate = {
  name: 'ps.color_correct',
  description:
    'Fix flat or dull tonality with auto levels or brightness/contrast — stepping stone until curves atomics ship.',
  arguments: [
    {
      name: 'preset',
      description:
        'Correction approach: auto_levels (default, global tone stretch) or brightness_contrast (manual exposure tweak).',
      required: false,
    },
  ],
  handler: (args) => {
    const preset = argEnum(args, 'preset', PRESET_OPTIONS, 'auto_levels');

    const correctionStep =
      preset === 'auto_levels'
        ? `3. Call \`photoshop_auto_levels\` on the active layer (or merged duplicate if the user wants non-destructive workflow — duplicate first with \`photoshop_duplicate_layer\`).`
        : `3. Call \`photoshop_adjust_brightness_contrast\` with modest values (e.g. brightness +5 to +15, contrast +5 to +20) based on preview feedback.`;

    const text = [
      `Goal: Improve overall tone and contrast so the image looks less flat.`,
      ``,
      `Intent: make it pop, S-curve, fix flat image, auto tone, exposure fix`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document and raster layer.`,
      `2. Call \`photoshop_get_preview\` if you have not seen the image this session.`,
      correctionStep,
      `4. Prefer \`photoshop_adjust_curves\` for S-curve / targeted tone; chain auto levels then brightness/contrast if curves is unavailable or still flat.`,
      `5. Call \`photoshop_get_preview\` once after correction.`,
      `6. For stylistic looks (cinematic, teal-orange), use \`photoshop_recipe_apply_color_grade\` instead — this guide is for neutral correction only.`,
      ``,
      `End state: active layer tonality is improved; one undo per atomic adjustment; original pixels preserved if adjustments were on duplicates or adjustment layers.`,
    ].join('\n');

    return userPrompt(`Color correct (${preset.replace(/_/g, ' ')}).`, text);
  },
};
