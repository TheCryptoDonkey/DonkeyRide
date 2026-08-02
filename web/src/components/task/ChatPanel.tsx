import { useEffect, useRef, useState } from 'react';
import { getAuthPrivKey } from '../../services/api';
import { sendTaskChatMessage, subscribeTaskChat, CHAT_MAX_LENGTH } from '../../services/chat';
import type { ChatMessage } from '../../types/api';

interface ChatPanelProps {
  taskId: string;
  /** Own pubkey (hex) — distinguishes own bubbles and counts unread */
  selfPubkey: string;
  /** The other participant's pubkey (hex) — DM recipient */
  counterpartyPubkey: string;
  /** e.g. "Driver" / "Rider" from the domain profile */
  counterpartyLabel: string;
}

/**
 * End-to-end encrypted chat with the other participant: NIP-17
 * gift-wrapped DMs exchanged directly over public relays. The operator
 * never sees a message. History replays from the relays after a refresh.
 */
export function ChatPanel({ taskId, selfPubkey, counterpartyPubkey, counterpartyLabel }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const append = (msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg].sort((a, b) => a.at - b.at);
    });
  };

  useEffect(() => {
    const privKey = getAuthPrivKey();
    if (!privKey) return;
    let closed = false;
    let handle: { close: () => void } | null = null;
    void subscribeTaskChat(privKey, selfPubkey, counterpartyPubkey, taskId, (msg) => {
      append(msg);
      if (!openRef.current && msg.from.toLowerCase() !== selfPubkey.toLowerCase()) {
        setUnread((n) => n + 1);
      }
    }).then((sub) => {
      if (closed) sub.close();
      else handle = sub;
    });
    return () => {
      closed = true;
      handle?.close();
    };
  }, [taskId, selfPubkey, counterpartyPubkey]);

  // Keep the newest message in view
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
  };

  const handleSend = async () => {
    const privKey = getAuthPrivKey();
    const trimmed = text.trim();
    if (!trimmed || sending || !privKey) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendTaskChatMessage(privKey, counterpartyPubkey, taskId, trimmed);
      append(sent);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send — try again');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button className="btn-secondary w-full flex items-center justify-center gap-2" onClick={handleOpen}>
        <span>💬 Chat with {counterpartyLabel.toLowerCase()}</span>
        {unread > 0 && (
          <span className="bg-donkey-red text-white text-xs font-bold rounded-full px-2 py-0.5">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="meta-card space-y-2">
      <div className="flex items-center justify-between">
        <p className="meta-label">Chat with {counterpartyLabel.toLowerCase()}</p>
        <button
          className="text-xs text-donkey-muted"
          onClick={() => setOpen(false)}
          aria-label="Collapse chat"
        >
          ▾ Hide
        </button>
      </div>

      <div ref={listRef} className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-donkey-muted">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const mine = msg.from.toLowerCase() === selfPubkey.toLowerCase();
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm break-words ${
                  mine
                    ? 'bg-donkey-purple/30 text-donkey-text'
                    : 'bg-donkey-card text-donkey-text'
                }`}
              >
                {msg.text}
                <span className="block text-[10px] text-donkey-muted mt-0.5">
                  {new Date(msg.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Type a message..."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          className="btn-primary px-4"
          onClick={handleSend}
          disabled={sending || !text.trim()}
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>

      <p className="text-[10px] text-donkey-muted">
        End-to-end encrypted via Nostr — the operator never sees messages.
      </p>

      {error && <p className="text-donkey-red text-xs">{error}</p>}
    </div>
  );
}
