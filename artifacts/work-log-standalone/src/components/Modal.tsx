import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onClose: () => void;
};

export function Modal({
  open,
  title,
  children,
  primaryLabel,
  secondaryLabel = "닫기",
  onPrimary,
  onClose,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {secondaryLabel}
          </button>
          {primaryLabel && onPrimary && (
            <button type="button" className="btn primary" onClick={onPrimary}>
              {primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
