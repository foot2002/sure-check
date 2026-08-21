import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PUBLIC_CASE_CAUTION,
  PUBLIC_CASE_DISCLAIMER,
  assertPublicCaseSafe,
  isPubliclyListedCase,
} from "@/lib/report/publicCasePolicy";
import {
  applyUrlVisibility,
  normalizeUrlVisibility,
  type UrlVisibility,
} from "@/lib/report/publicDisplayName";
import {
  PUBLIC_EVIDENCE_KIND_LABEL,
  classifyPublicEvidenceKind,
  type PublicEvidenceKind,
} from "@/lib/report/publicEvidenceKinds";
import { riskLabelKo } from "@/lib/report/adminOutreach";

export type PublicCaseFilter =
  | "all"
  | "public"
  | "private"
  | "high-risk"
  | "notice-gap"
  | "external-tool";

export type PublicCaseSort = "recent" | "risk";

export interface PublicCaseEvidence {
  id: string;
  kind: PublicEvidenceKind;
  label: string;
  imageUrl: string;
}

export interface PublicCaseListItem {
  publicId: string;
  displayName: string;
  surveyTitle: string;
  platform: string;
  publishedAt: string | null;
  diagnosedAt: string;
  riskLevel: string;
  riskLabel: string;
  problemSummary: string;
  dataSummary: string;
  improvementSummary: string;
  urlVisibility: UrlVisibility;
  surveyUrl: string | null;
  urlHost: string | null;
  subjectType: string;
  noticeGaps: string[];
  issueBadges: string[];
}

export interface PublicCaseDetail extends PublicCaseListItem {
  summary: string;
  score: number | null;
  evidence: PublicCaseEvidence[];
  disclaimer: string;
  caution: string;
}

const PUBLIC_CASE_SELECT = [
  "public_id",
  "public_case_status",
  "public_display_name",
  "public_survey_title",
  "public_summary",
  "public_problem_summary",
  "public_improvement_summary",
  "url_visibility",
  "public_survey_url",
  "public_url_host",
  "selected_evidence_file_ids",
  "public_risk_level",
  "public_score",
  "public_platform",
  "public_private_type",
  "public_data_summary",
  "public_notice_gaps",
  "public_issue_badges",
  "public_case_published_at",
  "observed_date_kst",
].join(", ");

const PLATFORM_LABEL: Record<string, string> = {
  google_forms: "Google Forms",
  naver_form: "Naver Form",
  moaform: "Moaform",
  generic: "기타 설문",
  wiseon_csap: "WiseON",
  unknown: "미확인",
};

const RISK_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  limited: 2,
  medium: 3,
  low: 4,
  unknown: 5,
};

type PublicCaseRow = {
  public_id: string | null;
  public_case_status: string | null;
  public_display_name: string | null;
  public_survey_title: string | null;
  public_summary: string | null;
  public_problem_summary: string | null;
  public_improvement_summary: string | null;
  url_visibility: string | null;
  public_survey_url: string | null;
  public_url_host: string | null;
  selected_evidence_file_ids: string[] | null;
  public_risk_level: string | null;
  public_score: number | string | null;
  public_platform: string | null;
  public_private_type: string | null;
  public_data_summary: string | null;
  public_notice_gaps: string[] | null;
  public_issue_badges: string[] | null;
  public_case_published_at: string | null;
  observed_date_kst: string | null;
};

export function publicPlatformLabel(platform: string | null | undefined): string {
  const key = (platform || "unknown").trim();
  return PLATFORM_LABEL[key] || platform || PLATFORM_LABEL.unknown;
}

function rewritePublicWording(text: string): string {
  return text
    .replace(/위반\s*확정/g, "위반 소지")
    .replace(/불법/g, "확인 필요");
}

