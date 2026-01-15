import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ToastNotification } from "../types";
import type { ViewState } from "../constants";
import type { ScheduledEmail } from "../hooks/useScheduledEmail";
import { Toast } from "./Toast";
import { formatScheduledDate } from "../utils";

interface ScheduledListProps {
  scheduledEmails: ScheduledEmail[];
  loading: boolean;
  animating: boolean;
  closing: boolean;
  toast: ToastNotification | null;
  onNavigate: (target: ViewState) => void;
  onLoad: () => void;
  onDelete: (id: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function ScheduledList({
  scheduledEmails,
  loading,
  animating,
  closing,
  toast,
  onNavigate,
  onLoad,
  onDelete,
  onKeyDown,
}: ScheduledListProps) {
  useEffect(() => {
    onLoad();
  }, []);

  function handleHeaderDrag(e: React.MouseEvent) {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <span className="status-badge pending">대기중</span>;
      case "sent":
        return <span className="status-badge sent">발송됨</span>;
      case "failed":
        return <span className="status-badge failed">실패</span>;
      default:
        return null;
    }
  }

  const pendingEmails = scheduledEmails.filter((e) => e.status === "pending");
  const sentEmails = scheduledEmails.filter((e) => e.status === "sent");
  const failedEmails = scheduledEmails.filter((e) => e.status === "failed");

  return (
    <div
      className={`scheduled-screen ${animating ? "animating" : ""} ${closing ? "closing" : ""}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div className="scheduled-header" onMouseDown={handleHeaderDrag}>
        <button
          className="back-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("menu");
          }}
          disabled={animating}
        >
          ←
        </button>
        <div className="scheduled-title">
          <span className="scheduled-icon">🕐</span>
          <span className="scheduled-name">예약된 메일</span>
        </div>
        <div className="scheduled-count">{pendingEmails.length}</div>
      </div>

      <div className="scheduled-content">
        {loading ? (
          <div className="scheduled-loading">
            <span className="loading-spinner" />
            로딩 중...
          </div>
        ) : scheduledEmails.length === 0 ? (
          <div className="scheduled-empty">
            <span className="empty-icon">📭</span>
            <p>예약된 메일이 없습니다</p>
            <button className="compose-new-btn" onClick={() => onNavigate("new-email")}>
              새 메일 예약하기
            </button>
          </div>
        ) : (
          <div className="scheduled-sections">
            {pendingEmails.length > 0 && (
              <div className="scheduled-section">
                <div className="section-header">
                  <span>대기 중</span>
                  <span className="section-count">{pendingEmails.length}</span>
                </div>
                {pendingEmails.map((email) => (
                  <div key={email.id} className="scheduled-item">
                    <div className="scheduled-item-main">
                      <div className="scheduled-item-to">{email.to}</div>
                      <div className="scheduled-item-subject">{email.subject}</div>
                      <div className="scheduled-item-time">
                        <span className="time-icon">⏰</span>
                        {formatScheduledDate(email.scheduled_at)}
                      </div>
                    </div>
                    <div className="scheduled-item-actions">
                      {getStatusBadge(email.status)}
                      <button
                        className="cancel-btn"
                        onClick={() => onDelete(email.id)}
                        title="예약 취소"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sentEmails.length > 0 && (
              <div className="scheduled-section">
                <div className="section-header">
                  <span>발송 완료</span>
                  <span className="section-count">{sentEmails.length}</span>
                </div>
                {sentEmails.map((email) => (
                  <div key={email.id} className="scheduled-item sent">
                    <div className="scheduled-item-main">
                      <div className="scheduled-item-to">{email.to}</div>
                      <div className="scheduled-item-subject">{email.subject}</div>
                    </div>
                    <div className="scheduled-item-actions">
                      {getStatusBadge(email.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {failedEmails.length > 0 && (
              <div className="scheduled-section">
                <div className="section-header">
                  <span>발송 실패</span>
                  <span className="section-count">{failedEmails.length}</span>
                </div>
                {failedEmails.map((email) => (
                  <div key={email.id} className="scheduled-item failed">
                    <div className="scheduled-item-main">
                      <div className="scheduled-item-to">{email.to}</div>
                      <div className="scheduled-item-subject">{email.subject}</div>
                      {email.error_message && (
                        <div className="scheduled-item-error">{email.error_message}</div>
                      )}
                    </div>
                    <div className="scheduled-item-actions">
                      {getStatusBadge(email.status)}
                      <button
                        className="cancel-btn"
                        onClick={() => onDelete(email.id)}
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
