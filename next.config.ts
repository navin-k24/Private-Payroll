import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
    resolveAlias: {
      "isomorphic-ws": "./lib/shims/isomorphic-ws.js",
    },
  },
};

export default nextConfig;
