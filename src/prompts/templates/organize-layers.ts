import {
  argBool,
  argEnum,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const NAMING_OPTIONS = ['type_index', 'content_summary', 'preserve'] as const;
type NamingScheme = (typeof NAMING_OPTIONS)[number];

const NAMING_BLURB: Record<NamingScheme, string> = {
  type_index: 'Rename layers to "<kind>_<n>" (e.g. text_01, image_02, shape_03).',
  content_summary: 'Rename text layers to a slug of their content; keep other names.',
  preserve: 'Keep existing names; only auto-group, do not rename.',
};

export const organizeLayersTemplate: PhotoshopPromptTemplate = {
  name: 'ps.organize_layers',
  description:
    'Clean up a messy PSD: rename layers using a consistent scheme and optionally auto-group them by kind or spatial proximity. Users often say: organize layers, rename mess, tidy layers.',
  arguments: [
    {
      name: 'naming_scheme',
      description:
        'How to rename layers. One of: type_index (default, e.g. text_01), content_summary (text layers get a slug of their content), preserve (do not rename, only group).',
      required: false,
    },
    {
      name: 'auto_group',
      description:
        'When true, group layers by kind (text / image / shape / adjustment) into folders. Default true.',
      required: false,
    },
  ],
  handler: (args) => {
    const naming = argEnum<NamingScheme>(args, 'naming_scheme', NAMING_OPTIONS, 'type_index');
    const autoGroup = argBool(args, 'auto_group', true);

    const text = [
      `Goal: Tidy the layer stack of the active document.`,
      `Naming: ${NAMING_BLURB[naming]}`,
      `Grouping: ${autoGroup ? 'on — layers will be grouped by kind into folders.' : 'off — only renaming, no folders.'}`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document.`,
      `2. Call \`photoshop_get_layers\` to inspect the current mess. If the count is very low (< 3 layers), tell the user there is nothing to organize and stop.`,
      `3. Call \`photoshop_recipe_organize_layers\` with { naming_scheme: "${naming}", auto_group: ${autoGroup} }.`,
      `   - The recipe never deletes, merges or flattens. It only renames and groups, so visual output is unchanged.`,
      `4. Summarize what changed (count of renames + count of new groups) instead of dumping the full new layer list.`,
      ``,
      `End state: the layer stack is cleaner; visual output is identical to before; one undo reverts everything.`,
    ].join('\n');

    return userPrompt(`Organize layers (${naming}, group=${autoGroup}).`, text);
  },
};
