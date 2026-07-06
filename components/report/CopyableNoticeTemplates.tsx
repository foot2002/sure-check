"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { CopyableTemplate } from "@/lib/reporting/reportMessages";

interface CopyableNoticeTemplatesProps {
  templates: CopyableTemplate[];
}

export function CopyableNoticeTemplates({
  templates,
}: CopyableNoticeTemplatesProps) {
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);

  if (templates.length === 0) return null;

  async function copy(template: CopyableTemplate) {
    await navigator.clipboard.writeText(template.body);
    setCopiedTitle(template.title);
    setTimeout(() => setCopiedTitle(null), 2000);
  }

  return (
    <section>
      <SectionHeader
        title="개선 문구 복사"
        description="운영자가 바로 붙여넣어 쓸 수 있는 고지·안내 문구 템플릿입니다."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => {
          const copied = copiedTitle === template.title;
          return (
            <article
              key={template.title}
              className="report-summary-card p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground md:text-[15px]">
                  {template.title}
                </h3>
                <button
                  type="button"
                  onClick={() => void copy(template)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-subtle bg-background px-3 text-xs font-semibold text-muted transition hover:border-brand-muted hover:text-brand"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-muted md:text-[15px]">
                {template.body}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
