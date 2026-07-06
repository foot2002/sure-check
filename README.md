# SURE Check

설문 링크 개인정보 위험 진단 서비스

구글폼, 네이버폼, 모아폼 등 온라인 설문 URL을 입력하면 개인정보보호 위험 신호를 자동으로 점검합니다.

> **주의**: 본 버전은 Mock API + 룰엔진 기반 프로토타입입니다. 실제 DB, Supabase, Playwright 크롤링은 포함되지 않습니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다.

포트 변경 예시:

```bash
npm run dev -- -p 8080
```

## 빌드

```bash
npm run build
npm start
```

## 사용 방법

1. 메인 페이지에서 설문 URL을 입력합니다.
2. **진단하기** 버튼을 클릭합니다.
3. 진단 진행 화면에서 단계별 진행 상태를 확인합니다.
4. 완료 후 같은 페이지 하단에 결과 리포트가 표시됩니다.
5. 리포트에서 요약 복사, 전체 복사, 공유 링크, Markdown 다운로드 등을 이용할 수 있습니다.

## 2차 작업 — 룰엔진 구조

1차의 고정 Mock 리포트 대신, **NormalizedForm fixture → 계층형 룰엔진 → ScanReport** 흐름으로 동작합니다.

### 진단 파이프라인

```
classifyContext → classifyDataRisk → classifyToolRisk
  → deriveRequiredObligations → checkNoticeCompliance
  → assessManagementRisk → applyGradeOverrideRules
  → calculateScore → generateReport
```

### 등급 강제 룰 (요약)

- **D2 준식별정보만 있는 일반 설문**(실제 문항에서 확인된 성별, 연령대, 자녀 연령대, 거주권역 등)은 고지 일부 누락이 있어도 **고위험으로 강제하지 않습니다**. 보통 주의 또는 위험 수준으로 판단합니다.
- **지방공기업, 지방공사·공단, 지방자치단체 출자·출연기관, 공공재단**은 SURE Check에서 **공공부문 설문**(`public_sector`)으로 분류합니다.
- **발주기관, 주관기관, 조사기관, 수행기관, 개인정보처리자** 중 하나라도 공공부문이면 `public_sector` context를 적용합니다.
- 단, **공공부문으로 분류되더라도 수집정보가 D2 준식별정보에 그치면 고위험으로 강제하지 않습니다**.
- D3 직접식별정보(이름·연락처·이메일·상세주소 등) 이상, D4 민감정보, D5 고유식별정보는 별도 동의·고지 누락 시 등급이 상향될 수 있습니다.
- 직원/조직진단 맥락(직원·근로자·조직진단·고충·괴롭힘 등)이 확인될 때만 익명성·원자료·소수집단 관련 고지를 요구합니다.

### Fixture URL 매핑

URL 키워드로 fixture를 선택한 뒤 `analyzeForm()`으로 리포트를 생성합니다.

| URL 키워드 | 처리 방식 | 비고 |
|-----------|----------|------|
| `docs.google.com/forms`, `forms.gle` | GoogleFormsExtractor (4차) | 실제 HTML 추출 |
| `form.naver.com`, `naver.me` | NaverFormsExtractor (5차) | 실제 HTML + 공개 API 추출 |
| `moaform.com`, `answer.moaform.com` | MoaformExtractor (6차) | 실제 HTML + 공개 JSON 추출 |
| `wiseon` | wiseon_csap_caution fixture | |
| 그 외 | GenericHtmlExtractor → 룰엔진 | 베타 (상황별) |

## 3차 작업 — Generic HTML 베타 진단

naver / wiseon URL은 **fixture**를 유지합니다.  
그 외( Google Forms / 네이버폼 / 모아폼 제외) URL은 **URL 안전검사 → HTML fetch → GenericHtmlExtractor → 룰엔진** 경로로 처리합니다.

### 보안 (SSRF 방어)

- `http`/`https`만 허용, `file:`, `data:`, `javascript:` 등 차단
- localhost, 사설 IP, link-local 차단 (DNS resolve 후 재검사)
- 리다이렉트 최대 3회, 최종 URL 재검사
- GET만 사용, 타임아웃 8초, HTML 최대 2MB
- `text/html`이 아니면 `limited` 처리

### 캐시

- 정규화 URL 해시 기준 인메모리 캐시 (TTL 30분)
- 동일 URL 재진단 시 fetch 생략
- 개발 중 룰/표시 로직 변경 후 이전 결과가 남아 보이면 Debug Panel의 `URL 캐시 초기화` 버튼을 누르거나 `POST /api/cache/clear`를 호출합니다.

## 준식별정보 표시 기준

SURE Check는 `quasi_identifier`를 “성별·연령·거주지역 등” 같은 고정 대표 문구로 표시하지 않습니다. 실제 탐지된 문항별 세부 카테고리를 기준으로 수집정보를 표시합니다.

### 세부 카테고리

- `gender`: 성별, 귀하의 성별, 남성/여성, 남자/여자 선택 문항이 있을 때만 표시합니다.
- `respondent_age` 또는 `age_range`: 귀하의 연령, 귀하의 나이, 연령대, 만 나이, 출생연도 문항을 “연령대”로 표시합니다.
- `child_age_range`: 자녀의 연령, 자녀 나이, 아이 연령, 어린이 연령대 문항을 “자녀 연령대”로 표시합니다.
- `residence_area`: 거주지, 거주지역, 거주권역, 관내/인접 시군/타지역, 시/군, 시군구 문항을 “거주권역”으로 표시합니다.
- `address`: 주소, 상세주소, 도로명주소, 지번주소, 배송지, 우편번호처럼 상세 주소를 묻는 경우에만 사용합니다.
- `affiliation`, `department`, `position`, `tenure`: 소속, 부서, 직급, 근속연수는 준식별정보로 표시합니다.

### 표시 원칙

- 성별 문항이 없으면 “성별”이라는 단어를 표시하지 않습니다.
- 자녀 연령대는 응답자 연령과 구분해 “자녀 연령대”로 표시합니다.
- 거주권역/시군구는 상세주소가 아니므로 `address`로 올리지 않습니다.
- 리포트의 “이 설문이 요구하는 정보”와 상단 요약은 실제 탐지 항목만 조합합니다.
- Debug Panel의 추출 문항 테이블은 `detectedCategories` 원본과 `displayLabel`을 함께 보여줍니다.

## 직접식별정보와 고위험정보 구분 기준

