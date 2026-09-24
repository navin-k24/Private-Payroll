// Browser & Node isomorphic WebSocket shim for Next.js bundlers
const ws =
  typeof WebSocket !== "undefined"
    ? WebSocket
    : typeof globalThis !== "undefined" && globalThis.WebSocket
      ? globalThis.WebSocket
      : null;

export const WebSocket = ws;
export default ws;
