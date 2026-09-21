import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOfficialLetterModel,
  letterToolName,
  officialLetterDocNumber,
  sanitizeOfficialLetterTitle,
} from "@/lib/report/officialLetterModel";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { buildCoreOperatorProblems } from "@/lib/reporting/buildCoreOperatorProblems";
import type { ScanReport } from "@/lib/types/scan";

export interface OfficialNoticeViolation {
  title: string;
  body: string;
}

export interface OfficialNoticeModel {
  recipient: string;
  surveyTitle: string;
  surveyUrl: string;
  diagnosedAtKo: string;
  issuedAtDots: string;
  docNumber: string;
  riskLabel: string;
  riskReason: string;
  riskLine: string;
  violationItems: string[];
  violationTitles: string[];
  focusRequest: string;
  attachmentReportLine: string;
  receiptLine: string;
}

function isScanReport(value: unknown): value is ScanReport {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const form = row.form as Record<string, unknown> | undefined;
  return (
    typeof row.scanId === "string" &&
    Boolean(form) &&
    typeof form === "object" &&
    Array.isArray(form.questions)
  );
}

function objectParticle(word: string): "을" | "를" {
  const last = Array.from(word.replace(/[)\]"'」》]/g, "")).at(-1) || "";
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 0 ? "를" : "을";
  }
  return "를";
}

function usesExternalSurveyTool(platform: string | null | undefined): boolean {
  return (
    platform === "google_forms" ||
    platform === "naver_forms" ||
    platform === "moaform"
  );
}

function resolvePlatform(
  summaryPlatform?: string | null,
  reportPlatform?: string | null,
): string {
  const candidates = [summaryPlatform, reportPlatform]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  for (const platform of candidates) {
    if (usesExternalSurveyTool(platform) || platform === "wiseon_csap") {
      return platform;
    }
  }
  return candidates[0] || "unknown";
}

