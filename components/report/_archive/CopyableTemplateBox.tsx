"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CopyableTemplate } from "@/lib/reporting/reportMessages";

interface CopyableTemplateBoxProps {
  templates: CopyableTemplate[];
}

export function CopyableTemplateBox({ templates }: CopyableTemplateBoxProps) {
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);

  if (templates.length === 0) return null;

  async function copy(template: CopyableTemplate) {
    await navigator.clipboard.writeText(template.body);
    setCopiedTitle(template.title);
    setTimeout(() => setCopiedTitle(null), 2000);
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-background p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">
        개선 문구 복사
      </h3>
      <div className="space-y-3">
        {templates.map((template) => {
          const copied = copiedTitle === template.title;
          return (
            <div
              key={template.title}
              className="rounded-lg border border-border-subtle bg-surface p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-foreground">
                  {template.title}
                </p>
                <button
                  type="button"
                  onClick={() => void copy(template)}
                  className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[10px] text-muted hover:bg-background"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {template.body}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
