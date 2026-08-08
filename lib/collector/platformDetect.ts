import type { CollectorPlatform, UrlKind } from "@/lib/collector/types";
import {
  classifyCollectorUrlKind,
  isCollectorShortenerUrl,
  looksLikeSurveyDomainUrl,
  toStrictCollectorPlatform,
  validateSurveyResponseUrl,
} from "@/lib/collector/surveyUrlRules";

export function isShortenerUrl(url: string): boolean {
  return isCollectorShortenerUrl(url);
}

/** Collector classification — strict response-path rules (not diagnosis host-only checks). */
export function classifyUrlKind(url: string): UrlKind {
  return classifyCollectorUrlKind(url);
}

export function toCollectorPlatform(url: string): CollectorPlatform | null {
  return toStrictCollectorPlatform(url);
}

export function isSupportedSurveyUrl(url: string): boolean {
  return toCollectorPlatform(url) != null;
}

export {
  looksLikeSurveyDomainUrl,
  validateSurveyResponseUrl,
  isCollectorShortenerUrl,
};
