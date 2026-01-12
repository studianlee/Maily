import type { GmailMessage } from "../../types";

interface EmailItemProps {
  email: GmailMessage;
  onClick: () => void;
}

// 발신자 이름만 추출
function extractName(from: string): string {
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

// 날짜 포맷
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = today.getTime() - targetDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
    } else if (diffDays === 1) {
      return "어제";
    } else if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}월 ${date.getDate()}일`;
    } else {
      return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    }
  } catch {
    return dateStr;
  }
}

export function EmailItem({ email, onClick }: EmailItemProps) {
  return (
    <div
      className={`email-item ${email.is_unread ? "unread" : ""}`}
      onClick={onClick}
    >
      <div className="email-from">{extractName(email.from)}</div>
      <div className="email-subject">{email.subject}</div>
      <div className="email-snippet">{email.snippet}</div>
      <div className="email-date">{formatDate(email.date)}</div>
    </div>
  );
}
