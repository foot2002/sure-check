import { WeeklyPressCopy } from "@/components/weekly/WeeklyPressCopy";
import {
  WEEKLY_CHECKLIST,
  WEEKLY_NOTICE_EXAMPLE_NOTE,
  WEEKLY_OPERATOR_QUOTE,
  WEEKLY_PUBLIC_SECTOR_POLICY,
  WEEKLY_PUBLIC_SECTOR_SUBTITLE,
  WEEKLY_RESPONDENT_TIPS,
  WEEKLY_TOP_DISCLAIMER,
  formatWeeklyCount,
  type WeeklyKeyFinding,
} from "@/lib/weekly/copy";
import { caseSignalLabel } from "@/lib/weekly/narrative";
import { formatScore1 } from "@/lib/weekly/privacyIndex";
import {
  weeklySampleBadge,
  weeklySampleBadgeLabel,
} from "@/lib/weekly/sampleSize";
import type { WeeklyAnonymousCase, WeeklyPublicSectorStats } from "@/lib/weekly/types";
import type { WeeklyGroupRow } from "@/lib/weekly/present";

export function WeeklyTopDisclaimer() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
      {WEEKLY_TOP_DISCLAIMER}
    </div>
  );
}

export function WeeklyKeyNumberStrip({
  analyzable,
  personalInfoCount,
  attentionNeededCount,
  publicExternalToolCount,
}: {
  analyzable: number;
  personalInfoCount: number;
  attentionNeededCount: number;
  publicExternalToolCount: number;
}) {
  const items = [
    { label: "분석 완료 설문", value: `${formatWeeklyCount(analyzable)}건` },
    { label: "개인정보 수집 신호", value: `${formatWeeklyCount(personalInfoCount)}건` },
    { label: "응답 전 확인 필요", value: `${formatWeeklyCount(attentionNeededCount)}건` },
  ];
  if (publicExternalToolCount > 0) {
    items.push({
      label: "공공부문 외부도구 확인 필요",
      value: `${formatWeeklyCount(publicExternalToolCount)}건`,
    });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-teal-100 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,118,110,0.05)]"
        >
          <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 md:text-3xl">
            {item.value}
          </p>
          <p className="mt-1 text-xs font-semibold text-teal-800">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function WeeklyKeyFindings({
  findings,
  compact = false,
}: {
  findings: WeeklyKeyFinding[];
  compact?: boolean;
}) {
  if (findings.length === 0) return null;
  return (
    <section>
      <h2
        className={
          compact
            ? "text-sm font-bold text-slate-900"
            : "text-xl font-bold text-slate-900"
        }
      >
        이번 주 핵심 발견
      </h2>
      <ol
        className={
          compact
            ? "mt-3 grid gap-2 md:grid-cols-3"
            : "mt-4 grid gap-3 md:grid-cols-3"
        }
      >
        {findings.map((item) => (
          <li
            key={item.order}
            className={
              compact
                ? "rounded-xl border border-slate-200 bg-white px-3 py-3"
                : "rounded-2xl border border-slate-200 bg-white p-4 md:p-5"
            }
          >
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              {item.order}
            </p>
            <h3
              className={
                compact
                  ? "mt-1 text-sm font-bold leading-snug text-slate-900"
                  : "mt-1 text-base font-bold leading-snug text-slate-900"
              }
            >
              {item.title}
            </h3>
            <p
              className={
                compact
                  ? "mt-1 text-xs leading-relaxed text-slate-600"
                  : "mt-2 text-sm leading-relaxed text-slate-600"
              }
            >
              {item.detail}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WeeklyPressBox({
  title,
  bullets,
  text,
}: {
  title: string;
  bullets: string[];
  text: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:p-6">
      <p className="text-xs font-semibold tracking-wide text-teal-800">보도용 핵심 요약</p>
      <h2 className="mt-1 text-lg font-bold text-slate-900">보도 제목 후보</h2>
      <p className="mt-2 text-xl font-bold leading-snug text-slate-900">{title}</p>
      <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-slate-700">
        {bullets.map((line) => (
          <li key={line}>- {line}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">{WEEKLY_OPERATOR_QUOTE}</p>
      <div className="mt-4">
        <WeeklyPressCopy text={text} compact />
      </div>
    </section>
  );
}

export function WeeklySampleBadge({ count }: { count: number }) {
  const label = weeklySampleBadgeLabel(weeklySampleBadge(count));
  if (!label) return null;
  return (
    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
      {label}
    </span>
  );
}

export function WeeklyGroupInsightCards({
  cards,
}: {
  cards: Array<{ title: string; value: string }>;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">{card.title}</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

export function WeeklyGroupCards({
  rows,
  emphasize,
}: {
  rows: WeeklyGroupRow[];
  emphasize?: string[];
}) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <article
          key={row.label}
          className={`rounded-2xl border bg-white p-4 ${
            emphasize?.includes(row.label) ? "border-teal-200" : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-900">{row.label}</h3>
            <WeeklySampleBadge count={row.surveyCount} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {formatWeeklyCount(row.surveyCount)}건 · 개인정보 {row.personalInfoRate}% · 주의
            필요 {row.attentionNeededRate}% · 평균 {formatScore1(row.avgOverallScore)}
          </p>
          {weeklySampleBadge(row.surveyCount) !== "none" ? (
            <p className="mt-2 text-xs text-amber-800">
              표본이 적어 해석에 주의가 필요합니다.
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function WeeklyPublicSectorBlock({
  stats,
}: {
  stats: WeeklyPublicSectorStats;
}) {
  if (stats.publicPersonalInfoSurveyCount === 0) return null;
  const retentionPair = stats.retentionGapCount + stats.destructionGapCount;
  const cards = [
    ["공공부문 개인정보 수집 설문", stats.publicPersonalInfoSurveyCount],
    ["외부 설문도구 사용 확인 필요", stats.externalToolReviewCount],
    ["클라우드 보안 기준 확인 필요", stats.csapOrCloudReviewCount],
    ["보유기간·파기 기준 안내 미흡", retentionPair],
  ] as const;
  return (
    <section className="rounded-2xl border border-teal-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-slate-900">공공부문 특별 분석</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {WEEKLY_PUBLIC_SECTOR_SUBTITLE}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
              {formatWeeklyCount(value)}건
            </p>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>수집 목적 안내 미흡 {formatWeeklyCount(stats.purposeGapCount)}건</div>
        <div>수집 항목 안내 미흡 {formatWeeklyCount(stats.itemsGapCount)}건</div>
        <div>보유기간 안내 미흡 {formatWeeklyCount(stats.retentionGapCount)}건</div>
        <div>파기 기준 안내 미흡 {formatWeeklyCount(stats.destructionGapCount)}건</div>
        <div>담당자 연락처 미흡 {formatWeeklyCount(stats.contactGapCount)}건</div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        {stats.narrative ||
          "이번 주 공공부문 분석 대상이 충분하지 않습니다. 확인 필요 신호가 반복되는 경우 공개 화면의 고지·안내를 보완할 필요가 있습니다."}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        {WEEKLY_PUBLIC_SECTOR_POLICY}
      </p>
    </section>
  );
}

export function WeeklyRiskCaseCard({ item }: { item: WeeklyAnonymousCase }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {item.orgType} · {item.surveyPattern} · {item.tool}
      </p>
      <p className="mt-2 text-xs font-semibold text-teal-800">
        {caseSignalLabel(item)}
      </p>
      <dl className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">
        <div>
          <dt className="font-semibold text-slate-900">왜 이번 주에 주목해야 하는가</dt>
          <dd>{item.whyThisWeek || item.whyRisky}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">수집되는 정보</dt>
          <dd>{item.collectedInfo.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">빠진 고지 항목</dt>
          <dd>{item.noticeGaps.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">왜 위험한가</dt>
          <dd>{item.whyRisky}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">응답자가 알기 어려운 점</dt>
          <dd>{item.respondentBlindSpot}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">운영자가 바로 고칠 항목</dt>
          <dd>{item.operatorMissed.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">바로 고치는 문구</dt>
          <dd>{item.quickFixNotice}</dd>
        </div>
      </dl>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="text-xs font-semibold text-slate-500">{WEEKLY_NOTICE_EXAMPLE_NOTE}</p>
        <p className="mt-2 text-slate-600">
          <span className="font-semibold text-slate-800">미흡한 안내 예시</span>
          {" — "}
          {item.weakNoticeExample}
        </p>
        <p className="mt-2 text-slate-700">
          <span className="font-semibold text-slate-800">개선된 안내 예시</span>
          {" — "}
          {item.improvedNoticeExample}
        </p>
      </div>
    </article>
  );
}

export function WeeklyWeekOverWeekCard({
  interpretation,
  scoreDelta,
  personalInfoRateDelta,
  attentionNeededRateDelta,
  publicExternalToolDelta,
  currentTopIssue,
  previousTopIssue,
}: {
  interpretation: string;
  scoreDelta: number | null;
  personalInfoRateDelta: number | null;
  attentionNeededRateDelta: number | null;
  publicExternalToolDelta: number | null;
  currentTopIssue: string | null;
  previousTopIssue: string | null;
}) {
  const fmtDelta = (value: number | null, suffix: string) => {
    if (value == null) return "비교 불가";
    if (value === 0) return "변동 없음";
    return value > 0 ? `+${value}${suffix}` : `${value}${suffix}`;
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-slate-900">전주 대비 무엇이 달라졌나</h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{interpretation}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>개인정보 보호 수준지수 {fmtDelta(scoreDelta, "점")}</div>
        <div>개인정보 포함 비율 {fmtDelta(personalInfoRateDelta, "%p")}</div>
        <div>주의 필요 비율 {fmtDelta(attentionNeededRateDelta, "%p")}</div>
        <div>공공부문 외부도구 {fmtDelta(publicExternalToolDelta, "건")}</div>
        <div className="sm:col-span-2">
          TOP 이슈 {previousTopIssue ? `${previousTopIssue} → ` : ""}
          {currentTopIssue || "데이터 부족"}
        </div>
      </dl>
    </section>
  );
}

export function WeeklyCollapsedChecklists() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-slate-900">응답자·기관 체크리스트 요약</h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        설문에 이름·연락처를 쓰기 전, 최소 3가지를 확인하세요. 1. 왜 필요한 정보인지
        설명이 있는가 2. 언제까지 보관하고 파기하는지 보이는가 3. 누가 관리하고 어디로
        문의해야 하는지 확인되는가
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        개인정보를 수집하는 설문이라면 첫 화면에 최소 고지 항목을 표시해야 합니다.
        수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처, 외부도구 사용 여부를
        확인하세요.
      </p>
      <details className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-teal-800">
          전체 체크리스트 보기
        </summary>
        <div className="mt-3">
          <h3 className="text-sm font-bold text-slate-900">{WEEKLY_RESPONDENT_TIPS.title}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {WEEKLY_RESPONDENT_TIPS.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <h3 className="mt-4 text-sm font-bold text-slate-900">기관·기업 개선 체크리스트</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {WEEKLY_CHECKLIST.map((item) => (
              <li key={item}>□ {item}</li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
