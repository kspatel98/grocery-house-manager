import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OverlayPortal from './OverlayPortal';
import { featureEducation, type FeatureEducationKey } from '../featureEducation';

function seenKey(feature: FeatureEducationKey) {
  return `ghm_feature_purpose_seen_v101:${feature}`;
}

export function FeatureWhyButton({ feature, label = 'Why?' }: { feature: FeatureEducationKey; label?: string }) {
  const [open, setOpen] = useState(false);
  const item = featureEducation[feature];
  return <>
    <button type="button" className="feature-why-button-v101" onClick={() => setOpen(true)}><span aria-hidden="true">ⓘ</span>{label}</button>
    {open && <FeaturePurposeDialog feature={feature} onClose={() => setOpen(false)} />}
  </>;
}

export function FeaturePurposeCard({ feature, learnPath = '/learn' }: { feature: FeatureEducationKey; learnPath?: string }) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const item = featureEducation[feature];
  useEffect(() => {
    try { setVisible(localStorage.getItem(seenKey(feature)) !== '1'); } catch { setVisible(true); }
  }, [feature]);
  const dismiss = () => {
    try { localStorage.setItem(seenKey(feature), '1'); } catch { /* no-op */ }
    setVisible(false);
  };
  if (!visible) return null;
  return <section className={`feature-purpose-card-v101 feature-${feature}`} aria-label={`Why ${item.title}`}>
    <div className="feature-purpose-icon-v101" aria-hidden="true">{item.icon}</div>
    <div className="feature-purpose-copy-v101"><small>WHY THIS EXISTS</small><strong>{item.title}</strong><p>{item.benefit}</p></div>
    <div className="feature-purpose-actions-v101">
      <button type="button" className="secondary" onClick={() => setOpen(true)}>Learn more</button>
      <button type="button" className="text-button" onClick={dismiss}>Got it</button>
    </div>
    {open && <FeaturePurposeDialog feature={feature} onClose={() => setOpen(false)} learnPath={learnPath} />}
  </section>;
}

export function FeaturePurposeDialog({ feature, onClose, learnPath = '/learn' }: { feature: FeatureEducationKey; onClose: () => void; learnPath?: string }) {
  const item = useMemo(() => featureEducation[feature], [feature]);
  return <OverlayPortal>
    <div className="modal-backdrop feature-purpose-backdrop-v101" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="modal focus-dialog feature-purpose-dialog-v101" role="dialog" aria-modal="true" aria-label={item.title}>
        <header className="focus-dialog-titlebar"><div><p className="eyebrow">WHY GHM DOES THIS</p><h2>{item.title}</h2><p>{item.problem}</p></div><button data-dialog-close="true" className="icon-btn" onClick={onClose} aria-label="Close">×</button></header>
        <div className="focus-dialog-scroll">
          <div className="feature-purpose-dialog-hero-v101"><span aria-hidden="true">{item.icon}</span><div><small>THE BENEFIT</small><strong>{item.benefit}</strong></div></div>
          <p className="feature-purpose-explanation-v101">{item.explanation}</p>
          {item.example && <div className="feature-purpose-example-v101"><small>EXAMPLE</small><p>{item.example}</p></div>}
          <div className="feature-purpose-principle-v101"><span>✦</span><div><strong>Benefit first. Details when you need them.</strong><p>GHM keeps the main screen focused and makes the deeper reason available without forcing you to read a manual.</p></div></div>
        </div>
        <footer className="focus-dialog-actions"><button className="secondary" onClick={onClose}>Close</button><Link className="primary center-link" to={learnPath} onClick={onClose}>How GHM helps</Link></footer>
      </section>
    </div>
  </OverlayPortal>;
}
