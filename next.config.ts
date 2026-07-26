import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "jszip",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // Ensure Chromium brotli binaries are included in the Vercel serverless bundle
  outputFileTracingIncludes: {
    "/api/evidence/capture": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/evidence/capture/route": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
};

export default nextConfig;
