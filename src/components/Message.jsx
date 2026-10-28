const DEFAULT_MESSAGES = Object.freeze({
  loading: 'Loading…',
  empty: 'No items found.',
  error: 'Something went wrong.',
  success: 'Done.',
});

const MESSAGE_KINDS = new Set(Object.keys(DEFAULT_MESSAGES));

export function getMessagePresentation({ kind = 'empty', message, onRetry } = {}) {
  const safeKind = MESSAGE_KINDS.has(kind) ? kind : 'empty';
  const safeMessage = typeof message === 'string' && message.trim()
    ? message
    : DEFAULT_MESSAGES[safeKind];

  return {
    kind: safeKind,
    message: safeMessage,
    role: safeKind === 'error' ? 'alert' : 'status',
    ariaLive: safeKind === 'error' ? 'assertive' : 'polite',
    showRetry: safeKind === 'error' && typeof onRetry === 'function',
  };
}

export default function Message({
  kind = 'empty',
  message,
  onRetry,
  onDismiss,
  retryLabel = 'Retry',
  compact = false,
}) {
  const presentation = getMessagePresentation({ kind, message, onRetry });
  const className = [
    'message',
    `message--${presentation.kind}`,
    compact ? 'message--compact' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} role={presentation.role} aria-live={presentation.ariaLive}>
      <span className="message__text">{presentation.message}</span>
      {presentation.showRetry && (
        <button className="button--secondary message__action" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
      {typeof onDismiss === 'function' && (
        <button
          className="button--secondary message__action"
          type="button"
          aria-label="Dismiss message"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
