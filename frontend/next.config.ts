import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_PROXY_URL;
    if (backendUrl && !backendUrl.startsWith("http://127.0.0.1") && !backendUrl.startsWith("http://localhost")) {
      return [
        {
          source: "/backend-proxy/:path*",
          destination: `${backendUrl.replace(/\/+$/, "")}/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
