// Scene export/import for the standalone wrapper (does NOT modify vnccs_pose_studio.js).
//
// Problem: Pose Studio's Export dialog ("Current Pose Only" / "All Poses (Set)") only writes the ACTIVE
// character. This adds a third button that writes ALL characters (poses, positions, zoom, mesh/body sliders,
// prompts, camera angles) into ONE json, and makes the normal Import button restore all of them.
//
// File format = Pose Studio's own v3 scene schema (same shape as the Pose Library's scene_pose / pose_animation
// assets, built with the same serializePoseStudioCharacter()):
//   type "pose_animation" + characters[]  -> the only multi-character JSON that the stock Import button of
//   Pose Studio accepts (handleFileImport -> loadCharacterSceneLibraryAsset). Stock Pose Studio opens it in
//   Animation mode (frame 0 = the saved pose; all poses/positions are kept in characters[].poses).
//   Extra key `vnccs_standalone_scene` marks files made here: the standalone Import restores them in normal
//   (image) mode with all pose tabs instead of Animation mode.
import * as CharModule from "../extensions/ComfyUI_VNCCS_Utils/pose_studio/characters.mjs?v=20260908.14";
import * as AnimModule from "../extensions/ComfyUI_VNCCS_Utils/pose_studio/animation.mjs?v=20260908.14";

const MARKER = "vnccs_standalone_scene";
const clone = (v) => JSON.parse(JSON.stringify(v));

// Same logic as characters.mjs serializePoseStudioCharacter (used directly from the vendor module).
const serializeCharacter = CharModule.serializePoseStudioCharacter;

export function buildScene(studio) {
  // Same preparation as the Pose Library save / exportPose('animation'): flush the viewer into the active char.
  studio.captureActiveCharacterRuntime();
  const animationMode = studio.isAnimationMode();
  const prompts = [...studio.posePrompts];
  while (prompts.length < studio.poses.length) prompts.push("");
  const characters = studio.characters.map((character) => {
    studio.ensureCharacterRuntime(character);
    let animation = null;
    if (animationMode && character.animationState) {
      animation = JSON.parse(AnimModule.serializeAnimationStateSnapshot(character.animationState));
      if (animation.basePose) studio.stripSceneCameraFromPose(animation.basePose);
    }
    // image mode: animation=null -> Pose Studio builds a default clip from the character's pose on load.
    const out = serializeCharacter(character, animation);
    // 3D clothing guide strokes (scripts/cloth3d.js) - extra key, ignored by the stock importers
    const strokes = studio.cloth3d?.serialize(character.id);
    if (strokes && strokes.length) out.clothing_strokes = strokes;
    return out;
  });
  // Top-level `animation` object is required by the stock importer for type "pose_animation".
  const activeChar = studio.getActiveCharacter();
  const activePose = clone(activeChar?.poses?.[studio.activeTab] || {});
  studio.stripSceneCameraFromPose(activePose);
  const topAnimation = animationMode && studio.animationState
    ? JSON.parse(AnimModule.serializeAnimationStateSnapshot(studio.animationState))
    : JSON.parse(AnimModule.serializeAnimationStateSnapshot(
        AnimModule.createDefaultAnimationState(activePose, { baseTransform: activeChar?.transform })));
  return {
    type: "pose_animation",
    version: "1.0",
    [MARKER]: { version: 1, mode: animationMode ? "animation" : "image", note: "all characters in one file" },
    schema_version: 3,
    animation: topAnimation,
    active_character_id: studio.activeCharacterId,
    activeTab: studio.activeTab,
    timeline: { ...studio.sharedTimeline },
    pose_prompts: prompts,
    camera: {
      yaw_deg: studio.exportParams.cam_yaw_deg || 0,
      pitch_deg: studio.exportParams.cam_pitch_deg || 0,
    },
    // output image size (Width/Height boxes in the Camera section) - extra key, ignored by the stock importers
    output_size: { width: studio.exportParams.view_width || 1024, height: studio.exportParams.view_height || 1024 },
    characters,
  };
}

export function downloadScene(studio, customName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = (customName && customName.trim())
    ? customName.trim().replace(/[^a-z0-9_\-\.]/gi, "_") : timestamp;
  const data = buildScene(studio);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `scene_${name}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return data;
}

export async function loadScene(studio, data) {
  const animation = data?.[MARKER]?.mode === "animation";
  // Same token handling as handleFileImport so stale async loads are dropped.
  studio._libraryLoadToken = (studio._libraryLoadToken || 0) + 1;
  await studio.loadCharacterSceneLibraryAsset(data, { animation });
  if (studio.cloth3d) {                                   // restore 3D clothing strokes (match characters by order)
    studio.cloth3d.clearAll();
    data.characters.forEach((d, i) => { const ch = studio.characters[i]; if (ch && d.clothing_strokes) studio.cloth3d.restore(ch.id, d.clothing_strokes); });
  }
  const os = data.output_size;                            // output Width/Height: set through the same input boxes the user types in
  if (os && Number.isFinite(os.width) && Number.isFinite(os.height)) {
    for (const [k, val] of [["view_width", os.width], ["view_height", os.height]]) {
      const w = studio.exportWidgets?.[k];
      if (w) { w.value = val; w.dispatchEvent(new Event("input", { bubbles: true })); w.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  }
  studio.showMessage(`Scene imported: ${data.characters.length} characters.`);
}

export function install(studio) {
  // 1) Export dialog: extra button (image mode; in Animation mode the stock "Animation Clip" button already
  //    exports every character).
  const origShowExport = studio.showExportModal.bind(studio);
  studio.showExportModal = function () {
    origShowExport();
    if (studio.isAnimationMode()) return;
    const overlays = studio.container.querySelectorAll(".vnccs-ps-modal-overlay");
    const overlay = overlays[overlays.length - 1];
    if (!overlay) return;
    const nameInput = overlay.querySelector("input");
    const cancel = overlay.querySelector(".vnccs-ps-modal-btn.cancel");
    const btn = document.createElement("button");
    btn.className = "vnccs-ps-modal-btn";
    btn.dataset.sceneExport = "1";
    btn.innerText = "সব পুতুল (Scene)";
    btn.onclick = () => {
      try { downloadScene(studio, nameInput?.value); }
      catch (err) { console.error(err); studio.showMessage?.(`Scene export failed: ${err?.message || err}`, true); }
      overlay.parentNode?.removeChild(overlay);
    };
    cancel.parentNode.insertBefore(btn, cancel);
  };

  // 2) Import: scene files made above (or any v3 scene with characters[]) restore ALL characters.
  const origImport = studio.handleFileImport.bind(studio);
  studio.handleFileImport = function (e) {
    const input = e.target;
    const file = input.files && input.files[0];
    const isJson = file && (/\.json$/i.test(file.name || "") || file.type === "application/json");
    if (!isJson) return origImport(e);
    (async () => {
      let data = null;
      try { data = JSON.parse(await file.text()); } catch (_) { /* let the stock importer report it */ }
      const isScene = data && Array.isArray(data.characters) && data.characters.length
        && (data[MARKER] || data.type === "scene_pose");
      if (!isScene) return origImport(e);
      try {
        await loadScene(studio, data);
      } catch (err) {
        console.error("Scene import failed:", err);
        studio.showMessage?.(`Failed to load scene file: ${err?.message || err}`, true);
      } finally {
        input.value = "";
      }
    })();
  };
}
