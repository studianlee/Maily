import { getCurrentWindow } from "@tauri-apps/api/window";
import type { GmailMessage } from "../types";
import type { Toast as ToastType } from "../types";
import type { FeatureType, ViewState } from "../constants";
import { FEATURES, TONE_OPTIONS } from "../constants";
import type { EmailTone } from "../constants";
import { Toast } from "./Toast";

interface FeatureProps {
  view: FeatureType;
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
  replyTo: GmailMessage | null;
  toast: ToastType | null;
  onInputChange: (text: string) => void;
  onOutputChange: (text: string) => void;
  onToneChange: (tone: EmailTone) => void;
  onGenerate: () => void;
  onCopy: () => void;
  onSendReply: () => void;
  onNavigate: (target: ViewState) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

// 이메일에서 실제 주소만 추출
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export function Feature({
  view,
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
  replyTo,
  toast,
  onInputChange,
  onOutputChange,
  onToneChange,
  onGenerate,
  onCopy,
  onSendReply,
  onNavigate,
  onKeyDown,
}: FeatureProps) {
  const feature = FEATURES.find((f) => f.id === view);

  function handleHeaderDrag(e: React.MouseEvent) {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  }

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
            onNavigate("menu");
          }}
          disabled={animating}
        >
          ←
        </button>
        <div className="feature-title">
          <span className="feature-icon">{feature?.icon}</span>
          <span className="feature-name">{feature?.label}</span>
        </div>
        <div className={`connection-status ${ollamaStatus ? "online" : "offline"}`}>
          <span className="status-dot-small" />
        </div>
      </div>

      <div className="feature-content">
        <div className="input-section">
          <label className="input-label">입력</label>
          <textarea
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={feature?.desc || "내용을 입력하세요..."}
            disabled={isLoading}
          />
        </div>

        {view === "email-reply" && (
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
        )}

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
            "생성하기"
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
              <span className="result-label">결과 (수정 가능)</span>
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
            {view === "email-reply" && replyTo && (
              <div className="reply-actions">
                <div className="reply-info">
                  <div className="reply-to">
                    <span className="reply-label">받는 사람:</span>
                    <span className="reply-value">{extractEmail(replyTo.from)}</span>
                  </div>
                  <div className="reply-subject">
                    <span className="reply-label">제목:</span>
                    <span className="reply-value">
                      {replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`}
                    </span>
                  </div>
                </div>
                <button
                  className="send-reply-btn"
                  onClick={onSendReply}
                  disabled={isSending || !outputText.trim()}
                >
                  {isSending ? (
                    <>
                      <span className="loading-spinner" />
                      전송 중...
                    </>
                  ) : (
                    <>
                      <span>📤</span>
                      답장 보내기
                    </>
                  )}
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
