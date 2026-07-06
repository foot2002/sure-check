export interface ExtractorInput {
  url: string;
  html: string;
  finalUrl: string;
}

export interface QuestionCandidate {
  id: string;
  questionText: string;
  questionType: string;
  required: boolean;
  auxiliaryText?: string;
  detectedCategories: string[];
  riskTags: string[];
  source: string;
}

export interface ExtractorOutput {
  title: string;
  headings: string[];
  description: string;
  noticeTexts: string[];
  privacyPolicyUrls: string[];
  questions: QuestionCandidate[];
  formTexts: string[];
}
