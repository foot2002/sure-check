/**
 * Unit + optional live checks for shared closed/liveness precheck.
 */
import assert from "node:assert/strict";
import {
  htmlLooksClosedSurvey,
  htmlLooksLoginRequired,
  isClosedSurveyUrl,
} from "../lib/scan/surveyStatusSignals";
import { NAVER_CLOSED_STATUSES } from "../lib/extractors/naverFormsTypes";
import { collectorFeedbackFromLimitedReason } from "../lib/report/limitedOutcomeBuckets";
import { isReportableAdminOutcome } from "../lib/report/limitedOutcomeBuckets";

assert.equal(
  isClosedSurveyUrl("https://docs.google.com/forms/d/e/xxx/closedform"),
  true,
);
assert.equal(
  isClosedSurveyUrl("https://answer.moaform.com/answers/ABC/closed"),
  true,
);
assert.equal(
  isClosedSurveyUrl("https://form.naver.com/response/abc"),
  false,
);

assert.equal(
  htmlLooksClosedSurvey(
    "<html>이 설문의 응답이 종료되었습니다</html>",
    "종료",
    "https://form.naver.com/response/x",
  ),
  true,
);
assert.equal(
  htmlLooksClosedSurvey("<html>welcome survey</html>", "설문", "https://moaform.com/q/x"),
  false,
);

assert.equal(
  htmlLooksLoginRequired(
    "<html>로그인이 필요합니다. 비밀번호를 입력하세요</html>",
    "로그인",
  ),
  true,
);

assert.ok(NAVER_CLOSED_STATUSES.has("FINISHED"));
assert.ok(NAVER_CLOSED_STATUSES.has("PAUSED"));

assert.equal(
  collectorFeedbackFromLimitedReason(
    "JavaScript 실행 후 문항이 로딩되는 구조로 fetch 기반 추출이 제한됩니다.",
  ),
  null,
);
assert.equal(
  collectorFeedbackFromLimitedReason("네이버폼 응답이 종료되었습니다."),
  "closed",
);

assert.equal(isReportableAdminOutcome("normal_diagnosis"), true);
assert.equal(isReportableAdminOutcome("extraction_limited"), false);
assert.equal(isReportableAdminOutcome("survey_closed"), false);

console.log("check-survey-liveness-precheck: PASS");
