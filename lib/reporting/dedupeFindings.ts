import type { FindingCategory, ScanFinding, Severity } from "@/lib/types/scan";

export interface DedupeFindingGroup {
  id: string;
  category: FindingCategory;
  title: string;
  severity: Severity;
  descriptions: string[];
  evidence: string[];
  evidenceExtraCount: number;
  recommendations: string[];
  count: number;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function worseSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

function normalizedTitle(finding: ScanFinding): string {
  const source = `${finding.title} ${finding.description}`;

  if (/보유|이용기간|파기|목적 달성 후/.test(source)) {
    return "보유·파기 안내 부족";
  }
  if (/수탁자|위탁|관리감독/.test(source)) {
    return "외부 설문 SaaS 위탁 안내 부족";
  }
  if (/국외|해외|이전 국가|이전받는 자|국외이전|국외보관/.test(source)) {
    return "국외이전/국외보관 안내 부족";
  }
  if (/익명성|원자료|소수집단|통계 비공개/.test(source)) {
    return "직원 설문 익명성·원자료 제공 기준 부족";
  }
  if (/개인정보처리자|담당자|문의처|담당부서/.test(source)) {
    return "담당자/처리자 안내 부족";
  }
  if (/수집.*목적|수집.*항목|동의 거부|거부권|불이익/.test(source)) {
    return "기본 개인정보 고지 부족";
  }
  if (/민감|건강|고충|괴롭힘/.test(source)) {
    return "민감정보 또는 민감 맥락 확인 필요";
  }
  if (/공공|출자|출연|기관/.test(source)) {
    return "공공부문 운영 주체 확인 필요";
  }

  return finding.title.replace(/\s+/g, " ").trim();
}

export function dedupeFindings(findings: ScanFinding[]): DedupeFindingGroup[] {
  const groups = new Map<string, DedupeFindingGroup>();

  for (const finding of findings) {
    const title = normalizedTitle(finding);
    const key = `${finding.category}:${title}`;
    const existing = groups.get(key);
    const evidence = finding.evidence ?? [];
    const recommendations = finding.recommendation ? [finding.recommendation] : [];

    if (!existing) {
      groups.set(key, {
        id: key.toLowerCase().replace(/[^a-z0-9가-힣]+/gi, "_"),
        category: finding.category,
        title,
        severity: finding.severity,
        descriptions: unique([finding.description]),
        evidence: unique(evidence).slice(0, 3),
        evidenceExtraCount: Math.max(0, unique(evidence).length - 3),
        recommendations: unique(recommendations),
        count: 1,
      });
      continue;
    }

    const mergedEvidence = unique([...existing.evidence, ...evidence]);
    existing.severity = worseSeverity(existing.severity, finding.severity);
    existing.descriptions = unique([...existing.descriptions, finding.description]);
    existing.evidence = mergedEvidence.slice(0, 3);
    existing.evidenceExtraCount = Math.max(0, mergedEvidence.length - 3);
    existing.recommendations = unique([...existing.recommendations, ...recommendations]);
    existing.count += 1;
  }

  return [...groups.values()].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  );
}