직접식별정보(D3)와 고위험정보(D5)는 별도로 표시합니다. 이름, 연락처, 이메일이 확인되면 모두 직접식별정보에 표시하며, 주민등록번호나 계좌번호 같은 고위험정보가 없으면 “고위험정보 없음”을 유지합니다.

### 직접식별정보(D3)

- `name`: 이름, 성명, 신청자명, 담당자명 → “이름”
- `phone`: 휴대폰, 핸드폰, 전화번호, 연락처, `tel` → “연락처”
- `email`: 이메일, e-mail, email, 메일 → “이메일”
- `address`: 상세주소, 도로명주소, 지번주소, 배송지, 우편번호 → “상세주소”
- `birthdate`: 생년월일, 생일, 출생연도 → “생년월일”

경품 응모 맥락의 연락처 문항은 “경품 응모용 연락처”로 표시합니다. 일반 연락처 문항은 “연락처”로 표시합니다.

### 고위험정보(D5)

- `resident_registration_number`: 주민등록번호, 주민번호
- `passport_number`: 여권번호
- `driver_license_number`: 운전면허번호
- `foreign_registration_number`: 외국인등록번호
- `id_document`: 신분증, 학생증, 사원증 첨부
- `financial_account`: 계좌번호, 예금주, 은행
- `authentication_secret`: 비밀번호, 인증번호

이름, 연락처, 이메일은 D3 직접식별정보이며 고위험정보로 올리지 않습니다. 고위험정보는 위 D5 항목이 실제 문항에 있을 때만 표시합니다.

## 공공부문 근거와 응답 선택지 지자체명 구분 기준

공공부문 탐지는 설문 운영 주체를 판단하는 기능입니다. 응답자가 선택하는 거주지 선택지는 공공부문 근거로 사용하지 않습니다.

### 공공부문 근거로 사용하는 텍스트

- 설문 제목
- 설문 설명문과 안내문
- 운영기관, 주최/주관, 발주기관, 조사기관, 수행기관
- 개인정보처리자, 담당부서, 문의처
- 기관명으로 확인되는 공공 문화시설, 체육시설, 도서관, 박물관, 미술관

예를 들어 `용인시박물관 기획전 만족도 조사`는 `용인시박물관`을 공공 문화시설 근거로 사용합니다.

### 공공부문 근거로 사용하지 않는 텍스트

- 거주지 선택지의 `용인`, `경기도`, `서울`, `기타`
- 문항 옵션에 들어 있는 지자체명
- 응답자 속성을 고르는 선택지

거주지 선택지의 지자체명은 `residence_area` 준식별정보 판단에는 사용할 수 있지만, 설문 운영 주체의 공공성 근거로는 사용하지 않습니다.

### 표현 기준

- 재단법인, 문화재단, 관광재단, 복지재단 등 실제 재단 관련 운영주체가 있을 때만 “공공재단” 표현을 사용합니다.
- 지자체 박물관이나 공공 문화시설은 “공공 문화시설” 또는 “지자체 박물관”으로 표현합니다.
- D2 준식별정보 중심의 공공 문화시설 만족도 조사는 공공부문이라고 해서 고위험으로 강제하지 않습니다. 보유기간, 파기 기준, 담당부서, 외부 설문 시스템 안내를 확인 필요 사항으로 표시합니다.

## 공공부문 개인정보 설문과 CSAP 인증 도구 권고 기준

공공기관·지자체·교육청·학교·공공재단·공사·공단 등 **공공부문**에서 개인정보 또는 민감정보를 수집하면서, Google Forms·Naver Form·Moaform 등 **CSAP 인증 도구로 확인되지 않은 외부 설문도구**를 사용하는 경우 리포트 상단에 CSAP 강력 권고 블록을 표시합니다.

### 표시 조건 (모두 충족 시 강력 권고)

1. **공공부문 판단** (`publicSectorDetected === true`)
2. **개인정보·민감정보 수집** — 직접식별정보, 민감정보, 고위험정보, 직원/조직진단 민감 맥락 중 하나 이상
3. **CSAP 인증 도구로 확인되지 않은 외부 설문도구** — 실시간 인증 DB를 조회하지 않으므로 “미인증”으로 단정하지 않고, 확인 범위 내 분류 결과를 사용

### D2 준식별정보만 있는 공공 설문

성별·연령대·거주지역 등 **D2 준식별정보만** 수집하는 공공 설문은 CSAP **강력** 권고 블록을 표시하지 않습니다. 대신 외부 도구 이용·보유·파기 안내 중심의 **약한 안내**만 표시할 수 있습니다.

### 도구별 표현

| 플랫폼 | CSAP 기본 분류 | 표현 예 |
|--------|----------------|---------|
| Google Forms | `not_certified` | CSAP 인증 도구로 확인되지 않은 해외 설문 SaaS, 국외 보관·이전 확인 |
| Naver Form / Moaform | `unknown` | CSAP 인증 여부 확인이 필요한 외부 설문 SaaS, 위탁·수탁자 확인 |
| Generic / unknown | `unknown` | CSAP 인증 여부 확인 필요 |
| WiseON (`wiseon_csap`) | `certified` | CSAP 인증 기반 설문 도구로 확인됨 (고지 의무는 별도) |

### 리포트 반영 위치

- **Hero 바로 아래**: `PublicSectorCsapWarning` 강조 박스 + 접이식 “CSAP란?” 설명
- **Hero 판단 핵심 근거**: CSAP·보안 인증 도구 검토 문구 포함
- **운영자 우선 개선 1번**: CSAP 인증 등 공공부문 보안 기준 도구 사용 검토
- **도구·처리경로 위험도**: 공공부문 + 직접식별/민감정보 + 미확인 외부도구 시 상향 반영

### 표현 원칙

- “불법입니다”, “반드시 위반입니다” 등 법률 위반 **확정 표현 금지**
- CSAP 인증이 개인정보 고지 의무를 **대체한다고 표현하지 않음**
- “공공기관은 특히 개인정보와 민감정보 수집 시 CSAP 인증 도구 사용을 **강력히 권고**합니다” 취지로 안내

## 민간기업 개인정보 설문과 CSAP·ISMS-P·보안 인증 도구 권고 기준

민간기업·협회·병원·학원·조사 수행사 등 **공공부문이 아닌** 설문에서 개인정보 또는 민감정보를 Google Forms·Naver Form·Moaform 등 **범용 외부 설문도구**로 수집하는 경우, Hero 아래에 **보안 인증 권고 블록**을 표시합니다.

