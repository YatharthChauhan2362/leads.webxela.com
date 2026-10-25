import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Room for a 1 MB logo upload plus the form's own bytes.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
