/**
 * Public-institution matcher acceptance checks (no Jest required).
 * Run: npm run test:public-institutions
 */

import assert from "node:assert/strict";
import { normalizeInstitutionName } from "../lib/public-sector/normalizeInstitutionName";
import { matchPublicInstitution } from "../lib/public-sector/publicInstitutionMatcher";
import { detectPublicSector } from "../lib/rules/publicSectorRules";
import type { NormalizedForm } from "../lib/types/scan";

function formFromTitle(title: string, extras?: Partial<NormalizedForm>): NormalizedForm {
  return {
    platform: "moaform",
    title,
    url: "https://example.com",
    questions: [],
    pages: [{ id: "p0", questions: [] }],
    ...extras,
  };
}

function main() {
  assert.equal(
    normalizeInstitutionName("서울특별시 마포구"),
    "서울특별시마포구",
  );
  assert.equal(normalizeInstitutionName("서울시 마포구"), "서울특별시마포구");
  assert.equal(
    normalizeInstitutionName("(재)홍주문화관광재단"),
    "홍주문화관광재단",
  );

  // 1) List match — Seoul SME counseling
  {
    const match = matchPublicInstitution([
      {
        text: "서울시 소상공인정책과에서 진행하는 상담 참여 신청서입니다.",
        source: "title",
      },
    ]);
    assert.equal(match.isPublicSector, true);
    assert.ok(match.confidence === "high" || match.confidence === "medium");
    assert.ok(
      /서울시|서울특별시/.test(match.matchedName ?? ""),
      `matchedName=${match.matchedName}`,
    );
    const detected = detectPublicSector(
      formFromTitle("서울시 소상공인정책과에서 진행하는 상담 참여 신청서입니다."),
    );
    assert.equal(detected.publicSectorDetected, true);
    assert.equal(detected.subjectType, "public_sector");
  }

  // 2) Local facility — Yongin museum
  {
    const match = matchPublicInstitution([
      { text: "용인시박물관 기획전 만족도 조사", source: "title" },
    ]);
    assert.equal(match.isPublicSector, true);
    assert.ok((match.evidenceText ?? "").includes("용인시박물관"));
    const detected = detectPublicSector(
      formFromTitle("용인시박물관 기획전 만족도 조사"),
    );
    assert.equal(detected.publicSectorDetected, true);
    assert.equal(detected.subjectType, "public_sector");
  }

  // 3) Library facility — Mapo
  {
    const match = matchPublicInstitution([
      { text: "마포구립도서관 이용 만족도 조사", source: "title" },
    ]);
    assert.equal(match.isPublicSector, true);
    const detected = detectPublicSector(
      formFromTitle("마포구립도서관 이용 만족도 조사"),
    );
    assert.equal(detected.publicSectorDetected, true);
    assert.equal(detected.subjectType, "public_sector");
  }

  // 4) Residence options must not alone mark public
  {
    const match = matchPublicInstitution([
      {
        text: "귀하의 거주지역은 어디입니까? 서울, 경기, 인천, 기타",
        source: "residence_options",
      },
    ]);
    assert.equal(match.isPublicSector, false);

    const detected = detectPublicSector(
      formFromTitle("설문", {
        questions: [
          {
            id: "q1",
            label: "귀하의 거주지역은 어디입니까?",
            questionText: "귀하의 거주지역은 어디입니까?",
            type: "single_choice",
            required: false,
            hasPersonalData: false,
            dataRiskLevel: "D2",
            detectedCategories: ["residence_area"],
            riskTags: [],
            options: ["서울", "경기", "인천", "기타"],
          },
        ],
      }),
    );
    // Title alone is neutral; options ignored → not public by list
    assert.equal(detected.publicSectorDetected, false);
  }

  // 5) Private org with Seoul in name
  {
    const match = matchPublicInstitution([
      { text: "서울마케팅연구소 고객 만족도 조사", source: "title" },
    ]);
    assert.ok(
      match.isPublicSector === false || match.confidence === "low",
      `unexpected public match: ${JSON.stringify(match)}`,
    );
    const detected = detectPublicSector(
      formFromTitle("서울마케팅연구소 고객 만족도 조사"),
    );
    assert.ok(
      detected.publicSectorDetected === false ||
        detected.publicSectorConfidence === "low",
    );
  }

  console.log("All public-institution matcher tests passed.");
}

main();
