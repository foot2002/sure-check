import type { ContextFlag, ManagementCheckItem } from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";

export interface ManagementRuleResult {
  items: ManagementCheckItem[];
  deduction: number;
}

const ITEM_WEIGHT = 1.5;

export function evaluateManagementSignals(
  form: NormalizedForm,
  contextFlags: ContextFlag[] = [],
): ManagementRuleResult {
  const mgmt = form.management ?? {};
  const isEmployeeSurvey = contextFlags.includes("employee_survey");
  const isPublicAgency = contextFlags.includes("public_agency");
  const items: ManagementCheckItem[] = [];

  const checks: {
    label: string;
    value: boolean | null | undefined;
    positiveDetail: string;
    negativeDetail: string;
    enabled?: boolean;
  }[] = [
    {
      label: "공식 계정 사용",
      value: mgmt.officialAccount,
      positiveDetail: "기관/회사 공식 계정 사용이 확인됩니다.",
      negativeDetail: "공식 계정 또는 관리 주체 안내가 확인되지 않습니다.",
      enabled: isPublicAgency,
    },
    {
      label: "접근권한 관리",
      value: mgmt.accessControl,
      positiveDetail: "접근 권한 관리 안내가 확인됩니다.",
      negativeDetail: "관리체계 확인 필요: 접근권한 관리 여부를 화면에서 확인할 수 없습니다.",
    },
    {
      label: "원자료 다운로드 관리",
      value: mgmt.rawDataDownloadControl,
      positiveDetail: "원자료 다운로드 관리 안내가 확인됩니다.",
      negativeDetail: "관리체계 확인 필요: 원자료 다운로드 관리 여부를 확인할 수 없습니다.",
      enabled: isEmployeeSurvey,
    },
    {
      label: "보유기간 및 파기 관리",
      value: mgmt.retentionManagement ?? form.hasRetentionNotice,
      positiveDetail: "보유기간·파기 관리 안내가 확인됩니다.",
      negativeDetail: "보유기간 및 파기 관리 안내가 부족합니다.",
    },
    {
      label: "결과 공개 방지",
      value: mgmt.resultDisclosurePrevention,
      positiveDetail: "결과 공개 방지 관련 안내가 확인됩니다.",
      negativeDetail: "관리체계 확인 필요: 결과 공개 방지 조치를 확인할 수 없습니다.",
      enabled: isPublicAgency || isEmployeeSurvey,
    },
    {
      label: "원자료 제공 범위",
      value: mgmt.rawDataScopeDefined,
      positiveDetail: "원자료 제공 범위가 정의되어 있습니다.",
      negativeDetail: "원자료 제공 범위 안내가 확인되지 않습니다.",
      enabled: isEmployeeSurvey,
    },
    {
      label: "기관/회사 관리통제",
      value: mgmt.institutionalControl,
      positiveDetail: "기관 또는 회사의 관리·통제 안내가 확인됩니다.",
      negativeDetail: "기관/회사의 관리통제 여부를 확인할 수 없습니다.",
      enabled: isPublicAgency,
    },
    {
      label: "익명성 보장",
      value: mgmt.anonymityGuarantee,
      positiveDetail: "익명성 보장 관련 안내가 확인됩니다.",
      negativeDetail:
        form.contextHints?.claimsAnonymous
          ? "익명 안내가 있으나 실질적 익명성 보장 근거가 부족합니다."
          : "관리체계 확인 필요: 익명성 보장 여부를 확인할 수 없습니다.",
      enabled: isEmployeeSurvey,
    },
  ];

  let deduction = 0;

  for (const check of checks) {
    if (check.enabled === false) continue;

    let status: ManagementCheckItem["status"];
    let detail: string;

    if (check.value === true) {
      status = "confirmed";
      detail = check.positiveDetail;
    } else if (check.value === false) {
      status = "missing";
      detail = check.negativeDetail;
      deduction += ITEM_WEIGHT;
    } else {
      status = "unknown";
      detail = check.negativeDetail;
      deduction += ITEM_WEIGHT * 0.5;
    }

    items.push({ label: check.label, status, detail });
  }

  return {
    items,
    deduction: Math.min(15, Math.round(deduction)),
  };
}
