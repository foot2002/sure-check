import type {
  DataRiskResult,
  FormContext,
  ObligationItem,
  ToolRiskResult,
} from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import { buildRequiredObligations } from "@/lib/rules/obligationRules";

export function deriveRequiredObligations(
  context: FormContext,
  dataRisk: DataRiskResult,
  toolRisk: ToolRiskResult,
  form: NormalizedForm,
): ObligationItem[] {
  return buildRequiredObligations(
    context.flags,
    dataRisk.level,
    toolRisk.level,
    form,
  );
}
