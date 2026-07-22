import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Building2,
  Clock,
  Eye,
  FileWarning,
  Lock,
  Shield,
  UserRound,
  Wrench,
} from "lucide-react";

export interface ReasonCardModel {
  title: string;
  description: string;
  Icon: LucideIcon;
}

const KEYWORD_RULES: Array<{
  pattern: RegExp;
  title: string;
  Icon: LucideIcon;
}> = [
  {
    pattern: /이름|연락처|이메일|직접\s*식별|개인을\s*직접/,
    title: "이름·연락처 수집",
    Icon: UserRound,
  },
  {
    pattern: /민감|건강|고충|괴롭힘/,
    title: "민감정보 포함",
    Icon: Eye,
  },
  {
    pattern: /보유기간|파기/,
    title: "보유기간·파기 미확인",
    Icon: Clock,
  },
  {
    pattern: /고지|안내문|동의/,
    title: "고지문 확인 필요",
    Icon: FileWarning,
  },
  {
    pattern: /Google|네이버|모아폼|외부\s*설문|SaaS|도구/,
    title: "외부 설문도구 사용",
    Icon: Wrench,
  },
  {
    pattern: /CSAP|보안\s*인증|ISMS/,
    title: "보안·인증 확인",
    Icon: Lock,
  },
  {
    pattern: /공공|기관|지자체|도서관/,
    title: "공공·기관 설문",
    Icon: Building2,
  },
  {
    pattern: /준식별|연령|거주/,
    title: "준식별정보 포함",
    Icon: Shield,
  },
];

export function toReasonCard(reason: string, index: number): ReasonCardModel {
  const matched = KEYWORD_RULES.find((rule) => rule.pattern.test(reason));
  const title =
    matched?.title ??
    (reason.length > 18 ? `${reason.slice(0, 16).trim()}…` : reason);
  const Icon = matched?.Icon ?? AlertTriangle;

  return {
    title: matched ? title : `핵심 근거 ${index + 1}`,
    description: reason,
    Icon,
  };
}
