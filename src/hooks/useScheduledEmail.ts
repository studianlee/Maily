import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ScheduledEmail {
  id: number;
  provider: string;
  to: string;
  subject: string;
  body: string;
  scheduled_at: string;
  status: string;
  created_at: string;
  error_message: string | null;
}

interface CreateScheduledEmail {
  provider: string;
  to: string;
  subject: string;
  body: string;
  scheduled_at: string;
}

export function useScheduledEmail() {
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 예약 이메일 목록 로드
  const loadScheduledEmails = useCallback(async () => {
    try {
      setLoading(true);
      const emails = await invoke<ScheduledEmail[]>("get_scheduled_emails");
      setScheduledEmails(emails);
    } catch (e) {
      setError("예약 목록 로딩 실패: " + e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 예약 이메일 생성
  const createScheduled = useCallback(async (email: CreateScheduledEmail) => {
    try {
      const created = await invoke<ScheduledEmail>("create_scheduled_email", { email });
      setScheduledEmails(prev => [...prev, created]);
      return created;
    } catch (e) {
      throw new Error("예약 생성 실패: " + e);
    }
  }, []);

  // 예약 이메일 삭제
  const deleteScheduled = useCallback(async (id: number) => {
    try {
      await invoke("delete_scheduled_email", { id });
      setScheduledEmails(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      throw new Error("예약 삭제 실패: " + e);
    }
  }, []);

  // 백엔드 이벤트 리스너 (백그라운드에서 발송 시 UI 업데이트)
  useEffect(() => {
    const unlistenSent = listen<number>("scheduled-email-sent", (event) => {
      const sentId = event.payload;
      setScheduledEmails(prev =>
        prev.map(e => e.id === sentId ? { ...e, status: "sent" } : e)
      );
    });

    const unlistenFailed = listen<{ id: number; error: string }>("scheduled-email-failed", (event) => {
      const { id, error } = event.payload;
      setScheduledEmails(prev =>
        prev.map(e => e.id === id ? { ...e, status: "failed", error_message: error } : e)
      );
    });

    return () => {
      unlistenSent.then(fn => fn());
      unlistenFailed.then(fn => fn());
    };
  }, []);

  return {
    scheduledEmails,
    loading,
    error,
    setError,
    loadScheduledEmails,
    createScheduled,
    deleteScheduled,
  };
}
