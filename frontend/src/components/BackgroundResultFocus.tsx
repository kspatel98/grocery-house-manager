import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { markBackgroundTaskOpened } from '../backgroundTasks';

export default function BackgroundResultFocus() {
  const location = useLocation();
  useEffect(() => {
    const taskId = new URLSearchParams(location.search).get('bgTask');
    if (!taskId) return;
    let stopped = false;
    let attempts = 0;

    const selectorForRoute = () => {
      const params = new URLSearchParams(location.search);
      if (location.pathname === '/assistant') {
        return params.get('view') === 'plan'
          ? '.autopilot-plan-result[data-ghm-background-result="true"]'
          : '.v93-agent-answer[data-ghm-background-result="true"]';
      }
      return '[data-ghm-background-result="true"]';
    };

    const findAndFocus = () => {
      if (stopped) return;
      const target = document.querySelector<HTMLElement>(selectorForRoute());
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => target.focus({ preventScroll: true }), 320);
        markBackgroundTaskOpened(taskId);
        window.dispatchEvent(new CustomEvent('ghm:background-result-opened', { detail: { id: taskId } }));
        return;
      }
      attempts += 1;
      if (attempts < 30) window.setTimeout(findAndFocus, 180);
    };

    const hydrated = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id !== taskId) return;
      attempts = 0;
      window.setTimeout(findAndFocus, 60);
    };

    window.addEventListener('ghm:background-result-hydrated', hydrated);
    // Fallback for a direct/reloaded result URL where hydration may finish before
    // this effect subscribes. The delay also prevents focusing stale prior results.
    const timer = window.setTimeout(findAndFocus, 800);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('ghm:background-result-hydrated', hydrated);
    };
  }, [location.pathname, location.search]);
  return null;
}
