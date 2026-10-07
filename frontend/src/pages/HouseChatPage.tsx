import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { Activity, House, User } from '../types';

function cachedUser(): User | null {
  const raw = localStorage.getItem('account_profile_cache') || localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
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

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load({ silent: true }), 10000);
    const onFocus = () => void load({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [id]);

  useEffect(() => {
    if (!messages.length) return;
    const behavior: ScrollBehavior = initializedRef.current ? 'smooth' : 'auto';
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    initializedRef.current = true;
  }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean || sending || !id) return;
    setSending(true);
    try {
      const response = await api.post<Activity>(`/houses/${id}/chat`, { message: clean });
      setMessages((current) => [...current, response.data]);
      setMessage('');
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
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }

  let previousDay = '';

  return (
    <main className="page house-chat-page-v105">
      <header className="chat-heading-v105">
        <div>
          <p className="eyebrow">HOUSE CHAT</p>
          <h1>{house?.name || 'Household'} chat</h1>
          <p>Keep grocery, meal and household coordination beside the things you are already managing in GHM.</p>
        </div>
        <div className="chat-heading-actions-v105">
          <Link className="secondary" to={`/houses/${id}/shopping`}>Shopping list</Link>
          <Link className="secondary" to={`/houses/${id}/expenses`}>Expenses</Link>
        </div>
      </header>

      <section className="chat-context-strip-v105" aria-label="Quick household context">
        <Link to={`/houses/${id}/shopping`}><span>🛒</span><strong>Shopping</strong><small>Share what is needed</small></Link>
        <Link to={`/houses/${id}/meals`}><span>🍲</span><strong>Meals</strong><small>Coordinate what to cook</small></Link>
        <Link to={`/houses/${id}/scan`}><span>🧾</span><strong>Receipts</strong><small>Tell the house what changed</small></Link>
        <Link to={`/houses/${id}/expenses`}><span>💸</span><strong>Expenses</strong><small>Keep money context close</small></Link>
      </section>

      <section className="chat-shell-v105">
        <div className="chat-intro-v105">
          <div className="chat-intro-icon-v105">💬</div>
          <div>
            <strong>Household coordination, not another social app.</strong>
            <p>Use this space for quick updates about groceries, meals, receipts, or shared household decisions.</p>
          </div>
        </div>

        {loadError ? <div className="status-card error">{loadError}</div> : null}

        <div className="chat-thread-v105" aria-live="polite">
          {loading ? <div className="chat-empty-v105">Loading household messages…</div> : null}
          {!loading && messages.length === 0 ? (
            <div className="chat-empty-v105">
              <span>👋</span>
              <h2>Start the house conversation</h2>
              <p>Try “I added milk to the list” or “Can we make Thepla tonight?”</p>
            </div>
          ) : null}

          {messages.map((item) => {
            const currentDay = dayLabel(item.created_at);
            const showDay = currentDay !== previousDay;
            previousDay = currentDay;
            const mine = Boolean(me?.id && item.user?.id === me.id);
            return (
              <div key={item.id}>
                {showDay ? <div className="chat-day-v105"><span>{currentDay}</span></div> : null}
                <article className={`chat-message-v105 ${mine ? 'mine' : ''}`}>
                  {!mine ? <div className="chat-avatar-v105">{initials(item.user?.full_name || item.user?.email)}</div> : null}
                  <div className="chat-bubble-v105">
                    {!mine ? <strong className="chat-author-v105">{item.user?.full_name || item.user?.email || 'House member'}</strong> : null}
                    <p>{item.message}</p>
                    <div className="chat-meta-v105">
                      <time>{timeLabel(item.created_at)}</time>
                      {(mine || house?.role === 'owner' || house?.role === 'admin') ? (
                        <button type="button" onClick={() => void removeMessage(item.id)} aria-label="Delete message">Delete</button>
                      ) : null}
                    </div>
                  </div>
                </article>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form className="chat-composer-v105" onSubmit={send}>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 1200))}
            placeholder="Message your household…"
            rows={1}
            aria-label="Household message"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="chat-composer-actions-v105">
            <small>{message.length}/1200</small>
            <button className="primary" type="submit" disabled={!message.trim() || sending}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
