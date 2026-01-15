import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "maily_internal_domains";

export function useInternalDomains() {
  const [domains, setDomains] = useState<string[]>([]);

  // 로컬 스토리지에서 로드
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setDomains(JSON.parse(stored));
      }
    } catch {
      // 파싱 실패 시 무시
    }
  }, []);

  // 내부 저장 함수
  const saveDomains = useCallback((newDomains: string[]) => {
    const filtered = newDomains
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0);
    const unique = [...new Set(filtered)];
    setDomains(unique);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  }, []);

  // 도메인 추가
  const addDomain = useCallback((domain: string) => {
    const normalized = domain.trim().toLowerCase();
    if (normalized && !domains.includes(normalized)) {
      saveDomains([...domains, normalized]);
    }
  }, [domains, saveDomains]);

  // 도메인 제거
  const removeDomain = useCallback((domain: string) => {
    saveDomains(domains.filter(d => d !== domain));
  }, [domains, saveDomains]);

  return {
    domains,
    addDomain,
    removeDomain,
  };
}
