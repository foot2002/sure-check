/**
 * Priority evidence capture queue: enqueue at most 5 high-priority
 * missing-evidence cases. Capture runs asynchronously via the existing worker.
 */

export const PRIORITY_EVIDENCE_MAX_ENQUEUE = 5;

export type PriorityEvidenceCandidate = {
  id: string;
  outreachPriority: string;
  overallRiskLevel: string;
  publicPrivateType: string;
  hasPersonalInfo: boolean;
  platform: string;
  outreachUiStatus: string;
  outreachCandidate?: boolean;
  evidenceStatus: string;
  userDecisionLabel?: string | null;
};

export function isPriorityEvidenceCandidate(
  row: PriorityEvidenceCandidate,
): boolean {
  if (row.outreachPriority !== "A") return false;
  if (row.overallRiskLevel !== "high" && row.overallRiskLevel !== "critical") {
    return false;
  }
  if (
    row.publicPrivateType !== "public" ||
    !row.hasPersonalInfo ||
    row.platform === "wiseon_csap"
  ) {
    return false;
  }
  const evidenceGap =
    row.evidenceStatus === "증거 부족" || row.evidenceStatus === "캡처 필요";
  if (!evidenceGap) return false;
  const reviewOk =
    row.outreachUiStatus === "unreviewed" ||
    row.outreachUiStatus === "send" ||
    row.outreachUiStatus === "candidate";
  if (!reviewOk) return false;
  return true;
}

export function pickPriorityEvidenceCases<T extends PriorityEvidenceCandidate>(
  rows: T[],
  limit = PRIORITY_EVIDENCE_MAX_ENQUEUE,
): T[] {
  return rows.filter(isPriorityEvidenceCandidate).slice(0, Math.max(0, limit));
}
