import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminCaseDetail, type AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOutreachCopy,
  formatDataCollectionSummary,
  pickIssueBadges,
} from "@/lib/report/adminOutreach";
import {
  normalizePublicCaseStatus,
  publicCaseStatusKo,
  type PublicCaseStatus,
} from "@/lib/report/publicCasePolicy";
import {
  applyUrlVisibility,
  extractUrlHost,
  normalizeUrlVisibility,
  suggestPublicDisplayName,
  type PublicOrgKind,
  type UrlVisibility,
} from "@/lib/report/publicDisplayName";
import {
  PUBLIC_EVIDENCE_KIND_LABEL,
  classifyPublicEvidenceKind,
  isDefaultSelectedPublicKind,
  needsPiiEvidenceConfirmation,
  type PublicEvidenceKind,
} from "@/lib/report/publicEvidenceKinds";

export interface PublicCaseEvidenceCandidate {
  id: string;
  kind: PublicEvidenceKind;
  kindLabel: string;
  label: string | null;
  pageNumber: number | null;
  defaultSelected: boolean;
  requiresPiiConfirmation: boolean;
}

export interface PublicCaseDraft {
  publicId: string | null;
  status: PublicCaseStatus;
  statusLabel: string;
  displayName: string;
  surveyTitle: string;
  summary: string;
  problemSummary: string;
  improvementSummary: string;
  urlVisibility: UrlVisibility;
  surveyUrl: string | null;
  urlHost: string | null;
  selectedEvidenceFileIds: string[];
  evidenceCandidates: PublicCaseEvidenceCandidate[];
  riskLevel: string;
  score: number | null;
  platform: string;
  subjectType: string;
}

export interface PublicCaseWriteInput {
  action: "publish" | "update" | "pause" | "resume";
  displayName?: string;
  surveyTitle?: string;
  summary?: string;
  problemSummary?: string;
  improvementSummary?: string;
  urlVisibility?: string;
  surveyUrl?: string | null;
  selectedEvidenceFileIds?: string[];
  confirmations?: {
    notViolationConfirmed?: boolean;
    displayNameConfirmed?: boolean;
    evidenceSafeConfirmed?: boolean;
    urlVisibilityConfirmed?: boolean;
    piiEvidenceConfirmed?: boolean;
  };
}

function kstDateStamp(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replace(/-/g, "");
}

function orgKindFromType(value: string | null | undefined): PublicOrgKind {
  const v = (value || "").toLowerCase();
  if (v === "public") return "public";
  if (v === "private") return "private";
  return "unknown";
}

function evidenceCandidatesFromDetail(
  detail: AdminCaseDetail,
): PublicCaseEvidenceCandidate[] {
  const candidates: PublicCaseEvidenceCandidate[] = [];
  for (const file of detail.evidenceFiles) {
    const kind = classifyPublicEvidenceKind({
      evidenceType: file.evidenceType,
      label: file.label,
      pageNumber: file.pageNumber,
    });
    if (!kind) continue;
    candidates.push({
      id: file.id,
      kind,
      kindLabel: PUBLIC_EVIDENCE_KIND_LABEL[kind],
      label: file.label,
      pageNumber: file.pageNumber,
      defaultSelected: isDefaultSelectedPublicKind(kind),
      requiresPiiConfirmation:
        kind === "pii_question" ||
        kind === "sensitive_question" ||
        kind === "high_risk_question",
    });
  }
  return candidates;
}

function defaultDraftFromDetail(detail: AdminCaseDetail): PublicCaseDraft {
  const s = detail.summary;
  const categoryLabels = [
    ...new Set(
      detail.questions.flatMap((q) => q.categories.map((c) => c.categoryLabel)),
    ),
  ].slice(0, 6);
  const issueBadges = pickIssueBadges({
    userDecisionLabel: s.userDecisionLabel,
    complianceLabels: detail.complianceChecks.map(
      (c) => `${c.checkItem} ${c.statusLabel}`,
    ),
    findingTitles: detail.findings.map((f) => f.title),
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    isPublic: s.publicPrivateType === "public",
  });
  const copy = buildOutreachCopy({ categoryLabels, issueBadges });
  const candidates = evidenceCandidatesFromDetail(detail);
  const defaultIds = candidates
    .filter((c) => c.defaultSelected)
    .map((c) => c.id);
  const url = s.surveyUrl || s.finalUrl || null;
  return {
    publicId: null,
    status: "private",
    statusLabel: publicCaseStatusKo("private"),
    displayName: suggestPublicDisplayName(
      s.operatorName || "",
      orgKindFromType(s.publicPrivateType),
    ),
    surveyTitle: s.surveyTitle || "제목 없음",
    summary: copy.letterSummary.slice(0, 400),
    problemSummary: copy.problemReason,
    improvementSummary: copy.improvementRequest,
    urlVisibility: "domain_only",
    surveyUrl: url,
    urlHost: extractUrlHost(url),
    selectedEvidenceFileIds: defaultIds,
    evidenceCandidates: candidates,
    riskLevel: s.overallRiskLevel,
    score: s.score,
    platform: s.platform,
    subjectType: s.publicPrivateType,
  };
}

