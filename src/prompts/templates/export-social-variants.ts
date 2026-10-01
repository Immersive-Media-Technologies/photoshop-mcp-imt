import {
  argList,
  userPrompt,
  type PhotoshopPromptTemplate,
} from '../_shared.js';

const KNOWN_PLATFORMS = new Set([
  'instagram_post',
  'instagram_story',
  'instagram_reel',
  'x_post',
  'x_header',
  'facebook_post',
  'facebook_cover',
  'linkedin_post',
  'linkedin_banner',
  'youtube_thumbnail',
  'tiktok_vertical',
  'pinterest_pin',
]);

const DEFAULT_PLATFORMS = ['instagram_post', 'instagram_story', 'x_post'];

export const exportSocialVariantsTemplate: PhotoshopPromptTemplate = {
  name: 'ps.export_social_variants',
  description:
    "Generate one JPEG per social-media platform from the active document, each at the platform's recommended dimensions, with sensible center-crop fallback. Users often say: for Instagram, social export, export variants.",
  arguments: [
    {
      name: 'platforms',
      description:
        'Comma-separated platform slugs. Known: instagram_post, instagram_story, instagram_reel, x_post, x_header, facebook_post, facebook_cover, linkedin_post, linkedin_banner, youtube_thumbnail, tiktok_vertical, pinterest_pin. Default: instagram_post,instagram_story,x_post.',
      required: false,
    },
  ],
  handler: (args) => {
    const requested = argList(args, 'platforms', DEFAULT_PLATFORMS);
    const valid = requested.filter((p) => KNOWN_PLATFORMS.has(p.toLowerCase()));
    const final = valid.length > 0 ? valid : DEFAULT_PLATFORMS;

    const text = [
      `Goal: Produce one ready-to-post image file per requested social platform from the active document.`,
      ``,
      `Plan:`,
      `1. Call \`photoshop_get_state\` to confirm an active document. Note its dimensions.`,
      `2. Call \`photoshop_recipe_export_social_variants\` with { platforms: ${JSON.stringify(final)} }.`,
      `   - The recipe duplicates the document for each platform, resizes/center-crops to the platform spec (e.g. Instagram post = 1080×1080, Story = 1080×1920, X post = 1600×900, YouTube thumbnail = 1280×720), exports JPEG, and closes the duplicate.`,
      `3. The recipe returns a list of absolute output paths. Present them grouped by platform so the user can grab the one they need.`,
      ``,
      `End state: the source document is unchanged; one new file per platform exists under ~/.photoshop-mcp/exports[/<chat-id>].`,
    ].join('\n');

    return userPrompt(`Export social variants for: ${final.join(', ')}.`, text);
  },
};
