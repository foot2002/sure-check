"use client";

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
import { PlatformMark } from "@/components/report/ui/PlatformMark";
import type { UserEvidenceCard } from "@/lib/reporting/buildUserEvidenceCards";
import type { SafetyTypeTone } from "@/lib/reporting/safetyType";
import type { Platform } from "@/lib/types/scan";

interface UserEvidenceCardsProps {
  cards: UserEvidenceCard[];
  tone: SafetyTypeTone;
  platform?: Platform;
  sourceKind?: "url" | "file";
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
    default:
      return AlertTriangle;
  }
}

function riskBadge(id: UserEvidenceCard["id"]): {
  label: string;
  className: string;
} {
  if (
    id === "public_external_tool" ||
    id === "sensitive_high_risk" ||
    id === "direct_identifiers"
  ) {
    return {
      label: "위험",
      className: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (id.startsWith("limited")) {
    return {
      label: "판단 제한",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }
  return {
    label: "확인 필요",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  };
}

function shortText(value: string, max = 110): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function EvidenceCard({
  card,
  platform,
  sourceKind,
  className = "",
}: {
  card: UserEvidenceCard;
  tone: SafetyTypeTone;
  platform?: Platform;
  sourceKind?: "url" | "file";
  className?: string;
}) {
  const Icon = cardIcon(card.id);
  const badge = riskBadge(card.id);

  return (
    <li className={`report-feature-card gap-0 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`report-feature-icon ${
              badge.label === "위험"
                ? "bg-rose-600"
                : badge.label === "판단 제한"
                  ? "bg-slate-500"
                  : "bg-amber-600"
            }`}
          >
            {createElement(Icon, {
              className: "h-4 w-4",
              strokeWidth: 2.25,
              "aria-hidden": true,
            })}
          </span>
          <span
            className={`report-feature-badge ${
              badge.label === "위험"
                ? "bg-rose-600"
                : badge.label === "판단 제한"
                  ? "bg-slate-500"
                  : "bg-amber-600"
            }`}
          >
            {badge.label}
          </span>
        </div>
      </div>
      <h4 className="mt-3 text-base font-bold leading-snug text-slate-900">
        {card.title}
      </h4>
      <div className="report-feature-divider" />

      {card.toolCompare ? (
        <div className="mb-3 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex items-center gap-3">
            <PlatformMark
              platform={platform}
              source={sourceKind}
              label={card.toolCompare.currentlyUses}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">현재</p>
              <p className="font-semibold text-slate-900">
                {card.toolCompare.currentlyUses}
              </p>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-2">
            <p className="text-xs font-semibold text-slate-500">권장</p>
            <p className="mt-0.5 font-medium leading-snug text-slate-800">
              {card.toolCompare.shouldUse}
            </p>
          </div>
        </div>
      ) : null}

      {card.detectedItems && card.detectedItems.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {card.detectedItems.slice(0, 6).map((item) => (
            <span key={item} className="report-badge-neutral">
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="space-y-2.5 text-sm">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500">
            확인된 사실
          </dt>
          <dd className="mt-1 leading-relaxed text-slate-700">
            {shortText(card.fact, 140)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500">
            문제
          </dt>
          <dd className="mt-1 leading-relaxed text-slate-700">
            {shortText(card.whyProblem, 120)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500">
            조치
          </dt>
          <dd className="mt-1 font-medium leading-relaxed text-slate-900">
            {shortText(card.action, 120)}
          </dd>
        </div>
      </dl>

      {card.basisLabels.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {card.basisLabels.map((label) => (
            <span key={label} className="report-badge-legal">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function UserEvidenceCards({
  cards,
  tone,
  platform,
  sourceKind,
}: UserEvidenceCardsProps) {
  if (cards.length === 0) return null;

  const list = cards.slice(0, 4);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">
          판단 핵심 근거
        </h3>
        <p className="mt-1 text-[15px] text-slate-600">
          무엇이 문제인지, 어떤 기준을 확인해야 하는지 핵심만 정리했습니다.
        </p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {list.map((card, index) => (
          <EvidenceCard
            key={card.id}
            card={card}
            tone={tone}
            platform={platform}
            sourceKind={sourceKind}
            className={index >= 3 ? "hidden md:flex" : ""}
          />
        ))}
      </ul>
    </section>
  );
}
