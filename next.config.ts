import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Cap disk cache size (mitigates unbounded /_next/image cache growth)
    minimumCacheTTL: 60,
    formats: ["image/avif", "image/webp"],
    // Next 16.1.7+ LRU disk cache bound (bytes)
    // @ts-expect-error maximumDiskCacheSize available on patched Next
    maximumDiskCacheSize: 52_428_800,
  },
};

export default nextConfig;
