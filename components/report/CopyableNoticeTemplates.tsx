"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Globe,
  Shield,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CopyableTemplate } from "@/lib/reporting/reportMessages";

interface CopyableNoticeTemplatesProps {
  templates: CopyableTemplate[];
}

function templateMeta(title: string): { Icon: LucideIcon; iconBg: string } {
  if (/국외|Google|이전/.test(title)) {
    return { Icon: Globe, iconBg: "bg-[#1d4ed8]" };
  }
  if (/공공|외부 설문|CSAP/.test(title)) {
    return { Icon: Shield, iconBg: "bg-[#0f766e]" };
  }
  if (/직원/.test(title)) {
    return { Icon: Users, iconBg: "bg-[#1e3a5f]" };
  }
  return { Icon: FileText, iconBg: "bg-slate-600" };
}

export function CopyableNoticeTemplates({
  templates,
}: CopyableNoticeTemplatesProps) {
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (templates.length === 0) return null;

  async function copy(template: CopyableTemplate) {
    await navigator.clipboard.writeText(template.body);
    setCopiedTitle(template.title);
    setTimeout(() => setCopiedTitle(null), 2000);
  }

  const visible = templates.slice(0, 4);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-800">개선 문구 복사</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          설문 맥락에 맞는 고지·안내 문구만 표시합니다.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((template) => {
          const copied = copiedTitle === template.title;
          const isLong = template.body.length > 160;
          const isOpen = expanded[template.title] === true;
          const body =
            isLong && !isOpen
              ? `${template.body.slice(0, 160).trim()}…`
              : template.body;
          const { Icon, iconBg } = templateMeta(template.title);

          return (
            <article key={template.title} className="report-feature-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`report-feature-icon ${iconBg}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h4 className="text-sm font-bold leading-snug text-slate-900">
                    {template.title}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(template)}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              <div className="report-feature-divider" />
              <p className="report-detail-body whitespace-pre-wrap">
                {body}
              </p>
              {isLong ? (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold text-slate-600 hover:text-slate-900"
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [template.title]: !isOpen,
                    }))
                  }
                >
                  {isOpen ? "간략히 보기" : "전체 보기"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
