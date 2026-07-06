import type { ComplianceGap, ObligationItem } from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import { evaluateNoticeCompliance } from "@/lib/rules/noticeComplianceRules";

export function checkNoticeCompliance(
  form: NormalizedForm,
  obligations: ObligationItem[],
): ComplianceGap[] {
  return evaluateNoticeCompliance(form, obligations);
}
