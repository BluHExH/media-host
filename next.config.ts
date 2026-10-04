import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    minimumCacheTTL: 60,
    formats: ["image/avif", "image/webp"],
    // Cap disk cache (mitigates unbounded /_next/image cache growth)
    maximumDiskCacheSize: 52_428_800,
  },
};

export default nextConfig;
