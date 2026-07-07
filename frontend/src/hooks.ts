import { useEffect, useRef } from 'react';
import { API_URL } from './api';

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

    function scheduleRefresh(delay = 900) {
      if (stopped) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        refreshRef.current();
      }, delay);
    }

    function connect() {
      if (stopped) return;
      const wsBase = API_URL.replace(/^http/i, 'ws');
      socket = new WebSocket(`${wsBase}/houses/${houseId}/updates/ws?token=${encodeURIComponent(authToken)}`);

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'house_updated') {
            scheduleRefresh();
          }
        } catch {
          // Ignore malformed websocket messages.
        }
      };

      socket.onclose = () => {
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    }

    connect();

    const onFocus = () => scheduleRefresh(1200);
    window.addEventListener('focus', onFocus);

    return () => {
      stopped = true;
      window.removeEventListener('focus', onFocus);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [houseId]);
}
