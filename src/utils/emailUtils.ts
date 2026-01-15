// 이메일 관련 유틸리티 함수

/**
 * 이메일 문자열에서 실제 이메일 주소만 추출
 * @example "John Doe <john@example.com>" -> "john@example.com"
 * @example "john@example.com" -> "john@example.com"
 */
export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

/**
 * 이메일 문자열에서 발신자 이름만 추출
 * @example "John Doe <john@example.com>" -> "John Doe"
 * @example "john@example.com" -> "john"
 */
export function extractName(from: string): string {
  const match = from.match(/^([^<]+)</);
  if (match) {
    return match[1].trim().replace(/"/g, "");
  }
  const emailMatch = from.match(/^([^@]+)@/);
  if (emailMatch) {
    return emailMatch[1];
  }
  return from;
}
