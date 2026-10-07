import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Only Amplience's app (visualizations) may embed the site in a frame.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.amplience.net" },
          // Which Amplience environment this deployment reads (production = CDN, preview = virtual staging).
          { key: "X-Content-Environment", value: process.env.AMPLIENCE_DELIVERY_HOST?.includes("staging") ? "preview" : "production" },
        ],
      },
    ];
  },
  images: {
    // Amplience Dynamic Imaging and BigCommerce product images (see lib/image-loader.ts)
    loaderFile: "./lib/image-loader.ts",
    remotePatterns: [{ protocol: "https", hostname: "cdn11.bigcommerce.com" }],
  },
};

export default nextConfig;
