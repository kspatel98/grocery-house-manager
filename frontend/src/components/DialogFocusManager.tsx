import { useEffect } from 'react';

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

export default function DialogFocusManager() {
  useEffect(() => {
    const body = document.body;
    let locked = false;
    let scrollY = 0;
    let lastDialog: HTMLElement | null = null;
    let previousFocus: HTMLElement | null = null;
    let lastOutsideFocus: HTMLElement | null = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = {
      position: '',
      top: '',
      left: '',
      right: '',
      width: '',
      overflow: '',
      paddingRight: '',
    };

    const lock = () => {
      if (locked) return;
      locked = true;
      scrollY = window.scrollY;
      previousFocus = lastOutsideFocus;
      previous.position = body.style.position;
      previous.top = body.style.top;
      previous.left = body.style.left;
      previous.right = body.style.right;
      previous.width = body.style.width;
      previous.overflow = body.style.overflow;
      previous.paddingRight = body.style.paddingRight;
      const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      body.classList.add('dialog-open');
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    };

    const unlock = () => {
      if (!locked) return;
      locked = false;
      body.classList.remove('dialog-open');
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      body.style.paddingRight = previous.paddingRight;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
      if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus?.focus({ preventScroll: true }));
      previousFocus = null;
      lastDialog = null;
    };

    const topDialog = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR));
      return dialogs.length ? dialogs[dialogs.length - 1] : null;
    };

    const sync = () => {
      const dialog = topDialog();
      if (dialog) {
        lock();
        if (dialog !== lastDialog) {
          lastDialog = dialog;
          if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
          requestAnimationFrame(() => {
            if (!(document.activeElement instanceof HTMLElement) || !dialog.contains(document.activeElement)) {
              dialog.focus({ preventScroll: true });
            }
          });
        }
      } else {
        unlock();
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.getElementById('root') || body, { subtree: true, childList: true });

    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = topDialog();
      if (!dialog) return;
      if (event.key === 'Escape') {
        const closeButton = dialog.querySelector<HTMLElement>('[data-dialog-close="true"]');
        if (closeButton) {
          event.preventDefault();
          closeButton.click();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
      if (!focusables.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!topDialog() && event.target instanceof HTMLElement) lastOutsideFocus = event.target;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      unlock();
    };
  }, []);

  return null;
}
