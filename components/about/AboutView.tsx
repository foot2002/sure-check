import Link from "next/link";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  Handshake,
  Info,
  Lock,
  Megaphone,
  Scale,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Reveal } from "@/components/about/Reveal";
import { KcfLogo } from "@/components/KcfLogo";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const PRIVACY_CENTER_URL = "https://www.kcf-korea.org/privacy-center";

const ROLE_CARDS = [
  {
    title: "개인정보 보호 인식 확산",
    body: "개인정보 보호의 중요성과 실무 적용 기준을 알리고, 기관과 기업의 자율적인 보호 활동을 지원합니다.",
    icon: Megaphone,
  },
  {
    title: "개인정보 수집·이용 진단",
    body: "온라인 설문, 신청서, 접수 양식 등 개인정보 수집 화면의 안내 항목과 위험 요소를 점검합니다.",
    icon: ClipboardCheck,
  },
  {
    title: "기관·기업 개선 지원",
    body: "개인정보 수집 목적, 항목, 보유기간, 파기 기준, 담당자 연락처 등 기본 고지 항목의 개선 방향을 제안합니다.",
    icon: Handshake,
  },
  {
    title: "공익형 모니터링",
    body: "공개 온라인 설문과 조사 환경을 모니터링하여 개인정보 보호 수준 향상을 위한 참고 지표와 리포트를 제공합니다.",
    icon: BarChart3,
  },
];

const PURPOSE_CARDS = [
  {
    title: "응답자의 안전한 판단 지원",
    body: "응답자가 개인정보 제공 여부를 스스로 판단할 수 있도록 설문 화면의 안내 수준을 확인합니다.",
    icon: UserRound,
  },
  {
    title: "기관·기업의 자율 개선 유도",
    body: "개인정보 수집·이용 고지, 보유기간, 파기 기준, 담당자 안내 등 기본 항목의 보완을 유도합니다.",
    icon: Building2,
  },
  {
    title: "온라인 개인정보 수집 실태 모니터링",
    body: "공개 설문과 온라인 조사 환경에서 개인정보가 어떻게 수집되고 있는지 집계 통계와 사례를 통해 보여줍니다.",
    icon: Eye,
  },
];

const ACTIVITIES = [
  "공개 온라인 설문 링크 수집 및 모니터링",
  "개인정보·민감정보·고위험정보 수집 여부 확인",
  "수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처 등 고지 항목 점검",
  "Google Forms, Naver Form, Moaform 등 외부 설문도구 사용 여부 확인",
  "공공기관·학교·기업 등의 온라인 설문 수집 실태 분석",
  "개선안내 후보 검토 및 자율 개선 요청 지원",
  "수집실태 리포트 및 주간 리포트 제공",
];

const PRINCIPLES = [
  {
    title: "공개 설문 화면 기준",
    body: "공개적으로 접근 가능한 설문 화면을 기준으로 진단합니다. 로그인, 비공개, 접근 권한이 필요한 페이지는 제한 처리하거나 진단 대상에서 제외합니다.",
    icon: Eye,
  },
  {
    title: "실제 개인정보 미수집",
    body: "응답자의 실제 개인정보를 입력하거나 저장하지 않습니다. 설문 화면의 문항과 안내문을 기준으로 수집 가능성을 분석합니다.",
    icon: Lock,
  },
  {
    title: "위법 확정이 아닌 개선 참고자료",
    body: "진단 결과는 법 위반 확정이 아니라, 개인정보 수집·고지 미흡 가능성에 대한 참고자료입니다.",
    icon: Scale,
  },
  {
    title: "자율 개선 우선",
    body: "기관·기업이 개인정보 수집 안내를 보완하고, 응답자에게 충분한 정보를 제공할 수 있도록 자율 개선을 우선합니다.",
    icon: Handshake,
  },
  {
    title: "익명 통계 중심 공개",
    body: "주간 리포트는 개별 기관명, 설문 제목, URL, 캡처를 공개하지 않고, 집계 통계와 익명화된 위험 유형 중심으로 제공합니다.",
    icon: ShieldCheck,
  },
];

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow?: string;
  title: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-wide text-teal-800">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`text-xl font-bold tracking-tight text-slate-900 md:text-2xl ${eyebrow ? "mt-1.5" : ""}`}
      >
        {title}
      </h2>
    </div>
  );
}

function HeroCtas() {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
      >
        설문 진단하기
      </Link>
      <Link
        href="/report"
        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-teal-300 hover:bg-teal-50"
      >
        수집실태 리포트 보기
      </Link>
      <Link
        href="/weekly"
        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-teal-300 hover:bg-teal-50"
      >
        주간 리포트 보기
      </Link>
    </div>
  );
}

