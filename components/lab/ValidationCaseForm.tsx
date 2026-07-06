"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createValidationCaseId } from "@/lib/validation/defaultCases";
import type {
  ExpectedContext,
  ExpectedDetectedCategory,
  ExpectedExtractor,
  ExpectedPlatform,
  PlatformGroup,
  ValidationCase,
} from "@/lib/validation/types";
import type { RiskGrade } from "@/lib/types/scan";

interface ValidationCaseFormProps {
  onAdd: (testCase: ValidationCase) => void;
}

const PLATFORM_GROUPS: PlatformGroup[] = [
  "google_forms",
  "naver_forms",
  "moaform",
  "generic_html",
  "walla",
  "now_survey",
  "survey_monkey",
  "typeform",
  "microsoft_forms",
  "qualtrics",
  "wiseon_survey",
  "research_company_custom",
  "unknown",
];

const EXPECTED_PLATFORMS: ExpectedPlatform[] = [
  "google_forms",
  "naver_forms",
  "moaform",
  "generic",
  "wiseon_csap",
  "unknown",
];

const EXTRACTORS: ExpectedExtractor[] = [
  "GoogleFormsExtractor",
  "NaverFormsExtractor",
  "MoaformExtractor",
  "GenericHtmlExtractor",
  "Limited",
  "Fixture",
];

const CATEGORIES: ExpectedDetectedCategory[] = [
  "name",
  "phone",
  "email",
  "address",
  "gender",
  "respondent_age",
  "age_range",
  "child_age_range",
  "residence_area",
  "quasi_identifier",
  "affiliation",
  "organization_identifier",
  "department",
  "position",
  "tenure",
  "sensitive_health",
  "sensitive_complaint",
  "sensitive_belief_union",
  "sensitive_political",
  "sensitive_religion",
  "unique_identifier",
  "financial",
  "resident_registration_number",
  "passport_number",
  "driver_license_number",
  "foreign_registration_number",
  "id_document",
  "financial_account",
  "authentication_secret",
  "program_preference",
  "policy_opinion",
  "service_feedback",
  "visit_purpose",
  "satisfaction",
  "preference",
  "improvement_opinion",
  "general_opinion",
];

const CONTEXTS: ExpectedContext[] = [
  "public_sector",
  "company",
  "employee",
  "event",
  "marketing",
  "complaint",
  "unknown",
];

const GRADES: RiskGrade[] = ["safe", "caution", "risk", "high_risk"];

const DATA_LEVELS = ["D0", "D1", "D2", "D3", "D4", "D5"] as const;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20";

export function ValidationCaseForm({ onAdd }: ValidationCaseFormProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [platformGroup, setPlatformGroup] = useState<PlatformGroup>("generic_html");
  const [expectedPlatform, setExpectedPlatform] = useState<ExpectedPlatform>("generic");
  const [expectedExtractor, setExpectedExtractor] =
    useState<ExpectedExtractor>("GenericHtmlExtractor");
  const [expectedMinQuestionCount, setExpectedMinQuestionCount] = useState("1");
  const [expectedRiskGrade, setExpectedRiskGrade] = useState<RiskGrade | "">("");
  const [expectedContext, setExpectedContext] = useState<ExpectedContext>("unknown");
  const [expectedDataLevel, setExpectedDataLevel] = useState<string>("");
  const [expectedIsLimited, setExpectedIsLimited] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<
    ExpectedDetectedCategory[]
  >([]);
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);

  function toggleCategory(category: ExpectedDetectedCategory) {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    onAdd({
      id: createValidationCaseId(),
      name: name.trim(),
      url: url.trim(),
      platformGroup,
      expectedPlatform,
      expectedExtractor,
      expectedMinQuestionCount: Number(expectedMinQuestionCount) || 0,
      expectedDetectedCategories: selectedCategories,
      expectedRiskGrade: expectedRiskGrade || undefined,
      expectedIsLimited,
      expectedContext: expectedContext || undefined,
      expectedDataLevel: (expectedDataLevel as ValidationCase["expectedDataLevel"]) ||
        undefined,
      notes: notes.trim() || undefined,
      enabled,
    });

    setName("");
    setUrl("");
    setNotes("");
    setSelectedCategories([]);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-foreground">테스트 케이스 추가</h3>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">이름</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="케이스 이름"
            required
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] font-medium text-muted">URL</span>
          <input
            className={inputClass}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">platformGroup</span>
          <select
            className={inputClass}
            value={platformGroup}
            onChange={(e) => setPlatformGroup(e.target.value as PlatformGroup)}
          >
            {PLATFORM_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">기대 플랫폼</span>
          <select
            className={inputClass}
            value={expectedPlatform}
            onChange={(e) => setExpectedPlatform(e.target.value as ExpectedPlatform)}
          >
            {EXPECTED_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">기대 추출기</span>
          <select
            className={inputClass}
            value={expectedExtractor}
            onChange={(e) => setExpectedExtractor(e.target.value as ExpectedExtractor)}
          >
            {EXTRACTORS.map((extractor) => (
              <option key={extractor} value={extractor}>
                {extractor}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">최소 문항 수</span>
          <input
            className={inputClass}
            type="number"
            min={0}
            value={expectedMinQuestionCount}
            onChange={(e) => setExpectedMinQuestionCount(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">기대 등급</span>
          <select
            className={inputClass}
            value={expectedRiskGrade}
            onChange={(e) => setExpectedRiskGrade(e.target.value as RiskGrade | "")}
          >
            <option value="">(미설정)</option>
            {GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">기대 context</span>
          <select
            className={inputClass}
            value={expectedContext}
            onChange={(e) => setExpectedContext(e.target.value as ExpectedContext)}
          >
            {CONTEXTS.map((ctx) => (
              <option key={ctx} value={ctx}>
                {ctx}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted">기대 dataLevel</span>
          <select
            className={inputClass}
            value={expectedDataLevel}
            onChange={(e) => setExpectedDataLevel(e.target.value)}
          >
            <option value="">(미설정)</option>
            {DATA_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={expectedIsLimited}
            onChange={(e) => setExpectedIsLimited(e.target.checked)}
          />
          <span className="text-[12px] text-muted">기대 isLimited</span>
        </label>
        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-[12px] text-muted">enabled</span>
        </label>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium text-muted">기대 개인정보 항목</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <label
              key={category}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-[11px]"
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => toggleCategory(category)}
              />
              {category}
            </label>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted">메모</span>
        <textarea
          className={`${inputClass} min-h-[60px]`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-hover"
      >
        <Plus size={14} />
        케이스 추가
      </button>
    </form>
  );
}
