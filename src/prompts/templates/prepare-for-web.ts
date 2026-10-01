import {
  argEnum,
  argInt,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const FORMAT_OPTIONS = ['jpeg', 'png'] as const;
type WebFormat = (typeof FORMAT_OPTIONS)[number];

export const prepareForWebTemplate: PhotoshopPromptTemplate = {
  name: 'ps.prepare_for_web',
  description:
    'Convert the active document to sRGB, downscale its longest edge, sharpen for screen, and export at the chosen format and quality. Does not mutate the source document. Users often say: for web, web export, optimize for web.',
  arguments: [
    {
      name: 'max_dimension_px',
      description: 'Longest-edge pixel cap. Default 2048. Common values: 1080, 1600, 2048, 2560.',
      required: false,
    },
    {
      name: 'format',
      description: 'Output format: jpeg (default) or png.',
      required: false,
    },
    {
      name: 'quality',
      description: 'JPEG quality 1-12 (Photoshop scale). Default 9. Ignored for png.',
      required: false,
    },
  ],
  handler: (args) => {
    const maxDim = Math.max(64, Math.min(8192, argInt(args, 'max_dimension_px', 2048)));
    const format = argEnum<WebFormat>(args, 'format', FORMAT_OPTIONS, 'jpeg');
    const quality = Math.max(1, Math.min(12, argInt(args, 'quality', 9)));

    const text = [
      `Goal: Produce a web-optimized export of the active document.`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document.`,
      `2. Call \`photoshop_recipe_prepare_for_web\` with { max_dimension_px: ${maxDim}, format: "${format}", quality: ${quality} }.`,
      `   - The recipe duplicates the document, converts to sRGB, downsizes the longest edge to ${maxDim}px (bicubic sharper), applies a mild unsharp mask, exports to disk, and closes the duplicate.`,
      `3. The recipe returns the absolute output path; surface it to the user.`,
      `4. Do NOT also call \`photoshop_save_document\` — the recipe already wrote the file.`,
      ``,
      `End state: the source document is unchanged; a new file exists at the returned path under ~/.photoshop-mcp/exports[/<chat-id>].`,
    ].join('\n');

    return userPrompt(
      `Export the active document for web (${format}, max ${maxDim}px, q=${quality}).`,
      text
    );
  },
};
