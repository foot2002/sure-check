import type { ToolRiskLevel } from "@/lib/types/analyzer";
import { PLATFORM_TOOL_MAP } from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";

export const TOOL_RISK_DEDUCTIONS: Record<ToolRiskLevel, number> = {
  csap_verified: 0,
  self_hosted: 3,
  domestic_saas: 8,
  overseas_saas: 18,
  generic_limited: 12,
};

export function resolveBaseToolLevel(form: NormalizedForm): ToolRiskLevel {
  if (form.management?.csapVerified || form.platform === "wiseon_csap") {
    return "csap_verified";
  }
  return PLATFORM_TOOL_MAP[form.platform] ?? "generic_limited";
}

export function isOverseasSaaS(level: ToolRiskLevel): boolean {
  return level === "overseas_saas";
}

export function isDomesticOrOverseasSaaS(level: ToolRiskLevel): boolean {
  return level === "domestic_saas" || level === "overseas_saas";
}

export function isExternalSaaS(level: ToolRiskLevel): boolean {
  return isDomesticOrOverseasSaaS(level) || level === "overseas_saas";
}
