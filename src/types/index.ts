// Gmail 메시지 타입
export interface GmailMessage {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
  is_unread: boolean;
}

// Gmail API 응답 타입
export interface GmailMessagesResult {
  messages: GmailMessage[];
  next_page_token: string | null;
}

// Outlook 메시지 타입
export interface OutlookMessage {
  id: string;
  conversation_id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
  is_unread: boolean;
}

// Outlook API 응답 타입
export interface OutlookMessagesResult {
  messages: OutlookMessage[];
  next_link: string | null;
}

// 통합 이메일 타입 (Gmail/Outlook 공통)
export interface EmailMessage {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
  is_unread: boolean;
  provider: "gmail" | "outlook";
}

// 이메일 제공자 타입
export type EmailProvider = "gmail" | "outlook";

// 토스트 타입
export interface Toast {
  message: string;
  type: "success" | "error" | "info";
}
