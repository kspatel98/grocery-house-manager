import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  clearPendingBackgroundResultFocus,
  markBackgroundTaskOpened,
  pendingBackgroundResultFocus,
} from '../backgroundTasks';

export default function BackgroundResultFocus() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const taskId = params.get('bgTask') || pendingBackgroundResultFocus();
    if (!taskId) return;

    let stopped = false;
    let focused = false;
    let observer: MutationObserver | null = null;
    let retryTimer = 0;
    const startedAt = Date.now();

    const selectorForRoute = () => {
      if (location.pathname === '/assistant') {
        return params.get('view') === 'plan'
          ? '.autopilot-plan-result[data-ghm-background-result="true"]'
          : '.v93-agent-answer[data-ghm-background-result="true"]';
      }
      return '[data-ghm-background-result="true"]';
    };

    const finish = (target: HTMLElement) => {
      if (stopped || focused) return;
      focused = true;
      target.setAttribute('tabindex', '-1');
      target.classList.add('ghm-background-result-focus-v123');
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      window.setTimeout(() => {
        target.focus({ preventScroll: true });
        target.classList.remove('ghm-background-result-focus-v123');
      }, 360);
      markBackgroundTaskOpened(taskId);
      clearPendingBackgroundResultFocus(taskId);
      window.dispatchEvent(new CustomEvent('ghm:background-result-opened', { detail: { id: taskId } }));
      observer?.disconnect();
      window.clearTimeout(retryTimer);
    };

    const findAndFocus = () => {
      if (stopped || focused) return;
      const target = document.querySelector<HTMLElement>(selectorForRoute());
      if (target) {
        finish(target);
        return;
      }
      if (Date.now() - startedAt < 60000) retryTimer = window.setTimeout(findAndFocus, 180);
    };

    const hydrated = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === taskId) window.setTimeout(findAndFocus, 0);
    };

    const focusRequested = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === taskId) window.setTimeout(findAndFocus, 0);
    };

    window.addEventListener('ghm:background-result-hydrated', hydrated);
    window.addEventListener('ghm:background-focus-requested', focusRequested);
    observer = new MutationObserver(findAndFocus);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ghm-background-result'] });
    // Run immediately, then keep retrying while the destination page hydrates.
    findAndFocus();

    return () => {
      stopped = true;
      observer?.disconnect();
      window.clearTimeout(retryTimer);
      window.removeEventListener('ghm:background-result-hydrated', hydrated);
      window.removeEventListener('ghm:background-focus-requested', focusRequested);
    };
  }, [location.pathname, location.search]);

  return null;
}
