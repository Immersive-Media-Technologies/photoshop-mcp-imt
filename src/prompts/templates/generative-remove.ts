import { argBool, argInt, userPrompt, type PhotoshopPromptTemplate } from '../_shared.js';

export const generativeRemoveTemplate: PhotoshopPromptTemplate = {
  name: 'ps.generative_remove',
  description:
    'AI Remove tool on the current selection. Users often say: remove person, erase distraction, generative remove, delete object.',
  arguments: [
    {
      name: 'feather_px',
      description: 'Edge feather 0-20 before remove (default 0)',
      required: false,
    },
    {
      name: 'auto_select_subject',
      description: 'Run Select Subject when no selection (true/false, default false)',
      required: false,
    },
  ],
  handler: (args) => {
    const feather = Math.max(0, Math.min(20, argInt(args, 'feather_px', 0)));
    const autoSelect = argBool(args, 'auto_select_subject', false);
    const text = [
      `Goal: Remove selected content using generative AI (Remove tool).`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_capabilities\` — verify \`generative_remove\`.`,
      `2. Call \`photoshop_get_state\` for selection bounds.`,
      `3. Call \`photoshop_generative_remove\` with { feather_px: ${feather}, auto_select_subject: ${autoSelect} }.`,
      `4. On \`generative_no_selection\`, define selection then retry.`,
      `5. On \`generative_unavailable\`, fallback \`photoshop_recipe_remove_distraction\`.`,
      `6. Call \`photoshop_get_preview\`.`,
      ``,
      `End state: distraction removed; selection cleared.`,
    ].join('\n');
    return userPrompt(`Generative remove (feather ${feather}px)`, text);
  },
};
