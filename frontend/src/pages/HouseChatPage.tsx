import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import OverlayPortal from '../components/OverlayPortal';
import { playAppSound } from '../appSounds';
import { useHouseLiveRefresh } from '../hooks';
import type { Activity, ExpenseSummary, House, Receipt, ShoppingList, User } from '../types';

type SharedRecipe = { id: number; name: string; base_servings?: number; cuisine?: string };
type ShareOption = {
  key: string;
  type: 'shopping_list' | 'recipe' | 'receipt' | 'expense';
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
  const [shareLoading, setShareLoading] = useState(false);
  const [shareQuery, setShareQuery] = useState('');
  const [shareKind, setShareKind] = useState<'all' | ShareOption['type']>('all');
  const [selectedShare, setSelectedShare] = useState<ShareOption | null>(null);
  const [deletePending, setDeletePending] = useState<Activity | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);
  const latestMessageIdRef = useRef<number | null>(null);

  async function load({ silent = false } = {}) {
    if (!id) return;
    try {
      if (!silent) setLoadError('');
      const [houseRes, chatRes] = await Promise.all([
        api.get<House>(`/houses/${id}`),
        api.get<Activity[]>(`/houses/${id}/chat?limit=150`),
      ]);
      setHouse(houseRes.data);
      const nextMessages = chatRes.data || [];
      const latest = nextMessages.reduce<Activity | null>((current, row) => (!current || row.id > current.id ? row : current), null);
      if (latestMessageIdRef.current != null && latest && latest.id > latestMessageIdRef.current && latest.user?.id !== me?.id) playAppSound('message');
      latestMessageIdRef.current = latest?.id || latestMessageIdRef.current;
      setMessages(nextMessages);
    } catch (error) {
      if (!silent) setLoadError(errorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadShareOptions() {
    if (!id) return;
    setShareLoading(true);
    try {
      const [listsResult, receiptsResult, recipesResult, expensesResult] = await Promise.allSettled([
        api.get<ShoppingList[]>(`/houses/${id}/shopping-lists`, { params: { include_done: true } }),
        api.get<Receipt[]>(`/houses/${id}/receipts`),
        api.get<SharedRecipe[]>('/recipes/community/mine'),
        api.get<ExpenseSummary>(`/houses/${id}/expenses`),
      ]);
      const options: ShareOption[] = [];
      if (listsResult.status === 'fulfilled') {
        (listsResult.value.data || []).slice(0, 30).forEach((row) => {
          const remaining = row.items.filter((item) => item.status !== 'skipped').length;
          options.push({ key: `list-${row.id}`, type: 'shopping_list', icon: '🛒', title: row.title, subtitle: `${remaining} item${remaining === 1 ? '' : 's'} · ${row.is_done ? 'completed' : 'active'} shopping list`, url: `/houses/${id}/shopping?list=${row.id}` });
        });
      }
      if (receiptsResult.status === 'fulfilled') {
        (receiptsResult.value.data || []).slice(0, 30).forEach((row) => {
          const total = row.total_amount != null ? ` · $${Number(row.total_amount).toFixed(2)}` : '';
          options.push({ key: `receipt-${row.id}`, type: 'receipt', icon: '🧾', title: row.store_name || 'Grocery receipt', subtitle: `${row.receipt_date || new Date(row.created_at).toLocaleDateString()}${total}`, url: `/houses/${id}/receipts` });
        });
      }
      if (recipesResult.status === 'fulfilled') {
        (recipesResult.value.data || []).slice(0, 30).forEach((row) => {
          options.push({ key: `recipe-${row.id}`, type: 'recipe', icon: '🍲', title: row.name, subtitle: `${row.cuisine || 'Recipe'} · ${row.base_servings || 4} servings`, url: `/houses/${id}/meals?recipe=${row.id}` });
        });
      }
      if (expensesResult.status === 'fulfilled') {
        (expensesResult.value.data?.expenses || []).slice(0, 30).forEach((row) => {
          options.push({ key: `expense-${row.id}`, type: 'expense', icon: '💸', title: row.title, subtitle: `${row.category} · ${row.currency || 'CAD'} ${Number(row.amount).toFixed(2)} · ${row.expense_date}`, url: `/houses/${id}/expenses/${row.expense_month}` });
        });
      }
      setShareOptions(options);
    } finally {
      setShareLoading(false);
    }
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
      if (messageInputRef.current) messageInputRef.current.style.height = '';
      latestMessageIdRef.current = response.data.id;
      playAppSound('message');
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
      setDeletePending(null);
      playAppSound('deleted');
    } catch (error) { setLoadError(errorMessage(error)); }
  }

  function beginReply(item: Activity) {
    setReplyTo(item);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => messageInputRef.current?.focus({ preventScroll: true }), 220);
    });
  }

  async function react(item: Activity, emoji: string) {
    if (!id) return;
    try {
      const { data } = await api.post<Activity>(`/houses/${id}/chat/${item.id}/reactions`, { emoji });
      setMessages((current) => current.map((row) => row.id === item.id ? data : row));
      playAppSound('reaction');
    } catch (error) { setLoadError(errorMessage(error)); }
  }

  async function openSharePicker() {
    setShareOpen(true);
    setShareQuery('');
    setShareKind('all');
    if (shareOptions.length === 0) await loadShareOptions();
  }

  const filteredShareOptions = useMemo(() => {
    const query = shareQuery.trim().toLowerCase();
    return shareOptions.filter((option) => {
      if (shareKind !== 'all' && option.type !== shareKind) return false;
      if (!query) return true;
      return `${option.title} ${option.subtitle}`.toLowerCase().includes(query);
    });
  }, [shareOptions, shareKind, shareQuery]);

  function chooseShare(option: ShareOption) {
    setSelectedShare(option);
    setShareOpen(false);
    window.setTimeout(() => messageInputRef.current?.focus({ preventScroll: true }), 80);
  }

  function resizeComposerInput(input: HTMLTextAreaElement) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(112, Math.max(50, input.scrollHeight))}px`;
  }

  let previousDay = '';

  return (
    <main className="page house-chat-page-v105 house-chat-page-v113 v133-house-chat-page">
      <section className="chat-shell-v105 v133-house-chat-shell">
        <div className="v133-house-chat-scroll">
          <section className="v133-house-chat-intro" aria-label="Household chat">
            <div><p className="eyebrow">HOUSE CHAT</p><strong>{house?.name || 'Household'}</strong><small>Messages and shared GHM items stay together here.</small></div>
          </section>
          <section className="chat-context-strip-v105 v133-house-chat-context" aria-label="Quick household context">
            <Link to={`/houses/${id}/shopping`}><span>🛒</span><strong>Shopping</strong><small>Lists and trips</small></Link>
            <Link to={`/houses/${id}/meals`}><span>🍲</span><strong>Meals</strong><small>Recipes to share</small></Link>
            <Link to={`/houses/${id}/scan`}><span>🧾</span><strong>Receipts</strong><small>What changed</small></Link>
            <Link to={`/houses/${id}/expenses`}><span>💸</span><strong>Money</strong><small>Expense context</small></Link>
          </section>
          {loadError ? <div className="status-card error">{loadError}</div> : null}
          <div className="chat-thread-v105 v133-house-chat-thread" aria-live="polite">
          {loading ? <div className="chat-empty-v105">Loading household messages…</div> : null}
          {!loading && messages.length === 0 ? <div className="chat-empty-v105"><span>👋</span><h2>Start the house conversation</h2><p>Send a quick message or attach a shopping list, receipt or recipe.</p></div> : null}

          {messages.map((item) => {
            const currentDay = dayLabel(item.created_at);
            const showDay = currentDay !== previousDay;
            previousDay = currentDay;
            const mine = Boolean(me?.id && item.user?.id === me.id);
            return <div key={item.id}>
              {showDay ? <div className="chat-day-v105"><span>{currentDay}</span></div> : null}
              <article className={`chat-message-v105 v133-house-chat-message ${mine ? 'mine' : ''}`}>
                <div className="chat-avatar-v105 v133-house-chat-avatar" aria-hidden="true">{(item.user?.avatar_url || (mine ? me?.avatar_url : '')) ? <img src={item.user?.avatar_url || me?.avatar_url} alt="" /> : <span>{initials(item.user?.full_name || item.user?.email || (mine ? me?.full_name || me?.email : 'House member'))}</span>}</div>
                <div className="chat-bubble-v105">
                  {!mine ? <strong className="chat-author-v105">{item.user?.full_name || item.user?.email || 'House member'}</strong> : null}
                  {item.reply_to_id ? <div className="chat-reply-preview-v113"><small>↩ {item.reply_to_user_name || 'House member'}</small><span>{item.reply_to_message || 'Message'}</span></div> : null}
                  {item.message ? <p>{item.message}</p> : null}
                  {item.attachment_title ? <Link className="chat-attachment-v113" to={item.attachment_url || '#'}><span>{attachmentIcon(item.attachment_type)}</span><div><small>{String(item.attachment_type || 'GHM item').replace('_', ' ').toUpperCase()}</small><strong>{item.attachment_title}</strong>{item.attachment_subtitle ? <p>{item.attachment_subtitle}</p> : null}</div><b>Open →</b></Link> : null}
                  <div className="chat-reaction-row-v113">
                    {(item.reactions || []).map((reaction) => <button key={reaction.emoji} className={reaction.reacted_by_me ? 'active' : ''} type="button" onClick={() => void react(item, reaction.emoji)}>{reaction.emoji} <span>{reaction.count}</span></button>)}
                    <details className="chat-reaction-picker-v113 chat-reaction-picker-v122" onToggle={(event) => { const details = event.currentTarget; if (!details.open) return; const rect = details.getBoundingClientRect(); const menuWidth = 250; details.dataset.side = window.innerWidth - rect.right < menuWidth && rect.left > menuWidth ? 'left' : 'right'; }}><summary aria-label="Add reaction">＋😊</summary><div>{REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={(event) => { (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); void react(item, emoji); }}>{emoji}</button>)}</div></details>
                  </div>
                  <div className="chat-meta-v105"><time>{timeLabel(item.created_at)}</time><button type="button" onClick={() => beginReply(item)}>Reply</button>{mine ? <button type="button" className="danger-text" onClick={() => { setDeletePending(item); playAppSound('warning'); }} aria-label="Delete your message">Delete</button> : null}</div>
                </div>
              </article>
            </div>;
          })}
            <div ref={bottomRef} />
          </div>
        </div>

        <form ref={composerRef} className="chat-composer-v105 chat-composer-v113 chat-composer-v122 v133-house-chat-composer" onSubmit={send}>
          {replyTo ? <div className="chat-compose-context-v113"><span><small>Replying to {replyTo.user?.full_name || (replyTo.user?.id === me?.id ? 'yourself' : 'house member')}</small><strong>{replyTo.message || replyTo.attachment_title || 'Shared item'}</strong></span><button type="button" onClick={() => setReplyTo(null)}>×</button></div> : null}
          {selectedShare ? <div className="chat-compose-context-v113 attachment"><span>{selectedShare.icon}</span><div><small>ATTACHED GHM ITEM</small><strong>{selectedShare.title}</strong><p>{selectedShare.subtitle}</p></div><button type="button" onClick={() => setSelectedShare(null)}>×</button></div> : null}
          <div className="chat-composer-main-v113"><button className="chat-attach-button-v113" type="button" onClick={() => void openSharePicker()} aria-label="Attach a GHM item">＋</button><textarea ref={messageInputRef} value={message} onChange={(event) => { setMessage(event.target.value.slice(0, 1200)); resizeComposerInput(event.currentTarget); }} placeholder="Message your household…" rows={1} aria-label="Household message" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="primary" type="submit" disabled={(!message.trim() && !selectedShare) || sending}>{sending ? 'Sending…' : 'Send'}</button></div>
          {message.length ? <small className="chat-char-count-v113">{message.length}/1200</small> : null}
        </form>
      </section>

      {shareOpen ? <OverlayPortal><div className="modal-backdrop chat-attach-backdrop-v123" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShareOpen(false); }}><section className="chat-attach-picker-v123" role="dialog" aria-modal="true" aria-label="Choose what to attach"><header><div><p className="eyebrow">ATTACH FROM GHM</p><h2>Choose what to share</h2><p>Attach a shopping list, receipt, recipe or household expense to this message.</p></div><button type="button" aria-label="Close attachment picker" onClick={() => setShareOpen(false)}>×</button></header><div className="chat-attach-controls-v123"><input autoFocus value={shareQuery} onChange={(event) => setShareQuery(event.target.value)} placeholder="Search your household items…" aria-label="Search attachments"/><div className="chat-attach-tabs-v123">{([['all','All'],['shopping_list','Lists'],['receipt','Receipts'],['recipe','Recipes'],['expense','Expenses']] as const).map(([key,label]) => <button type="button" key={key} className={shareKind === key ? 'active' : ''} onClick={() => setShareKind(key)}>{label}</button>)}</div></div><div className="chat-attach-list-v123">{shareLoading ? <p className="muted">Loading your shareable GHM items…</p> : filteredShareOptions.length ? filteredShareOptions.map((option) => <button type="button" key={option.key} onClick={() => chooseShare(option)}><span>{option.icon}</span><div><strong>{option.title}</strong><small>{option.subtitle}</small></div><b>Attach</b></button>) : <div className="chat-attach-empty-v123"><span>＋</span><strong>No matching item</strong><small>Try another category or search term.</small></div>}</div></section></div></OverlayPortal> : null}

      {deletePending ? <OverlayPortal><div className="modal-backdrop chat-delete-confirm-backdrop-v122" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDeletePending(null); }}><section className="modal focus-dialog chat-delete-confirm-v122" role="dialog" aria-modal="true" aria-label="Delete message?"><header className="focus-dialog-titlebar"><div><p className="eyebrow">CONFIRM DELETE</p><h2>Delete this message?</h2><p>This removes it from the household chat. This action cannot be undone.</p></div><button type="button" data-dialog-close="true" aria-label="Cancel delete" onClick={() => setDeletePending(null)}>×</button></header><div className="chat-delete-preview-v122">{deletePending.message || deletePending.attachment_title || 'Shared household item'}</div><footer className="focus-dialog-actions"><button className="secondary" type="button" onClick={() => setDeletePending(null)}>Cancel</button><button className="danger" type="button" onClick={() => void removeMessage(deletePending.id)}>Delete message</button></footer></section></div></OverlayPortal> : null}
    </main>
  );
}