export function AboutView() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <SiteHeader />
      <main className="flex-1">
        <section
          id="intro"
          className="border-b border-slate-200 bg-gradient-to-b from-teal-50/80 via-white to-[#f8fafc]"
        >
          <div className="mx-auto max-w-[72rem] px-5 py-8 md:px-8 md:py-12">
            <Reveal>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold tracking-wide text-teal-800">
                  개인정보보호진흥원 소개
                </p>
                <a
                  href={PRIVACY_CENTER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-teal-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-900"
                >
                  개인정보보호진흥원 바로가기
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
              <h1 className="mt-3 max-w-3xl text-2xl font-bold tracking-tight text-slate-900 md:mt-4 md:text-4xl md:leading-tight">
                대한민국 온라인 개인정보 보호 수준을 높입니다
              </h1>
              <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600 md:text-base">
                <p>
                  SURE-CHECK는 공개 온라인 설문에서 개인정보가 어떻게 수집되고
                  안내되는지 점검하여, 응답자의 안전한 판단과 기관·기업의 자율
                  개선을 지원하는 공익형 모니터링 서비스입니다.
                </p>
                <p>
                  공공기관, 기업, 학교, 협회 등에서 운영하는 온라인 설문·신청·접수
                  과정에서 개인정보 수집 목적, 수집 항목, 보유기간, 파기 기준,
                  담당자 연락처 등이 충분히 안내되고 있는지 확인할 수 있도록
                  돕습니다.
                </p>
              </div>
              <HeroCtas />
            </Reveal>
          </div>
        </section>

        <div className="mx-auto max-w-[72rem] space-y-10 px-5 py-10 md:space-y-14 md:px-8 md:py-14">
          <Reveal>
            <section id="greeting" className="scroll-mt-8">
              <SectionHeading title="인사말" />
              <article className="mt-5 rounded-2xl border border-teal-100 bg-white p-5 md:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <p className="text-sm font-semibold text-teal-900">
                    한국컨설팅산업재단 이사장 정옥래
                  </p>
                  <KcfLogo className="shrink-0 self-end sm:self-start" />
                </div>
                <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700 md:text-[15px]">
                  <p>
                    디지털 전환이 빠르게 확산되면서 온라인 설문, 신청 접수, 만족도
                    조사, 의견수렴 등 다양한 방식의 온라인 정보 수집이
                    일상화되고 있습니다. 이러한 변화는 업무 효율과 참여 편의성을
                    높이는 한편, 개인정보가 충분한 안내 없이 수집될 수 있는 새로운
                    위험도 함께 만들고 있습니다.
                  </p>
                  <p>
                    개인정보 보호는 단순한 규제 준수를 넘어, 국민과 이용자가
                    안심하고 디지털 서비스를 이용하기 위한 기본 조건입니다. 특히
                    공개 온라인 설문은 누구나 쉽게 만들고 배포할 수 있는 만큼,
                    개인정보 수집 목적과 항목, 보유기간, 파기 기준, 담당자 연락처
                    등을 명확히 안내하는 문화가 중요합니다.
                  </p>
                  <p>
                    한국컨설팅산업재단과 개인정보보호진흥원은 SURE-CHECK를 통해
                    공개 온라인 설문의 개인정보 수집·고지 실태를 점검하고,
                    기관과 기업이 스스로 개선할 수 있는 기준과 참고자료를
                    제공하고자 합니다.
                  </p>
                  <p>
                    SURE-CHECK는 특정 기관이나 기업을 비난하기 위한 서비스가
                    아니라, 개인정보 보호 수준을 높이고 안전한 온라인 수집 문화를
                    확산하기 위한 공익적 모니터링 플랫폼입니다. 앞으로도 자율
                    개선과 예방 중심의 개인정보 보호 문화가 정착될 수 있도록
                    노력하겠습니다.
                  </p>
                </div>
                <p className="mt-6 text-right text-sm font-semibold text-slate-900">
                  한국컨설팅산업재단 이사장 정옥래
                </p>
              </article>
            </section>
          </Reveal>

          <section id="institute" className="scroll-mt-8">
            <Reveal>
              <SectionHeading title="개인정보보호진흥원 소개" />
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                개인정보보호진흥원은 개인정보 보호 인식 확산과 안전한 데이터 활용
                문화 조성을 위해 운영되는 전문 조직입니다. 공공기관, 기업,
                교육기관, 협회 등 다양한 조직이 개인정보를 보다 안전하게
                수집·이용할 수 있도록 교육, 진단, 컨설팅, 모니터링 활동을
                수행합니다.
              </p>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {ROLE_CARDS.map((card, index) => {
                const Icon = card.icon;
                return (
                  <Reveal key={card.title} delayMs={index * 80}>
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-teal-800">
                            주요 역할 {index + 1}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-slate-900">
                            {card.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            {card.body}
                          </p>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </section>

          <section id="purpose" className="scroll-mt-8">
            <Reveal>
              <SectionHeading title="SURE-CHECK 운영 목적" />
              <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600 md:text-base">
                <p>
                  SURE-CHECK는 공개 온라인 설문이 개인정보를 수집하는 과정에서
                  응답자가 충분한 정보를 바탕으로 참여 여부를 판단할 수 있도록
                  돕기 위해 운영됩니다.
                </p>
                <p>
                  온라인 설문은 편리하지만, 성명, 연락처, 이메일, 소속, 주소, 건강
                  관련 정보 등 개인정보가 수집되는 경우가 많습니다. 이때 수집
                  목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처, 외부
                  설문도구 사용 여부 등이 충분히 안내되지 않으면 응답자는 자신의
                  개인정보가 어떻게 처리되는지 알기 어렵습니다.
                </p>
                <p>
                  SURE-CHECK는 이러한 문제를 사전에 확인하고, 기관·기업이 개인정보
                  수집 절차를 자율적으로 보완할 수 있도록 지원합니다.
                </p>
              </div>
            </Reveal>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {PURPOSE_CARDS.map((card, index) => {
                const Icon = card.icon;
                return (
                  <Reveal key={card.title} delayMs={index * 80}>
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <p className="mt-3 text-xs font-semibold text-teal-800">
                        핵심 목적 {index + 1}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-slate-900">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {card.body}
                      </p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </section>

          <section id="activities" className="scroll-mt-8">
            <Reveal>
              <SectionHeading title="주요 활동" />
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                SURE-CHECK는 공개적으로 접근 가능한 온라인 설문을 대상으로
                개인정보 수집·고지 상태를 점검하고, 개선이 필요한 사례를
                검토합니다.
              </p>
            </Reveal>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {ACTIVITIES.map((item, index) => (
                <Reveal
                  key={item}
                  as="li"
                  delayMs={(index % 2) * 80}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700"
                >
                  {item}
                </Reveal>
              ))}
            </ul>
            <Reveal>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                진단 결과는 위반 확정이 아니라, 개선안내 후보·확인 필요·위반
                소지·고지 미흡 가능성으로 해석합니다.
              </p>
            </Reveal>
          </section>

          <section id="principles" className="scroll-mt-8">
            <Reveal>
              <SectionHeading title="운영 원칙" />
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                SURE-CHECK는 개인정보 보호 수준 향상과 자율 개선을 목적으로
                운영됩니다. 진단 결과는 공개 설문 화면을 기준으로 한 자동진단 및
                관리자 검토 자료이며, 개별 설문의 위법 여부를 확정하는 자료가
                아닙니다.
              </p>
            </Reveal>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {PRINCIPLES.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal
                    key={item.title}
                    delayMs={(index % 2) * 80}
                    className={index === PRINCIPLES.length - 1 ? "md:col-span-2" : undefined}
                  >
                    <article className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-teal-800">
                            원칙 {index + 1}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-slate-900">
                            {item.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </section>

          <Reveal>
            <section id="notice" className="scroll-mt-8">
              <SectionHeading title="유의사항" />
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-950 md:px-5 md:py-5">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="space-y-3">
                    <p>
                      SURE-CHECK의 진단 결과는 공개 설문 화면을 기준으로 한
                      자동진단 및 관리자 검토 자료입니다. 이는 개인정보 수집·고지
                      미흡 가능성, 위반 소지, 개선 필요, 확인 필요 사항을 안내하기
                      위한 참고자료이며, 개별 설문의 위법 여부를 확정하는 자료가
                      아닙니다.
                    </p>
                    <p>
                      주간 리포트는 익명 통계와 대표 위험 유형 중심으로
                      게시됩니다. 기관명, 설문 제목, URL, 캡처 이미지 등은
                      공개하지 않습니다.
                    </p>
                    <p>
                      본 서비스는 법률 자문, 수사, 행정처분, 과태료 부과를 위한
                      절차가 아닙니다. 최종적인 법령 해석과 조치 여부는 해당
                      기관·기업 및 권한 있는 기관의 판단에 따릅니다.
                    </p>
                    <p>
                      SURE-CHECK는 응답자의 실제 개인정보를 수집하지 않으며, 공개
                      설문 화면에 나타난 문항과 안내문을 기준으로 분석합니다.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </Reveal>

          <Reveal>
            <section
              id="shortcuts"
              className="scroll-mt-8 rounded-2xl border border-teal-100 bg-white p-5 md:p-8"
            >
              <SectionHeading
                eyebrow="바로가기"
                title="공개 설문 화면 기준 자동진단을 확인해 보세요"
              />
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                설문 링크를 진단하거나, 수집실태 리포트와 주간 리포트를 통해
                공익형 모니터링 결과를 확인할 수 있습니다.
              </p>
              <HeroCtas />
            </section>
          </Reveal>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