### 표시 조건

1. **공공부문이 아님** (`publicSectorDetected !== true`)
2. **개인정보·민감정보 수집** — 직접식별, 민감, 고위험, 직원 민감 맥락 중 하나 이상
3. **범용 외부 설문도구** — Google Forms, Naver Form, Moaform, Generic 등
4. **보안 인증 미확인** — “미인증” 단정 없이 “확인 필요” / “인증 도구로 분류되지 않음” 표현

### D2 준식별정보만 있는 민간 설문

성별·연령대·거주지역만 수집하는 경우 **강한** 인증 권고 블록을 표시하지 않습니다. 외부 도구 이용·보유·파기·담당자 안내 중심의 **약한 안내**만 표시할 수 있습니다.

### 민간기업용 권고 내용

- **CSAP + ISMS-P + 보안 인증 수집도구**를 함께 권고
- CSAP는 “공공 수준의 보안 기준으로 참고 가능한 지표”로 설명 — **민간기업 법적 의무로 단정하지 않음**
- ISMS-P는 개인정보보호 관리체계 인증으로 설명
- 보안 인증 수집도구는 접근통제·파기·로그 관리가 검증된 수집 도구로 설명
- “인증 기준 알아보기” 접이식 영역에 3종 인증 카드 제공

### 공공기관 메시지와 구분

| 구분 | 공공기관 | 민간기업 |
|------|----------|----------|
| 전면 강조 | CSAP 중심 | CSAP + ISMS-P + 보안 인증 도구 |
| CSAP 표현 | 공공부문 보안 기준 충족 권고 | 참고 가능한 공공 수준 보안 지표 |
| 컴포넌트 | `PublicSectorCsapWarning` | `PrivateSectorSecurityCertificationCallout` |

### 표현 원칙

- “강력히 권고”, “우선 검토”, “관리체계 확인 필요” 사용
- “민간기업도 CSAP를 반드시 써야 합니다”, “구글폼 사용은 불법” 등 **법률 위반 확정 표현 금지**
- CSAP·ISMS-P가 개인정보 고지 의무를 대체한다고 표현하지 않음

### GenericHtmlExtractor 베타 진단

- `form`, `input`, `textarea`, `select`, `label` 등 화면에서 자동 확인 가능한 요소를 기준으로 문항을 추출합니다.
- 문항이 JavaScript로 동적 로딩되거나 로그인 후 표시되는 경우에는 추출이 제한될 수 있습니다.
- 문항을 하나도 추출하지 못한 URL(예: `https://example.com`)은 **진단 제한**으로 표시되며, 개인정보 위험 점수·등급은 산정하지 않습니다. 이는 정상 동작입니다.

### 테스트 URL

```
https://docs.google.com/forms/d/e/.../viewform   # GoogleFormsExtractor (4차)
https://forms.gle/...                            # GoogleFormsExtractor (리다이렉트 후 추출)
https://form.naver.com/response/9hQ4XnvCRtCR8xn4OJEe0w        # NaverFormsExtractor (5차)
https://www.moaform.com/q/{formId}                           # MoaformExtractor (6차)
https://wiseon.io/example                                    # fixture
https://example.com                              # 진단 제한 (설문 페이지 아님, 점수 미산정)
https://www.w3.org                               # HTML 베타 추출
http://localhost                                 # 차단 (failed)
http://127.0.0.1                                 # 차단 (failed)
file:///etc/passwd                               # 차단 (failed)
```

### 제한사항

- Playwright 미사용 — JavaScript 동적 문항·분기·로그인 후 화면은 추출 불가
- 외부 URL에 POST/제출 없음
- DB/Supabase 미연결

### 테스트 URL 예시

```
https://docs.google.com/forms/d/e/1FAIpQLSeuZiyN-uQBbmmSLxT81xGUfgjMQpUFyJ4D7r-0zjegTy_0HA/viewform
https://form.naver.com/example
https://www.moaform.com/q/{formId}
https://wiseon.io/example
https://example.com/survey
```

## 4차 작업 — Google Forms 실제 추출

Google Forms 공개 응답 URL에 대해 **GoogleFormsExtractor**로 실제 HTML을 파싱합니다.  
Playwright·DB·Supabase는 사용하지 않습니다.

### 처리 흐름

```
URL 안전검사 → HTML fetch (GET) → GoogleFormsExtractor
  → FB_PUBLIC_LOAD_DATA_ 파싱 (실패 시 DOM fallback)
  → analyzeForm → ScanReport
```

### URL 패턴

- `docs.google.com/forms`
- `docs.google.com/forms/d/e/`
- `docs.google.com/forms/d/`
- `forms.gle` (리다이렉트 후 최종 URL 재검사)

### 추출 방식

- HTML 내 `FB_PUBLIC_LOAD_DATA_` JSON 배열을 안전하게 파싱 (`eval`/`Function` 미사용)
- 파싱 실패 시 cheerio 기반 DOM 텍스트 fallback
- 제목, 설명, 문항, 선택지, 필수 여부, 섹션 구조, 개인정보 키워드 탐지

### 실패 시

- `google_public_high_risk` fixture로 **fallback하지 않음**
- 문항 추출 실패, 로그인 필요, 응답 종료, fetch 실패 시 **진단 제한(limited) 리포트** 생성 (점수 미산정)

### GoogleFormsExtractor 제한사항

- Playwright 미사용 — JavaScript 동적 로딩·로그인 후 문항·제출 후 화면 미지원
- 응답 분기(conditional logic)는 완전 탐지 불가 (`branchDetected`는 섹션 구조 기반 추정)
- 비공개·조직 내부 Google Forms는 로그인 필요로 제한될 수 있음
- 외부 URL에 POST/설문 제출 없음

### 테스트 방법

1. `npm run dev` 실행
2. 메인 페이지에서 **공개 Google Forms 테스트 링크**를 입력합니다.
3. 진단 완료 후 URL 입력 하단에 실제 제목·문항 기반 리포트가 표시되는지 확인합니다.

**공개 Google Forms 테스트 링크를 넣어 확인하세요.**

예시 (공개 샘플 폼):

```
https://docs.google.com/forms/d/e/1FAIpQLSeuZiyN-uQBbmmSLxT81xGUfgjMQpUFyJ4D7r-0zjegTy_0HA/viewform
```

확인 항목:

