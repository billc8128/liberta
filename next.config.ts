import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@daytona/sdk", "@earendil-works/pi-coding-agent"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
