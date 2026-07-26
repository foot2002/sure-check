import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "jszip",
    "puppeteer-core",
    "@sparticuz/chromium",
    "@fontsource/noto-sans-kr",
  ],
  outputFileTracingIncludes: {
    "/api/evidence/capture": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff2",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff2",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff",
    ],
    "/api/evidence/capture/route": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff2",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff2",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff",
    ],
  },
};

export default nextConfig;
