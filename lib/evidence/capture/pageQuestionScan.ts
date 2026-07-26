import type { Page } from "puppeteer-core";
import type { PageQuestionRisk } from "@/lib/evidence/capture/captureTypes";

const SENSITIVE =
  /건강|질병|장애|병력|진료|처방|종교|정치|사상|신념|노조|노동조합|성적\s*지향|성생활|유전자|생체|전과|범죄|수사|재판|민원\s*내용|고충/i;
const HIGH_RISK =
  /주민등록|여권\s*번호|운전면허|계좌|신용카드|카드\s*번호|비밀번호|인증번호|otp|생체인증/i;
const DIRECT =
  /성명|이름|실명|이메일|e-?mail|전화|휴대폰|핸드폰|연락처|휴대전화|주소|상세주소|거주지|생년월일|생일|주민|사업자등록번호|사번|학번/i;
const QUASI =
  /연령|나이|성별|직급|직군|직책|부서|근속|재직|소속|지역|구\b|시\b|학력|전공|소득|매출/i;

export function classifyQuestionRisk(text: string): PageQuestionRisk {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (SENSITIVE.test(t)) return "민감정보";
  if (HIGH_RISK.test(t)) return "고위험정보";
  if (DIRECT.test(t)) return "직접식별정보";
  if (QUASI.test(t)) return "준식별정보";
  return null;
}

/**
 * Extract visible question-like titles from the current survey page.
 * Heuristic — Google Forms / Moaform / generic headings.
 */
export async function scanPageQuestions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (raw: string) => {
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length < 2 || text.length > 180) return;
      if (/^(다음|이전|제출|보내기|시작하기|필수|선택)$/i.test(text)) return;
      const key = text.slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    };

    const headingNodes = Array.from(
      document.querySelectorAll(
        '[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, [class*="QuestionBaseTitle"], .js-question strong, .wf-pv-question-choice-wrapper strong, .js-question p, label',
      ),
    );
    for (const node of headingNodes) {
      push(node.textContent || "");
      if (out.length >= 40) break;
    }

    if (out.length === 0) {
      const listItems = Array.from(
        document.querySelectorAll('[role="listitem"]'),
      ).slice(0, 20);
      for (const item of listItems) {
        const heading = item.querySelector('[role="heading"], div');
        push(heading?.textContent || item.textContent || "");
      }
    }

    return out;
  });
}

export function partitionQuestionsByRisk(questions: string[]): {
  personalInfoQuestions: string[];
  sensitiveInfoQuestions: string[];
  highRiskQuestions: string[];
} {
  const personalInfoQuestions: string[] = [];
  const sensitiveInfoQuestions: string[] = [];
  const highRiskQuestions: string[] = [];
  for (const q of questions) {
    const risk = classifyQuestionRisk(q);
    if (risk === "민감정보") sensitiveInfoQuestions.push(q);
    else if (risk === "고위험정보") highRiskQuestions.push(q);
    else if (risk === "직접식별정보" || risk === "준식별정보") {
      personalInfoQuestions.push(q);
    }
  }
  return { personalInfoQuestions, sensitiveInfoQuestions, highRiskQuestions };
}
