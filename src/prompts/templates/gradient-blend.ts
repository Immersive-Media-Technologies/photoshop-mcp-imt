import {
  argEnum,
  argInt,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const DIRECTION_OPTIONS = ['top_to_bottom', 'bottom_to_top'] as const;

export const gradientBlendTemplate: PhotoshopPromptTemplate = {
  name: 'ps.gradient_blend',
  description:
    'Fade the active layer into the background using a linear gradient on the layer mask — common for soft compositing and horizon blends.',
  arguments: [
    {
      name: 'direction',
      description:
        'Gradient direction on the mask: top_to_bottom (fade downward) or bottom_to_top (fade upward, default for sky/horizon).',
      required: false,
    },
    {
      name: 'feather_px',
      description: 'Optional edge feather in pixels (0-20) before masking. Default 0.',
      required: false,
    },
  ],
  handler: (args) => {
    const direction = argEnum(args, 'direction', DIRECTION_OPTIONS, 'bottom_to_top');
    const feather = Math.max(0, Math.min(20, argInt(args, 'feather_px', 0)));

    const text = [
      `Goal: Fade the active layer into the background using a gradient on the layer mask.`,
      ``,
      `Intent: fade into background, gradient mask, blend subject, soft edge fade, arka planı yumuşat`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document and an active layer with the subject or composite to fade.`,
      feather > 0
        ? `2. If the layer edge needs softening first, apply feather ${feather}px via selection tools before masking.`
        : `2. Confirm whether the active layer already has a layer mask; if not, add one.`,
      `3. If no mask exists: call \`photoshop_create_layer_mask\` after a reveal-all or existing selection, or use \`photoshop_recipe_remove_background\` when isolating a subject first.`,
      `4. Apply the gradient fade:`,
      `   - Prefer \`photoshop_recipe_gradient_fade\` with { direction: "${direction}" } for a single undo.`,
      `   - Fallback: \`photoshop_apply_gradient_mask\` with { direction: "${direction}" } on an existing mask.`,
      `   - Last resort: ask the user to paint a linear black→white gradient (${direction.replace(/_/g, ' ')}) on the mask with the Gradient tool.`,
      `5. Call \`photoshop_get_preview\` once to confirm the fade.`,
      ``,
      `End state: the subject or composite remains visible while the background or lower layers fade in through the mask; each atomic step is individually undoable until a recipe wraps the chain.`,
    ].join('\n');

    return userPrompt(
      `Gradient mask blend (${direction.replace(/_/g, ' ')}, feather ${feather}px).`,
      text
    );
  },
};
