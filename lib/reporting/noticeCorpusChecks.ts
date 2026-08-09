import { formWideNoticeCorpus } from "@/lib/analyzer/formContext";
import type { NormalizedForm, ScanReport } from "@/lib/types/scan";

/**
 * 고지문·안내문 원문 코퍼스.
 * 설문 전체(상단·문항·하단 metadata)를 포함해 좁은 문항 창만 보지 않는다.
 */
export function buildNoticeCorpus(form: NormalizedForm): string {
  return formWideNoticeCorpus(form);
}

function includesAny(text: string, keywords: string[]): boolean {
  const normalized = text.replace(/\s+/g, " ");
  return keywords.some((k) => normalized.includes(k));
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** 수집 목적 */
export function hasCollectionPurpose(corpus: string): boolean {
  return includesAny(corpus, [
    "수집 목적",
    "수집·이용 목적",
    "수집 이용 목적",
    "개인정보 수집·이용 목적",
    "개인정보 수집 이용 목적",
    "이용 목적",
    "활용 목적",
    "처리 목적",
    "조사 목적",
    "서비스 개선 목적",
    "설문조사 경품 지급",
    "경품 지급",
  ]);
}

/** 수집 항목 */
export function hasCollectionItems(corpus: string): boolean {
  if (
    includesAny(corpus, [
      "수집 항목",
      "수집하려는 개인정보 항목",
      "개인정보 항목",
      "처리 항목",
      "수집정보",
      "수집하는 개인정보",
    ])
  ) {
    return true;
  }
  // 고지문에서 항목을 나열하는 경우
  return (
    /수집.{0,12}(개인정보\s*)?항목/.test(corpus) &&
    includesAny(corpus, [
      "성명",
      "이름",
      "휴대폰번호",
      "휴대폰 번호",
      "연락처",
      "전화번호",
      "이메일",
    ])
  );
}

/** 보유기간 */
export function hasRetentionPeriod(corpus: string): boolean {
  return (
    includesAny(corpus, [
      "보유기간",
      "보유·이용 기간",
      "보유 이용 기간",
      "개인정보 보유·이용 기간",
      "개인정보 보유 이용 기간",
      "이용기간",
      "보관기간",
      "행사 종료 시",
      "조사 종료 시",
      "경품 발송 완료 시",
      "경품 발송 완료 등 행사 종료 시",
      "목적 달성 시",
    ]) ||
    /\d+\s*(개월|년)\s*보관/.test(corpus) ||
    /보유.{0,8}기간/.test(corpus)
  );
}

/** 파기 기준 */
export function hasDestructionRule(corpus: string): boolean {
  return includesAny(corpus, [
    "파기",
    "삭제",
    "지체없이 파기",
    "지체 없이 파기",
    "즉시 파기",
    "행사 종료 후 파기",
    "경품 발송 완료 후 파기",
    "목적 달성 후 파기",
    "보유기간 경과 후 파기",
  ]);
}

/** 동의 거부권 및 불이익 */
export function hasRefusalAndDisadvantage(corpus: string): boolean {
  const hasRefusal = includesAny(corpus, [
    "동의 거부",
    "거부권",
    "거부할 권리",
    "동의를 거부할 권리",
    "거부 시",
  ]);
  const hasDisadvantage = includesAny(corpus, [
    "불이익",
    "제한",
    "경품지급 제한",
    "경품 지급 제한",
    "서비스 이용 제한",
  ]);
  return hasRefusal && hasDisadvantage;
}

/**
 * 담당부서/문의처 — 운영자 연락 안내만 인정.
 * 설문 문항의 휴대폰번호·연락처 수집 문구는 제외.
 */
export function hasOperatorContact(corpus: string): boolean {
  return matchesAny(corpus, [
    /담당\s*부서/,
    /담당자\s*[:：]/,
    /문의처/,
    /개인정보\s*보호책임자/,
    /개인정보\s*담당자/,
    /문의\s*(?:처|전화|메일|이메일)?\s*[:：]/,
    /연락처\s*[:：]\s*(?:0\d{1,2}[-\s.]?\d{3,4}|[A-Z0-9._%+-]+@)/i,
    /전화\s*[:：]\s*0\d{1,2}/,
    /이메일\s*[:：]\s*[A-Z0-9._%+-]+@/i,
  ]);
}

/**
 * 위탁/외부도구 처리 기준.
 * 도구명만 언급된 경우는 확인됨으로 보지 않음.
 */
export function hasTrusteeNotice(corpus: string): boolean {
  const hasTrusteeKeyword = /위탁|수탁자|처리위탁|위탁업무|수탁\s*업체/.test(
    corpus,
  );
  if (!hasTrusteeKeyword) return false;
  return matchesAny(corpus, [
    /위탁\s*업무/,
    /처리\s*업무/,
    /수탁자\s*[:：]/,
    /위탁\s*(?:업체|기관|회사)/,
    /외부\s*(?:업체|서비스|도구).{0,60}(?:보관|파기|처리|위탁)/,
    /(?:모아폼|네이버폼|구글폼|Google\s*Forms|Moaform|Naver\s*Form).{0,80}(?:위탁|수탁|보관|파기|처리)/i,
  ]);
}

/** 국외이전 안내 (원문 기준) */
export function hasOverseasTransferNotice(corpus: string): boolean {
  return includesAny(corpus, [
    "국외이전",
    "국외 이전",
    "국외 보관",
    "해외 이전",
    "해외 보관",
    "이전 국가",
    "이전받는 자",
  ]);
}

export type NoticeCheckKey =
  | "purpose"
  | "items"
  | "retention"
  | "destruction"
  | "refusal"
  | "contact"
  | "trustee"
  | "overseas"
  | "raw_access";

export interface CorpusNoticeCheckResult {
  key: NoticeCheckKey;
  item: string;
  confirmed: boolean;
  evidence: string;
}

export function evaluateCorpusNoticeChecks(
  report: ScanReport,
  options: {
    needsTrustee: boolean;
    needsOverseas: boolean;
    checkRawAccess?: boolean;
  },
): CorpusNoticeCheckResult[] {
  const corpus = buildNoticeCorpus(report.form);
  const results: CorpusNoticeCheckResult[] = [
    {
      key: "purpose",
      item: "수집 목적",
      confirmed: hasCollectionPurpose(corpus),
      evidence: hasCollectionPurpose(corpus)
        ? "수집 목적 관련 문구 확인"
        : "수집 목적 문구를 찾지 못함",
    },
    {
      key: "items",
      item: "수집 항목",
      confirmed: hasCollectionItems(corpus),
      evidence: hasCollectionItems(corpus)
        ? "수집 항목 안내 확인"
        : "안내문에 수집 항목 명시가 부족함",
    },
    {
      key: "retention",
      item: "보유기간",
      confirmed: hasRetentionPeriod(corpus),
      evidence: hasRetentionPeriod(corpus)
        ? "보유기간 관련 문구 확인"
        : "보유기간 문구를 찾지 못함",
    },
    {
      key: "destruction",
      item: "파기 기준",
      confirmed: hasDestructionRule(corpus),
      evidence: hasDestructionRule(corpus)
        ? "파기 기준 관련 문구 확인"
        : "파기 기준 문구를 찾지 못함",
    },
    {
      key: "refusal",
      item: "동의 거부권 및 불이익",
      confirmed: hasRefusalAndDisadvantage(corpus),
      evidence: hasRefusalAndDisadvantage(corpus)
        ? "동의 거부권 관련 문구 확인"
        : "동의 거부권·불이익 안내를 찾지 못함",
    },
    {
      key: "contact",
      item: "담당부서/문의처",
      confirmed: hasOperatorContact(corpus),
      evidence: hasOperatorContact(corpus)
        ? "담당부서·문의처 관련 문구 확인"
        : "담당부서·문의처 문구를 찾지 못함",
    },
  ];

  if (options.needsTrustee) {
    results.push({
      key: "trustee",
      item: "위탁/외부도구 처리 기준",
      confirmed: hasTrusteeNotice(corpus),
      evidence: hasTrusteeNotice(corpus)
        ? "위탁·외부도구 처리 기준 안내 확인"
        : "외부도구 위탁·처리 기준 안내를 찾지 못함",
    });
  }

  if (options.needsOverseas) {
    results.push({
      key: "overseas",
      item: "국외 보관·이전 안내",
      confirmed: hasOverseasTransferNotice(corpus),
      evidence: hasOverseasTransferNotice(corpus)
        ? "국외이전 안내 확인"
        : "국외 보관·이전 안내를 찾지 못함",
    });
  }

  if (options.checkRawAccess !== false) {
    const rawConfirmed =
      report.debug?.managementItems.some(
        (item) =>
          /접근|원자료|다운로드/i.test(item.label) && item.status === "confirmed",
      ) ?? false;
    results.push({
      key: "raw_access",
      item: "원자료 접근권한",
      confirmed: rawConfirmed,
      evidence: rawConfirmed
        ? "원자료 접근권한 관련 신호 확인"
        : "원자료 접근권한 기준을 찾지 못함",
    });
  }

  return results;
}

/** 신고·증빙용 고지문 전문 추출 */
export function extractPrivacyNoticeRaw(form: NormalizedForm): {
  rawText: string;
  source: "html" | "json" | "file_text";
  detectedItems: string[];
} {
  const corpus = buildNoticeCorpus(form);
  const detectedItems: string[] = [];
  if (hasCollectionPurpose(corpus)) detectedItems.push("수집 목적");
  if (hasCollectionItems(corpus)) detectedItems.push("수집 항목");
  if (hasRetentionPeriod(corpus)) detectedItems.push("보유기간");
  if (hasDestructionRule(corpus)) detectedItems.push("파기 기준");
  if (hasRefusalAndDisadvantage(corpus)) {
    detectedItems.push("동의 거부권 및 불이익");
  }
  if (hasOperatorContact(corpus)) detectedItems.push("담당부서/문의처");
  if (hasTrusteeNotice(corpus)) detectedItems.push("위탁/외부도구 처리 기준");
  if (hasOverseasTransferNotice(corpus)) detectedItems.push("국외이전");

  const sourceKind = form.metadata?.source?.kind;
  return {
    rawText: corpus.trim(),
    source:
      sourceKind === "file"
        ? "file_text"
        : form.extractedFromHtml
          ? "html"
          : "json",
    detectedItems,
  };
}
