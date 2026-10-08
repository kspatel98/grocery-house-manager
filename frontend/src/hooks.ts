import { useEffect, useRef } from 'react';
import { websocketApiBase } from './api';

/**
 * Live household refresh without turning a short network/PgBouncer interruption
 * into a request storm. WebSocket reconnects use bounded backoff and page-data
 * refreshes are coalesced/throttled.
 */
export function useHouseLiveRefresh(houseId: number, onRefresh: () => void | Promise<void>) {
  const refreshRef = useRef(onRefresh);
  const debounceRef = useRef<number | undefined>(undefined);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!houseId || !token) return;
    const authToken = token;

    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let lastRefreshAt = 0;
    let refreshInFlight = false;

    function scheduleRefresh(delay = 1200) {
      if (stopped) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(async () => {
        if (stopped || refreshInFlight) return;
        const now = Date.now();
        if (now - lastRefreshAt < 4000) return;
        refreshInFlight = true;
        lastRefreshAt = now;
        try {
          await refreshRef.current();
        } finally {
          refreshInFlight = false;
        }
      }, delay);
    }

    function connect() {
      if (stopped || document.hidden || !navigator.onLine) return;
      const wsBase = websocketApiBase();
      socket = new WebSocket(`${wsBase}/houses/${houseId}/updates/ws?token=${encodeURIComponent(authToken)}`);

      socket.onopen = () => {
        reconnectAttempt = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'house_updated') scheduleRefresh();
        } catch {
          // Ignore malformed websocket messages.
        }
      };

      socket.onclose = () => {
        socket = null;
        if (stopped || document.hidden || !navigator.onLine) return;
        reconnectAttempt += 1;
        const delay = Math.min(2000 * Math.pow(2, Math.min(reconnectAttempt - 1, 4)), 30000);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose owns reconnect scheduling. Avoid duplicate reconnect timers.
        socket?.close();
      };
    }

    connect();

    let lastFocusRefresh = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh < 45000) return;
      lastFocusRefresh = now;
      scheduleRefresh(900);
      if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    };
    const onOnline = () => {
      reconnectAttempt = 0;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      connect();
      scheduleRefresh(1000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        // Background tabs do not need a live household socket. Closing it saves
        // server work and prevents many sleeping tabs/devices from polling forever.
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        if (socket && socket.readyState <= WebSocket.OPEN) {
          socket.close(1000, 'page hidden');
        }
        socket = null;
        return;
      }
      if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [houseId]);
}
