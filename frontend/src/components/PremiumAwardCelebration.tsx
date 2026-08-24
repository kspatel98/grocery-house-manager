import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { PremiumCrownStats } from '../types';

type FlightBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  endScale: number;
};

type FlightState = {
  crown: FlightBox;
  badge: FlightBox;
} | null;

type Props = {
  open: boolean;
  memberName: string;
  subtext: string;
  stats: PremiumCrownStats | null;
  badgeTargetRef: RefObject<HTMLElement>;
  crownTargetRef: RefObject<HTMLElement>;
  onComplete: () => void;
};

function flightBox(source: DOMRect, target: DOMRect): FlightBox {
  const sourceCenterX = source.left + source.width / 2;
  const sourceCenterY = source.top + source.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  return {
    left: source.left,
    top: source.top,
    width: source.width,
    height: source.height,
    dx: targetCenterX - sourceCenterX,
    dy: targetCenterY - sourceCenterY,
    endScale: Math.max(0.28, Math.min(1, target.width / Math.max(source.width, 1))),
  };
}

export default function PremiumAwardCelebration({
  open,
  memberName,
  subtext,
  stats,
  badgeTargetRef,
  crownTargetRef,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'reveal' | 'fly'>('reveal');
  const [flight, setFlight] = useState<FlightState>(null);
  const crownPreviewRef = useRef<HTMLDivElement>(null);
  const badgePreviewRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);
  const flyTimeoutRef = useRef<number | null>(null);
  const finishTimeoutRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (flyTimeoutRef.current) window.clearTimeout(flyTimeoutRef.current);
    if (finishTimeoutRef.current) window.clearTimeout(finishTimeoutRef.current);
    onComplete();
  }, [onComplete]);

  const beginFlight = useCallback(() => {
    const sourceCrown = crownPreviewRef.current?.getBoundingClientRect();
    const sourceBadge = badgePreviewRef.current?.getBoundingClientRect();
    const targetCrown = crownTargetRef.current?.getBoundingClientRect();
    const targetBadge = badgeTargetRef.current?.getBoundingClientRect();

    if (!sourceCrown || !sourceBadge || !targetCrown || !targetBadge) {
      finish();
      return;
    }

    setFlight({
      crown: flightBox(sourceCrown, targetCrown),
      badge: flightBox(sourceBadge, targetBadge),
    });
    setPhase('fly');
    finishTimeoutRef.current = window.setTimeout(finish, 1450);
  }, [badgeTargetRef, crownTargetRef, finish]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    finishedRef.current = false;
    setPhase('reveal');
    setFlight(null);

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      flyTimeoutRef.current = window.setTimeout(finish, 1600);
      return () => {
        if (flyTimeoutRef.current) window.clearTimeout(flyTimeoutRef.current);
      };
    }

    flyTimeoutRef.current = window.setTimeout(beginFlight, 4400);
    return () => {
      if (flyTimeoutRef.current) window.clearTimeout(flyTimeoutRef.current);
      if (finishTimeoutRef.current) window.clearTimeout(finishTimeoutRef.current);
    };
  }, [beginFlight, finish, open]);

  if (!open) return null;

  const friendlyName = memberName.trim().split(/\s+/)[0] || 'Premium Member';
  const crownUsers = Math.max(0, stats?.crown_users || 0);
  const totalUsers = Math.max(crownUsers, stats?.total_users || 0);
  const hasLiveStats = totalUsers > 0 && crownUsers > 0;
  const confetti = Array.from({ length: 34 }, (_, index) => ({
    left: `${(index * 37 + 11) % 100}%`,
    delay: `${((index * 17) % 13) * 0.07}s`,
    duration: `${2.2 + ((index * 11) % 8) * 0.14}s`,
    rotate: `${(index * 53) % 360}deg`,
  }));

  const crownFlightStyle = flight ? ({
    left: flight.crown.left,
    top: flight.crown.top,
    width: flight.crown.width,
    height: flight.crown.height,
    '--premium-fly-x': `${flight.crown.dx}px`,
    '--premium-fly-y': `${flight.crown.dy}px`,
    '--premium-fly-x-a': `${flight.crown.dx * 0.27}px`,
    '--premium-fly-y-a': `${flight.crown.dy * 0.14 - 62}px`,
    '--premium-fly-x-b': `${flight.crown.dx * 0.78}px`,
    '--premium-fly-y-b': `${flight.crown.dy * 0.68 - 24}px`,
    '--premium-fly-scale-mid': (1 + flight.crown.endScale) / 2,
    '--premium-fly-scale': flight.crown.endScale,
  } as CSSProperties) : undefined;

  const badgeFlightStyle = flight ? ({
    left: flight.badge.left,
    top: flight.badge.top,
    width: flight.badge.width,
    height: flight.badge.height,
    '--premium-fly-x': `${flight.badge.dx}px`,
    '--premium-fly-y': `${flight.badge.dy}px`,
    '--premium-fly-x-a': `${flight.badge.dx * 0.27}px`,
    '--premium-fly-y-a': `${flight.badge.dy * 0.14 - 62}px`,
    '--premium-fly-x-b': `${flight.badge.dx * 0.78}px`,
    '--premium-fly-y-b': `${flight.badge.dy * 0.68 - 24}px`,
    '--premium-fly-scale-mid': (1 + flight.badge.endScale) / 2,
    '--premium-fly-scale': flight.badge.endScale,
  } as CSSProperties) : undefined;

  return (
    <div className={`premium-win-overlay phase-${phase}`} role="dialog" aria-modal="true" aria-labelledby="premium-win-title">
      <div className="premium-win-backdrop" aria-hidden="true" />
      <div className="premium-confetti" aria-hidden="true">
        {confetti.map((piece, index) => (
          <i
            key={index}
            className={`premium-confetti-piece piece-${index % 6}`}
            style={{ left: piece.left, animationDelay: piece.delay, animationDuration: piece.duration, rotate: piece.rotate }}
          />
        ))}
      </div>

      <div className="premium-win-stage">
        <button type="button" className="premium-win-skip" onClick={finish}>Skip animation</button>
        <div className="premium-jackpot-kicker"><span>★</span> PREMIUM JACKPOT <span>★</span></div>
        <div className="premium-jackpot-reels" aria-hidden="true">
          <span>✦</span><span className="reel-crown">👑</span><span>✦</span>
        </div>
        <p className="premium-win-super">CONGRATULATIONS</p>
        <h2 id="premium-win-title">{friendlyName}, you’ve earned the Crown.</h2>
        <p className="premium-win-copy">
          Your account now carries the <strong>Premium badge</strong> and the exclusive <strong>golden crown</strong>.
          They’ll travel to their permanent place in your header in a moment.
        </p>

        <div className="premium-award-preview-row">
          <div ref={crownPreviewRef} className="premium-award-crown-preview" aria-label="Golden premium crown">
            <span>👑</span><i aria-hidden="true" />
          </div>
          <div ref={badgePreviewRef} className="premium-award-badge-preview">
            <span className="premium-award-badge-icon">👑</span>
            <span><strong>Premium</strong><small>{subtext}</small></span>
          </div>
        </div>

        <div className="premium-member-rarity">
          <span className="premium-rarity-dot" aria-hidden="true" />
          {hasLiveStats ? (
            <p>You are one of <strong>{crownUsers.toLocaleString()}</strong> Crown Members out of <strong>{totalUsers.toLocaleString()}</strong> total users.</p>
          ) : (
            <p>You’ve joined the exclusive <strong>Crown Member</strong> circle.</p>
          )}
        </div>
        <p className="premium-win-footnote">Wear it proudly — your premium status is now visible across Grocery House Manager.</p>
      </div>

      {phase === 'fly' && flight && (
        <>
          <div className="premium-flying-crown" style={crownFlightStyle} aria-hidden="true"><span>👑</span><i /></div>
          <div className="premium-flying-badge" style={badgeFlightStyle} aria-hidden="true">
            <span className="premium-award-badge-icon">👑</span>
            <span><strong>Premium</strong><small>{subtext}</small></span>
          </div>
        </>
      )}
    </div>
  );
}
