import type { NextConfig } from "next";

const pdfTracingIncludes = [
  "./node_modules/pdf-parse/**/*",
  "./node_modules/pdfjs-dist/**/*",
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
  "./node_modules/@napi-rs/canvas-linux-x64-musl/**/*",
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/cases", destination: "/weekly", permanent: false },
      { source: "/cases/:path*", destination: "/weekly", permanent: false },
    ];
  },
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "mammoth",
    "jszip",
    "puppeteer-core",
    "@sparticuz/chromium",
    "@fontsource/noto-sans-kr",
  ],
  outputFileTracingIncludes: {
    "/api/scan/file": pdfTracingIncludes,
    "/api/scan/file/route": pdfTracingIncludes,
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