function toListItem(row: PublicCaseRow): PublicCaseListItem | null {
  if (
    !isPubliclyListedCase({
      publicCaseStatus: row.public_case_status,
      publicId: row.public_id,
    })
  ) {
    return null;
  }
  const visibility = normalizeUrlVisibility(row.url_visibility);
  const urls = applyUrlVisibility({
    visibility,
    surveyUrl: row.public_survey_url,
    urlHost: row.public_url_host,
  });
  const riskLevel = (row.public_risk_level || "unknown").toLowerCase();
  return {
    publicId: String(row.public_id),
    displayName: rewritePublicWording(
      (row.public_display_name || "익명 기관").trim() || "익명 기관",
    ),
    surveyTitle: rewritePublicWording(
      (row.public_survey_title || "제목 비공개").trim() || "제목 비공개",
    ),
    platform: publicPlatformLabel(row.public_platform),
    publishedAt: row.public_case_published_at,
    diagnosedAt: row.observed_date_kst || "",
    riskLevel,
    riskLabel: riskLabelKo(riskLevel),
    problemSummary: rewritePublicWording(
      (row.public_problem_summary || "확인 필요 사항이 있습니다.").trim(),
    ),
    dataSummary: rewritePublicWording(
      (row.public_data_summary || "수집 정보 요약 없음").trim(),
    ),
    improvementSummary: rewritePublicWording(
      (row.public_improvement_summary || "고지·안내 보완이 필요합니다.").trim(),
    ),
    urlVisibility: visibility,
    surveyUrl: urls.surveyUrl,
    urlHost: urls.urlHost,
    subjectType: (row.public_private_type || "unknown").toLowerCase(),
    noticeGaps: (row.public_notice_gaps || []).map(rewritePublicWording),
    issueBadges: (row.public_issue_badges || []).map(rewritePublicWording),
  };
}

function matchesFilter(item: PublicCaseListItem, filter: PublicCaseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "public") return item.subjectType === "public";
  if (filter === "private") return item.subjectType === "private";
  if (filter === "high-risk") {
    return item.riskLevel === "high" || item.riskLevel === "critical";
  }
  if (filter === "notice-gap") {
    return (
      item.noticeGaps.length > 0 ||
      item.issueBadges.some((b) => /고지|안내 미흡|목적|항목|보유/.test(b))
    );
  }
  if (filter === "external-tool") {
    return item.issueBadges.some((b) => /외부도구|위탁|CSAP|클라우드/.test(b));
  }
  return true;
}

function sortCases(items: PublicCaseListItem[], sort: PublicCaseSort): PublicCaseListItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "risk") {
      const diff =
        (RISK_RANK[a.riskLevel] ?? 9) - (RISK_RANK[b.riskLevel] ?? 9);
      if (diff !== 0) return diff;
    }
    const aTime = a.publishedAt || a.diagnosedAt || "";
    const bTime = b.publishedAt || b.diagnosedAt || "";
    return bTime.localeCompare(aTime);
  });
  return copy;
}

export function parsePublicCaseFilter(
  value: string | null | undefined,
): PublicCaseFilter {
  if (
    value === "public" ||
    value === "private" ||
    value === "high-risk" ||
    value === "notice-gap" ||
    value === "external-tool"
  ) {
    return value;
  }
  return "all";
}

export function parsePublicCaseSort(
  value: string | null | undefined,
): PublicCaseSort {
  return value === "risk" ? "risk" : "recent";
}

