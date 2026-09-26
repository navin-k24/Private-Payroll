// Browser & Node isomorphic WebSocket shim for Next.js bundlers
const resolvedWs =
  typeof globalThis !== "undefined" && globalThis.WebSocket
    ? globalThis.WebSocket
    : typeof window !== "undefined" && window.WebSocket
      ? window.WebSocket
      : null;

export const WebSocket = resolvedWs;
export default resolvedWs;
