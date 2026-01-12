import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import type { ViewState } from "../constants";

interface UseNavigationOptions {
  onShortcutActivate?: (text: string) => void;
  onViewChange?: (view: ViewState) => void;
}

export function useNavigation(options: UseNavigationOptions = {}) {
  const [view, setView] = useState<ViewState>("logo");
  const [animating, setAnimating] = useState(false);
  const [closing, setClosing] = useState(false);

  // 화면 전환
  const goTo = useCallback(async (
    target: ViewState,
    adjustWindow?: (currentView: ViewState, targetView: ViewState) => Promise<void>
  ) => {
    if (animating) return;
    setAnimating(true);

    const isClosing = (view === "menu" && target === "logo") ||
                      (view !== "logo" && view !== "menu" && target === "menu");

    if (isClosing) {
      setClosing(true);
      await new Promise(resolve => setTimeout(resolve, 200));
      setClosing(false);
    }

    setView(target);
    options.onViewChange?.(target);

    if (adjustWindow) {
      await new Promise(resolve => setTimeout(resolve, 50));
      await adjustWindow(view, target);
    }

    setTimeout(() => {
      setAnimating(false);
    }, 200);
  }, [animating, view, options]);

  // 글로벌 단축키 설정
  const setupShortcut = useCallback(async () => {
    try {
      await register("Alt+S", async () => {
        const text = await readText();
        if (text) {
          options.onShortcutActivate?.(text);
          await invoke("show_window");
        }
      });
    } catch (e) {
      console.error("Shortcut error:", e);
    }
  }, [options]);

  // 단축키 해제
  const cleanupShortcut = useCallback(async () => {
    await unregister("Alt+S").catch(() => {});
  }, []);

  // 앱 종료
  const exit = useCallback(async () => {
    await invoke("exit_app");
  }, []);

  // ESC 키 핸들러
  const handleEscapeKey = useCallback(() => {
    if (view !== "logo" && view !== "menu") {
      return "menu" as ViewState;
    } else if (view === "menu") {
      return "logo" as ViewState;
    }
    return null;
  }, [view]);

  return {
    view,
    animating,
    closing,
    setView,
    goTo,
    setupShortcut,
    cleanupShortcut,
    exit,
    handleEscapeKey,
  };
}
