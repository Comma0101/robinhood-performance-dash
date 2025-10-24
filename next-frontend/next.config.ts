import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  /* config options here */
  // Set the root directory for Turbopack to the parent directory.
  // This is necessary because Next.js is incorrectly inferring the
  // workspace root due to multiple lockfiles present in parent directories.
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
