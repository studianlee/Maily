import { useState, useRef, useCallback } from "react";
import type { Toast } from "../types";

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast({ message, type });
    timeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
}
