import type {
  DataRiskResult,
  FormContext,
  ManagementRiskResult,
  ToolRiskResult,
} from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import { evaluateManagementSignals } from "@/lib/rules/managementRiskRules";

export function assessManagementRisk(
  form: NormalizedForm,
  context: FormContext,
  _dataRisk: DataRiskResult,
  _toolRisk: ToolRiskResult,
): ManagementRiskResult {
  void _dataRisk;
  void _toolRisk;

  const result = evaluateManagementSignals(form, context.flags);

  const missingCount = result.items.filter((i) => i.status === "missing").length;
  const unknownCount = result.items.filter((i) => i.status === "unknown").length;

  const summary =
    missingCount > 0
      ? `관리·운영 측면에서 ${missingCount}건의 보완 필요 항목과 ${unknownCount}건의 확인 필요 항목이 있습니다.`
      : unknownCount > 0
        ? `대부분 양호하나 ${unknownCount}건은 설문 화면에서 확인 불가하여 별도 확인이 필요합니다.`
        : "관리·운영 관련 안내가 비교적 잘 갖춰져 있습니다.";

  return {
    items: result.items,
    deduction: result.deduction,
    summary,
  };
}
