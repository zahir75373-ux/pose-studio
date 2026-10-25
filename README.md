# Pose Studio (standalone) — local test wrapper

Runs the UNMODIFIED `web/vnccs_pose_studio.js` + `web/pose_studio/*` from AHEKOT/ComfyUI_VNCCS_Utils (MIT,
commit 2b0f404, 2026-10-11) with no ComfyUI. Only additions: `index.html`, `scripts/app.js` + `scripts/api.js`
(stubs of ComfyUI's modules), `sw.js` + `manifest.webmanifest` (offline cache / "install" on phone), `build.sh`.

Serve:   cd pose_studio_standalone && python3 -m http.server 8231   -> http://127.0.0.1:8231/index.html
Rebuild extensions/ from a clone:  ./build.sh /path/to/ComfyUI_VNCCS_Utils
Not working without a server: Pose Library, image/video -> pose (SAM 3D Body), Mixamo FBX (loads three.js from esm.sh).
Works: 3D doll, IK/FK dragging, body sliders, tabs, Export (pose_set JSON), Import (pose_set / single_pose / OpenPose JSON).
Licenses: LICENSE.VNCCS-MIT (code); MakeHuman-derived mesh asset is CC0 (see extensions/.../pose_studio/assets/*.md).
Size ~49 MB (37 MB model). Cloudflare Pages max file 25 MiB -> use GitHub Pages / Netlify instead.
