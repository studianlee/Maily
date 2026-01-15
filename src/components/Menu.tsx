import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ViewState } from "../constants";
import type { ToastNotification } from "../types";
import { Toast } from "./Toast";

interface MenuProps {
  ollamaStatus: boolean;
  animating: boolean;
  closing: boolean;
  toast: ToastNotification | null;
  onNavigate: (target: ViewState) => void;
  onExit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function Menu({
  ollamaStatus,
  animating,
  closing,
  toast,
  onNavigate,
  onExit,
  onKeyDown,
}: MenuProps) {
  const dragTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    isDraggingRef.current = false;

    dragTimerRef.current = window.setTimeout(() => {
      isDraggingRef.current = true;
      getCurrentWindow().startDragging();
    }, 150);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button !== 0) return;

    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }

    if (!isDraggingRef.current) {
      onNavigate("logo");
    }

    isDraggingRef.current = false;
  }

  function handleMouseLeave() {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
  }

  return (
    <div
      className={`menu-screen ${animating ? "animating" : ""} ${closing ? "closing" : ""}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div
        className="menu-header"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="menu-logo">
          <span>✉️</span>
        </div>
      </div>
      <div className="menu-items">
        <button
          className="menu-btn gmail-btn"
          style={{ animationDelay: "0ms" }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("inbox");
          }}
          disabled={animating}
          title="받은편지함"
        >
          <span className="menu-btn-icon">📬</span>
          <span className="menu-btn-label">메일함</span>
        </button>
        <button
          className="menu-btn scheduled-btn"
          style={{ animationDelay: "60ms" }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("scheduled");
          }}
          disabled={animating}
          title="예약된 메일"
        >
          <span className="menu-btn-icon">🕐</span>
          <span className="menu-btn-label">예약</span>
        </button>
        <button
          className="menu-btn new-email-btn"
          style={{ animationDelay: "120ms" }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("new-email");
          }}
          disabled={!ollamaStatus || animating}
          title="새 메일 작성"
        >
          <span className="menu-btn-icon">✏️</span>
          <span className="menu-btn-label">새 메일</span>
        </button>
      </div>
      <div className="menu-footer">
        <div className={`menu-status ${ollamaStatus ? "online" : "offline"}`}>
          <span className="status-indicator" />
          {ollamaStatus ? "AI 연결됨" : "AI 오프라인"}
        </div>
        <div className="menu-footer-buttons">
          <button
            className="settings-btn-menu"
            onClick={() => onNavigate("settings")}
            title="설정"
          >
            ⚙️
          </button>
          <button className="exit-btn-menu" onClick={onExit} title="앱 종료">
            ✕
          </button>
        </div>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
