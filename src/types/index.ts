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

// 토스트 타입
export interface Toast {
  message: string;
  type: "success" | "error" | "info";
}
