import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ViewState } from "../constants";

interface LogoProps {
  ollamaStatus: boolean;
  animating: boolean;
  onNavigate: (target: ViewState) => void;
  onExit: () => void;
}

export function Logo({ ollamaStatus, animating, onNavigate, onExit }: LogoProps) {
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
      onNavigate("menu");
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
      className={`logo-screen ${animating ? "animating" : ""}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <div className="logo-circle">
        <span className="logo-icon">✉️</span>
      </div>
      <div className={`status-dot ${ollamaStatus ? "online" : "offline"}`} />
      <button
        className="exit-btn-logo"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onExit();
        }}
        title="앱 종료"
      >
        ✕
      </button>
      <div className="expand-hint">클릭하여 열기</div>
    </div>
  );
}
