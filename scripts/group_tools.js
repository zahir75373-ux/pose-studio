// Group tools (v6) for multi-character scenes (does NOT modify vnccs_pose_studio.js).
// Moves/rotates/scales ALL characters rigidly about their common centre by editing the same data Pose Studio
// itself uses for a character in image mode:
//   x, y, zoom -> character.poses[activeTab].cameraParams.{offset_x, offset_y, zoom}   (per pose tab)
//   z          -> character.transform.z                                                  (per character, all tabs)
//   rotation   -> character.poses[activeTab].modelRotation = [rx, ry, rz] degrees (Euler XYZ, mesh.rotation)
// Mesh world transform of a doll = T(x,y,z) * R(modelRotation) * S(zoom)  (uniform scale), so a similarity
// transform of the group = new x/y/z + new zoom + new modelRotation. Poses (bones) are never touched.
const R2D = 180 / Math.PI;

export function install(studio) {
  const api = {};
  const THREE = () => studio.viewer.THREE;

  // ---- read/write helpers ------------------------------------------------------------------------
  function readState() {
    studio.captureActiveCharacterRuntime();           // flush the live viewer (active doll) into data
    const T = THREE(), v = studio.viewer, tab = studio.activeTab;
    return studio.characters.map((ch) => {
      studio.ensureCharacterRuntime(ch);
      const pose = ch.poses[tab] || (ch.poses[tab] = {});
      const cp = studio.cameraParamsForPose(pose, ch);
      const rot = Array.isArray(pose.modelRotation) ? pose.modelRotation : [0, 0, 0];
      const isActive = ch.id === studio.activeCharacterId;
      const mesh = isActive ? v.skinnedMesh : v.passiveCharacters?.get(ch.id)?.mesh;
      let localCenter = new T.Vector3(0, 0, 0);
      if (mesh?.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        mesh.geometry.boundingBox.getCenter(localCenter);
      }
      return {
        id: ch.id,
        pos: new T.Vector3(cp.offset_x, cp.offset_y, ch.transform?.z || 0),
        zoom: cp.zoom,
        rot: new T.Euler(rot[0] / R2D, rot[1] / R2D, rot[2] / R2D, "XYZ"),
        localCenter,
      };
    });
  }
  const bodyCenter = (s) => s.localCenter.clone().applyEuler(s.rot).multiplyScalar(s.zoom).add(s.pos);
  function groupCenter(states) {
    const T = THREE(), c = new T.Vector3();
    states.forEach((s) => c.add(bodyCenter(s)));
    return c.multiplyScalar(1 / states.length);
  }
  const clampOK = (p, z) => Math.abs(p.x) <= 50 && Math.abs(p.y) <= 50 && Math.abs(p.z) <= 40 && z >= 0.1 && z <= 7;

  function write(states) {
    const tab = studio.activeTab;
    for (const s of states) {
      const ch = studio.characters.find((c) => c.id === s.id);
      const pose = ch.poses[tab];
      pose.cameraParams = { ...studio.cameraParamsForPose(pose, ch), offset_x: s.pos.x, offset_y: s.pos.y, zoom: s.zoom };
      pose.modelRotation = [s.rot.x * R2D, s.rot.y * R2D, s.rot.z * R2D];
      ch.transform = { ...ch.transform, x: s.pos.x, y: s.pos.y, z: s.pos.z, zoom: s.zoom };
    }
    // refresh the live (active) doll + sliders + the passive dolls
    const act = studio.getActiveCharacter(), sa = states.find((s) => s.id === act.id);
    studio.exportParams.cam_offset_x = sa.pos.x;
    studio.exportParams.cam_offset_y = sa.pos.y;
    studio.exportParams.cam_zoom = sa.zoom;
    studio.viewer.setModelRotation(sa.rot.x * R2D, sa.rot.y * R2D, sa.rot.z * R2D);
    studio.viewer.setActiveCharacterAppearance({ color: act.color, transform: act.transform });
    studio.updateRotationSliders?.();
    studio.syncCameraWidgets();
    studio.updateCharacterScene();
    studio.syncToNode(false, { skipCapture: true });
  }

  // ---- maths -------------------------------------------------------------------------------------
  // similarity about C: p' = C + k*Q*(p-C);  zoom' = k*zoom;  R' = Q*R
  function transformAbout(states, C, k, Q, yawRad = null) {
    const T = THREE();
    return states.map((s) => {
      const q = new T.Quaternion().setFromEuler(s.rot);
      q.premultiply(Q);
      let rot = new T.Euler().setFromQuaternion(q, "XYZ");
      // common case (doll only turned left/right): keep the tidy [0, y, 0] form instead of a flipped Euler triple
      if (yawRad !== null && Math.abs(s.rot.x) < 1e-6 && Math.abs(s.rot.z) < 1e-6) {
        let y = s.rot.y + yawRad; y = Math.atan2(Math.sin(y), Math.cos(y));
        rot = new T.Euler(0, y, 0, "XYZ");
      }
      const pos = s.pos.clone().sub(C).applyQuaternion(Q).multiplyScalar(k).add(C);
      return { ...s, pos, zoom: s.zoom * k, rot };
    });
  }
  const undoStack = [];                              // up to 30 snapshots (a slider drag counts as ONE step)
  function apply(next, before) {
    for (const s of next) if (!clampOK(s.pos, s.zoom)) return { ok: false, reason: "limit" };
    if (undoStack[undoStack.length - 1] !== before) { undoStack.push(before); if (undoStack.length > 30) undoStack.shift(); }
    write(next);
    return { ok: true };
  }

  api.scale = (k, base) => {                         // base = states snapshot (optional, for sliders)
    const T = THREE(), st = base || readState(), C = groupCenter(st);
    return apply(transformAbout(st, C, k, new T.Quaternion()), st);
  };
  api.rotateY = (deg, base) => {                     // spin the group about the vertical axis through its centre
    const T = THREE(), st = base || readState(), C = groupCenter(st);
    const Q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), deg / R2D);
    return apply(transformAbout(st, C, 1, Q, deg / R2D), st);
  };
  api.tiltX = (deg, base) => {                       // optional tilt about the horizontal (screen-left/right) axis
    const T = THREE(), st = base || readState(), C = groupCenter(st);
    const Q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), deg / R2D);
    return apply(transformAbout(st, C, 1, Q), st);
  };
  api.depth = (d, base) => {                         // d>0 = towards the output camera, along its viewing direction
    const T = THREE(), st = base || readState();
    const yaw = (studio.exportParams.cam_yaw_deg || 0) / R2D, pitch = (studio.exportParams.cam_pitch_deg || 0) / R2D;
    const dir = new T.Vector3(0, 0, 1).applyEuler(new T.Euler(pitch, yaw, 0, "YXZ"));
    const next = st.map((s) => ({ ...s, pos: s.pos.clone().addScaledVector(dir, d) }));
    return apply(next, st);
  };
  api.flipActive = (deg = 180, base) => {            // turn ONLY the selected doll about its own body centre (e.g. back vs front check)
    const T = THREE(), st = base || readState(), act = st.find((s) => s.id === studio.activeCharacterId);
    if (!act) return { ok: false };
    const C = bodyCenter(act);
    const Q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), deg / R2D);
    const one = transformAbout([act], C, 1, Q, deg / R2D)[0];
    return apply(st.map((s) => (s.id === act.id ? one : s)), st);
  };
  api.undo = () => { const b = undoStack.pop(); if (!b) return false; write(b); return true; };
  api.undoDepth = () => undoStack.length;
  api.restore = (snap) => { undoStack.push(readState()); if (undoStack.length > 30) undoStack.shift(); write(snap); };
  api.snapshot = readState;
  api.center = () => groupCenter(readState()).toArray();
  studio.groupTools = api;
  return api;
}