export async function listPublishedPublicCases(input?: {
  filter?: string | null;
  sort?: string | null;
}): Promise<PublicCaseListItem[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("publication_records")
    .select(PUBLIC_CASE_SELECT)
    .eq("public_case_status", "published")
    .not("public_id", "is", null)
    .order("public_case_published_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);

  const filter = parsePublicCaseFilter(input?.filter);
  const sort = parsePublicCaseSort(input?.sort);
  const items = ((data || []) as unknown as PublicCaseRow[])
    .map(toListItem)
    .filter((row): row is PublicCaseListItem => Boolean(row))
    .filter((row) => matchesFilter(row, filter));
  const sorted = sortCases(items, sort);
  assertPublicCaseSafe(sorted);
  return sorted;
}

export async function getPublishedPublicCase(
  publicId: string,
): Promise<PublicCaseDetail | null> {
  const id = (publicId || "").trim();
  if (!id) return null;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("publication_records")
    .select(`${PUBLIC_CASE_SELECT}, survey_record_id`)
    .eq("public_id", id)
    .eq("public_case_status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as PublicCaseRow & { survey_record_id?: string };
  const listItem = toListItem(row);
  if (!listItem) return null;

  const selected = (row.selected_evidence_file_ids || []).filter(Boolean);
  const evidence: PublicCaseEvidence[] = [];
  if (selected.length > 0) {
    const { data: files, error: fileErr } = await supabase
      .from("evidence_files")
      .select("id, evidence_type, label, page_number, survey_record_id")
      .in("id", selected);
    if (fileErr) throw new Error(fileErr.message);
    const surveyId = row.survey_record_id;
    const byId = new Map((files || []).map((f) => [f.id as string, f]));
    for (const evidenceId of selected) {
      const file = byId.get(evidenceId);
      if (!file) continue;
      if (surveyId && file.survey_record_id && file.survey_record_id !== surveyId) {
        continue;
      }
      const kind = classifyPublicEvidenceKind({
        evidenceType: String(file.evidence_type || ""),
        label: (file.label as string | null) || null,
        pageNumber: (file.page_number as number | null) || null,
      });
      if (!kind) continue;
      evidence.push({
        id: evidenceId,
        kind,
        label: PUBLIC_EVIDENCE_KIND_LABEL[kind],
        imageUrl: `/api/public/cases/${encodeURIComponent(listItem.publicId)}/evidence/${encodeURIComponent(evidenceId)}`,
      });
    }
  }

  const detail: PublicCaseDetail = {
    ...listItem,
    summary: rewritePublicWording((row.public_summary || "").trim()),
    score:
      row.public_score == null || row.public_score === ""
        ? null
        : Number(row.public_score),
    evidence,
    disclaimer: PUBLIC_CASE_DISCLAIMER,
    caution: PUBLIC_CASE_CAUTION,
  };
  assertPublicCaseSafe(detail);
  return detail;
}

export async function loadPublishedEvidenceFile(input: {
  publicId: string;
  evidenceId: string;
}): Promise<{
  mimeType: string;
  bytes: Blob;
} | null> {
  const publicId = input.publicId.trim();
  const evidenceId = input.evidenceId.trim();
  if (!publicId || !evidenceId) return null;

  const supabase = createSupabaseServerClient();
  const { data: rec, error } = await supabase
    .from("publication_records")
    .select(
      "public_id, public_case_status, selected_evidence_file_ids, survey_record_id",
    )
    .eq("public_id", publicId)
    .eq("public_case_status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) return null;
  const selected = (rec.selected_evidence_file_ids as string[] | null) || [];
  if (!selected.includes(evidenceId)) return null;

  const { data: file, error: fileErr } = await supabase
    .from("evidence_files")
    .select(
      "id, storage_bucket, storage_path, mime_type, evidence_type, survey_record_id",
    )
    .eq("id", evidenceId)
    .maybeSingle();
  if (fileErr) throw new Error(fileErr.message);
  if (!file?.storage_path || !file.storage_bucket) return null;
  if (
    rec.survey_record_id &&
    file.survey_record_id &&
    file.survey_record_id !== rec.survey_record_id
  ) {
    return null;
  }
  const kind = classifyPublicEvidenceKind({
    evidenceType: String(file.evidence_type || ""),
  });
  if (!kind) return null;

  const downloaded = await supabase.storage
    .from(file.storage_bucket as string)
    .download(file.storage_path as string);
  if (downloaded.error || !downloaded.data) return null;
  return {
    mimeType: (file.mime_type as string | null) || downloaded.data.type || "image/png",
    bytes: downloaded.data,
  };
}
