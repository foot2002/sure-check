import type { FormContext } from "@/lib/types/analyzer";
import { CONTEXT_LABELS } from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import {
  detectContextFlags,
  detectPublicSector,
} from "@/lib/rules/contextRules";

export function classifyContext(form: NormalizedForm): FormContext {
  const publicSector = detectPublicSector(form);
  const flags = detectContextFlags(form);
  const labels = flags.map((flag) => CONTEXT_LABELS[flag]);

  const summaryParts: string[] = [];

  if (publicSector.publicSectorDetected) {
    const orgHint =
      publicSector.detectedOrganizations.length > 0
        ? ` (${publicSector.detectedOrganizations.slice(0, 2).join(", ")})`
        : "";
    const facilityEvidence = publicSector.publicSectorEvidence.some((evidence) =>
      /공공 문화시설|박물관|미술관|도서관|체육시설|물놀이시설/.test(evidence),
    );
    summaryParts.push(
      facilityEvidence
        ? `공공 문화시설 관련 설문으로 분류됩니다${orgHint}.`
        : `공공부문 설문으로 분류됩니다${orgHint}. 지방공기업·출자출연기관·공공재단 포함.`,
    );
  } else if (publicSector.possibleOnly) {
    summaryParts.push("공공부문 가능성이 있으나 확정 근거가 부족합니다.");
  } else if (labels.length > 0) {
    summaryParts.push(`${labels.join(", ")} 맥락의 설문으로 분류됩니다.`);
  } else {
    summaryParts.push("일반 설문 맥락으로 분류됩니다.");
  }

  return {
    flags,
    labels,
    summary: summaryParts.join(" "),
    subjectType: publicSector.subjectType,
    publicSectorDetected: publicSector.publicSectorDetected,
    publicSectorConfidence: publicSector.publicSectorConfidence,
    publicSectorEvidence: publicSector.publicSectorEvidence,
    publicInstitutionEvidence: publicSector.publicInstitutionEvidence,
    detectedOrganizations: publicSector.detectedOrganizations,
    surveyPurposeTypes: publicSector.surveyPurposeTypes,
  };
}
