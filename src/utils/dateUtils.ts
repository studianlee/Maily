// 날짜 관련 유틸리티 함수

/**
 * 이메일 목록에서 사용하는 날짜 포맷 (과거 날짜)
 * - 오늘: 시간 표시 (오후 3:30)
 * - 어제: "어제"
 * - 올해: "1월 15일"
 * - 작년 이전: "2024.1.15"
 */
export function formatEmailDate(dateStr: string): string {
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

/**
 * 예약 메일에서 사용하는 날짜 포맷 (미래 날짜)
 * - 60분 미만: "N분 후"
 * - 24시간 미만: "N시간 후"
 * - 7일 미만: "N일 후"
 * - 그 외: "1월 15일 오후 3:30"
 */
export function formatScheduledDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) {
    return "발송 대기 중...";
  }
  if (diffMins < 60) {
    return `${diffMins}분 후`;
  }
  if (diffHours < 24) {
    return `${diffHours}시간 후`;
  }
  if (diffDays < 7) {
    return `${diffDays}일 후`;
  }
  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
