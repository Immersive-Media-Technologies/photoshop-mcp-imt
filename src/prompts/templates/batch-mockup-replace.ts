import {
  argString,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

export const batchMockupReplaceTemplate: PhotoshopPromptTemplate = {
  name: 'ps.batch_mockup_replace',
  description:
    'Iterate a directory of asset images, swap each one into the named Smart Object in the active mockup PSD, and export a flattened JPEG per asset.',
  arguments: [
    {
      name: 'smart_object_layer_name',
      description:
        'Exact name of the Smart Object layer inside the active document whose contents will be replaced for each asset.',
      required: true,
    },
    {
      name: 'assets_dir',
      description:
        'Absolute path to the directory containing the source asset images (jpeg/png/psd). Subdirectories are not recursed.',
      required: true,
    },
  ],
  handler: (args) => {
    const layerName = argString(args, 'smart_object_layer_name', '');
    const assetsDir = argString(args, 'assets_dir', '');

    const text = [
      `Goal: Batch-render the active mockup once per asset by swapping the Smart Object contents.`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document. Then call \`photoshop_get_layers\` and verify a Smart Object layer named exactly "${layerName}" exists. If not, stop and ask the user for the correct name.`,
      `2. Call \`photoshop_recipe_batch_mockup_replace\` with { smart_object_layer_name: "${layerName}", assets_dir: "${assetsDir}" }.`,
      `   - The recipe iterates every file in the directory, replaces Smart Object contents, lets the parent mockup update, then exports a flattened JPEG named after the asset to ~/.photoshop-mcp/exports[/<chat-id>].`,
      `3. The recipe returns a JSON list of { source_asset, output_path }. Surface them as a Markdown table so the user can match exports to assets.`,
      `4. Do NOT loop manually with atomic place_image calls — Smart Object replacement preserves the mockup's perspective/warp; placing a new layer does not.`,
      ``,
      `End state: the active mockup PSD is restored to its first asset; one JPEG per input asset exists in the export directory.`,
    ].join('\n');

    return userPrompt(
      `Batch-replace Smart Object "${layerName}" with assets from ${assetsDir}.`,
      text
    );
  },
};