- 실제 폼 제목과 문항이 추출되는지
- 이름·연락처·이메일 문항이 있으면 `detectedCategories` 반영되는지
- 개인정보 고지문이 있으면 `noticeTexts` / description에 반영되는지
- wiseon은 기존 fixture 결과 유지
- `example.com`은 GenericHtmlExtractor 경로 유지

## 5차 작업 — 네이버폼 실제 추출

네이버폼 공개 응답 URL에 대해 **NaverFormsExtractor**로 실제 HTML과 공개 API 데이터를 파싱합니다.  
Playwright·DB·Supabase는 사용하지 않습니다.

### 처리 흐름

```
URL 안전검사 → HTML fetch (GET) → NaverFormsExtractor
  → HTML meta + survey-api 공개 access API (GET)
  → analyzeForm → ScanReport
```

### URL 패턴

- `form.naver.com/response/{surveyId}`
- `naver.me` 단축 URL (리다이렉트 후 `form.naver.com`인지 재검사)

### 추출 방식

- HTML `og:title`, `og:description`, `#nsv_root[data-url]`에서 메타데이터 추출
- URL에서 survey ID 추출 후 `GET survey-api.naver.com/api/form/surveys/{id}/access` 호출 (설문 제출 없음)
- JSON `pages[].questions[]`에서 문항·선택지·필수 여부 파싱 (`eval`/`Function` 미사용)
- API 실패 시 cheerio 기반 DOM fallback

### 실패 시

- `naver_company_event_risk` fixture로 **fallback하지 않음**
- 문항 추출 실패, 로그인 필요, 응답 종료, fetch 실패 시 **진단 제한 / 점수 산정 불가**

### NaverFormsExtractor 제한사항

- Playwright 미사용 — JavaScript로 동적 로딩되는 문항 미지원
- 네이버폼 초기 HTML은 SPA 셸이므로 공개 access API GET에 의존
- 비공개·로그인 필요 설문은 제한될 수 있음
- 외부 URL에 POST/설문 제출 없음

### 테스트 방법

1. `npm run dev` 실행
2. 메인 페이지에서 **공개 네이버폼 테스트 링크**를 입력합니다.
3. 진단 완료 후 URL 입력 하단에 실제 제목·문항 기반 리포트가 표시되는지 확인합니다.

**공개 네이버폼 테스트 링크를 넣어 확인하세요.**

예시:

```
https://form.naver.com/response/9hQ4XnvCRtCR8xn4OJEe0w
```

확인 항목:

- 실제 폼 제목과 문항이 추출되는지
- 이름·연락처·이메일 문항이 있으면 `detectedCategories` 반영되는지
- 개인정보 고지문이 있으면 `noticeTexts` / description에 반영되는지
- 문항을 추출하지 못한 경우 **진단 제한 / 점수 산정 불가** 표시
- Google Forms / moaform / wiseon / example.com 기존 경로 유지

## 6차 작업 — 모아폼 실제 추출

모아폼 공개 응답 URL에 대해 **MoaformExtractor**로 실제 HTML과 공개 JSON 데이터를 파싱합니다.  
Playwright·DB·Supabase는 사용하지 않습니다.

### 처리 흐름

```
URL 안전검사 → HTML fetch (GET) → MoaformExtractor
  → HTML meta + answer.moaform.com 공개 JSON (GET)
  → embedded JSON / DOM fallback
  → analyzeForm → ScanReport
```

### URL 패턴

- `moaform.com`
- `www.moaform.com`
- `ko.moaform.com`
- `answer.moaform.com` (리다이렉트 후 최종 URL)
- `surveyl.ink` (PRO 도메인, moaform 계열)

도메인에 `moaform.com`이 포함되면 MoaformExtractor 대상으로 판단합니다.

### 추출 방식

- HTML `og:title`, `og:description`, form/label/input/textarea/select 구조 확인
- URL에서 form ID 추출 후 `GET answer.moaform.com/answers/{id}.json` 호출 (설문 제출 없음)
- HTML 내 `application/json` 또는 `"blocks"` embedded JSON 안전 파싱 (`eval`/`Function` 미사용)
- API·embedded JSON 실패 시 cheerio 기반 DOM fallback

### 실패 시

- `moaform_employee_high_risk` fixture로 **fallback하지 않음**
- 문항 추출 실패, 로그인 필요, 응답 종료, fetch 실패 시 **진단 제한 / 점수 산정 불가**

### MoaformExtractor 제한사항

- Playwright 미사용 — JavaScript로 동적 로딩되는 문항 미지원
- 모아폼 초기 HTML은 SPA 셸일 수 있으므로 공개 JSON GET과 DOM fallback에 의존
- 비공개·로그인 필요 설문은 제한될 수 있음
- 외부 URL에 POST/설문 제출 없음

### 테스트 방법

1. `npm run dev` 실행
2. 메인 페이지에서 **공개 모아폼 테스트 링크**를 입력합니다.
3. 진단 완료 후 URL 입력 하단에 실제 제목·문항 기반 리포트가 표시되는지 확인합니다.

**공개 모아폼 테스트 링크를 넣어 확인하세요.**

예시:

```
https://www.moaform.com/q/{formId}
```

확인 항목:

- 실제 폼 제목과 문항이 추출되는지
- 이름·연락처·이메일 문항이 있으면 `detectedCategories` 반영되는지
- 개인정보 고지문이 있으면 `noticeTexts` / description에 반영되는지
- 문항을 추출하지 못한 경우 **진단 제한 / 점수 산정 불가** 표시
- Google Forms / 네이버폼 / wiseon / example.com 기존 경로 유지

## 7차 작업 — 통합 검수 & Debug Panel

Supabase·DB·Playwright 연결 전, **개발자용 Debug Panel**을 추가해 추출 결과와 룰엔진 판단을 화면에서 바로 확인합니다. 사용자용 리포트 UI는 그대로 유지하며, Debug Panel은 리포트 맨 아래 **접힌 카드**(`개발자 진단 정보 보기`)로 표시됩니다.

### Debug Panel 구성

| 영역 | 내용 |
|------|------|
| 메타 정보 | 입력 URL, 정규화 URL, 플랫폼, 최종 URL, 추출기, 문항 수, partialScan, isLimited, confidence 등 |
| 추출 문항 테이블 | pageIndex, questionIndex, questionText, type, required, options count, detectedCategories, riskTags |
| Analyzer Trace | 주체·목적 → 수집정보 → 도구·처리경로 → obligations → 고지 충족 → 관리·운영 → override → 최종 점수·등급 |
| JSON | NormalizedForm / ScanReport (접기·복사 가능) |

