import {
  argEnum,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const PRESET_OPTIONS = [
  'cinematic',
  'vintage',
  'teal_orange',
  'bw',
  'warm_film',
  'cool_dusk',
] as const;
type Preset = (typeof PRESET_OPTIONS)[number];

const PRESET_BLURB: Record<Preset, string> = {
  cinematic: 'desaturated shadows, lifted blacks, slight S-curve contrast',
  vintage: 'lifted blacks, warm highlights, mild magenta cast, lower saturation',
  teal_orange: 'orange skin tones with teal shadows (classic Hollywood look)',
  bw: 'black & white conversion with high local contrast',
  warm_film: 'warm overall white balance, soft highlights, +5 saturation',
  cool_dusk: 'cool blue shadows, slightly desaturated greens, mild green-magenta shift',
};

export const applyColorGradeTemplate: PhotoshopPromptTemplate = {
  name: 'ps.apply_color_grade',
  description:
    'Apply a named color grading preset (curves + hue/saturation + selective color) as a single non-destructive recipe. Users often say: cinematic, teal orange, moody grade, color grade.',
  arguments: [
    {
      name: 'preset',
      description:
        'Preset name. One of: cinematic, vintage, teal_orange, bw, warm_film, cool_dusk. Default: cinematic.',
      required: false,
    },
  ],
  handler: (args) => {
    const preset = argEnum<Preset>(args, 'preset', PRESET_OPTIONS, 'cinematic');

    const text = [
      `Goal: Apply the "${preset}" color grade to the active document.`,
      `Style: ${PRESET_BLURB[preset]}.`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document. Color mode must be RGB; if it is CMYK or Grayscale, warn the user and stop.`,
      `2. Call \`photoshop_recipe_apply_color_grade\` with { preset: "${preset}" }.`,
      `   - The recipe creates a layer group named "Color Grade · ${preset}" containing adjustment layers. All clipped to nothing so they affect the whole composition.`,
      `3. Call \`photoshop_get_preview\` once to show the user the result.`,
      `4. If the user asks to tweak, modify the adjustment layers individually (\`photoshop_set_layer_opacity\` on the Curves layer is the cheapest tweak) instead of rerunning the recipe.`,
      ``,
      `End state: one new layer group at the top of the stack; original layers untouched; one undo removes the grade.`,
    ].join('\n');

    return userPrompt(`Apply the "${preset}" color grade.`, text);
  },
};
