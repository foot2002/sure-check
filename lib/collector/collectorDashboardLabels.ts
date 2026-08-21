/**
 * Collector dashboard Korean labels. Display-only — does not change collect/diagnosis policy.
 */
export function collectorPlatformLabel(platform: string): string {
  if (platform === "google_forms") return "Google Forms";
  if (platform === "naver_form") return "Naver Form";
  if (platform === "moaform") return "Moaform";
  return platform;
}

export function collectorStatusLabelKo(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "active") return "응답 가능";
  if (s === "discovered") return "발견됨";
  if (s === "closed") return "종료됨";
  if (s === "restricted") return "접근제한";
  if (s === "limited") return "제한 진단";
  if (s === "completed") return "진단 완료";
  if (s === "unreachable") return "접속 실패";
  if (s === "invalid") return "URL 오류";
  if (s === "stale") return "과거 연도 제외";
  if (s === "ignored") return "제외됨";
  return "미확인";
}

export function collectorTriageLabelKo(queue: string | null | undefined): string {
  if (queue === "A_PRIORITY") return "우선순위 A";
  if (queue === "B_PRIORITY") return "우선순위 B";
  if (queue === "C_ARCHIVE") return "낮은 우선순위 보관";
  return "";
}

export function collectorLaneLabelKo(lane: string | null | undefined): string {
  if (lane === "date_unknown_hold") return "날짜 불명 보류";
  if (lane === "collect_candidate") return "수집 후보";
  if (lane === "active_candidate") return "진단 대상 후보";
  if (lane === "collect_confirmed") return "수집 확정";
  if (lane === "active_recent") return "최근 60일 진단대상";
  if (lane === "stale_candidate") return "과거 연도 제외";
  if (lane === "screened_out") return "진단 제외";
  if (lane === "raw_discovered") return "발견됨";
  return "";
}

export function collectorDiagnosisLabelKo(status: string | null | undefined): string {
  const s = (status || "undiagnosed").toLowerCase();
  if (s === "completed") return "진단 완료";
  if (s === "queued") return "진단 대기";
  if (s === "running") return "진단 중";
  if (s === "limited") return "내용을 읽지 못함";
  if (s === "failed" || s === "failed_retryable" || s === "failed_final") {
    return "진단 실패";
  }
  if (s === "skipped_closed") return "종료로 제외";
  if (s === "skipped_restricted") return "접근제한 제외";
  if (s === "timeout") return "타임아웃";
  if (s === "skipped") return "진단 제외";
  return "아직 진단 전";
}

export function collectorFreshnessLabelKo(input: {
  status?: string | null;
  lane?: string | null;
  reasonCode?: string | null;
  exclusionReason?: string | null;
  eligibleRecent?: boolean | null;
  reasonText?: string | null;
}): string {
  const code = `${input.reasonCode || ""} ${input.exclusionReason || ""}`.toLowerCase();
  if (input.eligibleRecent) return "최근 60일 적격";
  if (input.lane === "date_unknown_hold" || /date_unknown|unknown_no_signal|active_unknown/.test(code)) {
    return "날짜 불명 보류";
  }
  if (/stale|previous_year|old_year/.test(code) || input.status === "stale") {
    return "과거 연도 제외";
  }
  if (input.status === "closed" || /closed/.test(code)) return "종료 설문";
  if (input.status === "restricted" || /restricted/.test(code)) return "접근제한";
  if (/personal|research/.test(code)) return "개인연구 제외";
  if (input.reasonText) return input.reasonText;
  if (input.lane === "active_recent" || input.lane === "collect_confirmed") {
    return "최근 60일 적격";
  }
  return "최근성 판단 없음";
}

export function collectorSourceChannelKo(sourceType: string | null | undefined): string {
  if (sourceType === "official_site") return "공식 사이트";
  if (sourceType === "web" || sourceType === "blog" || sourceType === "cafe") {
    return "네이버 검색";
  }
  return "출처 미확인";
}

export function matchesCollectorHoldReason(
  input: {
    status?: string | null;
    title?: string | null;
    collectLane?: string | null;
    reasonCode?: string | null;
    exclusionReason?: string | null;
    eligibleRecent?: boolean | null;
    autoDiagnosisTarget?: boolean | null;
  },
  hold: string,
): boolean {
  const code = `${input.reasonCode || ""} ${input.exclusionReason || ""}`.toLowerCase();
  const status = (input.status || "").toLowerCase();
  if (hold === "date_unknown") {
    return (
      input.collectLane === "date_unknown_hold" ||
      /date_unknown|unknown_no_signal|active_unknown/.test(code)
    );
  }
  if (hold === "old_year") {
    return status === "stale" || /stale|previous_year|old_year/.test(code);
  }
  if (hold === "closed") return status === "closed" || /closed/.test(code);
  if (hold === "restricted") return status === "restricted";
  if (hold === "personal") {
    return /개인연구|personal|research/.test(`${input.title || ""} ${code}`);
  }
  if (hold === "invalid") return status === "invalid" || status === "unreachable";
  if (hold === "eligible") {
    return Boolean(input.autoDiagnosisTarget || input.eligibleRecent);
  }
  return true;
}
