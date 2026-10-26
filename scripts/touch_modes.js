// Touch behaviour layer (v6) for Pose Studio. Does NOT edit the vendor files: it wraps the
// viewer's instance methods handlePointerDown/Move/Up and adds ONE capture-phase pointerdown listener.
//  A) "Position mode": 1-finger drag on a doll moves the whole doll in the yellow-frame plane (same data the
//     left touch-pad writes: exportParams.cam_offset_x/y + character.transform.z -> persistActivePoseCameraParams()).
//  B) Joint dots: touch+drag = vendor IK pull (unchanged); touch held still >= longPressMs = rotate gizmo.
import { el, btn, row, mark } from "./ui_bar.js";
export function install(studio, userCfg = {}) {
  const v = studio.viewer, cv = v.canvas, T = v.THREE;
  const cfg = { longPressMs: 450, slop: 10, tapSelects: false, gizmoZonePx: 24, lockDepth: true, ...userCfg };
  const pm = { on: false, all: false, drag: null };
  const api = (studio.touchModes = { cfg, pm });
  const orig = { down: v.handlePointerDown.bind(v), move: v.handlePointerMove.bind(v), up: v.handlePointerUp.bind(v) };
  let lp = null; // long-press state

  // ---------- helpers ----------
  const rayFrom = (e) => {
    const r = cv.getBoundingClientRect();
    const rc = new T.Raycaster();
    rc.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), v.camera);
    return rc;
  };
  const markerScreen = (bone) => {
    const i = v.boneList.indexOf(bone);
    const m = v.jointMarkers.find((mk) => mk.userData?.boneIndex === i);
    if (!m) return null;
    const p = m.getWorldPosition(new T.Vector3()).project(v.camera);
    const r = cv.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  };
  // ring indicator shown while waiting for the long press
  const ring = document.createElement("div");
  ring.style.cssText = "position:fixed;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:3px solid #ff9;pointer-events:none;z-index:99999;display:none;transform:scale(1.6);opacity:.2";
  document.body.appendChild(ring);
  const showRing = (x, y) => { ring.style.transition = "none"; ring.style.transform = "scale(1.6)"; ring.style.opacity = ".2"; ring.style.left = x + "px"; ring.style.top = y + "px"; ring.style.display = "block";
    void ring.offsetWidth; ring.style.transition = `transform ${cfg.longPressMs}ms linear, opacity ${cfg.longPressMs}ms linear`; ring.style.transform = "scale(0.6)"; ring.style.opacity = "1"; };
  const hideRing = () => { ring.style.display = "none"; };

  // ---------- B) joint dots: capture-phase guard so the gizmo does not steal a touch that lands on its own dot ----------
  cv.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary || pm.on) return;
    if (v.selectedBone && v.transform.object) {
      const s = markerScreen(v.selectedBone);
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < cfg.gizmoZonePx) v.deselectBone({ source: "viewer" });
    }
  }, true);

  function cancelLongPress(revert) {
    if (!lp) return;
    clearTimeout(lp.t); hideRing();
    if (!lp.fired && v.directDrag?.active) {            // 2nd finger landed: abort the pull, restore the pose
      v.directDrag.hasDragged = true;
      orig.up({ pointerId: lp.id, type: "pointercancel" }, { cancelled: true });
      if (revert) v.undo();
      v.orbit.enabled = true;
    }
    lp = null;
  }
  function fireLongPress() {
    if (!lp || !v.directDrag?.active) return;
    lp.fired = true; hideRing();
    if (v.selectedBone === v.directDrag.clickedBone) v.deselectBone({ source: "viewer" });
    v.directDrag.hasDragged = false;                      // vendor then selects clickedBone -> rotate gizmo
    orig.up({ pointerId: lp.id, type: "pointerup" }, {});
    v.orbit.enabled = false;                              // finger is still down: keep the camera still until it lifts
    v.history.pop();                                      // drop the no-op undo entry recorded at pointerdown
    navigator.vibrate?.(30);
  }

  // ---------- A) position mode ----------
  const capDir = () => v.captureCamera.getWorldDirection(new T.Vector3());
  const allChars = () => studio.characters.map((ch) => ({ ch, active: ch.id === studio.activeCharacterId }));
  function pickCharacter(e) {
    const rc = rayFrom(e);
    const meshes = [v.skinnedMesh, ...[...(v.passiveCharacters?.values?.() || [])].map((p) => p.mesh)].filter(Boolean);
    meshes.forEach((m) => m.updateMatrixWorld(true));
    const hit = rc.intersectObjects(meshes, true)[0];
    if (!hit) return null;
    let id = studio.activeCharacterId;
    if (!(hit.object === v.skinnedMesh || v.skinnedMesh.getObjectById?.(hit.object.id))) {
      for (const [pid, p] of v.passiveCharacters) if (p.mesh === hit.object || p.mesh.getObjectById?.(hit.object.id)) id = pid;
    }
    return { id, point: hit.point.clone(), ray: rc.ray };
  }
  const readPos = (ch) => { const cp = studio.cameraParamsForPose(ch.poses[studio.activeTab] || {}, ch); return new T.Vector3(cp.offset_x, cp.offset_y, ch.transform?.z || 0); };
  const inRange = (p) => Math.abs(p.x) <= 50 && Math.abs(p.y) <= 50 && Math.abs(p.z) <= 40;
  function applyPositions(map) { // map: id -> Vector3
    const tab = studio.activeTab;
    for (const { ch, active } of allChars()) {
      const p = map.get(ch.id); if (!p) continue;
      if (active) {
        ch.transform.z = p.z; studio.exportParams.cam_offset_x = p.x; studio.exportParams.cam_offset_y = p.y;
        studio.persistActivePoseCameraParams();           // vendor path (same as the left touch pad)
      } else {
        const pose = ch.poses[tab] || (ch.poses[tab] = {});
        pose.cameraParams = { ...studio.cameraParamsForPose(pose, ch), offset_x: p.x, offset_y: p.y };
        ch.transform = { ...ch.transform, x: p.x, y: p.y, z: p.z };
        v.passiveCharacters.get(ch.id)?.mesh.position.set(p.x, p.y, p.z);
      }
    }
    v.updateIKEffectorPositions?.(); v.updateMarkers?.(); v.requestRender();
  }
  async function posDown(e) {
    const hit = pickCharacter(e);
    if (!hit) return;                                      // empty background: orbit may rotate the view as usual
    pm.drag = { id: e.pointerId, last: e, ready: false };
    v.orbit.enabled = false;
    if (hit.id !== studio.activeCharacterId) {
      await studio.selectCharacter(hit.id);                // vendor selection (swaps the live doll)
      if (!pm.drag) return;
    }
    const e0 = pm.drag.last;
    const rc = rayFrom(e0), n0 = capDir(), n1 = v.camera.getWorldDirection(new T.Vector3());
    const normal = cfg.lockDepth && Math.abs(rc.ray.direction.dot(n0)) > 0.35 ? n0 : n1;
    const plane = new T.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
    const P0 = hit.point.clone();
    if (!studio.isAnimationMode()) v.recordState();
    const start = new Map(allChars().map(({ ch }) => [ch.id, readPos(ch)]));
    Object.assign(pm.drag, { plane, P0, start, ready: true, moved: false });
    posMove(pm.drag.last);
  }
  function posMove(e) {
    const d = pm.drag; if (!d) return; d.last = e; if (!d.ready) return;
    const P = new T.Vector3();
    if (!rayFrom(e).ray.intersectPlane(d.plane, P)) return;
    const delta = P.sub(d.P0), map = new Map();
    if (pm.all) {
      for (const [id, p0] of d.start) map.set(id, p0.clone().add(delta));
      if (![...map.values()].every(inRange)) return;       // all-or-nothing keeps the spacing between dolls
    } else {
      const id = studio.activeCharacterId, p = d.start.get(id).clone().add(delta);
      p.set(Math.max(-50, Math.min(50, p.x)), Math.max(-50, Math.min(50, p.y)), Math.max(-40, Math.min(40, p.z)));
      map.set(id, p);
    }
    d.moved = true; applyPositions(map);
  }
  function posUp() {
    const d = pm.drag; pm.drag = null; v.orbit.enabled = true;
    if (d?.ready && d.moved) { if (pm.all) studio.updateCharacterScene?.(); studio.syncToNode(false, { skipCapture: true }); }
  }
  // depth by buttons: move along the output camera axis
  api.nudgeDepth = (amount) => {
    const n = capDir().multiplyScalar(-amount), map = new Map();
    const ids = pm.all ? studio.characters.map((c) => c.id) : [studio.activeCharacterId];
    for (const id of ids) map.set(id, readPos(studio.characters.find((c) => c.id === id)).add(n));
    if (![...map.values()].every(inRange)) return false;
    if (!studio.isAnimationMode()) v.recordState();
    applyPositions(map); if (pm.all) studio.updateCharacterScene?.(); studio.syncToNode(false, { skipCapture: true }); return true;
  };

  // ---------- wrapped vendor handlers ----------
  v.handlePointerDown = function (e) {
    const touch = e.pointerType === "touch";
    if (touch && !e.isPrimary) { if (pm.drag) posUp(); cancelLongPress(true); return; }   // 2nd finger = pinch / pan only
    if (pm.on && e.button === 0) { posDown(e); return; }
    orig.down(e);
    if (touch && e.button === 0 && v.directDrag?.active) {
      cancelLongPress(false);
      lp = { id: e.pointerId, x0: e.clientX, y0: e.clientY, fired: false, slopped: false, t: setTimeout(fireLongPress, cfg.longPressMs) };
      showRing(e.clientX, e.clientY);
    }
  };
  v.handlePointerMove = function (e) {
    if (pm.drag && e.pointerId === pm.drag.id) { posMove(e); return; }
    if (lp && e.pointerId === lp.id) {
      if (lp.fired) return;
      if (!lp.slopped) {
        if (Math.hypot(e.clientX - lp.x0, e.clientY - lp.y0) < cfg.slop) return;   // finger jitter: not a drag yet
        lp.slopped = true; clearTimeout(lp.t); hideRing();
      }
    }
    orig.move(e);
  };
  v.handlePointerUp = function (e, o) {
    if (pm.drag && e.pointerId === pm.drag.id) { if (e.type !== "lostpointercapture") posUp(); return; }
    if (lp && e.pointerId === lp.id) {
      if (e.type === "lostpointercapture") return;
      const l = lp; lp = null; clearTimeout(l.t); hideRing();
      if (l.fired) { v.orbit.enabled = true; return; }
      if (!l.slopped && v.directDrag?.active && !cfg.tapSelects) {   // quick tap on a dot: pull mode, so nothing to select
        v.directDrag.hasDragged = true; orig.up(e, o); v.history.pop(); return;
      }
    }
    orig.up(e, o);
  };

  // ---------- UI: one bottom sheet (opened from the shared toolbar) ----------
  // no browser context menu / text selection / callout on long press over the 3D canvas
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.style.webkitTouchCallout = "none"; cv.style.userSelect = "none"; cv.style.webkitUserSelect = "none";
  const ui = studio.ui;
  const tool = ui.addTool("pos", "\u{1F4CD} \u09AA\u099C\u09BF\u09B6\u09A8", { title: "\u0986\u0999\u09C1\u09B2 \u09A6\u09BF\u09DF\u09C7 \u09AA\u09C1\u09A4\u09C1\u09B2 \u099F\u09C7\u09A8\u09C7 \u09B8\u09B0\u09BE\u09A8",
    onOpen: () => { pm.on = true; sync(); }, onClose: () => { pm.on = false; sync(); } });
  const hint = el("div", "font-size:12px;opacity:.85;margin:2px 0", "\u09AA\u09C1\u09A4\u09C1\u09B2\u09C7\u09B0 \u0993\u09AA\u09B0 \u0986\u0999\u09C1\u09B2 \u099F\u09C7\u09A8\u09C7 \u099C\u09BE\u09DF\u0997\u09BE \u09A0\u09BF\u0995 \u0995\u09B0\u09C1\u09A8 (\u09A6\u09C1\u0987 \u0986\u0999\u09C1\u09B2\u09C7 \u0995\u09CD\u09AF\u09BE\u09AE\u09C7\u09B0\u09BE \u09B8\u09B0\u09BE\u09A8\u09CB/\u099C\u09C1\u09AE)");
  tool.body.appendChild(hint);
  const r = row(tool.body);
  const bAll = btn(r, "\u{1F465} \u09B8\u09AC\u09BE\u0987 \u098F\u0995\u09B8\u09BE\u09A5\u09C7", () => { pm.all = !pm.all; sync(); });
  const bNear = btn(r, "\u2B06 \u0995\u09BE\u099B\u09C7", () => api.nudgeDepth(+2));
  const bFar = btn(r, "\u2B07 \u09A6\u09C2\u09B0\u09C7", () => api.nudgeDepth(-2));
  function sync() { mark(bAll, pm.all); }
  sync();
  api.setPositionMode = (on) => { if (on) ui.open("pos"); else if (ui.openId === "pos") ui.close(); };
  api.setAll = (on) => { pm.all = !!on; sync(); };
  return api;
}