### 7차 통합 검수 체크리스트

#### 테스트 URL 유형

| 유형 | 예시 / 방법 |
|------|------------|
| 실제 공개 Google Forms | `docs.google.com/forms` 또는 `forms.gle` 공개 설문 |
| 실제 공개 네이버폼 | `form.naver.com` 또는 `naver.me` 단축 URL |
| 실제 공개 모아폼 | `moaform.com/q/...` 공개 설문 |
| 일반 HTML form 페이지 | `<form>` / `<input>` 이 있는 자체 호스팅 페이지 |
| 설문이 아닌 일반 페이지 | 블로그, 랜딩 페이지 등 |
| localhost / 127.0.0.1 | `http://localhost:3000` 등 (차단 확인) |
| 문항 없는 페이지 | 빈 폼 또는 동적 로딩만 있는 페이지 |
| 개인정보 고지문이 있는 설문 | description / noticeTexts에 고지 포함 |
| 이름·연락처·이메일 설문 | D3 직접식별정보 탐지 확인 |
| 성별/연령대/자녀 연령대/거주권역 설문 | 실제 문항별 D2 준식별정보 표시 확인 |

#### 각 테스트에서 확인할 것

- [ ] 문항 수가 실제와 일치하는가
- [ ] 실제 문항에 있는 성별, 연령대, 자녀 연령대, 거주권역만 **D2 준식별정보**로 표시되는가
- [ ] 이름·휴대폰·이메일은 **D3 직접식별정보**로 분류되는가
- [ ] 건강·고충·괴롭힘은 **D4 민감정보** 맥락으로 분류되는가
- [ ] 고유식별정보는 **D5**로 분류되는가
- [ ] 공공기관·출자출연기관 탐지(`publicSectorDetected`)가 되는가
- [ ] 고지문이 있으면 누락으로 잡히지 않는가
- [ ] 문항 추출 실패 시 **진단 제한 / 점수 산정 불가**로 표시되는가
- [ ] 문항 추출 성공 시 **진단 제한 finding**이 표시되지 않는가
- [ ] Debug Panel에서 NormalizedForm·ScanReport JSON 확인 및 복사가 되는가
- [ ] Analyzer Trace 8단계가 순서대로 표시되는가
- [ ] `npm run build` TypeScript 에러 없음
- [ ] `npm run dev` 정상 실행

#### 룰 회귀 점검 (오탐 방지)

- [ ] **「이용 목적」** 문항을 개인정보로 분류하지 않는다
- [ ] 성별, 연령대, 자녀 연령대, 거주권역만으로 **D3**로 올리지 않는다
- [ ] 관광·이용자 만족도 설문을 **근로자/조직진단**으로 분류하지 않는다
- [ ] 직원/조직진단이 아닌 설문에 **원자료 제공범위·소수집단 통계 비공개** 기준을 요구하지 않는다
- [ ] 민감정보(D4+)가 없으면 **「민감정보 입력 주의」** 문구를 표시하지 않는다
- [ ] 네이버폼·모아폼에서 문항 추출에 성공했으면 **「진단 제한」 finding**을 표시하지 않는다

### Debug Panel 사용법

1. 설문 URL 진단 후 리포트 하단 **「개발자 진단 정보 보기」** 클릭
2. 메타 필드·추출 문항 테이블·Analyzer Trace 확인
3. NormalizedForm / ScanReport JSON 펼치기 → **복사** 버튼으로 클립보드 저장
4. Supabase 연결 시 이 JSON 구조가 저장 기준 데이터가 됩니다

## 8차 작업 — 검증 Lab (Validation Harness)

조사 솔루션 품질을 **개발자/운영자용 검증 하네스**로 점검합니다. DB 없이 localStorage에 케이스·결과를 저장하며, 추후 `validation_runs` Supabase 테이블로 이전할 수 있도록 타입을 분리했습니다.

### 접속

```bash
npm run dev
```

