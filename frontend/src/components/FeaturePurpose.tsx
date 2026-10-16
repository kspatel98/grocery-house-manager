import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OverlayPortal from './OverlayPortal';
import { featureEducation, type FeatureEducationKey } from '../featureEducation';


export function FeatureWhyButton({ feature, label = 'Why?' }: { feature: FeatureEducationKey; label?: string }) {
  const [open, setOpen] = useState(false);
  const item = featureEducation[feature];
  return <>
    <button type="button" className="feature-why-button-v101" onClick={() => setOpen(true)}><span aria-hidden="true">ⓘ</span>{label}</button>
    {open && <FeaturePurposeDialog feature={feature} onClose={() => setOpen(false)} />}
  </>;
}

export function FeaturePurposeCard({ feature: _feature, learnPath: _learnPath = '/learn' }: { feature: FeatureEducationKey; learnPath?: string }) {
  // V134: education stays available through the compact Why? link. Large duplicate
  // purpose cards consumed valuable mobile space and repeated the same information.
  return null;
}

export function FeaturePurposeDialog({ feature, onClose, learnPath = '/learn' }: { feature: FeatureEducationKey; onClose: () => void; learnPath?: string }) {
  const item = useMemo(() => featureEducation[feature], [feature]);
  return <OverlayPortal>
    <div className="modal-backdrop feature-purpose-backdrop-v101" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="modal focus-dialog feature-purpose-dialog-v101" role="dialog" aria-modal="true" aria-label={item.title}>
        <header className="focus-dialog-titlebar"><div><p className="eyebrow">WHY GHM DOES THIS</p><h2>{item.title}</h2><p>{item.problem}</p></div><button data-dialog-close="true" className="icon-btn" onClick={onClose} aria-label="Close">×</button></header>
        <div className="focus-dialog-scroll feature-purpose-scroll-v105">
          <div className="feature-purpose-dialog-hero-v101 feature-purpose-dialog-hero-v105"><span aria-hidden="true">{item.icon}</span><div><small>WHY THIS HELPS</small><strong>{item.benefit}</strong></div></div>
          <section className="feature-purpose-detail-v105"><small>HOW IT WORKS</small><p className="feature-purpose-explanation-v101">{item.explanation}</p></section>
          {item.example && <div className="feature-purpose-example-v101 feature-purpose-example-v105"><small>EXAMPLE</small><p>{item.example}</p></div>}
        </div>
        <footer className="focus-dialog-actions feature-purpose-actions-v105"><button className="primary" onClick={onClose}>Got it</button><Link className="secondary center-link" to={learnPath} onClick={onClose}>How GHM helps</Link></footer>
      </section>
    </div>
  </OverlayPortal>;
}
