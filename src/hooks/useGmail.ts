import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GmailMessage, GmailMessagesResult, AttachmentUpload } from "../types";

export function useGmail() {
  const [authenticated, setAuthenticated] = useState(false);
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // 토큰 자동 갱신 래퍼
  const withTokenRefresh = useCallback(async <T>(apiCall: () => Promise<T>): Promise<T> => {
    try {
      return await apiCall();
    } catch (e) {
      const errorMsg = String(e);
      if (errorMsg.includes("401") || errorMsg.includes("invalid_grant") || errorMsg.includes("로그인이 필요")) {
        try {
          await invoke("refresh_gmail_token");
          return await apiCall();
        } catch {
          setAuthenticated(false);
          setEmails([]);
          throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
        }
      }
      throw e;
    }
  }, []);

  // 인증 상태 확인
  const checkAuth = useCallback(async () => {
    try {
      const loaded = await invoke<boolean>("load_gmail_tokens");
      if (loaded) {
        setAuthenticated(true);
        return true;
      }
      const isAuth = await invoke<boolean>("is_gmail_authenticated");
      setAuthenticated(isAuth);
      return isAuth;
    } catch {
      setAuthenticated(false);
      return false;
    }
  }, []);

  // 로그인
  const login = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      await invoke("start_google_auth");
      await invoke("save_gmail_tokens");
      setAuthenticated(true);
      return true;
    } catch (e) {
      setError("Gmail 로그인 실패: " + e);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 로그아웃
  const logout = useCallback(async () => {
    await invoke("logout_gmail");
    await invoke("clear_email_cache").catch(() => {});
    setAuthenticated(false);
    setEmails([]);
    setNextPageToken(null);
  }, []);

  // 캐시에서 이메일 로드
  const loadFromCache = useCallback(async () => {
    try {
      const cached = await invoke<GmailMessage[] | null>("load_email_cache");
      if (cached && cached.length > 0) {
        setEmails(cached);
        return true;
      }
    } catch {
      // 캐시 로드 실패는 무시
    }
    return false;
  }, []);

  // 이메일 목록 로드
  const loadEmails = useCallback(async (query?: string, skipCache = false) => {
    try {
      setLoading(true);
      setError(null);
      setNextPageToken(null);

      // 캐시된 이메일 먼저 표시 (검색이 아닐 때만)
      if (!skipCache && !query) {
        await loadFromCache();
      }

      const result = await withTokenRefresh(() =>
        invoke<GmailMessagesResult>("get_gmail_messages", {
          maxResults: 20,
          searchQuery: query || null,
          pageToken: null,
        })
      );
      setEmails(result.messages);
      setNextPageToken(result.next_page_token);

      // 새 이메일 캐시 저장 (검색이 아닐 때만)
      if (!query && result.messages.length > 0) {
        invoke("save_email_cache", { emails: result.messages }).catch(() => {});
      }
    } catch (e) {
      setError("메일 로딩 실패: " + e);
    } finally {
      setLoading(false);
    }
  }, [loadFromCache, withTokenRefresh]);

  // 추가 이메일 로드 (페이지네이션)
  const loadMore = useCallback(async (searchQuery?: string) => {
    if (!nextPageToken || loadingMore) return;

    try {
      setLoadingMore(true);
      const result = await withTokenRefresh(() =>
        invoke<GmailMessagesResult>("get_gmail_messages", {
          maxResults: 20,
          searchQuery: searchQuery || null,
          pageToken: nextPageToken,
        })
      );
      setEmails(prev => [...prev, ...result.messages]);
      setNextPageToken(result.next_page_token);
    } catch {
      // 추가 로딩 실패는 조용히 처리
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, withTokenRefresh]);

  // 이메일 상세 조회
  const getMessageDetail = useCallback(async (messageId: string) => {
    return withTokenRefresh(() =>
      invoke<GmailMessage>("get_gmail_message_detail", { messageId })
    );
  }, [withTokenRefresh]);

  // 읽음 처리
  const markAsRead = useCallback(async (messageId: string) => {
    try {
      await withTokenRefresh(() =>
        invoke("mark_as_read", { messageId })
      );
      setEmails(prev => prev.map(e =>
        e.id === messageId ? { ...e, is_unread: false } : e
      ));
    } catch {
      // 읽음 처리 실패는 무시
    }
  }, [withTokenRefresh]);

  // 이메일 전송
  const sendEmail = useCallback(async (
    to: string,
    subject: string,
    body: string,
    cc?: string,
    bcc?: string,
    attachments?: AttachmentUpload[]
  ) => {
    return withTokenRefresh(() =>
      invoke("send_gmail", { to, subject, body, cc, bcc, attachments })
    );
  }, [withTokenRefresh]);

  // 중요 표시 (별표)
  const starEmail = useCallback(async (messageId: string, starred: boolean) => {
    await withTokenRefresh(() =>
      invoke("star_gmail_message", { messageId, starred })
    );
    setEmails(prev => prev.map(e =>
      e.id === messageId ? { ...e, is_starred: starred } : e
    ));
  }, [withTokenRefresh]);

  // 이메일 삭제 (휴지통으로 이동)
  const deleteEmail = useCallback(async (messageId: string) => {
    await withTokenRefresh(() =>
      invoke("delete_gmail_message", { messageId })
    );
    setEmails(prev => prev.filter(e => e.id !== messageId));
  }, [withTokenRefresh]);

  // 이메일 보관 (아카이브)
  const archiveEmail = useCallback(async (messageId: string) => {
    await withTokenRefresh(() =>
      invoke("archive_gmail_message", { messageId })
    );
    setEmails(prev => prev.filter(e => e.id !== messageId));
  }, [withTokenRefresh]);

  // 첨부파일 다운로드
  const downloadAttachment = useCallback(async (
    messageId: string,
    attachmentId: string,
    filename: string
  ): Promise<string> => {
    return withTokenRefresh(() =>
      invoke<string>("download_gmail_attachment", { messageId, attachmentId, filename })
    );
  }, [withTokenRefresh]);

  return {
    authenticated,
    emails,
    loading,
    error,
    nextPageToken,
    loadingMore,
    setEmails,
    setError,
    checkAuth,
    login,
    logout,
    loadEmails,
    loadMore,
    getMessageDetail,
    markAsRead,
    sendEmail,
    starEmail,
    deleteEmail,
    archiveEmail,
    downloadAttachment,
  };
}
