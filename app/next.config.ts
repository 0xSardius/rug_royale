import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SDK ships TypeScript source from the pnpm workspace.
  transpilePackages: ["@rug-royale/sdk"],
  turbopack: {
    // Repo root, so the SDK can import idl/ and coins.json from outside app/.
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
