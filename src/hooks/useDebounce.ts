import { useState, useEffect } from "react";

/**
 * 값의 변경을 지연시키는 디바운스 훅
 * @param value 디바운스할 값
 * @param delay 지연 시간 (ms), 기본값 300ms
 * @returns 디바운스된 값
 *
 * @example
 * const [searchQuery, setSearchQuery] = useState("");
 * const debouncedQuery = useDebounce(searchQuery, 300);
 *
 * useEffect(() => {
 *   // debouncedQuery가 변경될 때만 API 호출
 *   searchAPI(debouncedQuery);
 * }, [debouncedQuery]);
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // delay 후에 값 업데이트
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // 값이 변경되면 이전 타이머 취소
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
