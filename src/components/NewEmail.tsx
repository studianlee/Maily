import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Toast as ToastType } from "../types";
import type { ViewState, EmailTone } from "../constants";
import { TONE_OPTIONS } from "../constants";
import { Toast } from "./Toast";

interface NewEmailProps {
  to: string;
  subject: string;
  inputText: string;
  outputText: string;
  isLoading: boolean;
  isSending: boolean;
  selectedTone: EmailTone;
  error: string | null;
  copied: boolean;
  ollamaStatus: boolean;
  animating: boolean;
  closing: boolean;
  toast: ToastType | null;
  emailProvider: string | null;
  onToChange: (to: string) => void;
  onSubjectChange: (subject: string) => void;
  onInputChange: (text: string) => void;
  onOutputChange: (text: string) => void;
  onToneChange: (tone: EmailTone) => void;
  onGenerate: () => void;
  onCopy: () => void;
  onSend: () => void;
  onSchedule: (scheduledAt: string) => void;
  onNavigate: (target: ViewState) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function NewEmail({
  to,
  subject,
  inputText,
  outputText,
  isLoading,
  isSending,
  selectedTone,
  error,
  copied,
  ollamaStatus,
  animating,
  closing,
  toast,
  emailProvider,
  onToChange,
  onSubjectChange,
  onInputChange,
  onOutputChange,
  onToneChange,
  onGenerate,
  onCopy,
  onSend,
  onSchedule,
  onNavigate,
  onKeyDown,
}: NewEmailProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  function handleHeaderDrag(e: React.MouseEvent) {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  }

  function handleSchedule() {
    if (!scheduleDate || !scheduleTime) return;
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    onSchedule(scheduledAt);
    setShowSchedule(false);
    setScheduleDate("");
    setScheduleTime("");
  }

  // 최소 예약 시간: 현재 시간 + 5분
  const now = new Date();
  const minDate = now.toISOString().split("T")[0];
  const minTime = now.toTimeString().slice(0, 5);

  return (
    <div
      className={`feature-screen ${animating ? "animating" : ""} ${closing ? "closing" : ""}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div className="feature-header" onMouseDown={handleHeaderDrag}>
        <button
          className="back-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("inbox");
          }}
          disabled={animating}
        >
          ←
        </button>
        <div className="feature-title">
          <span className="feature-icon">✏️</span>
          <span className="feature-name">새 메일 작성</span>
        </div>
        <div className={`connection-status ${ollamaStatus ? "online" : "offline"}`}>
          <span className="status-dot-small" />
        </div>
      </div>

      <div className="feature-content">
        <div className="compose-fields">
          <div className="compose-field">
            <label>받는 사람</label>
            <input
              type="email"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              placeholder="email@example.com"
              disabled={isSending}
            />
          </div>
          <div className="compose-field">
            <label>제목</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="메일 제목을 입력하세요"
              disabled={isSending}
            />
          </div>
        </div>

        <div className="input-section">
          <label className="input-label">내용 (AI에게 지시할 내용)</label>
          <textarea
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="예: 미팅 일정 조율 요청 메일을 작성해줘"
            disabled={isLoading}
          />
        </div>

        <div className="tone-section">
          <label className="tone-label">답변 톤</label>
          <div className="tone-buttons">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.value}
                className={`tone-btn ${selectedTone === t.value ? "active" : ""}`}
                onClick={() => onToneChange(t.value)}
                disabled={isLoading}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="generate-btn"
          onClick={onGenerate}
          disabled={isLoading || !ollamaStatus || !inputText.trim()}
        >
          {isLoading ? (
            <>
              <span className="loading-spinner" />
              생성 중...
            </>
          ) : (
            "AI로 작성하기"
          )}
        </button>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {outputText && (
          <div className="result-section">
            <div className="result-header">
              <span className="result-label">메일 내용 (수정 가능)</span>
              <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={onCopy}>
                {copied ? "✓ 복사됨" : "📋 복사"}
              </button>
            </div>
            <textarea
              className="result-textarea"
              value={outputText}
              onChange={(e) => onOutputChange(e.target.value)}
              disabled={isSending}
            />
            <div className="reply-actions">
              <button
                className="send-reply-btn"
                onClick={onSend}
                disabled={isSending || !outputText.trim() || !to.trim() || !subject.trim()}
              >
                {isSending ? (
                  <>
                    <span className="loading-spinner" />
                    전송 중...
                  </>
                ) : (
                  <>
                    <span>📤</span>
                    메일 보내기
                  </>
                )}
              </button>
              <button
                className="schedule-btn"
                onClick={() => setShowSchedule(!showSchedule)}
                disabled={isSending || !outputText.trim() || !to.trim() || !subject.trim() || !emailProvider}
              >
                <span>🕐</span>
                예약 발송
              </button>
            </div>

            {showSchedule && (
              <div className="schedule-picker">
                <div className="schedule-inputs">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={minDate}
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    min={scheduleDate === minDate ? minTime : undefined}
                  />
                </div>
                <button
                  className="schedule-confirm-btn"
                  onClick={handleSchedule}
                  disabled={!scheduleDate || !scheduleTime}
                >
                  예약 확정
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
