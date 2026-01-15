// 첨부파일 타입
export interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
}

// 첨부파일 업로드 타입
export interface AttachmentUpload {
  filename: string;
  mime_type: string;
  data: string; // Base64 encoded
}

// Gmail 메시지 타입
export interface GmailMessage {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  to?: string;
  cc?: string;
  date: string;
  snippet: string;
  body?: string;
  is_unread: boolean;
  is_starred: boolean;
  labels: string[];
  attachments: Attachment[];
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
  to?: string;
  cc?: string;
  date: string;
  snippet: string;
  body?: string;
  is_unread: boolean;
  is_flagged: boolean;
  labels: string[];
  attachments: Attachment[];
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
  labels: string[];
  provider: "gmail" | "outlook";
}

// 이메일 제공자 타입
export type EmailProvider = "gmail" | "outlook";

// 이메일 카테고리 타입
export type EmailCategory = "all" | "internal" | "external" | "auth" | "promo";

export interface CategoryInfo {
  id: EmailCategory;
  label: string;
  icon: string;
}

export const EMAIL_CATEGORIES: CategoryInfo[] = [
  { id: "all", label: "전체", icon: "📬" },
  { id: "internal", label: "내부", icon: "🏢" },
  { id: "external", label: "외부", icon: "🌐" },
  { id: "auth", label: "인증", icon: "🔐" },
  { id: "promo", label: "프로모션", icon: "📢" },
];

// 토스트 알림 타입
export interface ToastNotification {
  message: string;
  type: "success" | "error" | "info";
}
