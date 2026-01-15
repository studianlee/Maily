import { useState, useRef, useCallback } from "react";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import type { ToastNotification } from "../types";

export function useToast() {
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback(async (message: string, type: ToastNotification["type"] = "info") => {
    // 기존 인앱 토스트 클리어
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast(null);

    // 시스템 알림 표시
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }

      if (permissionGranted) {
        await sendNotification({
          title: "Maily",
          body: message,
        });
      }
    } catch {
      // 알림 실패 시 인앱 토스트로 폴백
      setToast({ message, type });
      timeoutRef.current = window.setTimeout(() => {
        setToast(null);
      }, 3000);
    }
  }, []);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
}
