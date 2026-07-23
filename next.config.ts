import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "jszip",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
};

export default nextConfig;
