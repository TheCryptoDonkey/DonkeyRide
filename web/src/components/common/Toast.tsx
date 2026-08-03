import { useEffect, useState } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'error';
  action?: ToastAction;
  sticky?: boolean;
}

/**
 * Tiny toast/banner utility — no library, no context. showToast() can be
 * called from anywhere (services included); ToastHost renders the stack.
 */
let nextId = 1;
let toasts: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  listeners.forEach((listener) => listener([...toasts]));
}

export function showToast(message: string, opts?: {
  type?: 'info' | 'error';
  action?: ToastAction;
  sticky?: boolean;
  durationMs?: number;
}): number {
  const id = nextId++;
  // Replace duplicates of the same message so banners don't pile up
  toasts = toasts.filter((t) => t.message !== message);
  toasts.push({
    id,
    message,
    type: opts?.type || 'info',
    action: opts?.action,
    sticky: opts?.sticky,
  });
  emit();
  if (!opts?.sticky) {
    setTimeout(() => dismissToast(id), opts?.durationMs ?? 4000);
  }
  return id;
}

export function dismissToast(id: number): void {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (next: ToastItem[]) => setItems(next);
    listeners.add(listener);
    listener([...toasts]);
    return () => { listeners.delete(listener); };
  }, []);

  // The live region is rendered even when empty. A region inserted at the
  // same moment as its content is unreliably announced; a persistent one
  // that gains a child is announced every time.
  return (
    <div
      className="fixed left-3 right-3 z-[2000] space-y-2 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          // An error interrupts; an ordinary confirmation waits its turn
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 shadow-panel border text-sm max-w-md mx-auto ${
            toast.type === 'error'
              ? 'bg-donkey-red/90 border-donkey-red text-white'
              : 'bg-donkey-surface border-donkey-border text-donkey-text'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="font-bold underline underline-offset-2 min-h-[44px] px-2"
              onClick={() => {
                toast.action!.onClick();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          {/* Dismissal was a click handler on the div: no keyboard, no
              screen-reader affordance. It is a real button now. */}
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 min-h-[44px] min-w-[32px] opacity-70 hover:opacity-100"
            onClick={() => dismissToast(toast.id)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ))}
    </div>
  );
}
