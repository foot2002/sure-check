/**
 * Classify collection_runs.error_summary for admin console (minimal labels).
 */

export type CollectorRunKind =
  | "partition_a"
  | "partition_b"
  | "partition_all"
  | "revalidate"
  | "search"
  | "unknown";

export function classifyCollectorRunSummary(
  errorSummary: string | null | undefined,
): { kind: CollectorRunKind; labelKo: string } {
  const text = errorSummary || "";
  if (text.startsWith("[revalidate]") || text.startsWith("[revalidate-batch")) {
    return { kind: "revalidate", labelKo: "backlog revalidate" };
  }
  const part = text.match(/partition\s*=\s*(a|b|all)\b/i);
  if (part?.[1]?.toLowerCase() === "a") {
    return { kind: "partition_a", labelKo: "partition A" };
  }
  if (part?.[1]?.toLowerCase() === "b") {
    return { kind: "partition_b", labelKo: "partition B" };
  }
  if (part?.[1]?.toLowerCase() === "all") {
    return { kind: "partition_all", labelKo: "partition all" };
  }
  if (text.includes("[org_v1.2]") || text.includes("[org_v1")) {
    return { kind: "search", labelKo: "검색수집" };
  }
  if (text.trim()) {
    return { kind: "search", labelKo: "검색수집" };
  }
  return { kind: "unknown", labelKo: "수집" };
}
