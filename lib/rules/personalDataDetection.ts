import type { NormalizedForm } from "@/lib/types/scan";

export function claimsAnonymityInNotices(form: NormalizedForm): boolean {
  const joined = [
    form.notices?.anonymity,
    form.notices?.privacyNotice,
    form.notices?.description,
    form.notices?.consentText,
  ]
    .filter(Boolean)
    .join(" ");
  return /익명|무기명|개인\s*식별\s*불가/.test(joined);
}
