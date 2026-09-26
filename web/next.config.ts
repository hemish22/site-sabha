import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A stray lockfile higher up (~/Desktop) would otherwise be taken as the workspace root.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
