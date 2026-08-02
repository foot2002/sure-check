import type { MockReportKey, NormalizedForm } from "@/lib/types/scan";

export const NORMALIZED_FORM_FIXTURES: Record<MockReportKey, NormalizedForm> = {
  google_public_high_risk: {
    fixtureKey: "google_public_high_risk",
    platform: "google_forms",
    title: "2026년 주민 의견 수렴 설문",
    url: "",
    operatorType: "공공기관",
    hasPrivacyNotice: false,
    hasConsent: false,
    hasRetentionNotice: false,
    hasOverseasTransferNotice: false,
    contextHints: {
      isPublicAgency: true,
    },
    notices: {
      description:
        "주민 여러분의 소중한 의견을 수렴합니다. 아래 항목을 작성해 주세요.",
      consentText: "제출",
    },
    management: {
      officialAccount: false,
      accessControl: null,
      rawDataDownloadControl: null,
      retentionManagement: false,
      resultDisclosurePrevention: null,
      rawDataScopeDefined: null,
      institutionalControl: false,
      anonymityGuarantee: null,
      csapVerified: false,
      trusteeDisclosed: false,
      domesticStorage: false,
      publicSecurityVerified: false,
    },
    questions: [
      {
        id: "q1",
        label: "성명",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["이름"],
        dataRiskLevel: "D3",
      },
      {
        id: "q2",
        label: "휴대전화번호",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["전화번호"],
        dataRiskLevel: "D3",
      },
      {
        id: "q3",
        label: "이메일 주소",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["이메일"],
        dataRiskLevel: "D3",
      },
      {
        id: "q4",
        label: "의견 내용",
        type: "long_text",
        required: false,
        hasPersonalData: false,
        dataRiskLevel: "D1",
      },
    ],
  },

  naver_company_event_risk: {
    fixtureKey: "naver_company_event_risk",
    platform: "naver_forms",
    title: "여름 이벤트 커피쿠폰 응모",
    url: "",
    operatorType: "일반 기업",
    hasPrivacyNotice: true,
    hasConsent: true,
    hasRetentionNotice: false,
    hasOverseasTransferNotice: false,
    contextHints: {
      isEvent: true,
      prizeDescription: "커피쿠폰 제공",
    },
    notices: {
      description: "이벤트 응모를 위해 아래 정보를 입력해 주세요.",
      privacyNotice: "입력하신 정보는 이벤트 응모 및 경품 발송 목적으로 이용됩니다.",
      consentText: "동의합니다",
      purpose: "이벤트 응모 및 경품(커피쿠폰) 발송",
      items: "이름, 휴대전화번호",
    },
    management: {
      officialAccount: true,
      accessControl: null,
      rawDataDownloadControl: null,
      retentionManagement: false,
      resultDisclosurePrevention: null,
      rawDataScopeDefined: null,
      institutionalControl: true,
      anonymityGuarantee: null,
      csapVerified: false,
      trusteeDisclosed: false,
      domesticStorage: true,
    },
    questions: [
      {
        id: "q1",
        label: "이름",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["이름"],
        dataRiskLevel: "D3",
      },
      {
        id: "q2",
        label: "휴대전화번호",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["전화번호"],
        dataRiskLevel: "D3",
      },
      {
        id: "q3",
        label: "이벤트 참여 경로",
        type: "multiple_choice",
        required: false,
        hasPersonalData: false,
        dataRiskLevel: "D1",
      },
    ],
  },

  moaform_employee_high_risk: {
    fixtureKey: "moaform_employee_high_risk",
    platform: "moaform",
    title: "2026년 직원 만족도 및 조직 진단 (익명)",
    url: "",
    operatorType: "기업 HR",
    hasPrivacyNotice: true,
    hasConsent: false,
    hasRetentionNotice: false,
    hasOverseasTransferNotice: false,
    contextHints: {
      isEmployeeSurvey: true,
      claimsAnonymous: true,
    },
    notices: {
      description:
        "본 설문은 익명으로 진행되며, 조직 개선을 위한 목적으로만 활용됩니다.",
      privacyNotice: "응답 내용은 통계 목적으로만 활용됩니다.",
      anonymity: "익명 설문입니다. 개인을 특정할 수 없도록 응답해 주세요.",
    },
    management: {
      officialAccount: true,
      accessControl: null,
      rawDataDownloadControl: null,
      retentionManagement: null,
      resultDisclosurePrevention: null,
      rawDataScopeDefined: false,
      institutionalControl: true,
      anonymityGuarantee: false,
      csapVerified: false,
      trusteeDisclosed: false,
      domesticStorage: true,
    },
    questions: [
      {
        id: "q1",
        label: "소속 부서",
        type: "dropdown",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["부서"],
        dataRiskLevel: "D2",
      },
      {
        id: "q2",
        label: "직급",
        type: "dropdown",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["직급"],
        dataRiskLevel: "D2",
      },
      {
        id: "q3",
        label: "근속 연수",
        type: "dropdown",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["근속연수"],
        dataRiskLevel: "D2",
      },
      {
        id: "q4",
        label: "현재 겪고 있는 직장 내 고충 사항",
        type: "long_text",
        required: false,
        hasPersonalData: true,
        personalDataTypes: ["고충"],
        dataRiskLevel: "D4",
      },
      {
        id: "q5",
        label: "직속 상사에 대한 평가",
        type: "scale",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["상사평가"],
        dataRiskLevel: "D4",
      },
      {
        id: "q6",
        label: "직장 내 괴롭힘 경험 여부",
        type: "multiple_choice",
        required: false,
        hasPersonalData: true,
        personalDataTypes: ["괴롭힘"],
        dataRiskLevel: "D4",
      },
    ],
  },

  generic_unknown_warning: {
    fixtureKey: "generic_unknown_warning",
    platform: "generic",
    title: "온라인 설문",
    url: "",
    operatorType: "미확인",
    hasPrivacyNotice: false,
    hasConsent: false,
    hasRetentionNotice: false,
    hasOverseasTransferNotice: false,
    partialScan: true,
    detectedFields: ["input[type=text]", "label: 이메일"],
    notices: {
      description: "설문에 참여해 주세요.",
    },
    management: {
      officialAccount: null,
      accessControl: null,
      rawDataDownloadControl: null,
      retentionManagement: null,
      resultDisclosurePrevention: null,
      rawDataScopeDefined: null,
      institutionalControl: null,
      anonymityGuarantee: null,
      csapVerified: false,
      trusteeDisclosed: false,
      domesticStorage: null,
    },
    questions: [
      {
        id: "q1",
        label: "이메일",
        type: "short_text",
        required: false,
        hasPersonalData: true,
        personalDataTypes: ["이메일"],
        dataRiskLevel: "D3",
      },
      {
        id: "q2",
        label: "자유 응답",
        type: "long_text",
        required: false,
        hasPersonalData: false,
        dataRiskLevel: "D1",
      },
    ],
  },

  wiseon_csap_caution: {
    fixtureKey: "wiseon_csap_caution",
    platform: "wiseon_csap",
    title: "WiseON 보안 설문",
    url: "",
    operatorType: "인증 기관/기업",
    hasPrivacyNotice: true,
    hasConsent: true,
    hasRetentionNotice: true,
    hasOverseasTransferNotice: true,
    contextHints: {
      isPublicAgency: false,
    },
    notices: {
      description: "CSAP 인증 환경에서 운영되는 보안 설문입니다.",
      privacyNotice:
        "수집된 개인정보는 설문 목적 달성 후 지체 없이 파기됩니다. 담당자가 접근 권한을 관리합니다.",
      consentText: "개인정보 수집·이용에 동의합니다 (필수)",
      purpose: "개인정보 수집·이용 목적: 설문 응답 관리 및 결과 분석",
      items: "수집 항목: 성명, 연락처",
      retention: "설문 종료 후 30일 이내",
      refusalRight: "동의를 거부할 수 있으며, 거부 시 설문 참여가 제한될 수 있습니다.",
      refusalDisadvantage: "동의 거부 시 설문 참여 불가",
      destruction: "보유 기간 경과 후 안전하게 파기합니다.",
      processor: "개인정보보호 담당자 (privacy@example.go.kr)",
      trustee: "WiseON (CSAP 인증 클라우드, 국내 보관)",
      trusteeTask: "설문 응답 데이터 저장 및 관리",
      privacyPolicyUrl: "https://example.go.kr/privacy",
      contactDepartment: "정보보호팀 (02-000-0000)",
    },
    management: {
      officialAccount: true,
      accessControl: true,
      rawDataDownloadControl: true,
      retentionManagement: true,
      resultDisclosurePrevention: true,
      rawDataScopeDefined: true,
      institutionalControl: true,
      anonymityGuarantee: null,
      csapVerified: true,
      trusteeDisclosed: true,
      domesticStorage: true,
      publicSecurityVerified: true,
    },
    questions: [
      {
        id: "q1",
        label: "성명",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["이름"],
        dataRiskLevel: "D3",
      },
      {
        id: "q2",
        label: "연락처",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["전화번호"],
        dataRiskLevel: "D3",
      },
    ],
  },
};

