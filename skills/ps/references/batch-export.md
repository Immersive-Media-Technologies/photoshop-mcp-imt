# Batch and export: CSV → cards, watermark, mockups, social variants, carousel, artboards, web export

Long batches run with a 600 s script timeout; a `extendscript_timeout` from one means Photoshop is still working: `ps_do ping` until
it answers, then check the output folder. Recipes write where the table says — move files with your own file tools afterwards.

| recipe / operation | input | output | notes |
|---|---|---|---|
| `recipe csv_to_cards {csv_path, output_dir, format: JPEG/PNG/PSD}` | template PSD with variables (Image › Variables › Define — UI, once) + CSV whose header row = variable names; a cell with an absolute image path replaces pixels | one file per row in `output_dir`, `details.xml_path` | lower level: `import_datasets {xml_path}`, `list_datasets`, `generate_from_datasets {output_dir, format, dataset_names}` |
| `recipe batch_watermark {assets_dir, text | logo_path, position, opacity, margin_px, font_size, scale_pct, quality}` | a folder of jpg/jpeg/png/tif/tiff/webp (not recursive); no document needed | `wm-<name>-<stamp>.jpg` in `~/.photoshop-mcp/exports/`, `output_paths`; failed files listed, not fatal | positions: bottom_right (default) · bottom_left · top_right · top_left · center |
| `recipe batch_mockup_replace {smart_object_layer_name, assets_dir, quality}` | active mockup PSD with a Smart Object of exactly that name + a folder of assets | `mockup-<asset>-<stamp>.jpg` in the exports folder | the PSD ends with the LAST asset placed — reopen or undo; keeps the Smart Object's warp |
| `replace_smart_object_contents {layer_name, file_path}` | one Smart Object, one file | in place | preserves transforms and Smart Filters; `convert_to_smart_object {layer_name}` first for a plain layer; `edit_smart_object_contents` opens the .psb as the active document |
| `recipe export_social_variants {platforms, quality}` | active document | `social-<slug>-<stamp>.jpg` per platform in the exports folder | centre-crop, no padding; slugs: instagram_post 1080² · instagram_story / instagram_reel / tiktok_vertical 1080×1920 · x_post 1600×900 · x_header 1500×500 · facebook_post 1200×630 · facebook_cover 1640×624 · linkedin_post 1200×627 · linkedin_banner 1584×396 · youtube_thumbnail 1280×720 · pinterest_pin 1000×1500 |
| `recipe split_carousel {slides 2–10, slide_width, slide_height, format: jpg/png, quality}` | a wide active document | numbered `carousel-<stamp>-N` files | seamless swipe panorama; width ≥ slides px |
| `recipe prepare_for_web {max_dimension_px 64–8192, format: jpeg/png, quality, path}` | active document | one file at `path` (or the exports folder) | duplicate → sRGB → downscale → sharpen → save; source untouched; do not `ps_save_document` after it |
| `recipe passport_photo {spec: us_2x2 | eu_35x45 | tr_50x60, make_sheet, quality}` | single-person portrait | JPEG (+ 10×15 cm sheet) in the exports folder | head size approximated from subject bounds — no compliance guarantee |
| `export_as {path, format: PNG/JPEG/WEBP/AVIF, quality, artboard_id}` | active document or one artboard | file at `path` | WebP/AVIF need PS ≥ 23.2 (`version_unsupported`); `ps_export_frame` is `export_as` PNG with the folder created |
| `export_artboards {folder, format, quality}` | all artboards | one file per board | 600 s; boards: `list_artboards`, `create_artboard {name, width, height, left, top}` (the first one converts the document), `set_active_artboard` |
| `ps_save_document {path, format: PSD/JPEG/PNG, quality 1–12}` | active document | the file; omit `path` to save in place | `save_document` over the original is irreversible — save a copy first |

## Rules
- Paths absolute; the exports default is `~/.photoshop-mcp/exports/` (`PHOTOSHOP_MCP_HOME` moves it). Photoshop does not create folders:
  `ps_export_frame` and `ps_save_document` do it for you, `export_as` and the recipes with `output_dir` create theirs; for anything else
  create the folder first.
- Batches touch many documents: `ps_get_state` afterwards — the active tab may have changed; `list_documents` to find leftovers.
- Multiple sizes of one design with different content → artboards (one document, `export_artboards`); same content re-framed →
  `export_social_variants`; one wide image in slices → `split_carousel`.
- Colour: `prepare_for_web` converts to sRGB; `export_as` does not — convert the document in the UI (Edit › Convert to Profile) or
  through `ps_execute_script` (`convertProfile('sRGB IEC61966-2.1', …)`) before exporting print-profile files for screens.
- Content Credentials for generated content are attached by Photoshop's export settings (UI); not controllable by script.