브라우저에서 [http://localhost:3000/lab](http://localhost:3000/lab) 을 엽니다.  
메인 사용자 화면(`/`)과 분리된 **개발자용 검증 페이지**입니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| 테스트 케이스 관리 | URL·기대 플랫폼·기대값 추가, enabled 토글, localStorage 저장 |
| 순차 실행 | `/api/scan/start` → status polling → report 조회 (케이스 간 500ms delay) |
| 기대값 비교 | 플랫폼, 추출기, 문항 수, PII 카테고리, 등급, 제한, context, dataLevel |
| 결과 상태 | `pass` / `partial` / `fail` / `skipped` / `error` |
| Export | JSON 복사·다운로드, CSV 다운로드 |
| 커버리지 매트릭스 | 플랫폼별 URL 감지·추출·Playwright 필요 여부 등 |
| Golden Cases | 대표 설문 유형별 고정 fixture로 룰 회귀 검증 |

### pass / partial / fail 기준

- **pass**: 기대값과 실제값이 모두 일치 (등급 포함)
- **partial**: mismatch 없음 + warning만 있음 (예: 과잉진단 가능성 — 기대 `risk`, 실제 `high_risk`)
- **fail**: 플랫폼·추출기·문항 수·PII 미탐지·과소진단·제한 여부 불일치 등

### 기본 테스트 케이스

`lib/validation/defaultCases.ts`에 20개 기본 케이스가 있습니다.

- **enabled=true (즉시 실행 가능)**: localhost / 127.0.0.1 / file URL 차단 테스트, WiseON fixture URL
- **enabled=false (placeholder)**: Google·네이버·모아폼·SurveyMonkey 등 — 실제 URL로 교체 후 enabled=true

### 사용 절차

1. `/lab` 접속 → 상단 요약·커버리지 매트릭스 확인
2. 필요 시 **테스트 케이스 추가** 폼에서 URL·기대값 입력
3. 케이스 테이블에서 enabled / 선택 체크
4. **전체 실행** 또는 **선택된 케이스만 실행**
5. 결과 테이블에서 pass/partial/fail 확인 → **상세 보기**로 문항·JSON·override rules 확인
6. JSON/CSV 다운로드 또는 localStorage에 자동 저장된 결과 재확인

### 플랫폼 확장 시 검증 절차

1. `defaultCases.ts`에 새 platformGroup 케이스 추가
2. `platformCoverage.ts` 매트릭스 상태 업데이트
3. 실제 공개 URL로 placeholder 교체 후 Lab에서 실행
4. 추출기·PII·등급 기대값 조정 → 회귀 없을 때까지 반복

## Golden Test Case 기반 룰 안정화

SURE Check의 룰 안정화는 특정 설문명을 하드코딩하는 방식이 아니라, 대표 설문 유형별 기대 결과를 고정한 **Golden Test Case** 기준으로 진행합니다.

### 원칙

- 설문 하나가 깨질 때마다 `if title includes ...` 형태로 예외처리하지 않습니다.
- 실제 기관명은 Golden fixture에 들어갈 수 있지만, analyzer rule은 공통 패턴으로 동작해야 합니다.
- 오류가 발견되면 공통 룰을 수정하고 같은 유형의 Golden Case를 추가하거나 기대값을 보완합니다.
- Supabase 연결 전에는 `/lab`의 Golden Cases 탭에서 통과율을 확인합니다.

### 구현 파일

```
lib/validation/goldenCases.ts        # GoldenCase 타입과 기본 대표 케이스
lib/validation/compareGoldenCase.ts  # 응답 판단, 데이터 항목, 금지/필수 문구 비교
lib/validation/runGoldenCase.ts      # analyzeForm + AudienceReport 기반 실행
components/lab/GoldenCasesPanel.tsx  # /lab Golden Cases 탭 UI
```

### 기본 대표 케이스

- 공공 문화시설 만족도 조사
- 공공 어린이시설 만족도 조사
- 공공 도서관 프로그램/정책 설문
- 기업 또는 공공 경품 설문
- Google Forms 직접식별정보 설문
- 직원 조직진단 설문
- 건강 민감정보 설문
- 고위험정보 설문
- 문항 없는 일반 페이지

### 비교 항목

- 기대 응답 판단(`expectedDecision`)
- 기대 점수/등급 범위(`expectedGradeRange`)
- 표시되어야 하는 데이터 항목(`expectedDataItems`)
- 표시되면 안 되는 데이터 항목(`expectedNotDataItems`)
- 기대 context(`expectedContext`)
- 운영자 보완사항(`expectedOperatorFixes`)
- 금지 문구(`forbiddenPhrases`)
- 필수 문구(`requiredPhrases`)
- 진단 제한 여부

### 사용 절차

1. `/lab` 접속
2. `Golden Cases` 탭 선택
3. `전체 Golden Case 실행`
4. mismatch와 금지 문구 포함 여부 확인
5. 결과 JSON 다운로드로 회귀 기록 보관

현재 Golden Case는 외부 URL fetch 없이 `sampleNormalizedForm` fixture를 분석합니다. 네트워크 상태가 아니라 룰 엔진과 리포트 표현의 회귀를 안정적으로 검증하기 위한 구조입니다.

### Playwright 전환 전 제한

- 동시 병렬 fetch 없음 (순차 실행만)
- JavaScript 동적 로딩·로그인 후 문항은 Generic/HTML 한계
- SurveyMonkey·Typeform·Qualtrics 등은 Generic 베타 또는 Playwright 필요로 표시
- 외부 URL에 POST하지 않음 · 설문 제출하지 않음

### lib/validation 구조

```
lib/validation/
  types.ts                  # ValidationCase, ValidationResult (Supabase 이전용)
  defaultCases.ts           # 기본 테스트 케이스
  runValidationCase.ts      # scan API 순차 실행
  compareValidationResult.ts
  goldenCases.ts             # 대표 유형 Golden Case fixture
  compareGoldenCase.ts       # Golden Case 비교
  runGoldenCase.ts           # Golden Case 실행
  mapActualFromReport.ts
  exportValidationResults.ts
  platformCoverage.ts
  validationStorage.ts      # localStorage
```

## Supabase 연결 전 P0 정리

Supabase·DB·Playwright 연결 전 단계에서는 제한 리포트와 저장 타입을 다음 기준으로 유지합니다.

- **진단 제한은 위험등급이 아닙니다.** `limited`, `blocked`, `failed`는 `RiskGrade`가 아니라 `diagnosisStatus`로 구분합니다.
- 문항을 하나도 확인하지 못한 경우, URL 안전검사 차단, HTML fetch 실패, non-HTML, timeout, 로그인/권한 필요, 응답 종료, 파싱 실패는 **점수 산정 불가**로 표시합니다.
- 제한/차단 리포트는 `isLimited: true`, `confidence: "none"`, `score: null | undefined`, `grade: undefined` 구조를 사용합니다.
- 문항을 일부라도 추출해 룰엔진 분석이 가능한 경우에만 `safe/caution/risk/high_risk` 등급과 점수를 표시합니다.
- `NormalizedForm`, `ScanReport`, `ScanDebugInfo`, `ValidationCase`, `ValidationResult`는 Supabase 연결 시 JSONB 저장 기준 타입입니다.

### Mock Scan 구조 주의

현재 `MockScanRepository`의 상태 진행(`pending → running → completed`)은 **로컬 개발용 in-memory mock**입니다. API 응답 이후 `simulateScanProgress()`가 백그라운드처럼 동작하지만, Vercel 같은 서버리스 운영 환경에서는 응답 이후 작업 지속이 보장되지 않습니다.

실제 운영 전에는 다음 구조로 전환해야 합니다.

1. `/api/scan/start`가 Supabase `scan_jobs`에 `pending` 작업 저장
2. 별도 Worker/Queue가 작업을 가져가 extractor + analyzer 실행
3. 결과를 `scan_reports` 또는 JSONB 컬럼에 저장
4. `/api/scan/status`, `/api/scan/report`가 Supabase 저장값 조회

### P0 검증 명령

```bash
npm run lint
npx tsc --noEmit
npm run dev -- -p 8080
```

## 리포트 구조 개선

하나의 `ScanReport`를 화면에서 다음 3개 관점으로 재구성합니다. 기존 extractor, 룰엔진, Debug Panel, Validation Lab은 유지하며, DB·Supabase·Playwright·Worker는 아직 연결하지 않습니다.

## 개인/민감정보 포함 여부 기반 분기형 리포트 구조

리포트는 먼저 “이 설문이 어떤 개인정보 유형을 포함하는지”를 판정한 뒤, 그 결과에 따라 응답자 행동 문구와 운영자 보완 우선순위를 다르게 표시합니다. 특정 설문명 예외처리가 아니라 수집정보 유형, 문항 맥락, 고지 상태, 도구 경로를 조합해 판단합니다.

### 최상위 분류

| 유형 | 기준 | 상단 행동 문구 |
|------|------|----------------|
| 개인정보 거의 없음 | 직접식별정보·준식별정보·민감정보·고위험정보가 거의 없고 만족도/선호도/의견 중심 | 화면 기준으로 응답해도 무리가 낮습니다. |
| 준식별정보만 있음 | 성별, 연령대, 거주권역, 자녀 연령대, 부서/직급 등은 있으나 이름·연락처·이메일 없음 | 응답은 가능해 보입니다. 다만 개인정보를 추가로 쓰지 마세요. |
| 직접식별정보 있음 | 이름, 연락처, 이메일, 상세주소, 생년월일 중 하나 이상 있음 | 고지 확인 전에는 이름·연락처 입력을 미루세요. |
| 민감정보 또는 고위험정보 있음 | 건강상태, 질병, 장애, 고충, 괴롭힘, 인사평가, 주민등록번호, 계좌번호, 신분증 등 | 고지 확인 전에는 응답하지 않는 것이 좋습니다. |
| 진단 제한 | 문항 없음, 로그인/접근 제한, 동적 로딩, HTML 분석 실패, URL 차단 등 | 이 링크만으로는 응답 안전성을 판단하기 어렵습니다. |

### 화면 순서

1. 개인/민감정보 포함 여부 판단
2. 응답자 행동 판단
3. 판단 핵심 근거
4. 이 설문이 요구하는 정보
5. 운영자 우선 개선사항
6. 개선 문구 복사
7. 추가 응답자 체크리스트
8. 세부 판단 근거 및 방법
9. Debug Panel

### 운영자 우선 개선사항

운영자 섹션은 먼저 “운영자가 먼저 고칠 3가지”를 보여주고, 전체 보완사항은 그룹별 접힘 카드로 제공합니다.

- 공공기관 + 개인정보/민감정보: CSAP 또는 공공 보안검증 도구 검토, 국외이전/위탁 안내, 기관 공식 계정과 접근권한 확인
- 준식별정보만 있는 공공 만족도 조사: 보유기간과 파기 기준, 담당부서 또는 문의처, 네이버폼/모아폼 이용 안내
- 직접식별정보가 있는 Google Forms: 국외 보관·이전 안내, 수집 항목, 보유기간, 파기 기준
- 직원/조직진단: 원자료 제공 범위, 익명성 기준, 소수집단 비공개 기준, 고충·인사평가 문항 접근권한
- 경품 설문: 경품 연락처와 설문응답 분리, 발송 후 파기, 선택 응모 안내

### 표현 원칙

- “응답 보류입니다”, “위험 신호가 감지되었습니다”처럼 모호한 표현을 본문에서 줄입니다.
- 응답자에게는 “무엇을 해야 하는지”를 먼저 말합니다.
- “법률 위반 확정”처럼 단정하지 않습니다.
- “고지 확인 전에는 응답하지 않는 것이 좋습니다”, “개인정보를 추가로 쓰지 마세요”, “이름·연락처 입력을 미루세요”처럼 행동 중심 문구를 사용합니다.

### 1. 응답자용 판단 리포트

상단에 **응답 판단** 카드를 표시합니다.

| 판단 | 의미 |
|------|------|
| 응답 가능 | 개인정보 위험 신호가 낮음 |
| 주의 후 응답 | D2 준식별정보 또는 일부 고지 확인 필요 |
| 확인 후 응답 | 이름·연락처·이메일 등 직접식별정보 또는 외부 도구 확인 필요 |
| 응답 보류 권고 | 민감정보, 고위험정보, 익명성 모순, 직원 고충/조직진단 등 응답 전 추가 확인 필요 |

“응답 금지” 또는 법률 위반 확정 표현은 사용하지 않습니다. 진단 제한 상태에서는 응답 판단 대신 **진단 제한 / 점수 산정 불가**를 표시합니다.

### 2. 운영자용 보완 리포트

운영자가 바로 수정할 수 있도록 다음 그룹으로 보완사항을 정리합니다.

- 필수 보완: 수집 목적, 수집 항목, 보유기간, 파기, 거부권, 담당자 등
- 권장 보완: 고지문 가독성, 응답자 안내 보완
- 도구·위탁 보완: 네이버폼/모아폼 위탁 안내, Google Forms 국외이전/국외보관 안내
- 설문 설계 보완: 불필요한 개인정보 삭제, 경품정보와 설문응답 분리, 민감문항 최소화
- 공공기관 보완: 공공부문 외부 SaaS 사용 시 위탁, 기관 계정, 보유·파기, 보안검증 확인
- 직원/조직진단 보완: 익명성 기준, 원자료 제공 범위, 소수집단 비공개 기준, 불이익 없음 안내

운영자 섹션에는 복사 가능한 개선 문구도 제공합니다.

### 3. 상세 근거/개발자 리포트

기존 상세 findings, 근거 문항, 법적 기준 요약, analyzer trace는 **상세 근거 보기** accordion 안으로 이동했습니다. 기본적으로 접힌 상태이며, Debug Panel은 가장 아래에서 기존처럼 별도 접힌 카드로 유지합니다.

### 리포팅 코드 구조

```
lib/reporting/
  composeAudienceReport.ts   # ScanReport → AudienceReport 합성
  respondentDecision.ts      # 응답자 판단 기준
  operatorActions.ts         # 운영자 보완사항/템플릿 생성
  reportMessages.ts          # AudienceReport 타입, 라벨, 템플릿

components/report/
  DecisionHero.tsx
  RiskScoreVisual.tsx
  RiskDimensionBars.tsx
  KeyReasonsGrid.tsx
  CollectedDataVisual.tsx
  RespondentChecklist.tsx
  OperatorFixDashboard.tsx
  FixPriorityCard.tsx
  CopyableNoticeTemplates.tsx
  CompactEvidenceAccordion.tsx
  ReportVisualSummary.tsx
```

## 시각적 리포팅 UX 고도화

리포트는 일반 사용자가 첫 화면에서 응답 여부를 판단하고, 운영자는 우선 보완사항을 바로 확인할 수 있도록 다음 순서로 표시합니다.

1. **DecisionHero**: 응답 판단, 점수 게이지, 핵심 이유, 진단 범위
2. **KeyReasonsGrid**: 판단 핵심 근거 최대 4개 카드
3. **CollectedDataVisual**: 직접식별정보, 준식별정보, 민감정보/민감 맥락, 고위험정보 칩
4. **RespondentChecklist**: 응답 전 확인할 점, 입력하지 않는 것이 좋은 정보
5. **OperatorFixDashboard**: 필수/권장/도구·위탁/공공기관/직원설문/설문설계 보완사항
6. **CopyableNoticeTemplates**: 상황별 고지문 템플릿 복사
7. **CompactEvidenceAccordion**: 중복 제거된 상세 근거, 기본 접힘
8. **DebugPanel**: 개발자 진단 정보, 가장 아래에 기본 접힘

### 중복 근거 정리

`lib/reporting/dedupeFindings.ts`에서 유사 finding을 묶어 사용자 리포트에 반복 노출되지 않게 합니다.

- 보유기간 누락, 파기 시점 누락 → **보유·파기 안내 부족**
- 수탁자 누락, 위탁업무 누락 → **외부 설문 SaaS 위탁 안내 부족**
- 국외이전 국가/수탁자/보유기간 누락 → **국외이전/국외보관 안내 부족**
- 익명성 기준, 원자료 제공 범위, 소수집단 기준 누락 → **직원 설문 익명성·원자료 제공 기준 부족**
- 담당자, 처리자, 문의처 누락 → **담당자/처리자 안내 부족**

일반 리포트에는 raw question id를 표시하지 않습니다. raw id와 원본 JSON은 Debug Panel에서만 확인합니다.

### 문구 원칙

- “불법”, “위반 확정”처럼 단정하지 않습니다.
- “위험 신호”, “확인 필요”, “보완 권고”, “위반 소지”처럼 자동 진단의 한계를 드러내는 표현을 사용합니다.
- 민감정보가 탐지되지 않으면 민감정보 경고를 표시하지 않습니다.
- 직원/조직진단 맥락이 아니면 직원 설문 보완사항을 표시하지 않습니다.
- 마케팅 맥락이 아니면 마케팅 동의 누락을 표시하지 않습니다.

## 아동 관련 시설 만족도 설문 처리 기준

도서관, 체육시설, 물놀이시설, 관광·문화·교육 프로그램 만족도 설문은 실제 식별정보 수집 여부와 문항 맥락을 분리해 판단합니다.

### 데이터 분류

- `자녀 연령대`, `거주권역`은 D2 준식별정보로 분류합니다.
- 성별 문항이 실제로 없으면 `성별`을 수집정보로 표시하지 않습니다.
- `선호 프로그램`, `프로그램 주제`, `정책 방향`, `서비스 개선 의견`, `만족도`, `이용 목적`은 일반 의견/선호도 문항으로 분류합니다.
- `건강 프로그램`, `건강 강좌`, `건강 관련 프로그램 선호`는 건강정보가 아니라 일반 선호도입니다.
- 실제 건강상태, 질병, 병력, 진료·치료 이력, 장애 여부, 정신건강 상태 등을 묻는 경우에만 건강 민감정보로 분류합니다.

### 공공시설 맥락

다음 키워드가 확인되면 공공부문 관련 시설 설문 가능성을 반영합니다.

- `양평`, `양평군`, `물맑은양평`
- `종합운동장`, `체육시설`, `공공체육시설`, `어린이물놀이시설`, `체육공원`, `스포츠센터`, `시설관리`

공공부문으로 분류되더라도 D2 준식별정보 중심 설문은 고위험으로 강제하지 않습니다.

### 고지 판정

- “보다 나은 서비스 제공”, “기초자료”, “서비스 개선”, “통계 분석 목적”, “고객만족도 조사” 등 목적성 문구가 있으면 수집·이용 목적을 완전 누락으로 보지 않고 `unclear`로 처리합니다.
- 수집 항목은 문항에서 확인되지만 안내문에 정리되지 않은 경우 `unclear`로 처리합니다.
- 운영자 보완사항은 보유기간, 파기 시점, 담당부서, 외부 설문 시스템 안내, 자유의견 개인정보 입력 주의문을 중심으로 표시합니다.

### 응답자 안내

아동 관련 시설 이용 설문에서 자녀 연령대를 묻더라도 자녀 이름, 생년월일, 연락처 등 직접적인 아동 식별정보가 없으면 “응답 보류 권고”로 올리지 않습니다. 자유의견 문항이 있으면 이름, 연락처, 자녀 이름, 건강정보, 사고 내용 등 개인을 식별할 수 있는 정보는 쓰지 않도록 안내합니다.

## API

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/scan/start` | 진단 시작 (body: `{ "formUrl": "..." }`) |
| GET | `/api/scan/status/[scanId]` | 진단 상태 조회 |
| GET | `/api/scan/report/[scanId]` | 진단 리포트 조회 |

## 프로젝트 구조

```
app/
  page.tsx                    # 메인 페이지 (결과 인라인 표시)
  lab/page.tsx                # 검증 Lab (개발자용)
  report/[scanId]/page.tsx    # 공유 링크용 결과 페이지
  api/scan/                   # Mock API Routes
components/                   # UI 컴포넌트
  report/                     # 응답자/운영자/상세 근거 리포트 UI
lib/
  debug/                      # ScanDebugInfo, AnalyzerTrace 빌더
  reporting/                  # AudienceReport 합성 및 메시지
  fixtures/normalizedForms.ts # NormalizedForm 샘플 5종
  security/                   # URL 안전검사, safe fetch
  extractors/                 # GoogleFormsExtractor, NaverFormsExtractor, MoaformExtractor, GenericHtmlExtractor
  cache/                      # 인메모리 URL 캐시
  scan/                       # 진단 오케스트레이션
  rules/                      # 분류·의무·준수·등급강제 룰
  analyzer/                   # 진단 엔진 (analyzeForm)
  types/                      # scan, analyzer 타입
  validation/                 # 검증 Lab 타입, 실행, 비교, export
  repositories/               # Repository 인터페이스 및 Mock 구현
  mock/                       # 인메모리 스토어, 하위호환 mockReports
  utils/                      # 등급, Markdown, 복사 유틸
```

## 기술 스택

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- cheerio (HTML 파싱)

## 향후 계획

- Playwright Worker → 네이버폼·모아폼 등 동적 문항 추출
- SupabaseScanRepository로 DB 연동
- PDF 다운로드, 카카오톡 공유 연동

## 면책

본 서비스는 법률 자문이 아닌 자동 위험 진단 도구입니다. 결과는 법률 위반을 확정하지 않으며, 실제 처리 방식에 따라 달라질 수 있습니다.
