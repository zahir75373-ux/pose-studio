// Minimal stub of ComfyUI's scripts/api.js. No server exists, so server calls get a 404 Response.
export const api = {
  fetchApi: async () => new Response("no server", { status: 404 }),
  addEventListener() {},
  removeEventListener() {},
  apiURL: (p) => p,
};
