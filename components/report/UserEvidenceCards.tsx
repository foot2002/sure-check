"use client";

import { useState } from "react";
import { createElement } from "react";
import {
  AlertTriangle,
  Building2,
  Clock,
  Eye,
  FileWarning,
  Globe,
  Lock,
  UserRound,
  Wrench,
} from "lucide-react";
import { getSafetyTypeTheme } from "@/components/report/ui/safetyTypeTheme";
import type { UserEvidenceCard } from "@/lib/reporting/buildUserEvidenceCards";
import type { SafetyTypeTone } from "@/lib/reporting/safetyType";

interface UserEvidenceCardsProps {
  cards: UserEvidenceCard[];
  tone: SafetyTypeTone;
}

function cardIcon(id: UserEvidenceCard["id"]) {
  switch (id) {
    case "public_external_tool":
      return Lock;
    case "sensitive_high_risk":
      return Eye;
    case "direct_identifiers":
      return UserRound;
    case "retention_destruction":
      return Clock;
    case "overseas_transfer":
      return Globe;
    case "outsourcing_notice":
      return Wrench;
    case "operator_unclear":
      return Building2;
    case "free_opinion_caution":
      return FileWarning;
    case "limited_analysis":
    case "limited_data_unknown":
    case "limited_manual_check":
      return AlertTriangle;
    default:
      return AlertTriangle;
  }
}

function EvidenceCard({
  card,
  tone,
}: {
  card: UserEvidenceCard;
  tone: SafetyTypeTone;
}) {
  const theme = getSafetyTypeTheme(tone);
  const Icon = cardIcon(card.id);
  const [expanded, setExpanded] = useState(false);
  const longBody =
    card.fact.length + card.whyProblem.length + card.action.length > 180;

  return (
    <li
      className={`flex flex-col gap-4 rounded-[1.5rem] border bg-white/95 p-5 shadow-sm md:p-6 ${theme.border}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.iconBg} text-white shadow-md`}
        >
          {createElement(Icon, { className: "h-6 w-6", "aria-hidden": true })}
        </span>
        <h4 className="text-lg font-bold leading-snug text-foreground md:text-xl">
          {card.title}
        </h4>
      </div>

      {card.toolCompare ? (
        <div className="grid gap-2 rounded-xl border border-border-subtle bg-[#f8fafc] p-3 text-sm md:text-[15px]">
          <p>
            <span className="font-semibold text-muted">써야 할 도구: </span>
            <span className="font-bold text-foreground">
              {card.toolCompare.shouldUse}
            </span>
          </p>
          <p>
            <span className="font-semibold text-muted">현재 사용도구: </span>
            <span className="font-bold text-foreground">
              {card.toolCompare.currentlyUses}
            </span>
          </p>
        </div>
      ) : null}

      {card.detectedItems && card.detectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {card.detectedItems.map((item) => (
            <span
              key={item}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold md:text-sm ${theme.badge}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 text-[15px] leading-relaxed text-foreground md:text-base">
        <div>
          <p className={`text-xs font-bold tracking-wide ${theme.accent}`}>
            현재 확인된 사실
          </p>
          <p className="mt-1 text-muted">{card.fact}</p>
        </div>

        {(expanded || !longBody) && (
          <>
            <div>
              <p className={`text-xs font-bold tracking-wide ${theme.accent}`}>
                왜 문제인지
              </p>
              <p className="mt-1 text-muted">{card.whyProblem}</p>
            </div>
            <div>
              <p className={`text-xs font-bold tracking-wide ${theme.accent}`}>
                필요한 조치
              </p>
              <p className="mt-1 font-medium text-foreground">{card.action}</p>
            </div>
          </>
        )}
      </div>

      {card.basisLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {card.basisLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#3730a3]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {longBody ? (
        <button
          type="button"
          className={`self-start text-sm font-bold ${theme.accent}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "간략히 보기" : "자세히 보기"}
        </button>
      ) : null}
    </li>
  );
}

export function UserEvidenceCards({ cards, tone }: UserEvidenceCardsProps) {
  if (cards.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-foreground">
          판단 핵심 근거
        </h3>
        <p className="mt-1 text-base text-muted">
          무엇이 문제인지, 어떤 기준을 확인해야 하는지 핵심만 정리했습니다.
        </p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <EvidenceCard key={card.id} card={card} tone={tone} />
        ))}
      </ul>
    </section>
  );
}
