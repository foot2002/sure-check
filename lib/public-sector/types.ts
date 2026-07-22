export type PublicInstitutionConfidence = "high" | "medium" | "low" | "none";

export type PublicInstitutionMatchBy =
  | "exact_list"
  | "alias"
  | "keyword_fallback"
  | "none";

export type PublicInstitutionIndexItem = {
  id: string;
  majorType: string;
  middleType: string;
  searchName: string;
  institutionName?: string;
  district?: string;
  aliases: string[];
  normalizedKeys: string[];
};

export type PublicInstitutionIndex = {
  version: number;
  generatedAt: string;
  sourceNote: string;
  itemCount: number;
  items: PublicInstitutionIndexItem[];
};

export type PublicInstitutionMatchResult = {
  isPublicSector: boolean;
  confidence: PublicInstitutionConfidence;
  matchedName?: string;
  matchedType?: string;
  matchedRegion?: string;
  matchedBy?: PublicInstitutionMatchBy;
  evidenceText?: string;
  evidenceSource?: string;
};

export type PublicInstitutionEvidence = {
  matchedName?: string;
  matchedType?: string;
  matchedRegion?: string;
  matchedBy?: string;
  evidenceText?: string;
  evidenceSource?: string;
};

export type AuthorityTextCandidate = {
  text: string;
  source: string;
};
