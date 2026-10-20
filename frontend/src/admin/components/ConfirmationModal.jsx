import React, { useEffect } from "react";
import { FaExclamationTriangle, FaTrash, FaTimes, FaCheck, FaInfoCircle } from "react-icons/fa";
import "./ConfirmationModal.css";

/**
 * Reusable Confirmation & Action Modal
 * 
 * Props:
 * - isOpen (bool): whether modal is displayed
 * - title (string): modal header title
 * - message (string): primary prompt message
 * - subMessage (string|optional): extra descriptive context (e.g. "This action cannot be undone.")
 * - confirmText (string): text on primary action button (default "Confirm")
 * - cancelText (string): text on cancel button (default "Cancel")
 * - type (string): "danger" | "warning" | "info" | "success" (default "danger")
 * - onConfirm (fn): callback when user clicks confirm
 * - onCancel (fn): callback when user cancels/closes
 * - isLoading (bool): shows loading state on confirm button
 * - confirmDisabled (bool): disables confirm button
 * - children (node|optional): custom content inside modal body
 */
const ConfirmationModal = ({
  isOpen,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  subMessage,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "danger",
  onConfirm,
  onCancel,
  isLoading = false,
  confirmDisabled = false,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isLoading) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (type) {
      case "danger":
        return <FaTrash className="cm-icon cm-icon-danger" />;
      case "warning":
        return <FaExclamationTriangle className="cm-icon cm-icon-warning" />;
      case "success":
        return <FaCheck className="cm-icon cm-icon-success" />;
      case "info":
      default:
        return <FaInfoCircle className="cm-icon cm-icon-info" />;
    }
  };

  return (
    <div className="cm-modal-overlay" onClick={isLoading ? undefined : onCancel}>
      <div
        className={`cm-modal-card cm-modal-${type}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-modal-title"
      >
        <button
          type="button"
          className="cm-modal-close"
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close"
        >
          <FaTimes />
        </button>

        <div className="cm-modal-header">
          <div className={`cm-icon-bubble cm-bubble-${type}`}>{renderIcon()}</div>
          <h3 id="cm-modal-title" className="cm-modal-title">
            {title}
          </h3>
        </div>

        <div className="cm-modal-body">
          {message && <p className="cm-modal-message">{message}</p>}
          {subMessage && <p className="cm-modal-submessage">{subMessage}</p>}
          {children}
        </div>

        <div className="cm-modal-footer">
          {cancelText && (
            <button
              type="button"
              className="cm-btn cm-btn-secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={`cm-btn cm-btn-${type}`}
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
          >
            {isLoading ? (
              <span className="cm-btn-spinner-wrap">
                <span className="cm-spinner" /> Processing...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
