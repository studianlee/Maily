import { useState, useEffect, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import "./App.css";

import type { GmailMessage, EmailProvider, AttachmentUpload } from "./types";
import type { FeatureType, ViewState, EmailTone } from "./constants";
import { useToast, useGmail, useOutlook, useAI, useWindowManager, useNavigation, useScheduledEmail, useInternalDomains } from "./hooks";
import { extractEmail } from "./utils";
import { Logo, Menu, Inbox, Feature, NewEmail, ScheduledList, Settings } from "./components";

function App() {
  // Hooks
  const { toast, showToast } = useToast();
  const gmail = useGmail();
  const outlook = useOutlook();
  const ai = useAI();
  const windowManager = useWindowManager();
  const scheduledEmail = useScheduledEmail();
  const internalDomains = useInternalDomains();

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
  const [newEmailCc, setNewEmailCc] = useState("");
  const [newEmailBcc, setNewEmailBcc] = useState("");
  const [newEmailAttachments, setNewEmailAttachments] = useState<AttachmentUpload[]>([]);

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
      setNewEmailCc("");
      setNewEmailBcc("");
      setNewEmailAttachments([]);
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

      await activeEmail.sendEmail(
        newEmailTo.trim(),
        newEmailSubject.trim(),
        ai.output,
        newEmailCc.trim() || undefined,
        newEmailBcc.trim() || undefined,
        newEmailAttachments.length > 0 ? newEmailAttachments : undefined
      );

      ai.clearOutput();
      setInputText("");
      setNewEmailTo("");
      setNewEmailSubject("");
      setNewEmailCc("");
      setNewEmailBcc("");
      setNewEmailAttachments([]);
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
        internalDomains={internalDomains.domains}
        onNavigate={handleGoTo}
        onGmailLogin={handleGmailLogin}
        onOutlookLogin={handleOutlookLogin}
        onLogout={handleLogout}
        onLoadEmails={activeEmail.loadEmails}
        onLoadMore={activeEmail.loadMore}
        onSelectEmail={selectEmail}
        onDeleteEmail={async (id) => {
          try {
            if (emailProvider === "outlook") {
              await outlook.deleteEmail(id);
            } else {
              await gmail.deleteEmail(id);
            }
            showToast("삭제되었습니다", "success");
          } catch (e) {
            showToast("삭제 실패: " + e, "error");
          }
        }}
        onArchiveEmail={async (id) => {
          try {
            if (emailProvider === "outlook") {
              await outlook.archiveEmail(id);
            } else {
              await gmail.archiveEmail(id);
            }
            showToast("보관되었습니다", "success");
          } catch (e) {
            showToast("보관 실패: " + e, "error");
          }
        }}
        onStarEmail={async (id, starred) => {
          try {
            if (emailProvider === "outlook") {
              await outlook.flagEmail(id, starred);
            } else {
              await gmail.starEmail(id, starred);
            }
            showToast(starred ? "중요 표시됨" : "중요 해제됨", "success");
          } catch (e) {
            showToast("중요 표시 실패: " + e, "error");
          }
        }}
        onBulkDelete={async (ids) => {
          try {
            for (const id of ids) {
              if (emailProvider === "outlook") {
                await outlook.deleteEmail(id);
              } else {
                await gmail.deleteEmail(id);
              }
            }
            showToast(`${ids.length}개 삭제됨`, "success");
          } catch (e) {
            showToast("일괄 삭제 실패: " + e, "error");
          }
        }}
        onBulkArchive={async (ids) => {
          try {
            for (const id of ids) {
              if (emailProvider === "outlook") {
                await outlook.archiveEmail(id);
              } else {
                await gmail.archiveEmail(id);
              }
            }
            showToast(`${ids.length}개 보관됨`, "success");
          } catch (e) {
            showToast("일괄 보관 실패: " + e, "error");
          }
        }}
        onCancelLogin={handleCancelLogin}
        onKeyDown={handleKeyDown}
      />
    );
  }

  // === 예약 메일 목록 화면 ===
  if (view === "scheduled") {
    return (
      <ScheduledList
        scheduledEmails={scheduledEmail.scheduledEmails}
        loading={scheduledEmail.loading}
        animating={animating}
        closing={closing}
        toast={toast}
        onNavigate={handleGoTo}
        onLoad={scheduledEmail.loadScheduledEmails}
        onDelete={async (id) => {
          try {
            await scheduledEmail.deleteScheduled(id);
            showToast("예약이 취소되었습니다", "success");
          } catch {
            showToast("취소 실패", "error");
          }
        }}
        onKeyDown={handleKeyDown}
      />
    );
  }

  // === 설정 화면 ===
  if (view === "settings") {
    return (
      <Settings
        animating={animating}
        closing={closing}
        toast={toast}
        emailProvider={emailProvider}
        internalDomains={internalDomains.domains}
        onNavigate={handleGoTo}
        onAddDomain={internalDomains.addDomain}
        onRemoveDomain={internalDomains.removeDomain}
        onLogout={handleLogout}
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
        cc={newEmailCc}
        bcc={newEmailBcc}
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
        attachments={newEmailAttachments}
        onToChange={setNewEmailTo}
        onSubjectChange={setNewEmailSubject}
        onCcChange={setNewEmailCc}
        onBccChange={setNewEmailBcc}
        onInputChange={setInputText}
        onOutputChange={ai.setOutput}
        onToneChange={setSelectedTone}
        onGenerate={() => generateResponse("email-reply")}
        onCopy={copyToClipboard}
        onSend={sendNewEmail}
        onSchedule={scheduleNewEmail}
        onNavigate={handleGoTo}
        onKeyDown={handleKeyDown}
        onAttachmentsChange={setNewEmailAttachments}
      />
    );
  }

  // === 이메일 답변 화면 ===
  return (
    <Feature
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
      onDownloadAttachment={async (messageId, attachmentId, filename) => {
        try {
          const savedPath = await activeEmail.downloadAttachment(messageId, attachmentId, filename);
          showToast(`${filename} 다운로드 완료`, "success");
          return savedPath;
        } catch (e) {
          showToast("다운로드 실패: " + e, "error");
          throw e;
        }
      }}
    />
  );
}

export default App;