async function nextPublicId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
): Promise<string> {
  const prefix = `case-${kstDateStamp()}-`;
  const { data, error } = await supabase
    .from("publication_records")
    .select("public_id")
    .like("public_id", `${prefix}%`);
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data || []) {
    const raw = String(row.public_id || "");
    const match = raw.match(/-(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function requirePublishConfirmations(input: PublicCaseWriteInput, selectedKinds: PublicEvidenceKind[]) {
  const c = input.confirmations || {};
  if (!c.notViolationConfirmed) {
    throw Object.assign(new Error("자동진단이 위반 확정이 아님을 확인해야 합니다."), {
      status: 400,
    });
  }
  if (!c.displayNameConfirmed) {
    throw Object.assign(new Error("공개용 기관/기업명과 설문 제목을 확인해야 합니다."), {
      status: 400,
    });
  }
  if (!c.evidenceSafeConfirmed) {
    throw Object.assign(
      new Error("공개할 캡처 이미지의 민감정보 여부를 확인해야 합니다."),
      { status: 400 },
    );
  }
  if (!c.urlVisibilityConfirmed) {
    throw Object.assign(new Error("설문 URL 공개 범위를 확인해야 합니다."), {
      status: 400,
    });
  }
  if (needsPiiEvidenceConfirmation(selectedKinds) && !c.piiEvidenceConfirmed) {
    throw Object.assign(
      new Error("개인정보 문항 캡처를 공개하려면 추가 확인이 필요합니다."),
      { status: 400 },
    );
  }
}

export async function getAdminPublicCaseDraft(
  caseId: string,
): Promise<PublicCaseDraft> {
  const detail = await getAdminCaseDetail(caseId);
  const defaults = defaultDraftFromDetail(detail);
  const rec = detail.publicCase;
  if (!rec) return defaults;

  const visibility = normalizeUrlVisibility(rec.urlVisibility);
  const urls = applyUrlVisibility({
    visibility,
    surveyUrl: rec.publicSurveyUrl || defaults.surveyUrl,
    urlHost: rec.publicUrlHost || defaults.urlHost,
  });
  return {
    ...defaults,
    publicId: rec.publicId,
    status: rec.status,
    statusLabel: publicCaseStatusKo(rec.status),
    displayName: rec.publicDisplayName || defaults.displayName,
    surveyTitle: rec.publicSurveyTitle || defaults.surveyTitle,
    summary: rec.publicSummary || defaults.summary,
    problemSummary: rec.publicProblemSummary || defaults.problemSummary,
    improvementSummary:
      rec.publicImprovementSummary || defaults.improvementSummary,
    urlVisibility: visibility,
    surveyUrl: rec.publicSurveyUrl || urls.surveyUrl || defaults.surveyUrl,
    urlHost: rec.publicUrlHost || urls.urlHost || defaults.urlHost,
    selectedEvidenceFileIds:
      rec.selectedEvidenceFileIds.length > 0
        ? rec.selectedEvidenceFileIds
        : defaults.selectedEvidenceFileIds,
  };
}

export async function saveAdminPublicCase(
  caseId: string,
  input: PublicCaseWriteInput,
): Promise<{ publicId: string | null; status: PublicCaseStatus }> {
  const detail = await getAdminCaseDetail(caseId);
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const candidates = evidenceCandidatesFromDetail(detail);
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const { data: existing, error: existingErr } = await supabase
    .from("publication_records")
    .select("id, public_id, public_case_status, publish_status")
    .eq("survey_record_id", caseId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  const currentStatus = normalizePublicCaseStatus(
    (existing?.public_case_status as string | null) || "private",
  );
  let nextStatus: PublicCaseStatus = currentStatus;
  let publicId = (existing?.public_id as string | null) || null;

  if (input.action === "pause") {
    if (currentStatus === "private") {
      throw Object.assign(new Error("등록되지 않은 공개 사례입니다."), {
        status: 400,
      });
    }
    nextStatus = "paused";
  } else if (input.action === "resume") {
    if (currentStatus !== "paused" && currentStatus !== "reviewing") {
      throw Object.assign(new Error("다시 공개할 수 있는 상태가 아닙니다."), {
        status: 400,
      });
    }
    nextStatus = "published";
  } else {
    nextStatus = "published";
    const selectedIds = Array.from(
      new Set((input.selectedEvidenceFileIds || []).filter(Boolean)),
    );
    const selectedKinds = selectedIds
      .map((id) => candidateById.get(id)?.kind)
      .filter((k): k is PublicEvidenceKind => Boolean(k));
    for (const id of selectedIds) {
      if (!candidateById.has(id)) {
        throw Object.assign(new Error("공개할 수 없는 캡처가 포함되어 있습니다."), {
          status: 400,
        });
      }
    }
    requirePublishConfirmations(input, selectedKinds);

    const displayName = (input.displayName || "").trim();
    const surveyTitle = (input.surveyTitle || "").trim();
    if (!displayName || !surveyTitle) {
      throw Object.assign(new Error("공개용 기관/기업명과 설문 제목은 필수입니다."), {
        status: 400,
      });
    }

    const visibility = normalizeUrlVisibility(input.urlVisibility);
    const surveyUrl = (input.surveyUrl || detail.summary.surveyUrl || "").trim() || null;
    const urls = applyUrlVisibility({
      visibility,
      surveyUrl,
      urlHost: extractUrlHost(surveyUrl),
    });
    if (visibility === "full" && !urls.surveyUrl) {
      throw Object.assign(new Error("URL 공개를 선택한 경우 설문 URL이 필요합니다."), {
        status: 400,
      });
    }

    const categoryLabels = [
      ...new Set(
        detail.questions.flatMap((q) => q.categories.map((c) => c.categoryLabel)),
      ),
    ].slice(0, 6);
    const issueBadges = pickIssueBadges({
      userDecisionLabel: detail.summary.userDecisionLabel,
      complianceLabels: detail.complianceChecks.map(
        (c) => `${c.checkItem} ${c.statusLabel}`,
      ),
      findingTitles: detail.findings.map((f) => f.title),
      hasSensitiveInfo: detail.summary.hasSensitiveInfo,
      hasHighRiskInfo: detail.summary.hasHighRiskInfo,
      isPublic: detail.summary.publicPrivateType === "public",
    });
    const dataSummary = formatDataCollectionSummary({
      personalCount: detail.summary.personalInfoQuestionCount,
      sensitiveCount: detail.summary.sensitiveQuestionCount,
      highRiskCount: detail.summary.highRiskQuestionCount,
      hasPersonalInfo: detail.summary.hasPersonalInfo,
      hasSensitiveInfo: detail.summary.hasSensitiveInfo,
      hasHighRiskInfo: detail.summary.hasHighRiskInfo,
      categoryLabels,
    });

    if (!publicId) publicId = await nextPublicId(supabase);

    const payload = {
      survey_record_id: caseId,
      scan_report_id: detail.summary.scanReportId,
      title: surveyTitle,
      summary: (input.summary || "").trim() || null,
      observed_at: detail.summary.observedAt,
      observed_date_kst: detail.summary.observedDateKst,
      public_id: publicId,
      public_case_status: nextStatus,
      public_display_name: displayName,
      public_survey_title: surveyTitle,
      public_summary: (input.summary || "").trim() || null,
      public_problem_summary: (input.problemSummary || "").trim() || null,
      public_improvement_summary:
        (input.improvementSummary || "").trim() || null,
      url_visibility: visibility,
      public_survey_url: visibility === "hidden" ? null : surveyUrl,
      public_url_host: urls.urlHost,
      selected_evidence_file_ids: selectedIds,
      public_risk_level: detail.summary.overallRiskLevel,
      public_score: detail.summary.score,
      public_platform: detail.summary.platform,
      public_private_type: detail.summary.publicPrivateType,
      public_data_summary: dataSummary,
      public_notice_gaps: issueBadges,
      public_issue_badges: issueBadges,
      public_case_published_at: now,
      public_case_published_by: "admin",
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("publication_records")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("publication_records").insert({
        ...payload,
        publish_status: "private",
      });
      if (error) throw new Error(error.message);
    }

    return { publicId, status: nextStatus };
  }

  if (!existing?.id) {
    throw Object.assign(new Error("공개 사례 기록이 없습니다."), { status: 400 });
  }
  if (input.action === "resume" && !publicId) {
    publicId = await nextPublicId(supabase);
  }
  const pausePayload: Record<string, unknown> = {
    public_case_status: nextStatus,
    public_id: publicId,
  };
  if (nextStatus === "published") {
    pausePayload.public_case_published_at = now;
    pausePayload.public_case_published_by = "admin";
  }
  const { error } = await supabase
    .from("publication_records")
    .update(pausePayload)
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
  return { publicId, status: nextStatus };
}