// ---- bottom sheet (Bengali) -----------------------------------------------------------------------------------
import { el, btn, row } from "./ui_bar.js";
export function installPanel(studio) {
  const api = studio.groupTools || install(studio);
  const ui = studio.ui;
  const tool = ui.addTool("group", "\u{1F465} \u0997\u09CD\u09B0\u09C1\u09AA", { title: "\u09B8\u09AC \u09AA\u09C1\u09A4\u09C1\u09B2 \u098F\u0995\u09B8\u09BE\u09A5\u09C7", onOpen: () => { opened = api.snapshot(); msg.textContent = ""; } });
  const body = tool.body; let opened = null;
  const msg = el("div", "font-size:12px;opacity:.85;min-height:15px;color:#fc6");
  const report = (res) => { msg.textContent = res && res.ok === false ? "\u09B8\u09C0\u09AE\u09BE\u09B0 \u09AC\u09BE\u0987\u09B0\u09C7 \u09AF\u09BE\u099A\u09CD\u099B\u09C7, \u0986\u09B0 \u09B9\u09AC\u09C7 \u09A8\u09BE" : ""; };
  const lab = (r, t, w = 66) => r.appendChild(el("span", `width:${w}px;flex:none`, t));
  const slider = (r, min, max, step, fn, fmt) => {
    const s = el("input", "flex:1;min-width:90px;height:32px"); s.type = "range"; s.min = min; s.max = max; s.step = step; s.value = 0;
    const val = el("span", "width:34px;text-align:right;flex:none;opacity:.8", "0");
    let base = null; const begin = () => { if (!base) base = api.snapshot(); };
    s.addEventListener("pointerdown", begin); s.addEventListener("touchstart", begin, { passive: true });
    s.addEventListener("input", () => { begin(); val.textContent = fmt ? fmt(+s.value) : s.value; report(fn(parseFloat(s.value), base)); });
    s.addEventListener("change", () => { base = null; s.value = 0; val.textContent = "0"; });
    r.appendChild(s); r.appendChild(val); return s;
  };
  const r1 = row(body); lab(r1, "\u09B8\u09BE\u0987\u099C");           // সাইজ
  btn(r1, "\u2212 \u099B\u09CB\u099F\u09CB", () => report(api.scale(1 / 1.1))); btn(r1, "+ \u09AC\u09DC\u09CB", () => report(api.scale(1.1)));
  const r2 = row(body); lab(r2, "\u0998\u09CB\u09B0\u09BE\u09A8\u09CB");   // ঘোরানো
  btn(r2, "\u27F2 15\u00B0", () => report(api.rotateY(-15))); slider(r2, -180, 180, 1, (v, b) => api.rotateY(v, b), (n) => n + "\u00B0"); btn(r2, "\u27F3 15\u00B0", () => report(api.rotateY(15)));
  const r3 = row(body); lab(r3, "\u0995\u09BE\u099B\u09C7/\u09A6\u09C2\u09B0\u09C7");  // কাছে/দূরে
  slider(r3, -25, 25, 0.5, (v, b) => api.depth(v, b));
  const r4 = row(body); lab(r4, "\u09B9\u09C7\u09B2\u09BE\u09A8\u09CB");   // হেলানো
  slider(r4, -60, 60, 1, (v, b) => api.tiltX(v, b), (n) => n + "\u00B0");
  const r5 = row(body); lab(r5, "\u09A6\u09C7\u0996\u09BE\u09B0 \u09A6\u09BF\u0995", 66);   // দেখার দিক (check views)
  btn(r5, "\u09AA\u09BE\u09B6 90\u00B0", () => report(api.rotateY(90)));
  btn(r5, "\u0989\u09B2\u09CD\u099F\u09CB 180\u00B0", () => report(api.rotateY(180)));
  btn(r5, "\u098F\u0987 \u09AA\u09C1\u09A4\u09C1\u09B2 \u0989\u09B2\u09CD\u099F\u09CB", () => report(api.flipActive(180)));
  const r6 = row(body);
  btn(r6, "\u21B6 \u0986\u0997\u09C7\u09B0\u099F\u09BE", () => { if (!api.undo()) msg.textContent = "\u0986\u09B0 \u0986\u0997\u09C7\u09B0 \u09A7\u09BE\u09AA \u09A8\u09C7\u0987"; else msg.textContent = ""; });
  btn(r6, "\u2B6F \u0996\u09CB\u09B2\u09BE\u09B0 \u09B8\u09AE\u09DF\u09C7\u09B0 \u0985\u09AC\u09B8\u09CD\u09A5\u09BE", () => { if (opened) { api.restore(opened); msg.textContent = ""; } });
  body.appendChild(msg);
  return tool;
}
