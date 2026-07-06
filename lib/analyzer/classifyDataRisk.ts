import type { DataRiskResult } from "@/lib/types/analyzer";
import { DATA_RISK_LABELS } from "@/lib/types/analyzer";
import type { NormalizedForm, NormalizedQuestion } from "@/lib/types/scan";
import {
  inferQuestionDataLevel,
  maxDataLevel,
} from "@/lib/rules/dataRiskRules";

function formatDetectedItem(question: NormalizedQuestion, level: string): string {
  if (level === "D2") {
    const detail =
      question.personalDataTypes?.length
        ? question.personalDataTypes.join(", ")
        : "준식별정보";
    return `${question.label} (${detail})`;
  }

  const types = question.personalDataTypes?.join(", ") ?? question.label;
  return `${question.label} (${types})`;
}

export function classifyDataRisk(form: NormalizedForm): DataRiskResult {
  const levels = form.questions.map(inferQuestionDataLevel);
  const level = maxDataLevel(levels);

  const detectedItems: string[] = [];
  const evidenceQuestions: string[] = [];

  for (const q of form.questions) {
    const qLevel = inferQuestionDataLevel(q);
    if (qLevel !== "D0" && qLevel !== "D1") {
      detectedItems.push(formatDetectedItem(q, qLevel));
      evidenceQuestions.push(`${q.label}${q.required ? " (필수)" : ""}`);
    }
  }

  if (form.partialScan && form.detectedFields) {
    for (const field of form.detectedFields) {
      detectedItems.push(`[베타] ${field}`);
      evidenceQuestions.push(`탐지: ${field}`);
    }
  }

  return {
    level,
    levelLabel: DATA_RISK_LABELS[level],
    detectedItems,
    evidenceQuestions,
  };
}
