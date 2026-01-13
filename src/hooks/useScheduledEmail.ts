import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

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

  // 예약 이메일 발송 체크 (백그라운드)
  const checkAndSend = useCallback(async () => {
    try {
      const sentIds = await invoke<number[]>("check_and_send_scheduled_emails");
      if (sentIds.length > 0) {
        // 발송된 이메일 상태 업데이트
        setScheduledEmails(prev =>
          prev.map(e => sentIds.includes(e.id) ? { ...e, status: "sent" } : e)
        );
      }
      return sentIds;
    } catch {
      // 백그라운드 체크 실패는 무시
      return [];
    }
  }, []);

  // 주기적으로 발송 체크 (1분마다)
  useEffect(() => {
    const interval = setInterval(() => {
      checkAndSend();
    }, 60000);

    // 초기 로드 시에도 체크
    checkAndSend();

    return () => clearInterval(interval);
  }, [checkAndSend]);

  return {
    scheduledEmails,
    loading,
    error,
    setError,
    loadScheduledEmails,
    createScheduled,
    deleteScheduled,
    checkAndSend,
  };
}
