"""Non-charging diagnostics for the private GHM merchandise pilot.
Run in backend container. Does not create Stripe sessions or PrintKK orders.
Never prints API keys or customer addresses.
"""
from app.core.config import settings
from app.db.session import SessionLocal
from app.models import MerchCatalogProduct


def main():
    flags={
        'Stripe API key configured':bool(settings.stripe_secret_key),
        'Signed Stripe webhook configured':bool(settings.stripe_webhook_secret),
        'PrintKK API key configured':bool(settings.printkk_api_key),
        'Stripe Tax switch enabled':bool(settings.merch_tax_enabled),
        'Canadian shipping configured':settings.merch_shipping_cents_cad>=0,
        'Private pilot limited to one email':bool(settings.merch_pilot_email),
        'Merch checkout switch on':bool(settings.merch_checkout_enabled),
    }
    print('GHM STORE v149 — NON-CHARGING READINESS CHECK')
    for name,flag in flags.items():print(f"{'OK' if flag else 'NOT READY'} | {name}")
    print(f'Configured flat Canadian shipping quote: CA${settings.merch_shipping_cents_cad/100:.2f}')
    print('PrintKK base:',settings.printkk_api_base)
    try:
        with SessionLocal() as db:
            active=db.query(MerchCatalogProduct).filter(MerchCatalogProduct.active.is_(True)).all()
            valid=[p for p in active if p.printkk_design_id and p.price_cents_cad>0]
            print(f'Published products: {len(active)}; with price + PrintKK variant: {len(valid)}')
            for p in active:
                print(f"  {p.sku}: {'READY FOR TESTING' if p in valid else 'MISSING PRICE OR SPECIFICATION'}")
    except Exception as exc:
        print('Database check failed:',type(exc).__name__)
    print('NOTE: These checks do not test taxes, Stripe payouts, actual PrintKK API payloads, supplier costs or fulfillment. Do not interpret them as production approval.')

if __name__=='__main__':main()
