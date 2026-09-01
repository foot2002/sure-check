import type { WeeklyPrivacyGrade } from "@/lib/weekly/privacyIndex";

export type WeeklyReportStatus = "draft" | "published" | "archived";

export type WeeklyTrendPoint = {
  weekId: string;
  weekLabel: string;
  shortRange: string;
  avgScore: number | null;
  personalInfoRate: number;
  attentionNeededRate: number;
  analyzableCount: number;
};

export type WeeklyIssueRow = {
  label: string;
  findingCount: number;
  affectedSurveyCount: number;
  rateOfAllScans: number;
  description: string;
};

export type WeeklyPlatformRow = {
  platform: string;
  surveyCount: number;
  personalInfoCount: number;
  personalInfoRate: number;
  sensitiveInfoCount: number;
  sensitiveInfoRate: number;
  highRiskInfoCount: number;
  highRiskInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  avgOverallScore: number | null;
};

export type WeeklyOrgTypeRow = {
  typeLabel: string;
  surveyCount: number;
  personalInfoCount: number;
  personalInfoRate: number;
  sensitiveInfoCount: number;
  sensitiveInfoRate: number;
  highRiskInfoCount: number;
  highRiskInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  avgOverallScore: number | null;
};

export type WeeklyQuestionCategoryRow = {
  categoryKey: string;
  label: string;
  count: number;
  rate: number;
};

export type WeeklyAnonymousCase = {
  id: string;
  title: string;
  orgType: string;
  surveyPattern: string;
  tool: string;
  collectedInfo: string[];
  noticeGaps: string[];
  respondentRisk: string;
  operatorFix: string;
  similarCount: number;
  whyRisky: string;
  respondentBlindSpot: string;
  operatorMissed: string[];
  quickFixNotice: string;
  weakNoticeExample: string;
  improvedNoticeExample: string;
};

export type WeeklyInsight = {
  order: number;
  text: string;
};

export type WeeklyPublicSectorStats = {
  publicPersonalInfoSurveyCount: number;
  externalToolReviewCount: number;
  csapOrCloudReviewCount: number;
  purposeGapCount: number;
  itemsGapCount: number;
  retentionGapCount: number;
  destructionGapCount: number;
  contactGapCount: number;
  narrative: string;
};

export type WeeklyQualityStats = {
  completedDiagnosisCount: number;
  limitedQuestionAnalysisCount: number;
  closedExcludedCount: number;
  restrictedExcludedCount: number;
  evidenceCaptureCount: number;
  evidenceSurveyCount: number;
  evidenceImageCount: number;
};

export type WeeklySummary = {
  headline: string;
  oneLiner: string;
  bullets: [string, string, string];
  analyzableCount: number;
  personalInfoCount: number;
  personalInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  avgScore: number | null;
  grade: WeeklyPrivacyGrade | null;
  publicExternalToolCount: number;
  scoreDelta: number | null;
  fourWeekAvgScore: number | null;
  isPartial: boolean;
};

export type WeeklyMetrics = {
  analyzableCount: number;
  personalInfoCount: number;
  personalInfoRate: number;
  sensitiveInfoCount: number;
  sensitiveInfoRate: number;
  highRiskInfoCount: number;
  highRiskInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  avgScore: number | null;
  grade: WeeklyPrivacyGrade | null;
  publicExternalToolCount: number;
  evidenceCaptureCount: number;
  evidenceSurveyCount: number;
  evidenceImageCount: number;
};

export type WeeklyReportSnapshot = {
  weekId: string;
  weekLabel: string;
  shortRange: string;
  periodStartKst: string;
  periodEndKst: string;
  generatedAt: string;
  isPartial: boolean;
  summary: WeeklySummary;
  metrics: WeeklyMetrics;
  trends: WeeklyTrendPoint[];
  issueTop5: WeeklyIssueRow[];
  platformStats: WeeklyPlatformRow[];
  organizationStats: WeeklyOrgTypeRow[];
  publicSector: WeeklyPublicSectorStats;
  questionStats: {
    totalQuestions: number;
    personalInfoQuestions: number;
    sensitiveQuestions: number;
    highRiskQuestions: number;
    personalInfoQuestionRate: number;
    frequentCategories: WeeklyQuestionCategoryRow[];
  };
  anonymousCases: WeeklyAnonymousCase[];
  insights: WeeklyInsight[];
  checklist: string[];
  pressSummary: string;
  quality: WeeklyQualityStats;
  disclaimer: string;
};

export type WeeklyListCard = {
  weekId: string;
  weekLabel: string;
  shortRange: string;
  headline: string;
  analyzableCount: number;
  personalInfoCount: number;
  personalInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  avgScore: number | null;
  grade: WeeklyPrivacyGrade | null;
  publicExternalToolCount: number;
  isPartial: boolean;
  generatedAt: string;
  hasPublicIssue: boolean;
  hasSchoolIssue: boolean;
  hasNoticeGap: boolean;
  bullets: [string, string, string];
};

export type WeeklyReportRow = {
  id: string;
  weekId: string;
  weekLabel: string;
  periodStartKst: string;
  periodEndKst: string;
  generatedAt: string;
  status: WeeklyReportStatus;
  snapshot: WeeklyReportSnapshot;
};
