/**
 * Admin-only “개선안내 후보” discovery.
 * Never auto-sends mail. Never uses “위반 확정”.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const IMPROVEMENT_CANDIDATE_LABEL = "개선안내 후보";
export const IMPROVEMENT_WORDING = {
  candidate: "개선안내 후보",
  risk: "위반 소지",
  improve: "개선 필요",
  check: "확인 필요",
} as const;

export type ImprovementCandidateRow = {
  id: string;
  operatorName: string | null;
  surveyTitle: string | null;
  surveyUrl: string | null;
  platform: string | null;
  publicPrivateType: string | null;
  hasPersonalInfo: boolean;
  hasSensitiveInfo: boolean;
  hasHighRiskInfo: boolean;
  gapLabels: string[];
  riskLevel: string | null;
  score: number | null;
  hasEvidence: boolean;
  reviewStatus: string | null;
  priority: number;
  wording: "위반 소지" | "개선 필요" | "확인 필요";
};

const NOTICE_GAP_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /고지/, label: "고지문 미흡" },
  { re: /목적/, label: "수집 목적 미흡" },
  { re: /항목/, label: "수집 항목 미흡" },
  { re: /보유/, label: "보유기간 미흡" },
  { re: /파기/, label: "파기 기준 미흡" },
  { re: /연락처|담당자/, label: "담당자 연락처 미흡" },
  { re: /위탁|외부/, label: "외부 설문도구·위탁 안내 미흡" },
  { re: /국외/, label: "국외이전 확인 필요" },
  { re: /CSAP|클라우드/, label: "공공부문 외부도구·CSAP 확인 필요" },
];

function isExternalSurveyTool(platform: string | null | undefined): boolean {
  const p = (platform || "").toLowerCase();
  return (
    p.includes("google") ||
    p.includes("naver") ||
    p.includes("moa") ||
    p.includes("microsoft")
  );
}

export function classifyImprovementGaps(input: {
  hasPersonalInfo?: boolean | null;
  hasSensitiveInfo?: boolean | null;
  hasHighRiskInfo?: boolean | null;
  userDecisionLabel?: string | null;
  publicPrivateType?: string | null;
  platform?: string | null;
  complianceLabels?: string[];
}): string[] {
  const gaps: string[] = [];
  const push = (label: string) => {
    if (!gaps.includes(label)) gaps.push(label);
  };
  if (input.hasPersonalInfo) push("개인정보 포함");
  if (input.hasSensitiveInfo) push("민감정보 포함");
  if (input.hasHighRiskInfo) push("고위험정보 포함");
  const decision = input.userDecisionLabel || "";
  if (/응답 거부|신고 검토|REPORT_OR_INQUIRE|DO_NOT_RESPOND/.test(decision)) {
    push("응답 거부·신고 검토 판단");
  }
  for (const hint of NOTICE_GAP_HINTS) {
    if (hint.re.test(decision)) push(hint.label);
  }
  for (const label of input.complianceLabels || []) {
    for (const hint of NOTICE_GAP_HINTS) {
      if (hint.re.test(label)) push(hint.label);
    }
  }
  const isPublic =
    input.publicPrivateType === "public" ||
    input.publicPrivateType === "공공" ||
    input.publicPrivateType === "public_agency";
  if (isPublic && isExternalSurveyTool(input.platform)) {
    push("공공부문 외부도구·CSAP 확인 필요");
  }
  return gaps;
}

export function isImprovementCandidate(input: {
  hasPersonalInfo?: boolean | null;
  hasSensitiveInfo?: boolean | null;
  hasHighRiskInfo?: boolean | null;
  overallRiskLevel?: string | null;
  userDecisionLabel?: string | null;
  publicPrivateType?: string | null;
  platform?: string | null;
  complianceLabels?: string[];
}): boolean {
  if (input.hasPersonalInfo || input.hasSensitiveInfo || input.hasHighRiskInfo) {
    return true;
  }
  const risk = (input.overallRiskLevel || "").toLowerCase();
  if (risk === "high" || risk === "critical") return true;
  const decision = input.userDecisionLabel || "";
  if (/응답 거부|신고 검토|REPORT_OR_INQUIRE|DO_NOT_RESPOND|미흡|확인 필요/.test(decision)) {
    return true;
  }
  return classifyImprovementGaps(input).length > 0;
}

function wordingFor(input: {
  hasHighRiskInfo?: boolean | null;
  overallRiskLevel?: string | null;
  gapLabels: string[];
}): ImprovementCandidateRow["wording"] {
  const risk = (input.overallRiskLevel || "").toLowerCase();
  if (input.hasHighRiskInfo || risk === "critical" || risk === "high") {
    return "위반 소지";
  }
  if (input.gapLabels.some((g) => /확인 필요|CSAP|국외/.test(g))) {
    return "확인 필요";
  }
  return "개선 필요";
}

function priorityFor(input: {
  publicPrivateType?: string | null;
  hasHighRiskInfo?: boolean | null;
  hasSensitiveInfo?: boolean | null;
  overallRiskLevel?: string | null;
  gapCount: number;
}): number {
  let p = 50;
  const isPublic =
    input.publicPrivateType === "public" ||
    input.publicPrivateType === "공공" ||
    input.publicPrivateType === "public_agency";
  if (isPublic) p += 40;
  if (input.hasHighRiskInfo) p += 30;
  if (input.hasSensitiveInfo) p += 15;
  const risk = (input.overallRiskLevel || "").toLowerCase();
  if (risk === "critical") p += 25;
  else if (risk === "high") p += 15;
  p += Math.min(20, input.gapCount * 3);
  return p;
}

export async function listImprovementCandidates(limit = 12): Promise<{
  count: number;
  items: ImprovementCandidateRow[];
}> {
  const supabase = createSupabaseServerClient();
  const fetchLimit = Math.min(Math.max(limit * 8, 40), 200);
  const { data: surveys, error } = await supabase
    .from("survey_records")
    .select(
      "id, survey_title, survey_url, operator_name, platform, public_private_type, has_personal_info, has_sensitive_info, has_high_risk_info, overall_risk_level, user_decision_label, review_status, observed_at, scan_job_id",
    )
    .order("observed_at", { ascending: false })
    .limit(fetchLimit);

  if (error || !surveys) {
    return { count: 0, items: [] };
  }

  const ids = surveys.map((s) => String(s.id));
  const complianceBySurvey = new Map<string, string[]>();
  if (ids.length > 0) {
    try {
      const { data: checks } = await supabase
        .from("survey_compliance_checks")
        .select("survey_record_id, check_item, status, status_label")
        .in("survey_record_id", ids.slice(0, 80));
      for (const row of checks || []) {
        const status = String(row.status || "");
        const label = String(row.status_label || "");
        if (!/missing|fail|미흡|없음|확인/.test(`${status} ${label}`)) continue;
        const sid = String(row.survey_record_id);
        const cur = complianceBySurvey.get(sid) || [];
        cur.push(String(row.check_item || label));
        complianceBySurvey.set(sid, cur);
      }
    } catch {
      /* optional */
    }
  }

  const scoreBySurvey = new Map<string, number | null>();
  const evidenceByScan = new Map<string, boolean>();
  if (ids.length > 0) {
    try {
      const { data: scores } = await supabase
        .from("survey_index_scores")
        .select("survey_record_id, overall_score")
        .in("survey_record_id", ids.slice(0, 80));
      for (const row of scores || []) {
        scoreBySurvey.set(
          String(row.survey_record_id),
          typeof row.overall_score === "number" ? row.overall_score : null,
        );
      }
    } catch {
      /* optional */
    }
    const scanIds = surveys
      .map((s) => s.scan_job_id)
      .filter((id): id is string => Boolean(id))
      .slice(0, 80);
    if (scanIds.length > 0) {
      try {
        const { data: captures } = await supabase
          .from("capture_jobs")
          .select("scan_job_id, status")
          .in("scan_job_id", scanIds);
        for (const row of captures || []) {
          if (row.status === "success" || row.status === "partial") {
            evidenceByScan.set(String(row.scan_job_id), true);
          }
        }
      } catch {
        /* optional */
      }
    }
  }

  const items: ImprovementCandidateRow[] = [];
  for (const row of surveys) {
    const complianceLabels = complianceBySurvey.get(String(row.id)) || [];
    const flags = {
      hasPersonalInfo: Boolean(row.has_personal_info),
      hasSensitiveInfo: Boolean(row.has_sensitive_info),
      hasHighRiskInfo: Boolean(row.has_high_risk_info),
      overallRiskLevel: row.overall_risk_level as string | null,
      userDecisionLabel: row.user_decision_label as string | null,
      publicPrivateType: row.public_private_type as string | null,
      platform: row.platform as string | null,
      complianceLabels,
    };
    if (!isImprovementCandidate(flags)) continue;
    const gapLabels = classifyImprovementGaps(flags);
    items.push({
      id: String(row.id),
      operatorName: (row.operator_name as string | null) || null,
      surveyTitle: (row.survey_title as string | null) || null,
      surveyUrl: (row.survey_url as string | null) || null,
      platform: (row.platform as string | null) || null,
      publicPrivateType: (row.public_private_type as string | null) || null,
      hasPersonalInfo: flags.hasPersonalInfo,
      hasSensitiveInfo: flags.hasSensitiveInfo,
      hasHighRiskInfo: flags.hasHighRiskInfo,
      gapLabels,
      riskLevel: flags.overallRiskLevel,
      score: scoreBySurvey.get(String(row.id)) ?? null,
      hasEvidence: row.scan_job_id
        ? Boolean(evidenceByScan.get(String(row.scan_job_id)))
        : false,
      reviewStatus: (row.review_status as string | null) || null,
      priority: priorityFor({
        publicPrivateType: flags.publicPrivateType,
        hasHighRiskInfo: flags.hasHighRiskInfo,
        hasSensitiveInfo: flags.hasSensitiveInfo,
        overallRiskLevel: flags.overallRiskLevel,
        gapCount: gapLabels.length,
      }),
      wording: wordingFor({
        hasHighRiskInfo: flags.hasHighRiskInfo,
        overallRiskLevel: flags.overallRiskLevel,
        gapLabels,
      }),
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  return {
    count: items.length,
    items: items.slice(0, limit),
  };
}
