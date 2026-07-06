import type { RiskGrade } from "@/lib/types/scan";
import type {
  ActualValidationValues,
  ExpectedPlatform,
  ValidationCase,
  ValidationResultStatus,
} from "@/lib/validation/types";

const GRADE_ORDER: Record<RiskGrade, number> = {
  safe: 0,
  caution: 1,
  risk: 2,
  high_risk: 3,
};

function platformsMatch(
  expected: ExpectedPlatform | undefined,
  actual: string,
): boolean {
  if (!expected || expected === "unknown") return true;
  return expected === actual;
}

function extractorsMatch(
  expected: string | undefined,
  actual: string,
): boolean {
  if (!expected) return true;
  if (expected === "Limited") {
    return actual === "Limited";
  }
  if (expected === "Fixture") {
    return actual === "Fixture" || actual.startsWith("Fixture");
  }
  return expected === actual;
}

function compareGrades(
  expected?: RiskGrade,
  actual?: RiskGrade,
): { ok: boolean; warning?: string; mismatch?: string } {
  if (!expected) return { ok: true };
  if (!actual) {
    return { ok: false, mismatch: "실제 등급 없음" };
  }

  const e = GRADE_ORDER[expected];
  const a = GRADE_ORDER[actual];

  if (a === e) return { ok: true };
  if (a === e + 1) {
    return { ok: true, warning: "과잉진단 가능성" };
  }
  if (a > e + 1) {
    return { ok: true, warning: "과잉진단 가능성 (등급 상향)" };
  }
  if (expected === "high_risk" && (actual === "caution" || actual === "safe")) {
    return { ok: false, mismatch: "과소진단 가능성" };
  }
  if (e - a >= 2) {
    return { ok: false, mismatch: "과소진단 가능성" };
  }
  return { ok: false, mismatch: `기대 등급 ${expected}, 실제 ${actual}` };
}

export interface ComparisonOutput {
  success: boolean;
  status: ValidationResultStatus;
  matched: string[];
  mismatches: string[];
  warnings: string[];
}

export function compareValidationResult(
  testCase: ValidationCase,
  actual: ActualValidationValues,
): ComparisonOutput {
  const matched: string[] = [];
  const mismatches: string[] = [];
  const warnings: string[] = [];

  if (testCase.expectedPlatform) {
    if (platformsMatch(testCase.expectedPlatform, actual.actualPlatform)) {
      matched.push(`플랫폼: ${actual.actualPlatform}`);
    } else {
      mismatches.push(
        `플랫폼 불일치 (기대 ${testCase.expectedPlatform}, 실제 ${actual.actualPlatform})`,
      );
    }
  }

  if (testCase.expectedExtractor) {
    if (extractorsMatch(testCase.expectedExtractor, actual.actualExtractor)) {
      matched.push(`추출기: ${actual.actualExtractor}`);
    } else {
      mismatches.push(
        `추출기 불일치 (기대 ${testCase.expectedExtractor}, 실제 ${actual.actualExtractor})`,
      );
    }
  }

  if (testCase.expectedMinQuestionCount !== undefined) {
    if (actual.actualQuestionCount >= testCase.expectedMinQuestionCount) {
      matched.push(`문항 수: ${actual.actualQuestionCount}`);
    } else {
      mismatches.push(
        `문항 수 부족 (최소 ${testCase.expectedMinQuestionCount}, 실제 ${actual.actualQuestionCount})`,
      );
    }
  }

  if (testCase.expectedDetectedCategories?.length) {
    const missing = testCase.expectedDetectedCategories.filter(
      (category) => !actual.actualDetectedCategories.includes(category),
    );
    if (missing.length === 0) {
      matched.push("개인정보 항목 탐지 일치");
    } else {
      mismatches.push(`미탐지 카테고리: ${missing.join(", ")}`);
    }
  }

  if (testCase.expectedIsLimited !== undefined) {
    if (actual.actualIsLimited === testCase.expectedIsLimited) {
      matched.push(`제한 여부: ${actual.actualIsLimited}`);
      if (actual.actualIsLimited) {
        matched.push(
          `diagnosisStatus: ${actual.actualDiagnosisStatus ?? "limited"}`,
        );
      }
    } else {
      mismatches.push(
        `제한 여부 불일치 (기대 ${testCase.expectedIsLimited}, 실제 ${actual.actualIsLimited})`,
      );
    }
  }

  if (testCase.expectedContext && testCase.expectedContext !== "unknown") {
    if (actual.actualContext === testCase.expectedContext) {
      matched.push(`context: ${actual.actualContext}`);
    } else if (actual.actualContext === "unknown") {
      warnings.push(
        `context 미확인 (기대 ${testCase.expectedContext}, 실제 unknown)`,
      );
    } else {
      mismatches.push(
        `context 불일치 (기대 ${testCase.expectedContext}, 실제 ${actual.actualContext})`,
      );
    }
  }

  if (testCase.expectedDataLevel && !actual.actualIsLimited) {
    if (actual.actualDataLevel === testCase.expectedDataLevel) {
      matched.push(`dataRisk: ${actual.actualDataLevel}`);
    } else if (!actual.actualDataLevel) {
      mismatches.push(`dataRisk level 없음 (기대 ${testCase.expectedDataLevel})`);
    } else {
      mismatches.push(
        `dataRisk 불일치 (기대 ${testCase.expectedDataLevel}, 실제 ${actual.actualDataLevel})`,
      );
    }
  }

  const gradeCompare = compareGrades(
    testCase.expectedRiskGrade,
    actual.actualRiskGrade,
  );
  if (
    testCase.expectedRiskGrade &&
    !actual.actualIsLimited &&
    testCase.expectedIsLimited !== true
  ) {
    if (gradeCompare.ok && !gradeCompare.warning) {
      matched.push(`등급: ${actual.actualRiskGrade}`);
    } else if (gradeCompare.warning) {
      warnings.push(gradeCompare.warning);
      matched.push(`등급: ${actual.actualRiskGrade} (${gradeCompare.warning})`);
    } else if (gradeCompare.mismatch) {
      mismatches.push(gradeCompare.mismatch);
    }
  }

  let status: ValidationResultStatus;
  if (mismatches.length > 0) {
    status = "fail";
  } else if (warnings.length > 0) {
    status = "partial";
  } else {
    status = "pass";
  }

  return {
    success: status === "pass",
    status,
    matched,
    mismatches,
    warnings,
  };
}