export function resolveFixtureKey(formUrl: string): MockReportKey {
  const url = formUrl.toLowerCase();
  if (
    url.includes("google_public_high_risk") ||
    url.includes("google-forms-basic") ||
    url.includes("/fixture/google")
  ) {
    return "google_public_high_risk";
  }
  if (
    url.includes("naver_company_event_risk") ||
    url.includes("naver-form-personal") ||
    url.includes("/fixture/naver")
  ) {
    return "naver_company_event_risk";
  }
  if (url.includes("moaform") || url.includes("/fixture/moaform")) {
    return "moaform_employee_high_risk";
  }
  if (url.includes("wiseon") || url.includes("/fixture/wiseon")) {
    return "wiseon_csap_caution";
  }
  if (url.includes("generic_unknown") || url.includes("/fixture/generic")) {
    return "generic_unknown_warning";
  }
  return "generic_unknown_warning";
}

export function isFixtureUrl(formUrl: string): boolean {
  const url = formUrl.toLowerCase();
  return (
    url.includes("wiseon") ||
    url.includes("sure-check.verify/fixture/") ||
    url.includes("fixture.sure-check.local/") ||
    /sure-check\.verify\/fixture\//.test(url)
  );
}

export function getFixtureByKey(key: MockReportKey): NormalizedForm {
  return { ...NORMALIZED_FORM_FIXTURES[key] };
}

export function getFixtureByUrl(formUrl: string): NormalizedForm {
  const key = resolveFixtureKey(formUrl);
  return { ...NORMALIZED_FORM_FIXTURES[key], url: formUrl, fixtureKey: key };
}
