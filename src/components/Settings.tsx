import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ViewState } from "../constants";
import type { ToastNotification, EmailProvider } from "../types";
import { Toast } from "./Toast";

interface SettingsProps {
  animating: boolean;
  closing: boolean;
  toast: ToastNotification | null;
  emailProvider: EmailProvider | null;
  internalDomains: string[];
  onNavigate: (target: ViewState) => void;
  onAddDomain: (domain: string) => void;
  onRemoveDomain: (domain: string) => void;
  onLogout: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function Settings({
  animating,
  closing,
  toast,
  emailProvider,
  internalDomains,
  onNavigate,
  onAddDomain,
  onRemoveDomain,
  onLogout,
  onKeyDown,
}: SettingsProps) {
  const [newDomain, setNewDomain] = useState("");
  const [activeTab, setActiveTab] = useState<"domains" | "account">("domains");

  function handleHeaderDrag(e: React.MouseEvent) {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  }

  function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (newDomain.trim()) {
      onAddDomain(newDomain.trim());
      setNewDomain("");
    }
  }

  return (
    <div
      className={`settings-screen ${animating ? "animating" : ""} ${closing ? "closing" : ""}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div className="settings-header" onMouseDown={handleHeaderDrag}>
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
        <div className="settings-title">
          <span className="settings-icon">⚙️</span>
          <span className="settings-name">설정</span>
        </div>
      </div>

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === "domains" ? "active" : ""}`}
          onClick={() => setActiveTab("domains")}
        >
          🏢 내부 도메인
        </button>
        <button
          className={`settings-tab ${activeTab === "account" ? "active" : ""}`}
          onClick={() => setActiveTab("account")}
        >
          👤 계정
        </button>
      </div>

      <div className="settings-content">
        {activeTab === "domains" && (
          <div className="settings-section">
            <div className="section-description">
              내부 도메인으로 등록된 주소에서 온 메일은 "내부" 카테고리로 분류됩니다.
            </div>

            <form className="domain-form" onSubmit={handleAddDomain}>
              <input
                type="text"
                className="domain-input"
                placeholder="예: company.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
              <button type="submit" className="domain-add-btn" disabled={!newDomain.trim()}>
                추가
              </button>
            </form>

            <div className="domain-list">
              {internalDomains.length === 0 ? (
                <div className="empty-domains">
                  <span>📭</span>
                  <p>등록된 내부 도메인이 없습니다</p>
                </div>
              ) : (
                internalDomains.map((domain) => (
                  <div key={domain} className="domain-item">
                    <span className="domain-name">{domain}</span>
                    <button
                      className="domain-remove-btn"
                      onClick={() => onRemoveDomain(domain)}
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "account" && (
          <div className="settings-section">
            <div className="account-info">
              {emailProvider ? (
                <>
                  <div className="account-status connected">
                    <span className="status-icon">
                      {emailProvider === "gmail" ? "🔴" : "🔵"}
                    </span>
                    <div className="status-text">
                      <span className="status-label">연결된 계정</span>
                      <span className="status-provider">
                        {emailProvider === "gmail" ? "Gmail" : "Outlook"}
                      </span>
                    </div>
                  </div>
                  <button className="logout-btn" onClick={onLogout}>
                    로그아웃
                  </button>
                </>
              ) : (
                <div className="account-status disconnected">
                  <span className="status-icon">⚪</span>
                  <div className="status-text">
                    <span className="status-label">연결된 계정 없음</span>
                    <span className="status-hint">받은편지함에서 로그인하세요</span>
                  </div>
                </div>
              )}
            </div>

            <div className="settings-divider" />

            <div className="app-info">
              <div className="app-info-item">
                <span className="info-label">버전</span>
                <span className="info-value">1.0.0</span>
              </div>
              <div className="app-info-item">
                <span className="info-label">개발자</span>
                <span className="info-value">Maily Team</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
