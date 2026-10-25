// Minimal stub of ComfyUI's scripts/app.js so the unmodified Pose Studio file can be imported without ComfyUI.
export const app = {
  registerExtension() {},
  graph: { _nodes: [], links: {}, getNodeById() { return null; }, setDirtyCanvas() {} },
  canvas: null,
  canvasEl: null,
};
