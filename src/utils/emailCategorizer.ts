import type { GmailMessage, EmailCategory } from "../types";

// Gmail 라벨 매핑
const GMAIL_PROMO_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"];
const GMAIL_UPDATE_LABELS = ["CATEGORY_UPDATES"]; // 인증 메일 포함 가능성 높음

// Outlook 라벨 매핑
const OUTLOOK_OTHER_LABEL = "INFERENCE_OTHER"; // 프로모션/기타 메일

// 인증 관련 키워드 (라벨로 확인 안 될 때 폴백)
const AUTH_KEYWORDS = [
  "인증", "인증번호", "확인코드", "본인확인", "verification", "verify",
  "otp", "code", "password", "비밀번호", "로그인", "login", "sign in",
  "2fa", "two-factor", "security code", "보안코드", "일회용",
  "reset", "재설정", "activate", "활성화"
];

// 프로모션 관련 키워드 (라벨로 확인 안 될 때 폴백)
const PROMO_KEYWORDS = [
  "unsubscribe", "수신거부", "광고", "할인", "세일", "sale", "off",
  "프로모션", "promotion", "newsletter", "뉴스레터", "특가", "이벤트",
  "event", "coupon", "쿠폰", "deal", "offer", "limited", "한정",
  "무료배송", "free shipping", "마케팅", "marketing"
];

// 이메일에서 도메인 추출
function extractDomain(email: string): string {
  const match = email.match(/<([^>]+)>/) || email.match(/([^\s@]+@[^\s@]+)/);
  if (match) {
    const addr = match[1] || match[0];
    const parts = addr.split("@");
    return parts[parts.length - 1]?.toLowerCase() || "";
  }
  return "";
}

// 텍스트에 키워드가 포함되어 있는지 확인
function containsKeywords(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

// 라벨 기반 분류
function categorizeByLabels(labels: string[]): EmailCategory | null {
  // Gmail 프로모션/소셜
  if (labels.some(l => GMAIL_PROMO_LABELS.includes(l))) {
    return "promo";
  }

  // Gmail 업데이트 (인증 가능성)
  if (labels.some(l => GMAIL_UPDATE_LABELS.includes(l))) {
    return "auth";
  }

  // Outlook 기타 (프로모션)
  if (labels.includes(OUTLOOK_OTHER_LABEL)) {
    return "promo";
  }

  return null;
}

// 이메일 분류
export function categorizeEmail(
  email: GmailMessage,
  internalDomains: string[] = []
): EmailCategory {
  const fromDomain = extractDomain(email.from);
  const textToCheck = `${email.subject} ${email.snippet}`;
  const labels = email.labels || [];

  // 1. 라벨 기반 분류 (우선)
  const labelCategory = categorizeByLabels(labels);

  // 2. 인증 메일 체크 (키워드 기반, 라벨이 auth가 아닐 때도 추가 체크)
  if (containsKeywords(textToCheck, AUTH_KEYWORDS)) {
    return "auth";
  }

  // 3. 라벨로 프로모션 확정된 경우
  if (labelCategory === "promo") {
    return "promo";
  }

  // 4. 내부 도메인 체크
  if (internalDomains.length > 0) {
    const normalizedDomains = internalDomains.map(d => d.toLowerCase().trim());
    if (normalizedDomains.includes(fromDomain)) {
      return "internal";
    }
  }

  // 5. 키워드 기반 프로모션 체크 (폴백)
  if (containsKeywords(textToCheck, PROMO_KEYWORDS)) {
    return "promo";
  }

  return "external";
}

// 카테고리별 이메일 개수
export function getCategoryCounts(
  emails: GmailMessage[],
  internalDomains: string[] = []
): Record<EmailCategory, number> {
  const counts: Record<EmailCategory, number> = {
    all: emails.length,
    internal: 0,
    external: 0,
    auth: 0,
    promo: 0,
  };

  for (const email of emails) {
    const category = categorizeEmail(email, internalDomains);
    counts[category]++;
  }

  return counts;
}

// 카테고리로 이메일 필터링
export function filterByCategory(
  emails: GmailMessage[],
  category: EmailCategory,
  internalDomains: string[] = []
): GmailMessage[] {
  if (category === "all") {
    return emails;
  }

  return emails.filter(email => categorizeEmail(email, internalDomains) === category);
}