export function formatNoticeIssuedDots(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}.`;
}

export function noticeRecipient(operatorName: string | null | undefined): string {
  const name = String(operatorName || "").trim();
  if (!name || name === "미확인") return "관련 기관장";
  if (
    /(특별시장|광역시장|시장|구청장|군수|도지사|교육감|원장|이사장|회장)$/.test(
      name,
    )
  ) {
    return name;
  }
  if (
    name.endsWith("특별시") ||
    name.endsWith("광역시") ||
    name.endsWith("특별자치시")
  ) {
    return `${name}장`;
  }
  if (name.endsWith("특별자치도")) return `${name}지사`;
  if (/^[가-힣]{2,6}도$/.test(name)) return `${name}지사`;
  const gu = name.match(/^(.+?)\s+([가-힣]{2,8}구)$/);
  if (gu) return `${gu[2]}청장`;
  const gun = name.match(/^(.+?)\s+([가-힣]{2,8}군)$/);
  if (gun) return `${gun[2]}수`;
  const si = name.match(/^(.+?)\s+([가-힣]{2,8}시)$/);
  if (si) return `${si[2]}장`;
  if (name.endsWith("구")) return `${name}청장`;
  if (name.endsWith("군")) return `${name}수`;
  if (name.endsWith("시") && !name.endsWith("도시")) return `${name}장`;
  return name;
}

function noticeRiskLabel(level: string | null | undefined): string {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return "Critical (매우 높음)";
    case "high":
      return "High (높음)";
    case "medium":
      return "Medium (확인 필요)";
    case "low":
      return "Low (낮음)";
    default:
      return "확인 필요";
  }
}

function joinItems(items: string[], empty = ""): string {
  const unique = [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  if (unique.length === 0) return empty;
  if (unique.length === 2) return `${unique[0]} 및 ${unique[1]}`;
  return unique.join(", ");
}

function citePipa(article: string, subsequent: boolean): string {
  return subsequent ? `동법 ${article}` : `「개인정보 보호법」 ${article}`;
}

function withCite(text: string, cite: string): string {
  const trimmed = text.replace(/[.\s]+$/, "");
  if (/\)$/.test(trimmed)) return trimmed;
  return `${trimmed} (${cite})`;
}

function collectedItemPhrase(letter: ReturnType<typeof buildOfficialLetterModel>): string {
  const parts = [
    letter.personalItems !== "확인되지 않음" ? letter.personalItems : "",
    letter.sensitiveItems !== "확인되지 않음" ? letter.sensitiveItems : "",
    letter.highRiskItems !== "확인되지 않음" ? letter.highRiskItems : "",
  ].filter(Boolean);
  return joinItems(parts, "개인정보");
}

function buildViolations(
  detail: AdminCaseDetail,
  letter: ReturnType<typeof buildOfficialLetterModel>,
): OfficialNoticeViolation[] {
  const s = detail.summary;
  const reportPlatform =
    detail.reportJson && typeof detail.reportJson === "object"
      ? String((detail.reportJson as { platform?: unknown }).platform || "")
      : "";
  const platform = resolvePlatform(s.platform, reportPlatform);
  const toolName = letter.toolName || letterToolName(platform);
  const toolParticle = objectParticle(toolName);
  const collected = collectedItemPhrase(letter);
  const collectedParticle = objectParticle(collected.split(", ").at(-1) || collected);
  const hasPii =
    s.hasPersonalInfo ||
    s.hasSensitiveInfo ||
    s.hasHighRiskInfo ||
    letter.personalItems !== "확인되지 않음";
  const noticeByItem = new Map(letter.noticeRows.map((row) => [row[0], row] as const));
  const missing = (item: string) => {
    const row = noticeByItem.get(item);
    return !row || row[1] === "게시되지 않음(확인 불가)";
  };
  const posted = (item: string) => noticeByItem.get(item)?.[1] === "게시됨";
  const na = (item: string) => noticeByItem.get(item)?.[1] === "해당 없음";

  const items: OfficialNoticeViolation[] = [];
  const seen = new Set<string>();
  const push = (title: string, body: string) => {
    const key = title.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({ title, body: body.replace(/\s+/g, " ").trim() });
  };

  if (hasPii && usesExternalSurveyTool(platform)) {
    const sensitiveBit =
      letter.sensitiveItems !== "확인되지 않음" || s.hasSensitiveInfo
        ? " 및 민감정보"
        : "";
    push(
      `직접식별정보${sensitiveBit} 수집과 외부 무인증 도구 사용`,
      `${collected}${collectedParticle} 정부 CSAP(클라우드서비스 보안인증) 등을 받지 않은 ${toolName}${toolParticle} 통해 수집·처리 (「개인정보 보호법」 제29조, 「행정기관 및 공공기관의 클라우드컴퓨팅서비스 이용 기준」, 「국가 정보보안 기본지침」 및 「국가 클라우드 컴퓨팅 보안 가이드라인」)`,
    );
  }

  if (s.hasSensitiveInfo || letter.sensitiveItems !== "확인되지 않음") {
    const sensitive =
      letter.sensitiveItems !== "확인되지 않음"
        ? letter.sensitiveItems
        : "민감정보";
    push(
      `민감정보(${sensitive}) 별도 동의 미확인`,
      withCite(
        `민감정보 문항에 대한 별도의 동의 절차나 보호조치는 확인되지 않음`,
        citePipa("제23조", items.length > 0),
      ),
    );
  }

  if (s.hasHighRiskInfo || letter.highRiskItems !== "확인되지 않음") {
    const high =
      letter.highRiskItems !== "확인되지 않음"
        ? letter.highRiskItems
        : "고유식별정보";
    push(
      `고유식별정보(${high}) 수집 제한 확인 필요`,
      withCite(
        `${high}${objectParticle(high)} 범용 설문도구에서 수집하고 있어 처리 제한 및 안전조치 확인이 필요함`,
        citePipa("제24조", items.length > 0),
      ),
    );
  }

  if (hasPii && missing("담당부서 및 문의처 안내")) {
    push(
      "담당부서 연락처 안내 미흡",
      "설문 화면에서 직접적인 문의 연락처(전화·이메일)는 확인되지 않음",
    );
  }

  if (
    hasPii &&
    usesExternalSurveyTool(platform) &&
    !na("외부 업체 위탁·처리 기준 안내") &&
    missing("외부 업체 위탁·처리 기준 안내")
  ) {
    push(
      "위탁 업무 범위 명확화 필요",
      withCite(
        `${toolName} 사용에 따른 개인정보 처리 위탁의 구체적 범위 및 안내는 확인되지 않음`,
        citePipa("제26조", items.length > 0),
      ),
    );
  }

  if (
    hasPii &&
    (missing("개인정보 보유기간 안내") || missing("개인정보 파기 기준 안내"))
  ) {
    const retentionPosted = posted("개인정보 보유기간 안내");
    push(
      "보유기간 및 파기기준 구체화 필요",
      withCite(
        retentionPosted
          ? "보유기간 안내는 확인되었으나, 목적 달성 후 구체적인 파기 시점 및 방법에 대한 안내는 충분히 확인되지 않음"
          : "개인정보 보유기간·파기기준에 대한 충분한 안내는 확인되지 않음",
        citePipa("제21조", items.length > 0),
      ),
    );
  }

  if (
    hasPii &&
    platform === "google_forms" &&
    !na("국외 서버 보관·이전 안내") &&
    missing("국외 서버 보관·이전 안내")
  ) {
    push(
      "국외 보관·이전 안내 미확인",
      withCite(
        `${toolName}는 국외 사업자가 제공하는 서비스로, 수집된 정보가 해외 서버에 저장·처리될 가능성이 있으나 이에 대한 안내는 확인되지 않음`,
        citePipa("제28조의8", items.length > 0),
      ),
    );
  }

  if (hasPii && missing("수집 자료 접근권한 관리 안내")) {
    push(
      "원자료 접근권한 미확인",
      "수집된 응답 데이터에 대한 접근권한 관리 현황 미확인",
    );
  }

  if (
    hasPii &&
    (missing("개인정보 수집 목적 안내") ||
      missing("수집하는 개인정보 항목 안내") ||
      missing("동의 거부 권리 및 불이익 안내"))
  ) {
    push(
      "개인정보 수집·이용 고지 부족",
      withCite(
        "수집 목적, 수집 항목, 동의 거부권 및 불이익 등 필수 고지사항이 설문 화면에서 충분히 확인되지 않음",
        citePipa("제15조", items.length > 0),
      ),
    );
  }

  if (isScanReport(detail.reportJson)) {
    const audience = composeAudienceReport(detail.reportJson);
    const core = buildCoreOperatorProblems(
      detail.reportJson,
      audience.collectedDataSummary,
    );
    for (const problem of core.problems) {
      if (
        problem.id === "public_csap" ||
        problem.id === "private_cert" ||
        problem.id === "sensitive_consent" ||
        problem.id === "high_risk_collection" ||
        problem.id === "outsourcing" ||
        problem.id === "overseas" ||
        problem.id === "security_access" ||
        problem.id === "retention_gap" ||
        problem.id === "retention_improve" ||
        problem.id === "basic_notice_gap" ||
        problem.id === "contact_improve"
      ) {
        continue;
      }
      if (problem.severity === "LOW_OR_NONE") continue;
      const cite = problem.basisLabels[0]
        ? problem.basisLabels[0].replace(/^개인정보보호법/, "「개인정보 보호법」")
        : "";
      push(
        problem.title,
        cite ? withCite(problem.why, cite) : problem.why.replace(/[.\s]+$/, ""),
      );
    }
  } else {
    for (const finding of detail.findings.slice(0, 8)) {
      push(
        finding.title,
        String(finding.description || finding.recommendation || "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/[.\s]+$/, ""),
      );
    }
  }

  return items.slice(0, 8);
}

function formatViolationLine(item: OfficialNoticeViolation): string {
  return `${item.title}: ${item.body}`;
}

function buildFocusRequest(items: OfficialNoticeViolation[]): string {
  if (items.length >= 2) {
    return `특히 위 4항 중 '${items[0].title}' 및 '${items[1].title}' 사항에 대해서는, 해당 항목에 대한 개선 계획 및 사실 관계를 우선적으로 확인하시어 회신하여 주시기 바랍니다.`;
  }
  if (items.length === 1) {
    return `특히 위 4항 중 '${items[0].title}' 사항에 대해서는, 해당 항목에 대한 개선 계획 및 사실 관계를 우선적으로 확인하시어 회신하여 주시기 바랍니다.`;
  }
  return "특히 위 4항에서 확인된 사항에 대해서는, 관련 개선 계획 및 사실 관계를 우선적으로 확인하시어 회신하여 주시기 바랍니다.";
}

function buildRiskReason(
  letter: ReturnType<typeof buildOfficialLetterModel>,
  items: OfficialNoticeViolation[],
): string {
  if (letter.sensitiveItems !== "확인되지 않음") {
    return `${letter.sensitiveItems} 등 민감정보를 별도 동의 없이 수집하고 있으며, 개인정보 처리 체계 전반의 점검이 필요한 사안`;
  }
  if (items.length > 0) {
    return `${items[0].title} 등이 확인되어 개인정보 처리 체계 전반의 점검이 필요한 사안`;
  }
  return "공개 설문 화면 기준 자동진단 결과, 개인정보 처리 체계 전반의 점검이 필요한 사안";
}

export function buildOfficialNoticeModel(
  detail: AdminCaseDetail,
  now = new Date(),
): OfficialNoticeModel {
  const letter = buildOfficialLetterModel(detail);
  const violations = buildViolations(detail, letter);
  const riskLabel = noticeRiskLabel(detail.summary.overallRiskLevel);
  const riskReason = buildRiskReason(letter, violations);
  const issuedAtDots = formatNoticeIssuedDots(now);
  const surveyTitle = letter.surveyTitle || "제목 없음";
  return {
    recipient: noticeRecipient(letter.operatorName),
    surveyTitle,
    surveyUrl: letter.surveyUrl,
    diagnosedAtKo: letter.diagnosedAtKo,
    issuedAtDots,
    docNumber: officialLetterDocNumber(detail.id),
    riskLabel,
    riskReason,
    riskLine: `${riskLabel} — ${riskReason}`,
    violationItems: violations.map(formatViolationLine),
    violationTitles: violations.map((item) => item.title),
    focusRequest: buildFocusRequest(violations),
    attachmentReportLine: `        2. 분석 보고서(${surveyTitle}) 1부.  끝.`,
    receiptLine: `${officialLetterDocNumber(detail.id)}  (${issuedAtDots})     접수`,
  };
}

export function officialNoticeDownloadFilename(
  title: string,
  caseId: string,
): string {
  const safe = sanitizeOfficialLetterTitle(title);
  return `[SURE-CHECK] ${safe || "제목없음"} 실태조사 결과 통보.docx`;
}

export function officialNoticeAsciiFilename(caseId: string): string {
  return `sure-check-official-notice-${caseId}.docx`;
}
