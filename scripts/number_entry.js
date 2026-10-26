// Tap the number next to ANY left-panel slider (Zoom, age, muscle, waist, Yaw, rotation ...) to type an exact value.
// The slider stays as it is; we just set slider.value and fire the SAME `input` + `change` events a finger drag fires, so the
// doll, camera, undo history and saving all behave exactly like a normal slider move.
export function install(studio) {
  const root = studio.container;
  let overlay = null;
  const fieldSlider = (valueEl) => {
    const field = valueEl.closest(".vnccs-ps-field") || valueEl.parentElement?.parentElement;
    if (!field) return null;
    const s = field.querySelector('input[type="range"]');
    return s && !s.disabled ? s : null;
  };
  const labelOf = (valueEl, slider) => {
    const f = valueEl.closest(".vnccs-ps-field");
    const l = f?.querySelector(".vnccs-ps-label");
    return (l?.textContent || "").trim() || "Value";
  };
  const decimals = (step) => { const s = String(step); return s.includes(".") ? s.split(".")[1].length : 0; };
  function setSlider(slider, raw) {
    const min = parseFloat(slider.min), max = parseFloat(slider.max), step = parseFloat(slider.step) || 1;
    let v = parseFloat(String(raw).replace(",", "."));
    if (!Number.isFinite(v)) return false;
    v = Math.max(min, Math.min(max, v));
    v = min + Math.round((v - min) / step) * step;                // snap to the slider's own step
    v = +v.toFixed(Math.max(decimals(step), 4));
    slider.value = v;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function open(slider, name) {
    close();
    const min = parseFloat(slider.min), max = parseFloat(slider.max);
    overlay = document.createElement("div"); overlay.id = "numEntry";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center";
    const box = document.createElement("div");
    box.style.cssText = "background:#1b1b28;border:1px solid #888;border-radius:12px;padding:12px 14px;width:min(86vw,320px);color:#fff;font:15px sans-serif;box-sizing:border-box";
    const title = document.createElement("div"); title.textContent = name; title.style.cssText = "font-weight:bold;margin-bottom:4px";
    const range = document.createElement("div"); range.textContent = `${min} \u2026 ${max}`; range.style.cssText = "font-size:12px;opacity:.7;margin-bottom:8px";
    const inp = document.createElement("input");
    inp.type = "number"; inp.inputMode = "decimal"; inp.min = min; inp.max = max; inp.step = slider.step || "any"; inp.value = slider.value;
    inp.style.cssText = "width:100%;box-sizing:border-box;height:44px;font-size:20px;border-radius:8px;border:2px solid #4cf;background:#0d0d16;color:#fff;padding:0 10px";
    const warn = document.createElement("div"); warn.style.cssText = "font-size:12px;color:#fc6;min-height:16px;margin-top:4px";
    const rw = document.createElement("div"); rw.style.cssText = "display:flex;gap:8px;margin-top:6px";
    const mk = (t, fn, bg) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = `flex:1;height:42px;font-size:15px;border-radius:8px;border:1px solid #888;background:${bg};color:#fff;touch-action:manipulation`; b.addEventListener("click", fn); rw.appendChild(b); return b; };
    const ok = () => {
      const raw = parseFloat(inp.value);
      if (!Number.isFinite(raw)) { warn.textContent = "\u09B8\u0999\u09CD\u0996\u09CD\u09AF\u09BE \u09B2\u09BF\u0996\u09C1\u09A8"; return; }
      setSlider(slider, inp.value); close();
    };
    mk("\u09A0\u09BF\u0995 \u0986\u099B\u09C7", ok, "#27406a"); mk("\u09AC\u09BE\u09A4\u09BF\u09B2", close, "#2a2a3a");
    inp.addEventListener("input", () => { const v = parseFloat(inp.value); warn.textContent = Number.isFinite(v) && (v < min || v > max) ? `\u09B8\u09C0\u09AE\u09BE \u09AC\u09BE\u0987\u09B0\u09C7: ${min} \u2026 ${max} \u098F\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7 \u0995\u09C7\u099F\u09C7 \u09A8\u09C7\u0993\u09DF\u09BE \u09B9\u09AC\u09C7` : ""; });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); else if (e.key === "Escape") close(); });
    overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
    box.append(title, range, inp, warn, rw); overlay.appendChild(box); document.body.appendChild(overlay);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }
  // Each number gets its OWN click listener (a phone browser nudges a tap to the nearest element that has a click handler -
  // without this a tap on "25" would land on the neighbouring reset button).
  const onValueClick = (e) => {
    const v = e.currentTarget;
    const s = fieldSlider(v); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    open(s, labelOf(v, s));
  };
  let scanQueued = false;
  const scan = () => { scanQueued = false; root.querySelectorAll(".vnccs-ps-value").forEach((v) => { if (!v._psNum) { v._psNum = 1; v.addEventListener("click", onValueClick); } }); };
  const queue = () => { if (!scanQueued) { scanQueued = true; requestAnimationFrame(scan); } };
  scan(); new MutationObserver(queue).observe(root, { childList: true, subtree: true });
  const st = document.createElement("style");
  st.textContent = ".vnccs-ps-value{cursor:pointer;text-decoration:underline dotted rgba(255,255,255,.5);text-underline-offset:3px;display:inline-block;min-width:34px;text-align:center;padding:7px 6px;margin:-7px -3px;box-sizing:border-box}";
  document.head.appendChild(st);
  const api = { setSlider, open, close };
  studio.numberEntry = api; return api;
}
