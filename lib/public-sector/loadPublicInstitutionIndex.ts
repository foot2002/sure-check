import type { PublicInstitutionIndex } from "@/lib/public-sector/types";
import indexJson from "@/data/public-institutions.json";

let cached: PublicInstitutionIndex | null = null;

export function getPublicInstitutionIndex(): PublicInstitutionIndex {
  if (cached) return cached;
  cached = indexJson as PublicInstitutionIndex;
  return cached;
}

/** Test helper — allow injecting a tiny index without Excel. */
export function setPublicInstitutionIndexForTests(
  index: PublicInstitutionIndex | null,
): void {
  cached = index;
}
