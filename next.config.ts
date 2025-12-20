import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Allow larger payloads for Google Contacts import with photos
    },
  },
};

export default nextConfig;
