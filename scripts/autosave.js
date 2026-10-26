// Autosave of unsaved work (v6): every change -> (3 s later) the whole scene (all dolls, poses, positions, body sliders, camera,
// output size, clothing strokes) is written to this browser (IndexedDB). Also written at once when the app is hidden / closed.
// Next time the app opens: "আগের কাজ ফিরিয়ে আনবেন?" -> restore (same code path as Scene import) or discard.
// Uses scene_io.buildScene / loadScene, so it saves exactly what a Scene export saves.
import { buildScene, loadScene } from "./scene_io.js";
import { el, btn } from "./ui_bar.js";

const DB = "pose-studio-autosave", STORE = "kv", KEY = "latest", LS_KEY = "ps-autosave-fallback";
const idb = () => new Promise((res, rej) => {
  const rq = indexedDB.open(DB, 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
  rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
});
async function idbGet() { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); }
async function idbPut(v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function idbDel() { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

export function install(studio, { delayMs = 3000, quietMs = 4000 } = {}) {
  const st = { enabled: false, dirty: false, timer: null, lastSaved: 0, saves: 0, pending: null };
  const api = (studio.autosave = { st });

  function snapshot() {
    const scene = buildScene(studio);
    return { t: Date.now(), v: 1, scene };
  }
  async function saveNow(sync = false) {
    if (!st.enabled) return false;
    clearTimeout(st.timer); st.timer = null;
    let rec; try { rec = snapshot(); } catch (e) { console.warn("autosave snapshot failed", e); return false; }
    st.dirty = false;
    if (sync) { try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (_) {} }       // synchronous backup for pagehide
    try { await idbPut(rec); st.lastSaved = rec.t; st.saves++; try { localStorage.removeItem(LS_KEY); } catch (_) {} return true; }
    catch (e) { try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); st.lastSaved = rec.t; st.saves++; return true; } catch (_) { return false; } }
  }
  function markDirty() {
    if (!st.enabled) return;
    st.dirty = true;
    clearTimeout(st.timer); st.timer = setTimeout(() => saveNow(false), delayMs);
  }
  api.saveNow = saveNow; api.markDirty = markDirty;

  // every change of the app goes through syncToNode (poses, sliders, camera, dolls ...); clothing strokes via onChange
  const origSync = studio.syncToNode.bind(studio);
  studio.syncToNode = (...a) => { markDirty(); return origSync(...a); };
  if (studio.cloth3d) { const prev = studio.cloth3d.onChange; studio.cloth3d.onChange = () => { markDirty(); prev && prev(); }; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && st.dirty) saveNow(true); });
  window.addEventListener("pagehide", () => { if (st.dirty) saveNow(true); });

  async function readSaved() {
    let a = null, b = null;
    try { a = await idbGet(); } catch (_) {}
    try { const s = localStorage.getItem(LS_KEY); b = s ? JSON.parse(s) : null; } catch (_) {}
    const best = a && b ? (b.t > a.t ? b : a) : (a || b);
    return best && best.scene && Array.isArray(best.scene.characters) && best.scene.characters.length ? best : null;
  }
  async function discard() { try { await idbDel(); } catch (_) {} try { localStorage.removeItem(LS_KEY); } catch (_) {} }
  api.readSaved = readSaved; api.discard = discard;

  function describe(rec) {
    const d = new Date(rec.t), p = (n) => String(n).padStart(2, "0");
    const n = rec.scene.characters.length;
    const strokes = rec.scene.characters.reduce((a, c) => a + (c.clothing_strokes ? c.clothing_strokes.length : 0), 0);
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())} \u2022 ${n} \u099F\u09BE \u09AA\u09C1\u09A4\u09C1\u09B2` + (strokes ? ` \u2022 ${strokes} \u099F\u09BE \u09B0\u09C7\u0996\u09BE` : "");
  }
  function prompt(rec) {
    return new Promise((resolve) => {
      const ov = el("div", "position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center");
      ov.id = "autosavePrompt";
      const box = el("div", "background:#1b1b28;border:1px solid #888;border-radius:12px;padding:14px;width:min(88vw,340px);color:#fff;font:16px sans-serif;box-sizing:border-box");
      box.appendChild(el("div", "font-weight:bold;font-size:17px;margin-bottom:6px", "\u0986\u0997\u09C7\u09B0 \u0995\u09BE\u099C \u09AB\u09BF\u09B0\u09BF\u09DF\u09C7 \u0986\u09A8\u09AC\u09C7\u09A8?"));
      box.appendChild(el("div", "font-size:13px;opacity:.8;margin-bottom:10px", "\u0985\u099F\u09CB-\u09B8\u09C7\u09AD \u0995\u09B0\u09BE \u0995\u09BE\u099C \u09AA\u09BE\u0993\u09DF\u09BE \u0997\u09C7\u099B\u09C7: " + describe(rec)));
      const r = el("div", "display:flex;gap:8px");
      const done = (v) => { ov.remove(); resolve(v); };
      btn(r, "\u2705 \u09AB\u09BF\u09B0\u09BF\u09DF\u09C7 \u0986\u09A8\u09C1\u09A8", () => done(true), "flex:1;height:44px;font-size:15px;background:#27406a");
      btn(r, "\u{1F5D1} \u09AC\u09BE\u09A6 \u09A6\u09BF\u09A8", () => done(false), "flex:1;height:44px;font-size:15px");
      box.appendChild(r); ov.appendChild(box); document.body.appendChild(ov);
    });
  }
  api.prompt = prompt;

  // startup: look for saved work; autosave stays OFF until the user decided (so the old save is never overwritten by the blank start)
  api.ready = (async () => {
    const rec = await readSaved();
    if (rec) {
      const yes = await prompt(rec);
      if (yes) {
        try { await loadScene(studio, rec.scene); } catch (e) { console.error("autosave restore failed", e); studio.showMessage?.("\u09AB\u09BF\u09B0\u09BF\u09DF\u09C7 \u0986\u09A8\u09A4\u09C7 \u09B8\u09AE\u09B8\u09CD\u09AF\u09BE", true); }
      } else await discard();
    }
    setTimeout(() => { st.enabled = true; }, quietMs);       // ignore the app's own start-up / restore syncs
  })();
  return api;
}
