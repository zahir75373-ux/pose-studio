# Pose Studio (standalone) — local test wrapper

Runs the UNMODIFIED `web/vnccs_pose_studio.js` + `web/pose_studio/*` from AHEKOT/ComfyUI_VNCCS_Utils (MIT,
commit 2b0f404, 2026-10-11) with no ComfyUI. Only additions: `index.html`, `scripts/app.js` + `scripts/api.js`
(stubs of ComfyUI's modules), `sw.js` + `manifest.webmanifest` (offline cache / "install" on phone), `build.sh`,
`scripts/scene_io.js` (Export button "সব পুতুল (Scene)" = all characters in one JSON; Import restores them all).

Serve:   cd pose_studio_standalone && python3 -m http.server 8231   -> http://127.0.0.1:8231/index.html
Rebuild extensions/ from a clone:  ./build.sh /path/to/ComfyUI_VNCCS_Utils
Not working without a server: image/video -> pose (SAM 3D Body, needs ComfyUI + GPU), Mixamo FBX (loads three.js from esm.sh).
Works: 3D doll, IK/FK dragging, body sliders, tabs, Export (pose_set JSON), Import (pose_set / single_pose / OpenPose JSON).
Licenses: LICENSE.VNCCS-MIT (code); MakeHuman-derived mesh asset is CC0 (see extensions/.../pose_studio/assets/*.md).
Size ~49 MB (37 MB model). Cloudflare Pages max file 25 MiB -> use GitHub Pages / Netlify instead.

Pose Library (offline): `scripts/pose_library_local.js` answers the stock `/vnccs/pose_library/*` routes in the browser.
 - Bundled read-only library `pose_library/` = Hugging Face MIUProject/VNCCS_PoseLibrary_Main (16 poses + previews, 0.65 MB,
   SHA-256 verified). That HF repo declares NO license (see `pose_library/LICENSE-NOTE.txt`); shipped unmodified as the
   official default library of the MIT tool. Delete the folder to remove it - the app still works.
 - "Save Current Pose" / rename / delete work and are stored in this browser (IndexedDB, repository `local_user_poses`).
   Clearing browser data deletes them: back up with Export. A saved 2+ doll scene restores all dolls when applied.
 - Repository settings: bundled repo can be enabled/disabled; adding online repos / publishing is refused politely.

## v6 add-ons (all in `scripts/`, loaded by `index.html`; each one is optional - if one fails the app still runs)
- `ui_bar.js`   - ONE small toolbar (📍 পজিশন / 👥 গ্রুপ / ✏️ পোশাক) above the Undo row + one bottom sheet at a time. Hides while a vendor pop-up (Pose Library) is open. Very narrow phones: icons only.
- `touch_modes.js` - 📍 sheet: drag the doll to position it (👥 = all dolls together, ⬆⬇ near/far). Joint dots: drag = IK pull, long press = rotate gizmo. Long-press menu of the browser is disabled on the 3D view.
- `group_tools.js` - 👥 sheet: size of all dolls, 360° rotate around the group centre (keeps poses / holding hands), near/far, tilt, side/back check views, ↶ undo (30 steps), ⭯ back to the start state.
- `cloth3d.js` - ✏️ sheet: draw clothing lines/fills on the doll skin (they follow the pose, size, rotation and group tools and appear in the exported picture if "ছবিতে নিন" is on). Pen width slider (also changes a selected line), colours, fill, ↶ undo, delete all, per-line ✕, and a PARTIAL RUBBER with brush-size slider (rubbing removes only the touched part of a line; a filled shape is removed whole).
- `number_entry.js` - tap the number next to any left-panel slider to type an exact value.
- `autosave.js` - the whole scene (dolls, poses, sliders, camera, clothing lines) is saved in this browser; next start asks "আগের কাজ ফিরিয়ে আনবেন?".
- `scene_io.js` - Scene export/import now also stores `clothing_strokes` and the output size.
Cache name `pose-studio-standalone-v6` (bump it in `sw.js` on every update, otherwise phones keep the old files).
