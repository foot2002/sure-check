import type { NormalizedQuestion } from "@/lib/types/scan";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";

interface ExtractedQuestionTableProps {
  questions: NormalizedQuestion[];
  readable?: boolean;
}

function formatList(values: string[] | undefined): string {
  if (!values || values.length === 0) return "—";
  return values.join(", ");
}

function formatDisplayLabels(question: NormalizedQuestion): string {
  const categories = question.detectedCategories;
  if (!categories || categories.length === 0) return "—";
  const text = question.questionText ?? question.label;
  return categories
    .map((category) => getDetectedCategoryDisplayLabel(category, text))
    .join(", ");
}

export function ExtractedQuestionTable({
  questions,
  readable = false,
}: ExtractedQuestionTableProps) {
  if (questions.length === 0) {
    return (
      <p className={readable ? "text-sm text-muted md:text-[15px]" : "text-[12px] text-muted"}>
        추출된 문항이 없습니다.
      </p>
    );
  }

  const textClass = readable ? "text-sm md:text-[15px]" : "text-[11px]";
  const headClass = readable
    ? "px-3 py-2.5 text-sm font-semibold md:text-[15px]"
    : "px-2 py-2 font-medium";
  const cellClass = readable ? "px-3 py-2.5" : "px-2 py-2";

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className={`min-w-full text-left ${textClass}`}>
        <thead className="bg-surface text-muted">
          <tr>
            <th className={headClass}>page</th>
            <th className={headClass}>#</th>
            <th className={`min-w-[180px] ${headClass}`}>questionText</th>
            <th className={headClass}>type</th>
            <th className={headClass}>required</th>
            <th className={headClass}>options</th>
            <th className={`min-w-[120px] ${headClass}`}>categories</th>
            <th className={`min-w-[120px] ${headClass}`}>displayLabel</th>
            <th className={`min-w-[100px] ${headClass}`}>riskTags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-background">
          {questions.map((question, index) => (
            <tr key={question.id ?? index} className="align-top">
              <td className={`${cellClass} text-muted`}>
                {question.pageIndex ?? "—"}
              </td>
              <td className={`${cellClass} text-muted`}>
                {question.questionIndex ?? index + 1}
              </td>
              <td className={`max-w-xs ${cellClass} text-foreground`}>
                {question.questionText ?? question.label}
              </td>
              <td className={`${cellClass} text-muted`}>{question.type}</td>
              <td className={`${cellClass} text-muted`}>
                {question.required ? "Y" : "N"}
              </td>
              <td className={`${cellClass} text-muted`}>
                {question.options?.length ?? 0}
              </td>
              <td className={`${cellClass} text-muted`}>
                {formatList(question.detectedCategories)}
              </td>
              <td className={`${cellClass} text-muted`}>
                {formatDisplayLabels(question)}
              </td>
              <td className={`${cellClass} text-muted`}>
                {formatList(question.riskTags)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
