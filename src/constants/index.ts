// 화면 크기 설정
export const WINDOW_SIZES = {
  logo: { width: 70, height: 70 },
  menu: { width: 70, height: 340 },
  inbox: { width: 380, height: 520 },
  "new-email": { width: 420, height: 620 },
  scheduled: { width: 380, height: 520 },
  settings: { width: 380, height: 520 },
  feature: { width: 420, height: 620 },
} as const;

// 기능 타입 (email-reply는 inbox에서 메일 선택시 사용)
export type FeatureType = "email-reply";
export type ViewState = "logo" | "menu" | "inbox" | "new-email" | "scheduled" | "settings" | FeatureType;
export type EmailTone = "accept" | "decline" | "inquiry" | "formal" | "casual";

// 답변 톤 옵션
export const TONE_OPTIONS: { value: EmailTone; label: string; prompt: string }[] = [
  { value: "accept", label: "수락", prompt: "상대방의 요청을 긍정적으로 수락하며, 협조적인 태도를 보여주는 톤으로" },
  { value: "decline", label: "거절", prompt: "상대방의 요청을 정중하게 거절하되, 대안이나 양해를 구하는 톤으로" },
  { value: "inquiry", label: "문의", prompt: "궁금한 점을 명확하게 질문하고, 상세한 답변을 요청하는 톤으로" },
  { value: "formal", label: "정중", prompt: "격식을 갖추고 예의 바르게, 공식적인 비즈니스 톤으로" },
  { value: "casual", label: "친근", prompt: "친근하고 부드럽게, 동료나 친한 관계에서 사용하는 편안한 톤으로" },
];

// AI 시스템 프롬프트
export const SYSTEM_PROMPTS: Record<FeatureType, string> = {
  "email-reply": `당신은 10년 경력의 비즈니스 커뮤니케이션 전문가입니다.

[규칙]
- 한국어 비즈니스 이메일 형식을 따릅니다
- 3문단 이내로 작성합니다 (인사 - 본문 - 마무리)
- 간결하고 명확하게 작성합니다
- 마크다운 문법(**, ##, - 등)을 절대 사용하지 않습니다
- 이메일 본문만 출력합니다 (제목, 설명, 부연 없이)

[형식]
OOO님, 안녕하세요.

(핵심 내용)

감사합니다.`,
};
