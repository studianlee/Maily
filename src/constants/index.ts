// 화면 크기 설정
export const WINDOW_SIZES = {
  logo: { width: 70, height: 70 },
  menu: { width: 70, height: 480 },
  inbox: { width: 380, height: 520 },
  "new-email": { width: 420, height: 620 },
  feature: { width: 420, height: 620 },
} as const;

// 기능 타입
export type FeatureType = "email-reply" | "compose" | "summarize" | "translate" | "grammar";
export type ViewState = "logo" | "menu" | "inbox" | "new-email" | FeatureType;
export type EmailTone = "accept" | "decline" | "inquiry" | "formal" | "casual";

// 기능 목록
export const FEATURES: { id: FeatureType; label: string; icon: string; desc: string }[] = [
  { id: "email-reply", label: "이메일 답변", icon: "💬", desc: "받은 메일에 답장 작성" },
  { id: "compose", label: "작성", icon: "✏️", desc: "새 문서 작성" },
  { id: "summarize", label: "요약", icon: "📋", desc: "긴 텍스트 요약" },
  { id: "translate", label: "번역", icon: "🌐", desc: "텍스트 번역" },
  { id: "grammar", label: "맞춤법", icon: "📝", desc: "맞춤법 검사" },
];

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

  compose: `당신은 전문 문서 작성가입니다.

[규칙]
- 요청된 주제에 맞는 문서를 작성합니다
- 명확하고 논리적인 구조로 작성합니다
- 마크다운 문법(**, ##, - 등)을 절대 사용하지 않습니다
- 본문만 출력합니다 (제목, 설명, 부연 없이)
- 자연스러운 문장으로 작성합니다`,

  summarize: `당신은 문서 요약 전문가입니다.

[규칙]
- 핵심 내용만 추출하여 간결하게 요약합니다
- 원문의 중요한 정보를 누락하지 않습니다
- 3~5문장 이내로 요약합니다
- 불필요한 수식어와 반복을 제거합니다
- 마크다운 문법(**, ##, - 등)을 절대 사용하지 않습니다
- 요약 결과만 출력합니다 (설명, 부연 없이)`,

  translate: `당신은 전문 번역가입니다.

[규칙]
- 원문의 의미를 정확하게 전달합니다
- 자연스러운 한국어/영어로 번역합니다
- 의역보다 직역을 우선하되, 어색하면 의역합니다
- 마크다운 문법(**, ##, - 등)을 절대 사용하지 않습니다
- 번역 결과만 출력합니다 (원문, 설명, 부연 없이)`,

  grammar: `당신은 맞춤법 교정 전문가입니다.

[규칙]
- 맞춤법, 띄어쓰기, 문법 오류를 교정합니다
- 원문의 의미와 문체를 최대한 유지합니다
- 불필요한 수정은 하지 않습니다
- 마크다운 문법(**, ##, - 등)을 절대 사용하지 않습니다
- 교정된 텍스트만 출력합니다 (설명, 변경사항 없이)`,
};
