import {
  argBool,
  argInt,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

export const removeBackgroundTemplate: PhotoshopPromptTemplate = {
  name: 'ps.remove_background',
  description:
    'Remove the background from the active document in one recipe call. The recipe unlocks a Background layer itself and prefers Photoshop\'s native Remove Background. Users often say: remove background, cut out, isolate subject, transparent background, arka planı sil.',
  arguments: [
    {
      name: 'feather_px',
      description:
        'Edge feather in pixels (0-20). 0 = hard edge (default for product shots), 1-3 = soft edge for portraits.',
      required: false,
    },
    {
      name: 'keep_shadow',
      description:
        'When true, records intent for a contact shadow in the recipe response. Shadow layer creation is not yet implemented. Default false.',
      required: false,
    },
  ],
  handler: (args) => {
    const feather = Math.max(0, Math.min(20, argInt(args, 'feather_px', 0)));
    const keepShadow = argBool(args, 'keep_shadow', false);

    const text = [
      `Goal: Remove the background. One recipe. Stop.`,
      ``,
      `Do this and nothing else:`,
      `1. \`photoshop_get_state\``,
      `2. \`photoshop_recipe_remove_background\` with { feather_px: ${feather}, keep_shadow: ${keepShadow} }`,
      `3. \`photoshop_get_preview\` once`,
      `4. STOP. Report ok/summary. Do not rasterize, duplicate, hide, select_subject, mask, execute_script, or retry.`,
      ``,
      `End state: subject isolated with a layer mask; one undo reverts it.`,
    ].join('\n');

    return userPrompt(`Remove the background (feather ${feather}px, shadow=${keepShadow}).`, text);
  },
};
