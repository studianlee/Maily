import { useState } from "react";
import type { GmailMessage } from "../../types";
import { extractName, formatEmailDate } from "../../utils";

interface EmailItemProps {
  email: GmailMessage;
  selected?: boolean;
  showCheckbox?: boolean;
  onClick: () => void;
  onSelect?: (id: string, selected: boolean) => void;
  onDelete?: (id: string) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onStar?: (id: string, starred: boolean) => Promise<void>;
}

export function EmailItem({
  email,
  selected = false,
  showCheckbox = false,
  onClick,
  onSelect,
  onDelete,
  onArchive,
  onStar,
}: EmailItemProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete || isProcessing) return;
    setIsProcessing(true);
    try {
      await onDelete(email.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onArchive || isProcessing) return;
    setIsProcessing(true);
    try {
      await onArchive(email.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onStar || isProcessing) return;
    setIsProcessing(true);
    try {
      await onStar(email.id, !email.is_starred);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect?.(email.id, e.target.checked);
  };

  return (
    <div
      className={`email-item ${email.is_unread ? "unread" : ""} ${isProcessing ? "processing" : ""} ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      {showCheckbox && (
        <div className="email-checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxChange}
            className="email-checkbox"
          />
        </div>
      )}
      {onStar && (
        <button
          className={`email-star-btn ${email.is_starred ? "starred" : ""}`}
          onClick={handleStar}
          disabled={isProcessing}
          title={email.is_starred ? "중요 해제" : "중요 표시"}
        >
          {email.is_starred ? "★" : "☆"}
        </button>
      )}
      <div className="email-item-content">
        <div className="email-from">{extractName(email.from)}</div>
        <div className="email-subject">{email.subject}</div>
        <div className="email-snippet">{email.snippet}</div>
        <div className="email-date">{formatEmailDate(email.date)}</div>
      </div>
      {(onDelete || onArchive) && (
        <div className="email-item-actions">
          {onArchive && (
            <button
              className="email-action-btn archive-btn"
              onClick={handleArchive}
              disabled={isProcessing}
              title="보관"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              className="email-action-btn delete-btn"
              onClick={handleDelete}
              disabled={isProcessing}
              title="삭제"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
