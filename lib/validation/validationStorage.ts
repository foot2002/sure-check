import { DEFAULT_VALIDATION_CASES } from "@/lib/validation/defaultCases";
import type {
  ValidationCase,
  ValidationResult,
} from "@/lib/validation/types";
import { VALIDATION_STORAGE_KEYS } from "@/lib/validation/types";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadValidationCases(): ValidationCase[] {
  if (!isBrowser()) return DEFAULT_VALIDATION_CASES;
  try {
    const raw = localStorage.getItem(VALIDATION_STORAGE_KEYS.cases);
    if (!raw) return DEFAULT_VALIDATION_CASES;
    const parsed = JSON.parse(raw) as ValidationCase[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : DEFAULT_VALIDATION_CASES;
  } catch {
    return DEFAULT_VALIDATION_CASES;
  }
}

export function saveValidationCases(cases: ValidationCase[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(VALIDATION_STORAGE_KEYS.cases, JSON.stringify(cases));
}

export function loadValidationResults(): ValidationResult[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(VALIDATION_STORAGE_KEYS.results);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ValidationResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveValidationResults(results: ValidationResult[]): void {
  if (!isBrowser()) return;
  const slim = results.map((result) => {
    const { report, ...rest } = result;
    void report;
    return rest;
  });
  localStorage.setItem(VALIDATION_STORAGE_KEYS.results, JSON.stringify(slim));
  localStorage.setItem(
    VALIDATION_STORAGE_KEYS.lastRunAt,
    new Date().toISOString(),
  );
}

export function loadLastRunAt(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(VALIDATION_STORAGE_KEYS.lastRunAt);
}

export function resetValidationCasesToDefault(): ValidationCase[] {
  saveValidationCases(DEFAULT_VALIDATION_CASES);
  return DEFAULT_VALIDATION_CASES;
}

export function clearValidationResults(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(VALIDATION_STORAGE_KEYS.results);
  localStorage.removeItem(VALIDATION_STORAGE_KEYS.lastRunAt);
}

export function clearAllValidationStorage(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(VALIDATION_STORAGE_KEYS.cases);
  localStorage.removeItem(VALIDATION_STORAGE_KEYS.results);
  localStorage.removeItem(VALIDATION_STORAGE_KEYS.lastRunAt);
}
