import { useEffect } from 'react';
import './Toast.css';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
  title?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Toast({ message, type, onClose, duration = 5000, title, action }: ToastProps) {
  useEffect(() => {
    // Don't auto-close warning/error toasts - user should explicitly dismiss
    if (type === 'error' || type === 'warning') {
      return;
    }

    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose, type]);

  return (
    <div className={`toast toast-${type} toast-enhanced`} role="alert">
      <div className="toast-header">
        <span className="toast-icon-large">{getIcon(type)}</span>
        <div className="toast-title-section">
          {title && <div className="toast-title">{title}</div>}
          <div className="toast-message">{message}</div>
        </div>
        <button
          className="toast-close"
          onClick={onClose}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
      {action && (
        <div className="toast-action">
          <button
            className="toast-action-btn"
            onClick={() => {
              action.onClick();
              onClose();
            }}
          >
            {action.label}
          </button>
        </div>
      )}
      {(type === 'success' || type === 'info') && (
        <div className="toast-progress">
          <div
            className="toast-progress-bar"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  );
}

function getIcon(type: string): string {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    case 'warning':
      return '⚠';
    case 'info':
    default:
      return 'ℹ';
  }
}
