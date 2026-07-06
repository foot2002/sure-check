import type { Platform } from "@/lib/types/scan";

export type CsapCertificationStatus = "certified" | "not_certified" | "unknown";

export type ToolCategory = "overseas_saas" | "domestic_saas" | "generic" | "certified";

export interface ToolCsapProfile {
  platformLabel: string;
  csapStatus: CsapCertificationStatus;
  csapStatusLabel: string;
  isExternalSaaS: boolean;
  toolCategory: ToolCategory;
}

const PLATFORM_PROFILES: Record<Platform, ToolCsapProfile> = {
  google_forms: {
    platformLabel: "Google Forms",
    csapStatus: "not_certified",
    csapStatusLabel: "CSAP 인증 도구로 확인되지 않은 해외 설문 SaaS",
    isExternalSaaS: true,
    toolCategory: "overseas_saas",
  },
  naver_forms: {
    platformLabel: "Naver Form",
    csapStatus: "unknown",
    csapStatusLabel: "CSAP 인증 여부 확인이 필요한 외부 설문 SaaS",
    isExternalSaaS: true,
    toolCategory: "domestic_saas",
  },
  moaform: {
    platformLabel: "Moaform",
    csapStatus: "unknown",
    csapStatusLabel: "CSAP 인증 여부 확인이 필요한 외부 설문 SaaS",
    isExternalSaaS: true,
    toolCategory: "domestic_saas",
  },
  generic: {
    platformLabel: "외부 설문 도구",
    csapStatus: "unknown",
    csapStatusLabel: "CSAP 인증 여부 확인 필요",
    isExternalSaaS: true,
    toolCategory: "generic",
  },
  wiseon_csap: {
    platformLabel: "WiseON",
    csapStatus: "certified",
    csapStatusLabel: "CSAP 인증 기반 설문 도구로 확인됨",
    isExternalSaaS: false,
    toolCategory: "certified",
  },
  unknown: {
    platformLabel: "미확인 설문 도구",
    csapStatus: "unknown",
    csapStatusLabel: "CSAP 인증 여부 확인 필요",
    isExternalSaaS: true,
    toolCategory: "generic",
  },
};

export function getToolCsapProfile(
  platform: Platform,
  formManagement?: { csapVerified?: boolean },
): ToolCsapProfile {
  if (formManagement?.csapVerified || platform === "wiseon_csap") {
    const base = PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.unknown;
    return {
      ...base,
      csapStatus: "certified",
      csapStatusLabel: "CSAP 인증 기반 설문 도구로 확인됨",
      isExternalSaaS: false,
      toolCategory: "certified",
    };
  }

  return PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.unknown;
}

export function isCsapCertifiedTool(
  platform: Platform,
  formManagement?: { csapVerified?: boolean },
): boolean {
  return getToolCsapProfile(platform, formManagement).csapStatus === "certified";
}
