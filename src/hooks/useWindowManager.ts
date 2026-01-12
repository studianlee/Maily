import { useRef, useCallback } from "react";
import { getCurrentWindow, LogicalSize, LogicalPosition, currentMonitor } from "@tauri-apps/api/window";
import { WINDOW_SIZES, type ViewState } from "../constants";

export function useWindowManager() {
  const logoPositionRef = useRef<{ x: number; y: number } | null>(null);
  const menuPositionRef = useRef<{ x: number; y: number } | null>(null);

  // 창 크기 가져오기
  const getWindowSize = useCallback((view: ViewState) => {
    if (view === "logo") return WINDOW_SIZES.logo;
    if (view === "menu") return WINDOW_SIZES.menu;
    if (view === "inbox") return WINDOW_SIZES.inbox;
    if (view === "new-email") return WINDOW_SIZES["new-email"];
    return WINDOW_SIZES.feature;
  }, []);

  // 창 크기 및 위치 조정
  const adjustWindow = useCallback(async (
    currentView: ViewState,
    targetView: ViewState
  ) => {
    const win = getCurrentWindow();
    const { width: newWidth, height: newHeight } = getWindowSize(targetView);

    try {
      const position = await win.outerPosition();
      const monitor = await currentMonitor();

      if (monitor) {
        const scale = monitor.scaleFactor;
        const screenX = monitor.position.x;
        const screenY = monitor.position.y;
        const screenWidth = monitor.size.width / scale;
        const screenHeight = monitor.size.height / scale;

        const currentX = position.x / scale;
        const currentY = position.y / scale;

        // 현재 화면 위치 저장
        if (currentView === "logo" && targetView !== "logo") {
          logoPositionRef.current = { x: currentX, y: currentY };
        } else if (currentView === "menu" && targetView !== "menu" && targetView !== "logo") {
          menuPositionRef.current = { x: currentX, y: currentY };
        }

        let newX = currentX;
        let newY = currentY;
        let restorePosition = false;

        // 이전 화면으로 돌아갈 때 저장된 위치로 복원
        if (targetView === "logo" && logoPositionRef.current) {
          newX = logoPositionRef.current.x;
          newY = logoPositionRef.current.y;
          restorePosition = true;
        } else if (targetView === "menu" && currentView !== "logo" && menuPositionRef.current) {
          newX = menuPositionRef.current.x;
          newY = menuPositionRef.current.y;
          restorePosition = true;
        }

        // 복원이 아닌 경우에만 화면 경계 체크
        if (!restorePosition) {
          const padding = 10;

          if (newX + newWidth > screenX / scale + screenWidth - padding) {
            newX = screenX / scale + screenWidth - newWidth - padding;
          }
          if (newY + newHeight > screenY / scale + screenHeight - padding) {
            newY = screenY / scale + screenHeight - newHeight - padding;
          }
          if (newX < screenX / scale + padding) {
            newX = screenX / scale + padding;
          }
          if (newY < screenY / scale + padding) {
            newY = screenY / scale + padding;
          }
        }

        // 위치가 변경되었으면 부드럽게 이동
        const needsMove = Math.abs(newX - currentX) > 1 || Math.abs(newY - currentY) > 1;

        if (needsMove) {
          const duration = 200;
          const steps = 12;
          const stepTime = duration / steps;

          for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const eased = 1 - Math.pow(1 - progress, 3);

            const interpolatedX = currentX + (newX - currentX) * eased;
            const interpolatedY = currentY + (newY - currentY) * eased;

            await win.setPosition(new LogicalPosition(interpolatedX, interpolatedY));

            if (i < steps) {
              await new Promise(resolve => setTimeout(resolve, stepTime));
            }
          }
        }
      }

      await win.setSize(new LogicalSize(newWidth, newHeight));
    } catch (e) {
      console.error("Window adjustment error:", e);
    }
  }, [getWindowSize]);

  // 창 드래그 시작
  const startDrag = useCallback(() => {
    getCurrentWindow().startDragging();
  }, []);

  return {
    adjustWindow,
    startDrag,
    getWindowSize,
  };
}
