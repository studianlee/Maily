import { useState, useEffect, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import "./App.css";

import type { GmailMessage, EmailProvider } from "./types";
import type { FeatureType, ViewState, EmailTone } from "./constants";
import { useToast, useGmail, useOutlook, useAI, useWindowManager, useNavigation, useScheduledEmail } from "./hooks";
import { Logo, Menu, Inbox, Feature, NewEmail } from "./components";

function App() {
  // Hooks
  const { toast, showToast } = useToast();
  const gmail = useGmail();
  const outlook = useOutlook();
  const ai = useAI();
  const windowManager = useWindowManager();
  const scheduledEmail = useScheduledEmail();

  // 이메일 제공자 상태
  const [emailProvider, setEmailProvider] = useState<EmailProvider | null>(null);

  // 네비게이션 관련 상태
  const [inputText, setInputText] = useState("");
  const [selectedTone, setSelectedTone] = useState<EmailTone>("formal");
  const [copied, setCopied] = useState(false);
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null);
  const [isSending, setIsSending] = useState(false);

  // 새 이메일 작성 상태
  const [newEmailTo, setNewEmailTo] = useState("");
  const [newEmailSubject, setNewEmailSubject] = useState("");

  const navigation = useNavigation({
    onShortcutActivate: (text) => {
      setInputText(text);
      handleGoTo("email-reply");
    },
  });

  // 화면 전환 핸들러
  const handleGoTo = useCallback(async (target: ViewState) => {
    await navigation.goTo(target, windowManager.adjustWindow);

    // 화면별 상태 초기화
    if (target === "logo" || target === "menu") {
      ai.clearOutput();
    }

    if (target === "new-email") {
      setNewEmailTo("");
      setNewEmailSubject("");
      setInputText("");
      ai.clearOutput();
    }

    if (target === "inbox" && activeEmail.authenticated && activeEmail.emails.length === 0) {
      activeEmail.loadEmails();
    }
  }, [navigation, windowManager.adjustWindow, ai, gmail]);

  // 초기화
  useEffect(() => {
    ai.checkStatus();
    // Gmail, Outlook 인증 상태 확인
    gmail.checkAuth().then((isAuth) => {
      if (isAuth) setEmailProvider("gmail");
    });
    outlook.checkAuth().then((isAuth) => {
      if (isAuth && !emailProvider) setEmailProvider("outlook");
    });
    navigation.setupShortcut();
    return () => {
      navigation.cleanupShortcut();
    };
  }, []);

  // 현재 활성화된 이메일 훅
  const activeEmail = emailProvider === "outlook" ? outlook : gmail;

  // Gmail 로그인
  async function handleGmailLogin() {
    const success = await gmail.login();
    if (success) {
      setEmailProvider("gmail");
      await gmail.loadEmails();
    }
  }

  // Outlook 로그인
  async function handleOutlookLogin() {
    const success = await outlook.login();
    if (success) {
      setEmailProvider("outlook");
      await outlook.loadEmails();
    }
  }

  // 이메일 선택
  async function selectEmail(email: GmailMessage) {
    try {
      const detail = await activeEmail.getMessageDetail(email.id);
      setInputText(detail.body || detail.snippet);
      setReplyTo(detail as GmailMessage);
      ai.clearOutput();

      if (email.is_unread) {
        await activeEmail.markAsRead(email.id);
      }

      handleGoTo("email-reply");
    } catch (e) {
      activeEmail.setError("메일 상세 로딩 실패: " + e);
    }
  }

  // 로그아웃
  async function handleLogout() {
    if (emailProvider === "outlook") {
      await outlook.logout();
    } else {
      await gmail.logout();
    }
    setEmailProvider(null);
    setReplyTo(null);
  }

  // 로그인 취소
  function handleCancelLogin() {
    activeEmail.setError("로그인이 취소되었습니다.");
  }

  // 이메일 주소 추출
  function extractEmail(from: string): string {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  }

  // 답장 전송
  async function sendReply() {
    if (!replyTo || !ai.output.trim()) return;

    try {
      setIsSending(true);
      ai.setError(null);

      const to = extractEmail(replyTo.from);
      const subject = replyTo.subject.startsWith("Re:")
        ? replyTo.subject
        : `Re: ${replyTo.subject}`;

      await activeEmail.sendEmail(to, subject, ai.output);

      ai.clearOutput();
      setInputText("");
      setReplyTo(null);
      setCopied(false);
      showToast("메일이 전송되었습니다", "success");
      handleGoTo("menu");
    } catch (e) {
      showToast("메일 전송 실패", "error");
      ai.setError("메일 전송 실패: " + String(e));
    } finally {
      setIsSending(false);
    }
  }

  // 새 이메일 전송
  async function sendNewEmail() {
    if (!newEmailTo.trim() || !newEmailSubject.trim() || !ai.output.trim()) return;

    try {
      setIsSending(true);
      ai.setError(null);

      await activeEmail.sendEmail(newEmailTo.trim(), newEmailSubject.trim(), ai.output);

      ai.clearOutput();
      setInputText("");
      setNewEmailTo("");
      setNewEmailSubject("");
      setCopied(false);
      showToast("메일이 전송되었습니다", "success");
      handleGoTo("menu");
    } catch (e) {
      showToast("메일 전송 실패", "error");
      ai.setError("메일 전송 실패: " + String(e));
    } finally {
      setIsSending(false);
    }
  }

  // 이메일 예약 발송
  async function scheduleNewEmail(scheduledAt: string) {
    if (!newEmailTo.trim() || !newEmailSubject.trim() || !ai.output.trim() || !emailProvider) return;

    try {
      setIsSending(true);
      ai.setError(null);

      await scheduledEmail.createScheduled({
        provider: emailProvider,
        to: newEmailTo.trim(),
        subject: newEmailSubject.trim(),
        body: ai.output,
        scheduled_at: scheduledAt,
      });

      ai.clearOutput();
      setInputText("");
      setNewEmailTo("");
      setNewEmailSubject("");
      setCopied(false);
      showToast("메일이 예약되었습니다", "success");
      handleGoTo("menu");
    } catch (e) {
      showToast("예약 실패", "error");
      ai.setError("예약 실패: " + String(e));
    } finally {
      setIsSending(false);
    }
  }

  // AI 응답 생성
  async function generateResponse(feature: FeatureType) {
    if (!inputText.trim()) {
      ai.setError("내용을 입력해주세요.");
      return;
    }
    setCopied(false);
    await ai.generate(inputText, feature, feature === "email-reply" ? selectedTone : undefined);
  }

  // 클립보드 복사
  async function copyToClipboard() {
    try {
      await writeText(ai.output);
      setCopied(true);
      showToast("클립보드에 복사되었습니다", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("복사 실패", "error");
    }
  }

  // 키보드 단축키 핸들러
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      const target = navigation.handleEscapeKey();
      if (target) {
        handleGoTo(target);
      }
    }
    if (e.ctrlKey && e.key === "Enter") {
      const { view } = navigation;
      if (view !== "logo" && view !== "menu" && view !== "inbox" && view !== "new-email") {
        if (!ai.loading && ai.status && inputText.trim()) {
          generateResponse(view as FeatureType);
        }
      }
    }
  }

  const { view, animating, closing } = navigation;

  // === 로고 화면 ===
  if (view === "logo") {
    return (
      <Logo
        ollamaStatus={ai.status}
        animating={animating}
        onNavigate={handleGoTo}
        onExit={navigation.exit}
      />
    );
  }

  // === 메뉴 화면 ===
  if (view === "menu") {
    return (
      <Menu
        ollamaStatus={ai.status}
        animating={animating}
        closing={closing}
        toast={toast}
        onNavigate={handleGoTo}
        onExit={navigation.exit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  // === Inbox 화면 ===
  if (view === "inbox") {
    return (
      <Inbox
        authenticated={activeEmail.authenticated}
        emails={activeEmail.emails as GmailMessage[]}
        loading={activeEmail.loading}
        error={activeEmail.error}
        hasMore={emailProvider === "outlook" ? !!outlook.nextLink : !!gmail.nextPageToken}
        loadingMore={activeEmail.loadingMore}
        animating={animating}
        closing={closing}
        toast={toast}
        emailProvider={emailProvider}
        onNavigate={handleGoTo}
        onGmailLogin={handleGmailLogin}
        onOutlookLogin={handleOutlookLogin}
        onLogout={handleLogout}
        onLoadEmails={activeEmail.loadEmails}
        onLoadMore={activeEmail.loadMore}
        onSelectEmail={selectEmail}
        onCancelLogin={handleCancelLogin}
        onKeyDown={handleKeyDown}
      />
    );
  }

  // === 새 이메일 작성 화면 ===
  if (view === "new-email") {
    return (
      <NewEmail
        to={newEmailTo}
        subject={newEmailSubject}
        inputText={inputText}
        outputText={ai.output}
        isLoading={ai.loading}
        isSending={isSending}
        selectedTone={selectedTone}
        error={ai.error}
        copied={copied}
        ollamaStatus={ai.status}
        animating={animating}
        closing={closing}
        toast={toast}
        emailProvider={emailProvider}
        onToChange={setNewEmailTo}
        onSubjectChange={setNewEmailSubject}
        onInputChange={setInputText}
        onOutputChange={ai.setOutput}
        onToneChange={setSelectedTone}
        onGenerate={() => generateResponse("email-reply")}
        onCopy={copyToClipboard}
        onSend={sendNewEmail}
        onSchedule={scheduleNewEmail}
        onNavigate={handleGoTo}
        onKeyDown={handleKeyDown}
      />
    );
  }

  // === 기능 화면 ===
  return (
    <Feature
      view={view as FeatureType}
      inputText={inputText}
      outputText={ai.output}
      isLoading={ai.loading}
      isSending={isSending}
      selectedTone={selectedTone}
      error={ai.error}
      copied={copied}
      ollamaStatus={ai.status}
      animating={animating}
      closing={closing}
      replyTo={replyTo}
      toast={toast}
      onInputChange={setInputText}
      onOutputChange={ai.setOutput}
      onToneChange={setSelectedTone}
      onGenerate={() => generateResponse(view as FeatureType)}
      onCopy={copyToClipboard}
      onSendReply={sendReply}
      onNavigate={handleGoTo}
      onKeyDown={handleKeyDown}
    />
  );
}

export default App;
