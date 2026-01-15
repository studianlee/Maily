import { useState, useMemo, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { GmailMessage, EmailProvider, EmailCategory } from "../../types";
import type { ToastNotification } from "../../types";
import type { ViewState } from "../../constants";
import { EMAIL_CATEGORIES } from "../../types";
import { Toast } from "../Toast";
import { SearchBar } from "./SearchBar";
import { EmailItem } from "./EmailItem";
import { filterByCategory, getCategoryCounts } from "../../utils/emailCategorizer";
import { useDebounce } from "../../hooks";

interface InboxProps {
  authenticated: boolean;
  emails: GmailMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  animating: boolean;
  closing: boolean;
  toast: ToastNotification | null;
  emailProvider: EmailProvider | null;
  internalDomains: string[];
  onNavigate: (target: ViewState) => void;
  onGmailLogin: () => void;
  onOutlookLogin: () => void;
  onLogout: () => void;
  onLoadEmails: (query?: string) => void;
  onLoadMore: (query?: string) => void;
  onSelectEmail: (email: GmailMessage) => void;
  onDeleteEmail: (id: string) => Promise<void>;
  onArchiveEmail: (id: string) => Promise<void>;
  onStarEmail: (id: string, starred: boolean) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkArchive: (ids: string[]) => Promise<void>;
  onCancelLogin: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function Inbox({
  authenticated,
  emails,
  loading,
  error,
  hasMore,
  loadingMore,
  animating,
  closing,
  toast,
  emailProvider,
  internalDomains,
  onNavigate,
  onGmailLogin,
  onOutlookLogin,
  onLogout,
  onLoadEmails,
  onLoadMore,
  onSelectEmail,
  onDeleteEmail,
  onArchiveEmail,
  onStarEmail,
  onBulkDelete,
  onBulkArchive,
  onCancelLogin,
  onKeyDown,
}: InboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState<EmailCategory>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // 검색어 디바운스 (300ms 대기 후 검색 실행)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const isFirstRender = useRef(true);

  // 디바운스된 검색어가 변경되면 자동 검색
  useEffect(() => {
    // 첫 렌더링 시에는 검색하지 않음
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // 인증되지 않았으면 검색하지 않음
    if (!authenticated) return;

    // 검색어가 있으면 검색 실행
    if (debouncedSearchQuery.trim()) {
      setIsSearching(true);
      onLoadEmails(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, authenticated]);

  // 카테고리별 이메일 개수
  const categoryCounts = useMemo(
    () => getCategoryCounts(emails, internalDomains),
    [emails, internalDomains]
  );

  // 필터링된 이메일 목록
  const filteredEmails = useMemo(
    () => filterByCategory(emails, activeCategory, internalDomains),
    [emails, activeCategory, internalDomains]
  );

  function handleHeaderDrag(e: React.MouseEvent) {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  }

  // Enter 키나 버튼 클릭 시 즉시 검색 (디바운스 대기하지 않음)
  function handleSearch() {
    if (!searchQuery.trim()) {
      onLoadEmails();
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    onLoadEmails(searchQuery);
  }

  // 검색어 지우기 및 전체 목록 로드
  function handleClearSearch() {
    setSearchQuery("");
    setIsSearching(false);
    onLoadEmails();
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom < 100 && hasMore && !loadingMore) {
      onLoadMore(isSearching ? searchQuery : undefined);
    }
  }

  // 일괄 선택 관련 함수들
  function toggleSelectionMode() {
    setSelectionMode(!selectionMode);
    if (selectionMode) {
      setSelectedIds(new Set());
    }
  }

  function handleSelectEmail(id: string, selected: boolean) {
    const newSet = new Set(selectedIds);
    if (selected) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  }

  function selectAll() {
    const allIds = new Set(filteredEmails.map(e => e.id));
    setSelectedIds(allIds);
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || bulkProcessing) return;
    setBulkProcessing(true);
    try {
      await onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setBulkProcessing(false);
    }
  }

  async function handleBulkArchive() {
    if (selectedIds.size === 0 || bulkProcessing) return;
    setBulkProcessing(true);
    try {
      await onBulkArchive(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setBulkProcessing(false);
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
            <span className="provider-badge-header">
              {emailProvider === "outlook" ? "🔵" : "🔴"}
            </span>
            <button
              className={`select-mode-btn ${selectionMode ? "active" : ""}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelectionMode();
              }}
              title={selectionMode ? "선택 취소" : "선택 모드"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
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
            <button
              className="logout-btn-header"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLogout();
              }}
              title="로그아웃"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="inbox-content">
        {!authenticated ? (
          <div className="gmail-login-section">
            <div className="gmail-login-icon">📧</div>
            <h3>이메일 연결</h3>
            {loading ? (
              <>
                <p>브라우저에서 로그인을 완료해주세요.</p>
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
                <p>계정으로 로그인하여 이메일을 확인하세요.</p>
                <div className="email-provider-buttons">
                  <button className="gmail-login-btn" onClick={onGmailLogin}>
                    <span>🔴</span>
                    Gmail 연결
                  </button>
                  <button className="outlook-login-btn" onClick={onOutlookLogin}>
                    <span>🔵</span>
                    Outlook 연결
                  </button>
                </div>
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
            {selectionMode && (
              <div className="bulk-actions-bar">
                <div className="bulk-select-controls">
                  <button onClick={selectAll} disabled={bulkProcessing}>전체 선택</button>
                  <button onClick={deselectAll} disabled={bulkProcessing}>선택 해제</button>
                  <span className="selected-count">{selectedIds.size}개 선택됨</span>
                </div>
                <div className="bulk-action-buttons">
                  <button
                    className="bulk-archive-btn"
                    onClick={handleBulkArchive}
                    disabled={selectedIds.size === 0 || bulkProcessing}
                  >
                    {bulkProcessing ? "처리 중..." : "보관"}
                  </button>
                  <button
                    className="bulk-delete-btn"
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0 || bulkProcessing}
                  >
                    {bulkProcessing ? "처리 중..." : "삭제"}
                  </button>
                </div>
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
            ) : filteredEmails.length === 0 ? (
              <div className="empty-inbox">
                <span>{isSearching ? "🔍" : EMAIL_CATEGORIES.find(c => c.id === activeCategory)?.icon || "📭"}</span>
                <p>
                  {isSearching
                    ? "검색 결과가 없습니다."
                    : activeCategory === "all"
                      ? "받은 이메일이 없습니다."
                      : `${EMAIL_CATEGORIES.find(c => c.id === activeCategory)?.label || ""} 메일이 없습니다.`}
                </p>
                {(isSearching || activeCategory !== "all") && (
                  <button className="search-reset-btn" onClick={() => {
                    handleClearSearch();
                    setActiveCategory("all");
                  }}>
                    전체 목록 보기
                  </button>
                )}
              </div>
            ) : (
              <div className="email-list" onScroll={handleScroll}>
                {filteredEmails.map((email) => (
                  <EmailItem
                    key={email.id}
                    email={email}
                    selected={selectedIds.has(email.id)}
                    showCheckbox={selectionMode}
                    onClick={() => onSelectEmail(email)}
                    onSelect={handleSelectEmail}
                    onDelete={onDeleteEmail}
                    onArchive={onArchiveEmail}
                    onStar={onStarEmail}
                  />
                ))}
                {loadingMore && (
                  <div className="loading-more">
                    <span className="loading-spinner" />
                    <span>더 불러오는 중...</span>
                  </div>
                )}
                {!loadingMore && hasMore && (
                  <button
                    className="load-more-btn"
                    onClick={() => onLoadMore(isSearching ? searchQuery : undefined)}
                  >
                    더 보기
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 하단 카테고리 탭바 */}
      {authenticated && (
        <div className="category-tabbar">
          {EMAIL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`tabbar-item ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
            >
              <span className="tabbar-icon">{cat.icon}</span>
              <span className="tabbar-label">{cat.label}</span>
              {cat.id !== "all" && categoryCounts[cat.id] > 0 && (
                <span className="tabbar-badge">{categoryCounts[cat.id]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
