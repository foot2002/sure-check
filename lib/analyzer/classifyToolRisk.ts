import type { DataRiskResult, FormContext, ToolRiskResult } from "@/lib/types/analyzer";
import { TOOL_RISK_LABELS } from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import {
  resolveBaseToolLevel,
  TOOL_RISK_DEDUCTIONS,
} from "@/lib/rules/toolRouteRules";

export function classifyToolRisk(
  form: NormalizedForm,
  context: FormContext,
  _dataRisk: DataRiskResult,
): ToolRiskResult {
  void _dataRisk;

  const baseLevel = resolveBaseToolLevel(form);
  let level = baseLevel;
  let mitigated = false;
  let mitigationReason: string | undefined;

  if (form.management?.csapVerified && baseLevel !== "csap_verified") {
    level = "csap_verified";
    mitigated = true;
    mitigationReason = "CSAP 인증 도구로 판단되어 도구·처리경로 위험이 완화됩니다.";
  }

  if (form.management?.domesticStorage && level === "overseas_saas") {
    mitigated = false;
  }

  const platformLabel =
    form.platform === "google_forms"
      ? "Google Forms (해외 SaaS)"
      : form.platform === "naver_forms"
        ? "네이버폼 (국내 SaaS)"
        : form.platform === "moaform"
          ? "모아폼 (국내 SaaS)"
          : form.platform === "wiseon_csap"
            ? "WiseON (CSAP 인증)"
            : "플랫폼 미식별/Generic";

  const description = mitigated
    ? `${platformLabel} — ${mitigationReason}`
    : context.publicSectorDetected
      ? `${platformLabel} — ${TOOL_RISK_LABELS[level]} 수준. 공공부문 기관이 외부 설문 SaaS를 이용하는 경우 위탁·기관 계정·파기·공공 보안검증 여부 확인이 필요합니다.`
      : `${platformLabel} — ${TOOL_RISK_LABELS[level]} 수준으로 평가됩니다.`;

  return {
    level,
    levelLabel: TOOL_RISK_LABELS[level],
    description,
    mitigated,
    mitigationReason,
  };
}

export { TOOL_RISK_DEDUCTIONS };
