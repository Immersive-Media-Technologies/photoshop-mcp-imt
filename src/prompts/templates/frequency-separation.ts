import {
  argInt,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

export const frequencySeparationTemplate: PhotoshopPromptTemplate = {
  name: 'ps.frequency_separation',
  description:
    'Set up a frequency separation stack on the active layer (Low Frequency + High Frequency layers) so the user can smooth tones and retouch texture independently — without applying any actual smoothing. Users often say: frequency separation, split texture and color.',
  arguments: [
    {
      name: 'radius_px',
      description:
        'Gaussian blur radius in pixels used for the low-frequency layer. 4-8 for portraits, 10-20 for products. Default 6.',
      required: false,
    },
  ],
  handler: (args) => {
    const radius = Math.max(1, Math.min(50, argInt(args, 'radius_px', 6)));

    const text = [
      `Goal: Prepare the active layer for frequency separation retouching with a ${radius}px radius split.`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document with a NORMAL (raster) active layer. If it is text/Smart Object/background, ask the user to rasterize first or pick a different layer.`,
      `2. Call \`photoshop_recipe_frequency_separation\` with { radius_px: ${radius} }.`,
      `   - The recipe duplicates the active layer twice, names them "FS · Low" (Gaussian blur ${radius}px) and "FS · High" (Apply Image to subtract the low, set to Linear Light), groups them as "Frequency Separation".`,
      `3. Tell the user: "Paint with a soft brush on FS · Low to smooth tones, or on FS · High to repair texture. Do not edit pixels on the original layer."`,
      `4. Do NOT call any blur or healing tools yourself — the user will retouch interactively. End the turn after the setup.`,
      ``,
      `End state: a "Frequency Separation" group on top of the stack containing two prepared layers; the original layer is unchanged.`,
    ].join('\n');

    return userPrompt(`Build frequency separation setup (radius ${radius}px).`, text);
  },
};
