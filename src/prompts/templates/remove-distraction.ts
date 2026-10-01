import {
  argInt,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

export const removeDistractionTemplate: PhotoshopPromptTemplate = {
  name: 'ps.remove_distraction',
  description:
    'One-shot distraction removal: generative AI remove when available, else content-aware fill. Users often say: remove that person, erase distraction, content aware remove, clone out object.',
  arguments: [
    {
      name: 'feather_px',
      description: 'Edge feather in pixels before fill (0-20). Default 0.',
      required: false,
    },
  ],
  handler: (args) => {
    const feather = Math.max(0, Math.min(20, argInt(args, 'feather_px', 0)));

    const text = [
      `Goal: Remove the selected distraction or object via content-aware fill in one undoable step.`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document and check whether a pixel selection exists.`,
      `2. If no selection: call \`photoshop_select_rectangle\`, \`photoshop_select_subject\`, or ask the user to define the region to remove.`,
      `3. Call \`photoshop_recipe_remove_distraction\` with { feather_px: ${feather} } (uses generative remove when capable).`,
      `   - Fallback: content-aware fill when generative is unavailable.`,
      `4. If the result returns \`selection_required\`, go back to step 2.`,
      `5. Call \`photoshop_get_preview\` once. For best results prefer \`ps.generative_remove\` or \`photoshop_generative_remove\` when capabilities allow.`,
      ``,
      `End state: selected pixels are inpainted; selection cleared; one undo reverts the fill.`,
    ].join('\n');

    return userPrompt(`Remove distraction (feather ${feather}px).`, text);
  },
};
