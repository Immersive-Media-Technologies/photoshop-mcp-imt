# Colour and retouch by script: recipes, adjustment layers, filters, styles, type

Everything here is local Photoshop — no credits. Verify with `ps_get_layers` (new group / adjustment layer) then a frame.

## Retouch recipes (one history state each; `ps_recipe {name, args}`)

| recipe | builds | parameters | then |
|---|---|---|---|
| `frequency_separation` | group «Frequency Separation»: «FS Low» (Gaussian blur) + «FS High» (Apply Image, Linear Light) above the active raster layer; applies no smoothing | `radius_px` 1–50: 4–8 portraits, 10–20 products (default 6) | the user paints FS Low (colour) / FS High (texture) |
| `dodge_burn` | one 50 % grey layer «Dodge & Burn» above the active layer | `blend_mode`: overlay (stronger) · soft_light (gentler) | the user paints white / black at low opacity; `set_layer_opacity` to tame it |
| `enhance_portrait` | group «Enhance Portrait»: duplicate + frequency pair + auto-tone Curves | `intensity` low/medium/high, `skin_smoothing` (false = curves only), `use_neural_skin` (UXP Neural Filter first, `retouch.md`) | one-shot baseline; original untouched |
| `apply_color_grade` | group with Hue/Saturation + Brightness/Contrast | `preset`: cinematic · vintage · teal_orange · bw · warm_film · cool_dusk; RGB only (`unsupported_color_mode`) | global look; subject-only grades need a mask |
| `organize_layers` | renames top-level layers, groups by kind | `naming_scheme`: type_index · content_summary · preserve; `auto_group` | pixels unchanged |

## Adjustment layers (non-destructive, on top of the active layer)
`adjust_curves {preset: auto_tone | neutral}` · `adjust_vibrance {vibrance, saturation}` · `adjust_exposure {exposure, offset, gamma}` ·
`apply_photo_filter {red, green, blue, density, preserve_luminosity}` · `apply_gradient_map {reverse}` · `apply_lut {lut}` — a built-in
name («Crisp_Warm.3dl», «Kodak 5218 Fuji 3510.3dl», «Moonlight.3dl», …) or an absolute `.cube` / `.3dl` / `.look` path.
Direct on the active layer (destructive): `adjust_brightness_contrast`, `adjust_hue_saturation`, `auto_levels`, `auto_contrast`,
`desaturate`, `invert` → duplicate first. Colour Match, Camera Raw, Curves point editing: UI.

## Filters (active layer; refuse Background, text and Smart Objects → `duplicate_layer` / `rasterize_layer` first)
`apply_gaussian_blur {radius}` · `apply_sharpen` · `apply_smart_blur` · `apply_high_pass {radius}` · `apply_motion_blur {angle, radius}`
· `apply_noise`. Smart Filters by script: no — convert to a Smart Object and apply filters in the UI, or keep a duplicate.
Perspective of one plane: `distort_layer {corners, mode: perspective | bilinear, rasterize}` (Smart Object needs `rasterize:true`).
Liquify, Perspective Warp, Vanishing Point, Camera Raw Filter: modal UI, not scriptable.

## Layer styles, blend modes, type
- `apply_layer_style {style: drop_shadow | outer_glow | stroke | bevel_emboss, red, green, blue, opacity, size, distance, angle}`.
- `set_layer_blend_mode {blendMode}` (UI names: MULTIPLY, SCREEN, OVERLAY, SOFTLIGHT, COLOR, LUMINOSITY …), `set_layer_opacity`.
- `create_text_layer {text, x, y, fontSize, fontName (PostScript), tracking, leading, kind, box_width, box_height, alignment, red, green,
  blue}`; `set_text_style`, `set_text_ranges {ranges:[{from, to, fontName, red, …}]}` for mixed styling in one layer;
  `update_text_content`, `set_text_font`, `set_text_color`, `set_text_alignment`. `list_fonts` for names; `font_not_found` → pick from it.

## Hand-over points
Painting (frequency layers, dodge & burn, healing), Camera Raw, Liquify and Select and Mask are the user's work: prepare the stack by
script, name the layers, export a before-frame, then describe exactly which layer to paint on and with what. After the user is done:
`ps_get_layers` → `ps_export_frame`, compare.
