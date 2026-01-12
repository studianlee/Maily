import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { SYSTEM_PROMPTS, TONE_OPTIONS, type FeatureType, type EmailTone } from "../constants";

export function useAI() {
  const [status, setStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Ollama 연결 상태 확인
  const checkStatus = useCallback(async () => {
    try {
      const isOnline = await invoke<boolean>("check_ollama_status");
      setStatus(isOnline);
      return isOnline;
    } catch {
      setStatus(false);
      return false;
    }
  }, []);

  // AI 응답 생성 (스트리밍)
  const generate = useCallback(async (
    prompt: string,
    feature: FeatureType,
    tone?: EmailTone
  ) => {
    if (!prompt.trim()) {
      setError("내용을 입력해주세요.");
      return false;
    }

    setLoading(true);
    setError(null);
    setOutput("");

    let systemPrompt = SYSTEM_PROMPTS[feature];

    // 이메일 답변의 경우 톤 정보 추가
    if (feature === "email-reply" && tone) {
      const toneOption = TONE_OPTIONS.find(t => t.value === tone);
      if (toneOption) {
        systemPrompt = `${systemPrompt} ${toneOption.prompt} 작성해주세요.`;
      }
    }

    let unlistenChunk: UnlistenFn | null = null;
    let unlistenDone: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;
    let accumulatedText = "";

    const cleanup = () => {
      if (unlistenChunk) unlistenChunk();
      if (unlistenDone) unlistenDone();
      if (unlistenError) unlistenError();
    };

    try {
      unlistenChunk = await listen<string>("ai-stream-chunk", (event) => {
        accumulatedText += event.payload;
        setOutput(accumulatedText);
      });

      unlistenDone = await listen("ai-stream-done", () => {
        setLoading(false);
        cleanup();
      });

      unlistenError = await listen<string>("ai-stream-error", (event) => {
        setError("AI 응답 생성 실패: " + event.payload);
        setLoading(false);
        cleanup();
      });

      await invoke("generate_ai_response_stream", {
        prompt,
        model: null,
        systemPrompt,
      });

      return true;
    } catch (err) {
      setError("AI 응답 생성 실패: " + err);
      setLoading(false);
      cleanup();
      return false;
    }
  }, []);

  const clearOutput = useCallback(() => {
    setOutput("");
    setError(null);
  }, []);

  return {
    status,
    loading,
    output,
    error,
    setOutput,
    setError,
    checkStatus,
    generate,
    clearOutput,
  };
}
