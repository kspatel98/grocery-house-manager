import { money } from '../currency';

export type FlyerOpenDeal = {
  merchant?: string | null;
  name: string;
  brand?: string | null;
  price?: number | null;
  priceRaw?: string | null;
  discount?: string | null;
  imageUrl?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  sourceUrl?: string | null;
  postalCode?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storeMapsUrl?: string | null;
  isBundle?: boolean;
  requestedQuantity?: number | null;
};

export default function FlyerDealModal({deal,onClose}:{deal:FlyerOpenDeal|null;onClose:()=>void}) {
  if (!deal) return null;
  const merchant = deal.merchant || deal.storeName || 'Store';
  return <div className="modal-backdrop flyer-detail-backdrop" role="presentation" onMouseDown={(event)=>{if(event.currentTarget===event.target)onClose();}}>
    <section className="modal flyer-detail-modal focus-dialog" role="dialog" aria-modal="true" aria-label="Flyer deal details">
      <div className="flyer-detail-head">
        <div>
          <p className="eyebrow">Flyer deal details</p>
          <h2 data-i18n-skip="true">{deal.name}</h2>
          <p className="small-muted" data-i18n-skip="true">{merchant}{deal.brand ? ` • ${deal.brand}` : ''}</p>
        </div>
        <button type="button" className="icon-button" data-dialog-close="true" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="flyer-detail-grid">
        <div className="flyer-detail-image">{deal.imageUrl ? <img src={deal.imageUrl} alt="" /> : <span>🛒</span>}</div>
        <div className="flyer-detail-info">
          <div className="flyer-price-row"><b>{deal.price != null ? money(deal.price,'CAD') : deal.priceRaw || 'See flyer'}</b>{deal.priceRaw && deal.price != null && !String(deal.priceRaw).includes(String(deal.price)) ? <small data-i18n-skip="true">{deal.priceRaw}</small> : null}</div>
          {deal.discount ? <div className="flyer-detail-line"><strong>Discount</strong><span data-i18n-skip="true">{deal.discount}</span></div> : null}
          <div className="flyer-detail-line"><strong>Validity</strong><span>{deal.validFrom ? new Date(deal.validFrom).toLocaleDateString() : 'Current flyer'}{deal.validTo ? ` – ${new Date(deal.validTo).toLocaleDateString()}` : ''}</span></div>
          {deal.postalCode ? <div className="flyer-detail-line"><strong>Flyer area</strong><span data-i18n-skip="true">{deal.postalCode}</span></div> : null}
          {deal.requestedQuantity != null ? <div className="flyer-detail-line"><strong>Requested quantity</strong><span data-i18n-skip="true">{deal.requestedQuantity}</span></div> : null}
          {deal.isBundle ? <div className="hint compact-message">Shown as an offer only; excluded from exact basket pricing.</div> : null}
        </div>
      </div>
      <div className="flyer-location-panel">
        <div>
          <p className="eyebrow">Nearest store location</p>
          <strong data-i18n-skip="true">{deal.storeName || merchant}</strong>
          {deal.storeAddress ? <small data-i18n-skip="true">{deal.storeAddress}</small> : <small>Exact branch address is not supplied by the flyer provider. Use Maps to find the nearest location for this flyer area.</small>}
        </div>
        <div className="market-button-row">
          {deal.storeMapsUrl ? <a className="secondary center-link" href={deal.storeMapsUrl} target="_blank" rel="noreferrer">Open in Maps</a> : null}
          {deal.sourceUrl ? <a className="primary center-link" href={deal.sourceUrl} target="_blank" rel="noreferrer">Open source deal</a> : null}
        </div>
      </div>
      <p className="small-muted flyer-location-honesty">Flyer availability is tied to the postal-code area. The nearest store shown above is a convenience lookup and may not be the branch that published the flyer.</p>
    </section>
  </div>;
}
