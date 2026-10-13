import { useEffect, useState } from 'react';

const SOUND_KEY = 'ghm_app_sounds_enabled_v121';
let audioContext: AudioContext | null = null;
let armed = false;

export function appSoundsEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; }
}

export function setAppSoundsEnabled(enabled: boolean) {
  try { localStorage.setItem(SOUND_KEY, enabled ? '1' : '0'); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('ghm:sound-preference', { detail: { enabled } }));
  if (enabled) armAudio();
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

export function armAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  armed = true;
}

function tone(freq: number, start: number, duration: number, gainValue = .05, type: OscillatorType = 'sine') {
  if (!appSoundsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx || !armed || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + .018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + .02);
}

export function playAppSound(kind: 'notification' | 'success' | 'start' | 'warning' | 'navigate' | 'click' | 'hover' | 'message' | 'reaction' | 'created' | 'deleted' = 'success') {
  if (!appSoundsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx || !armed || ctx.state !== 'running') return;
  const now = ctx.currentTime + .01;
  if (kind === 'notification') {
    tone(740, now, .16, .055, 'sine');
    tone(990, now + .13, .22, .052, 'sine');
  } else if (kind === 'success' || kind === 'created') {
    tone(520, now, .12, .04, 'sine');
    tone(660, now + .09, .16, .04, 'sine');
    tone(820, now + .19, .2, .04, 'sine');
  } else if (kind === 'warning') {
    tone(300, now, .16, .045, 'triangle');
    tone(240, now + .16, .22, .045, 'triangle');
  } else if (kind === 'deleted') {
    tone(360, now, .09, .032, 'triangle');
    tone(250, now + .08, .14, .028, 'triangle');
  } else if (kind === 'reaction') {
    tone(680, now, .07, .028, 'sine');
    tone(860, now + .055, .1, .026, 'sine');
  } else if (kind === 'message') {
    tone(560, now, .08, .035, 'sine');
    tone(760, now + .07, .13, .034, 'sine');
  } else if (kind === 'click') {
    tone(470, now, .045, .018, 'sine');
  } else if (kind === 'hover') {
    tone(175, now, .034, .008, 'square');
  } else if (kind === 'navigate') {
    tone(620, now, .12, .035, 'sine');
  } else {
    tone(430, now, .1, .03, 'sine');
  }
}

export function useAppSounds() {
  const [enabled, setEnabledState] = useState(appSoundsEnabled);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      setEnabledState(typeof next === 'boolean' ? next : appSoundsEnabled());
    };
    window.addEventListener('ghm:sound-preference', update);
    return () => window.removeEventListener('ghm:sound-preference', update);
  }, []);
  return { enabled, setEnabled: setAppSoundsEnabled, toggle: () => setAppSoundsEnabled(!enabled) };
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const { enabled, toggle } = useAppSounds();
  return <button type="button" className={`ghm-sound-toggle-v121 ${className}`.trim()} onClick={toggle} aria-label={enabled ? 'Mute GHM sounds' : 'Turn on GHM sounds'} title={enabled ? 'Mute GHM sounds' : 'Turn on GHM sounds'}><span aria-hidden="true">{enabled ? '🔊' : '🔇'}</span></button>;
}

export function AppSoundBridge() {
  useEffect(() => {
    const arm = () => armAudio();
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });

    const ready = () => playAppSound('notification');
    const failed = () => playAppSound('warning');
    const success = () => playAppSound('success');
    const started = () => playAppSound('start');
    const completed = () => playAppSound('success');
    const navigate = () => playAppSound('navigate');
    const semantic = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: Parameters<typeof playAppSound>[0] }>).detail?.kind;
      if (kind) playAppSound(kind);
    };

    let lastHoverTarget: Element | null = null;
    let lastHoverAt = 0;
    const actionableSelector = 'button:not(:disabled),a[href],summary,[role="button"],select,input[type="checkbox"],input[type="radio"]';
    const onGlobalClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(actionableSelector) : null;
      if (!target) return;
      playAppSound('click');
      if (navigator.vibrate && appSoundsEnabled()) navigator.vibrate(6);
    };
    const onGlobalHover = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const target = event.target instanceof Element ? event.target.closest(actionableSelector) : null;
      if (!target || target === lastHoverTarget) return;
      const now = performance.now();
      if (now - lastHoverAt < 90) return;
      lastHoverTarget = target;
      lastHoverAt = now;
      playAppSound('hover');
    };
    const onGlobalLeave = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest(actionableSelector) : null;
      if (target && target === lastHoverTarget) lastHoverTarget = null;
    };

    window.addEventListener('ghm:background-task-ready', ready);
    window.addEventListener('ghm:background-task-failed', failed);
    window.addEventListener('ghm:background-task-started', started);
    window.addEventListener('ghm:background-task-completed', completed);
    window.addEventListener('ghm:success-moment', success);
    window.addEventListener('ghm:navigate-feedback', navigate);
    window.addEventListener('ghm:ui-sound', semantic);
    document.addEventListener('click', onGlobalClick, true);
    document.addEventListener('pointerover', onGlobalHover, true);
    document.addEventListener('pointerout', onGlobalLeave, true);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('ghm:background-task-ready', ready);
      window.removeEventListener('ghm:background-task-failed', failed);
      window.removeEventListener('ghm:background-task-started', started);
      window.removeEventListener('ghm:background-task-completed', completed);
      window.removeEventListener('ghm:success-moment', success);
      window.removeEventListener('ghm:navigate-feedback', navigate);
      window.removeEventListener('ghm:ui-sound', semantic);
      document.removeEventListener('click', onGlobalClick, true);
      document.removeEventListener('pointerover', onGlobalHover, true);
      document.removeEventListener('pointerout', onGlobalLeave, true);
    };
  }, []);
  return null;
}
