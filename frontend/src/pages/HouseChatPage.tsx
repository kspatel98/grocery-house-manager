import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, House, Receipt, ShoppingList, User } from '../types';

type SharedRecipe = { id: number; name: string; base_servings?: number; cuisine?: string };
type ShareOption = {
  key: string;
  type: 'shopping_list' | 'recipe' | 'receipt';
  icon: string;
  title: string;
  subtitle: string;
  url: string;
};

const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🎉'];

function cachedUser(): User | null {
  const raw = localStorage.getItem('account_profile_cache') || localStorage.getItem('user');
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
}

function initials(name?: string) {
  const safe = String(name || 'GH').trim();
  const parts = safe.replace(/@.*/, '').split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || 'GH').toUpperCase();
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function attachmentIcon(type?: string | null) {
  if (type === 'shopping_list') return '🛒';
  if (type === 'recipe') return '🍲';
  if (type === 'restaurant') return '🍽️';
  if (type === 'receipt') return '🧾';
  if (type === 'expense') return '💸';
  return '✨';
}

export default function HouseChatPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const me = useMemo(cachedUser, []);
  const [house, setHouse] = useState<House | null>(null);
  const [messages, setMessages] = useState<Activity[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [replyTo, setReplyTo] = useState<Activity | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOptions, setShareOptions] = useState<ShareOption[]>([]);
  const [selectedShare, setSelectedShare] = useState<ShareOption | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  async function load({ silent = false } = {}) {
    if (!id) return;
    try {
      if (!silent) setLoadError('');
      const [houseRes, chatRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Activity[]>(`/houses/${id}/chat?limit=150`),
      ]);
      setHouse(houseRes.data);
      setMessages(chatRes.data || []);
    } catch (error) {
      if (!silent) setLoadError(errorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadShareOptions() {
    if (!id) return;
    const [listsResult, receiptsResult, recipesResult] = await Promise.allSettled([
      api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`),
      api.get<Receipt[]>(`/houses/${id}/receipts`),
      api.get<SharedRecipe[]>('/recipes/community/mine'),
    ]);
    const options: ShareOption[] = [];
    if (listsResult.status === 'fulfilled') {
      (listsResult.value.data || []).filter((row) => !row.is_done).slice(0, 4).forEach((row) => {
        const remaining = row.items.filter((item) => item.status !== 'skipped').length;
        options.push({ key: `list-${row.id}`, type: 'shopping_list', icon: '🛒', title: row.title, subtitle: `${remaining} item${remaining === 1 ? '' : 's'} · active shopping list`, url: `/houses/${id}/shopping?list=${row.id}` });
      });
    }
    if (receiptsResult.status === 'fulfilled') {
      (receiptsResult.value.data || []).slice(0, 3).forEach((row) => {
        const total = row.total_amount != null ? ` · $${Number(row.total_amount).toFixed(2)}` : '';
        options.push({ key: `receipt-${row.id}`, type: 'receipt', icon: '🧾', title: row.store_name || 'Grocery receipt', subtitle: `${row.receipt_date || new Date(row.created_at).toLocaleDateString()}${total}`, url: `/houses/${id}/receipts` });
      });
    }
    if (recipesResult.status === 'fulfilled') {
      (recipesResult.value.data || []).slice(0, 4).forEach((row) => {
        options.push({ key: `recipe-${row.id}`, type: 'recipe', icon: '🍲', title: row.name, subtitle: `${row.cuisine || 'Recipe'} · ${row.base_servings || 4} servings`, url: `/houses/${id}/meals?recipe=${row.id}` });
      });
    }
    setShareOptions(options);
  }

  useEffect(() => {
    setLoading(true);
    void load();
  }, [id]);

  useHouseLiveRefresh(id, () => load({ silent: true }));

  useEffect(() => {
    if (!messages.length) return;
    const behavior: ScrollBehavior = initializedRef.current ? 'smooth' : 'auto';
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    initializedRef.current = true;
  }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim();
    if ((!clean && !selectedShare) || sending || !id) return;
    setSending(true);
    try {
      const response = await api.post<Activity>(`/houses/${id}/chat`, {
        message: clean,
        reply_to_id: replyTo?.id || null,
        attachment_type: selectedShare?.type || null,
        attachment_title: selectedShare?.title || null,
        attachment_subtitle: selectedShare?.subtitle || null,
        attachment_url: selectedShare?.url || null,
      });
      setMessages((current) => [...current, response.data]);
      setMessage('');
      setReplyTo(null);
      setSelectedShare(null);
      setShareOpen(false);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(messageId: number) {
    if (!id) return;
    try {
      await api.delete(`/houses/${id}/chat/${messageId}`);
      setMessages((current) => current.filter((item) => item.id !== messageId));
    } catch (error) { setLoadError(errorMessage(error)); }
  }

  async function react(item: Activity, emoji: string) {
    if (!id) return;
    try {
      const { data } = await api.post<Activity>(`/houses/${id}/chat/${item.id}/reactions`, { emoji });
      setMessages((current) => current.map((row) => row.id === item.id ? data : row));
    } catch (error) { setLoadError(errorMessage(error)); }
  }

  async function openSharePicker() {
    const next = !shareOpen;
    setShareOpen(next);
    if (next && shareOptions.length === 0) await loadShareOptions();
  }

  let previousDay = '';

  return (
    <main className="page house-chat-page-v105 house-chat-page-v113">
      <header className="chat-heading-v105">
        <div><p className="eyebrow">HOUSE CHAT</p><h1>{house?.name || 'Household'} chat</h1><p>Share household decisions and the GHM items behind them—without leaving the app.</p></div>
        <div className="chat-heading-actions-v105"><Link className="secondary" to={`/houses/${id}/shopping`}>Shopping</Link><Link className="secondary" to={`/houses/${id}/meals`}>Meals</Link></div>
      </header>

      <section className="chat-context-strip-v105" aria-label="Quick household context">
        <Link to={`/houses/${id}/shopping`}><span>🛒</span><strong>Shopping</strong><small>Lists and trips</small></Link>
        <Link to={`/houses/${id}/meals`}><span>🍲</span><strong>Meals</strong><small>Recipes to share</small></Link>
        <Link to={`/houses/${id}/scan`}><span>🧾</span><strong>Receipts</strong><small>What changed</small></Link>
        <Link to={`/houses/${id}/expenses`}><span>💸</span><strong>Money</strong><small>Expense context</small></Link>
      </section>

      <section className="chat-shell-v105">
        {loadError ? <div className="status-card error">{loadError}</div> : null}
        <div className="chat-thread-v105" aria-live="polite">
          {loading ? <div className="chat-empty-v105">Loading household messages…</div> : null}
          {!loading && messages.length === 0 ? <div className="chat-empty-v105"><span>👋</span><h2>Start the house conversation</h2><p>Send a quick message or attach a shopping list, receipt or recipe.</p></div> : null}

          {messages.map((item) => {
            const currentDay = dayLabel(item.created_at);
            const showDay = currentDay !== previousDay;
            previousDay = currentDay;
            const mine = Boolean(me?.id && item.user?.id === me.id);
            return <div key={item.id}>
              {showDay ? <div className="chat-day-v105"><span>{currentDay}</span></div> : null}
              <article className={`chat-message-v105 ${mine ? 'mine' : ''}`}>
                {!mine ? <div className="chat-avatar-v105">{initials(item.user?.full_name || item.user?.email)}</div> : null}
                <div className="chat-bubble-v105">
                  {!mine ? <strong className="chat-author-v105">{item.user?.full_name || item.user?.email || 'House member'}</strong> : null}
                  {item.reply_to_id ? <div className="chat-reply-preview-v113"><small>↩ {item.reply_to_user_name || 'House member'}</small><span>{item.reply_to_message || 'Message'}</span></div> : null}
                  {item.message ? <p>{item.message}</p> : null}
                  {item.attachment_title ? <Link className="chat-attachment-v113" to={item.attachment_url || '#'}><span>{attachmentIcon(item.attachment_type)}</span><div><small>{String(item.attachment_type || 'GHM item').replace('_', ' ').toUpperCase()}</small><strong>{item.attachment_title}</strong>{item.attachment_subtitle ? <p>{item.attachment_subtitle}</p> : null}</div><b>Open →</b></Link> : null}
                  <div className="chat-reaction-row-v113">
                    {(item.reactions || []).map((reaction) => <button key={reaction.emoji} className={reaction.reacted_by_me ? 'active' : ''} type="button" onClick={() => void react(item, reaction.emoji)}>{reaction.emoji} <span>{reaction.count}</span></button>)}
                    <details className="chat-reaction-picker-v113"><summary aria-label="Add reaction">＋😊</summary><div>{REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => void react(item, emoji)}>{emoji}</button>)}</div></details>
                  </div>
                  <div className="chat-meta-v105"><time>{timeLabel(item.created_at)}</time><button type="button" onClick={() => setReplyTo(item)}>Reply</button>{mine ? <button type="button" className="danger-text" onClick={() => void removeMessage(item.id)} aria-label="Delete your message">Delete</button> : null}</div>
                </div>
              </article>
            </div>;
          })}
          <div ref={bottomRef} />
        </div>

        <form className="chat-composer-v105 chat-composer-v113" onSubmit={send}>
          {replyTo ? <div className="chat-compose-context-v113"><span><small>Replying to {replyTo.user?.full_name || (replyTo.user?.id === me?.id ? 'yourself' : 'house member')}</small><strong>{replyTo.message || replyTo.attachment_title || 'Shared item'}</strong></span><button type="button" onClick={() => setReplyTo(null)}>×</button></div> : null}
          {selectedShare ? <div className="chat-compose-context-v113 attachment"><span>{selectedShare.icon}</span><div><small>ATTACHED GHM ITEM</small><strong>{selectedShare.title}</strong><p>{selectedShare.subtitle}</p></div><button type="button" onClick={() => setSelectedShare(null)}>×</button></div> : null}
          {shareOpen ? <div className="chat-share-picker-v113"><div><strong>Attach from GHM</strong><small>You can also use Share from a recipe or restaurant card.</small></div>{shareOptions.length ? <div className="chat-share-options-v113">{shareOptions.map((option) => <button type="button" key={option.key} onClick={() => { setSelectedShare(option); setShareOpen(false); }}><span>{option.icon}</span><div><strong>{option.title}</strong><small>{option.subtitle}</small></div></button>)}</div> : <p className="muted">No recent shareable lists, receipts or saved recipes yet.</p>}</div> : null}
          <div className="chat-composer-main-v113"><button className="chat-attach-button-v113" type="button" onClick={() => void openSharePicker()} aria-label="Attach a GHM item">＋</button><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 1200))} placeholder="Message your household…" rows={1} aria-label="Household message" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="primary" type="submit" disabled={(!message.trim() && !selectedShare) || sending}>{sending ? 'Sending…' : 'Send'}</button></div>
          <small className="chat-char-count-v113">{message.length}/1200</small>
        </form>
      </section>
    </main>
  );
}
