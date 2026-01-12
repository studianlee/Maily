import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { GmailMessage } from "../../types";
import type { Toast as ToastType } from "../../types";
import type { ViewState } from "../../constants";
import { Toast } from "../Toast";
import { SearchBar } from "./SearchBar";
import { EmailItem } from "./EmailItem";

interface InboxProps {
  authenticated: boolean;
  emails: GmailMessage[];
  loading: boolean;
  error: string | null;
  nextPageToken: string | null;
  loadingMore: boolean;
  animating: boolean;
  closing: boolean;
  toast: ToastType | null;
  onNavigate: (target: ViewState) => void;
  onLogin: () => void;
  onLogout: () => void;
  onLoadEmails: (query?: string) => void;
  onLoadMore: (query?: string) => void;
  onSelectEmail: (email: GmailMessage) => void;
  onCancelLogin: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function Inbox({
  authenticated,
  emails,
  loading,
  error,
  nextPageToken,
  loadingMore,
  animating,
  closing,
  toast,
  onNavigate,
  onLogin,
  onLogout,
  onLoadEmails,
  onLoadMore,
  onSelectEmail,
  onCancelLogin,
  onKeyDown,
}: InboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  function handleHeaderDrag(e: React.MouseEvent) {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  }

  function handleSearch() {
    if (!searchQuery.trim()) {
      onLoadEmails();
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    onLoadEmails(searchQuery);
  }

  function handleClearSearch() {
    setSearchQuery("");
    setIsSearching(false);
    onLoadEmails();
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom < 100 && nextPageToken && !loadingMore) {
      onLoadMore(isSearching ? searchQuery : undefined);
    }
  }

  return (
    <div
      className={`inbox-screen ${animating ? "animating" : ""} ${closing ? "closing" : ""}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div className="inbox-header" onMouseDown={handleHeaderDrag}>
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
        <div className="inbox-title">
          <span className="inbox-icon">📬</span>
          <span className="inbox-name">받은편지함</span>
        </div>
        {authenticated && (
          <>
            <button
              className="compose-btn"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate("new-email");
              }}
              title="새 메일 작성"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              className={`refresh-btn ${loading ? "loading" : ""}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!loading) onLoadEmails();
              }}
              title="새로고침"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="inbox-content">
        {!authenticated ? (
          <div className="gmail-login-section">
            <div className="gmail-login-icon">📧</div>
            <h3>Gmail 연결</h3>
            {loading ? (
              <>
                <p>브라우저에서 Google 로그인을 완료해주세요.</p>
                <div className="login-waiting">
                  <span className="loading-spinner" />
                  <span>인증 대기 중...</span>
                </div>
                <button className="gmail-cancel-btn" onClick={onCancelLogin}>
                  취소
                </button>
              </>
            ) : (
              <>
                <p>Google 계정으로 로그인하여 이메일을 확인하세요.</p>
                <button className="gmail-login-btn" onClick={onLogin}>
                  <span>🔗</span>
                  Google 계정 연결
                </button>
              </>
            )}
            {error && (
              <div className="gmail-error">
                <span>⚠️</span>
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            <SearchBar
              query={searchQuery}
              loading={loading}
              onQueryChange={setSearchQuery}
              onSearch={handleSearch}
              onClear={handleClearSearch}
            />
            {isSearching && (
              <div className="search-status">
                "{searchQuery}" 검색 결과
                <button className="search-reset" onClick={handleClearSearch}>초기화</button>
              </div>
            )}
            {loading && emails.length === 0 ? (
              <div className="loading-emails">
                <span className="loading-spinner" />
                <p>이메일 불러오는 중...</p>
              </div>
            ) : error ? (
              <div className="gmail-error-section">
                <span>⚠️</span>
                <p>{error}</p>
                <button onClick={() => onLoadEmails()}>다시 시도</button>
              </div>
            ) : emails.length === 0 ? (
              <div className="empty-inbox">
                <span>{isSearching ? "🔍" : "📭"}</span>
                <p>{isSearching ? "검색 결과가 없습니다." : "받은 이메일이 없습니다."}</p>
                {isSearching && (
                  <button className="search-reset-btn" onClick={handleClearSearch}>
                    전체 목록 보기
                  </button>
                )}
              </div>
            ) : (
              <div className="email-list" onScroll={handleScroll}>
                {emails.map((email) => (
                  <EmailItem
                    key={email.id}
                    email={email}
                    onClick={() => onSelectEmail(email)}
                  />
                ))}
                {loadingMore && (
                  <div className="loading-more">
                    <span className="loading-spinner" />
                    <span>더 불러오는 중...</span>
                  </div>
                )}
                {!loadingMore && nextPageToken && (
                  <button
                    className="load-more-btn"
                    onClick={() => onLoadMore(isSearching ? searchQuery : undefined)}
                  >
                    더 보기
                  </button>
                )}
              </div>
            )}
            <div className="inbox-footer">
              <button className="logout-btn" onClick={onLogout}>
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
