import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { OutlookMessage, OutlookMessagesResult } from "../types";

export function useOutlook() {
  const [authenticated, setAuthenticated] = useState(false);
  const [emails, setEmails] = useState<OutlookMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextLink, setNextLink] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // 토큰 자동 갱신 래퍼
  const withTokenRefresh = useCallback(async <T>(apiCall: () => Promise<T>): Promise<T> => {
    try {
      return await apiCall();
    } catch (e) {
      const errorMsg = String(e);
      if (errorMsg.includes("401") || errorMsg.includes("invalid_grant") || errorMsg.includes("로그인이 필요")) {
        try {
          await invoke("refresh_outlook_token");
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
      const loaded = await invoke<boolean>("load_outlook_tokens");
      if (loaded) {
        setAuthenticated(true);
        return true;
      }
      const isAuth = await invoke<boolean>("is_outlook_authenticated");
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
      await invoke("start_microsoft_auth");
      await invoke("save_outlook_tokens");
      setAuthenticated(true);
      return true;
    } catch (e) {
      setError("Outlook 로그인 실패: " + e);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 로그아웃
  const logout = useCallback(async () => {
    await invoke("logout_outlook");
    setAuthenticated(false);
    setEmails([]);
    setNextLink(null);
  }, []);

  // 이메일 목록 로드
  const loadEmails = useCallback(async (query?: string) => {
    try {
      setLoading(true);
      setError(null);
      setNextLink(null);

      const result = await withTokenRefresh(() =>
        invoke<OutlookMessagesResult>("get_outlook_messages", {
          maxResults: 20,
          searchQuery: query || null,
          skip: null,
        })
      );
      setEmails(result.messages);
      setNextLink(result.next_link);
    } catch (e) {
      setError("메일 로딩 실패: " + e);
    } finally {
      setLoading(false);
    }
  }, [withTokenRefresh]);

  // 추가 이메일 로드 (페이지네이션)
  const loadMore = useCallback(async (searchQuery?: string) => {
    if (loadingMore) return;

    try {
      setLoadingMore(true);
      const currentCount = emails.length;
      const result = await withTokenRefresh(() =>
        invoke<OutlookMessagesResult>("get_outlook_messages", {
          maxResults: 20,
          searchQuery: searchQuery || null,
          skip: currentCount,
        })
      );
      setEmails(prev => [...prev, ...result.messages]);
      setNextLink(result.next_link);
    } catch {
      // 추가 로딩 실패는 조용히 처리
    } finally {
      setLoadingMore(false);
    }
  }, [emails.length, loadingMore, withTokenRefresh]);

  // 이메일 상세 조회
  const getMessageDetail = useCallback(async (messageId: string) => {
    return withTokenRefresh(() =>
      invoke<OutlookMessage>("get_outlook_message_detail", { messageId })
    );
  }, [withTokenRefresh]);

  // 읽음 처리
  const markAsRead = useCallback(async (messageId: string) => {
    try {
      await withTokenRefresh(() =>
        invoke("mark_outlook_as_read", { messageId })
      );
      setEmails(prev => prev.map(e =>
        e.id === messageId ? { ...e, is_unread: false } : e
      ));
    } catch {
      // 읽음 처리 실패는 무시
    }
  }, [withTokenRefresh]);

  // 이메일 전송
  const sendEmail = useCallback(async (to: string, subject: string, body: string) => {
    return withTokenRefresh(() =>
      invoke("send_outlook", { to, subject, body })
    );
  }, [withTokenRefresh]);

  return {
    authenticated,
    emails,
    loading,
    error,
    nextLink,
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
  };
}
