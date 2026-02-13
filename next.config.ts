import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ccxt', '@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-code'],
  typescript: {
    // We'll handle TS errors separately — don't block the build
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
