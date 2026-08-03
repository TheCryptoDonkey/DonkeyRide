import { useEffect, useRef, useState } from 'react';
import { getAuthPrivKey } from '../../services/api';
import { sendTaskChatMessage, subscribeTaskChat, CHAT_MAX_LENGTH } from '../../services/chat';
import { useT } from '../../i18n';
import type { ChatMessage } from '../../types/api';

/**
 * One tap instead of a keyboard.
 *
 * The other party is either driving or standing in the rain. Typing while
 * moving is the thing every road-safety campaign is about, and a rider
 * with cold hands does not want to spell "I'm at the side entrance"
 * either. These are the four things anybody actually says.
 */
const QUICK_REPLIES: Record<'requester' | 'provider', string[]> = {
  requester: ['chat.quick.outside', 'chat.quick.twoMinutes', 'chat.quick.whichCar', 'chat.quick.onMyWay'],
  provider: ['chat.quick.hereNow', 'chat.quick.twoMinutesAway', 'chat.quick.cantStop', 'chat.quick.whereExactly'],
};

interface ChatPanelProps {
  taskId: string;
  /** Own pubkey (hex) — distinguishes own bubbles and counts unread */
  selfPubkey: string;
  /** The other participant's pubkey (hex) — DM recipient */
  counterpartyPubkey: string;
  /** e.g. "Driver" / "Rider" from the domain profile */
  counterpartyLabel: string;
  /** Which side is typing — decides which quick replies make sense */
  role?: 'requester' | 'provider';
}

/**
 * End-to-end encrypted chat with the other participant: NIP-17
 * gift-wrapped DMs exchanged directly over public relays. The operator
 * never sees a message. History replays from the relays after a refresh.
 */
export function ChatPanel({
  taskId, selfPubkey, counterpartyPubkey, counterpartyLabel, role = 'requester',
}: ChatPanelProps) {
  const { t } = useT();
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

  const send = async (body: string) => {
    const privKey = getAuthPrivKey();
    const trimmed = body.trim();
    if (!trimmed || sending || !privKey) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendTaskChatMessage(privKey, counterpartyPubkey, taskId, trimmed);
      append(sent);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => send(text);

  if (!open) {
    return (
      <button className="btn-secondary w-full flex items-center justify-center gap-2" onClick={handleOpen}>
        <span>💬 {t('chat.open', { label: counterpartyLabel.toLowerCase() })}</span>
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
        <p className="meta-label">{t('chat.open', { label: counterpartyLabel.toLowerCase() })}</p>
        <button
          className="text-xs text-donkey-muted min-h-[44px] px-2"
          onClick={() => setOpen(false)}
          aria-label={t('chat.collapse')}
        >
          ▾ {t('chat.hide')}
        </button>
      </div>

      <div ref={listRef} className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-donkey-muted">{t('chat.empty')}</p>
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

      {/* One tap instead of a keyboard — nobody should type at 30 mph */}
      <div className="flex flex-wrap gap-1">
        {QUICK_REPLIES[role].map((key) => (
          <button
            key={key}
            type="button"
            className="text-xs font-semibold px-3 min-h-[36px] rounded-full border border-donkey-border text-donkey-text"
            disabled={sending}
            onClick={() => void send(t(key))}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          aria-label={t('chat.inputLabel')}
          placeholder={t('chat.placeholder')}
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
          {sending ? '…' : t('chat.send')}
        </button>
      </div>

      <p className="text-[10px] text-donkey-muted">
        {t('chat.e2eNote')}
      </p>

      {error && <p className="text-donkey-red text-xs">{error}</p>}
    </div>
  );
}
