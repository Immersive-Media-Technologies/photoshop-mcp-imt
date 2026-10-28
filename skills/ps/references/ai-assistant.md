# AI Assistant (Photoshop Beta), Firefly Boards, Actions

## AI Assistant (early beta — Photoshop (Beta) app only)
Open: the **AI Assistant** icon at the top right of the window (Photoshop (Beta) from the Creative Cloud app; not in the release app).
- Prompts: edits («remove the background», «make the sky more dramatic», «remove the wires»), variations, refining an area without a
  manual selection; also non-editing: step-by-step guidance, error help, «Review my layers», critique, captions, metadata, «Identify
  the fonts», colour palettes. Suggested edits are reviewed and applied in the panel, follow-ups continue the chat.
- It is a UI agent inside the same document: **never run it and `ps_*` writes at the same time**; after an Assistant turn re-read with
  `ps_get_state` / `ps_get_layers` before scripting. Its edits are history states → `get_history` shows them, `undo` reverts them.
- Chat and pixels go to Adobe's cloud; generative steps it triggers spend credits like the UI features. Beta: work on a copy
  (`ps_save_document {path}` first) and do not hand a Beta-saved file to a release-only machine without checking it opens.
- The connector is verified with the release app (27.9–27.10). The Beta app loads the same ExtendScript transport in principle but is
  unverified; do not run both apps at once while the server works.
- Delegate to it what has no script route and the user has the Beta: area edits without a selection, quick variations, layer review.

## Firefly Boards (UI)
- To Boards: Share › **Send to Firefly Boards** (a local PSD is uploaded as a cloud document, PSDC); File › Export › Send to Firefly
  Boards; right-click selected layers › **Send layers to Firefly Boards**; on a generated variation: More options › Ideate in Firefly
  Boards. Pick an existing board or a new one → Open in Boards.
- Back: in Boards right-click an image › **Open in Photoshop** → a new document → `ps_get_state`, `list_documents`, `set_active_document`.
- Boards runs partner models with its own limits and credits (Firefly's rate table); uploads leave the machine — ask first.

## Actions (scriptable)
`play_action {actionSetName, actionName}` runs a recorded action — the user's route for anything the server lacks (a Camera Raw preset,
a Neural Filter with saved settings, a plugin). Names are as the Actions panel shows them in this UI language; the built-in set is
«Default Actions» only in English. Unknown name → `invalid_arguments` with the real set / action names → retry with one. An action that
opens a dialog makes Photoshop modal (`photoshop_busy`) — record it with dialogs off, or let the user answer the dialog.

## Hand-over to the user (pattern)
1. Script the setup (SKILL.md §5), export a before-frame, name the exact layer and selection.
2. One message: the click path, what to type, the model and its credit cost, what to leave open (the result layer, not a dialog).
3. Wait. Then `ps_get_state` → `ps_get_layers` → `ps_export_frame` and compare with the before-frame.

Sources: helpx.adobe.com/photoshop/desktop/whats-new/ai-assistant-overview (2026-06-23), …/get-started/set-up-toolbars-panels/
edit-images-with-ai-assistant; …/generative-ai/open-firefly-boards (2026-10-25); helpx «Play an action».
