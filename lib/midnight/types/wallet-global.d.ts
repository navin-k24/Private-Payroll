import type { InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

declare global {
  interface Window {
    midnight?: {
      [key: string]: InitialAPI;
    };
  }
}

export {};
