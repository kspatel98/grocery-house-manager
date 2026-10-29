"""PrintKK account API adapter. No implicit retries for order creation or payment.

API signatures and exact request/response structures MUST be validated against
https://api-docs.printkk.com/ using the account's staging credentials before
MERCH_CHECKOUT_ENABLED or PRINTKK_AUTO_PAY is switched on.
"""
import logging
import requests
from app.core.config import settings

log=logging.getLogger(__name__)
class PrintKKError(RuntimeError): pass

class PrintKKClient:
    def __init__(self, api_key=None):
        self.key=api_key or settings.printkk_api_key
        if not self.key:raise PrintKKError('PRINTKK_API_KEY is missing')
        base=settings.printkk_api_base.rstrip('/')
        if not base.startswith('https://api.printkk.com/'):
            raise PrintKKError('Only the official PrintKK HTTPS endpoint is permitted.')
        self.base=base
    def call(self,method,path,payload=None,params=None):
        if not path.startswith('/api/v1/') or '?' in path or '..' in path:
            raise PrintKKError('Invalid PrintKK endpoint.')
        try:
            r=requests.request(method,self.base+path,headers={'Api-Key':self.key,'Accept':'application/json'},
                json=payload if method!='GET' else None, params=params if method=='GET' else None, timeout=(5,18),allow_redirects=False)
            r.raise_for_status()
            data=r.json()
            if data.get('success') is not True:
                raise PrintKKError('PrintKK refused the operation: '+str(data.get('msg') or data.get('code'))[:200])
            return data.get('data') or {}
        except PrintKKError:raise
        except requests.HTTPError as e:
            status=e.response.status_code if e.response is not None else 0
            if status in (401,403):
                raise PrintKKError(f'PrintKK denied API access (HTTP {status}). Verify API key validity, permissions, and PrintKK API endpoint; do not share the key.') from e
            if status==404:
                raise PrintKKError('PrintKK API endpoint returned 404. Confirm the endpoint and API base in PrintKK documentation.') from e
            if status==429:
                raise PrintKKError('PrintKK API request limit reached (429). Retry later.') from e
            raise PrintKKError(f'PrintKK API returned HTTP {status}; check the server logs and provider status.') from e
        except requests.Timeout as e:
            if method=='GET':
                raise PrintKKError('PrintKK read-only request timed out. Check server connectivity to api.printkk.com, and retry; no order or payment was created.') from e
            raise PrintKKError('PrintKK order/payment response timed out; reconcile in PrintKK before retrying.') from e
        except requests.ConnectionError as e:
            if method=='GET':
                raise PrintKKError('Cannot connect to PrintKK API. Verify DNS, outbound HTTPS/443, and PRINTKK_API_BASE on the GHM server.') from e
            raise PrintKKError('PrintKK order/payment connection failed; reconcile before retrying.') from e
        except requests.RequestException as e:
            raise PrintKKError('PrintKK request failed; check server connectivity and logs. Never retry uncertain order payments automatically.') from e
        except ValueError as e:raise PrintKKError('PrintKK did not return valid JSON.') from e
    def design_page(self, page=1, size=15):
        """Read-only list of owner's saved PrintKK designs; no fulfillment costs."""
        if not 1 <= page <= 100 or not 1 <= size <= 30:
            raise PrintKKError('Invalid design pagination.')
        return self.call('GET','/api/v1/design/page',params={'pageNum':page,'pageSize':size})
    def design_detail(self, code):
        import re
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,140}',str(code)):
            raise PrintKKError('Invalid design code.')
        return self.call('GET',f'/api/v1/design/{code}')
    def order_detail(self,order_id):
        if not str(order_id).isdigit():raise PrintKKError('Invalid supplier ID')
        return self.call('GET',f'/api/v1/order/{order_id}')
    def pay(self,order_id):
        return self.call('POST','/api/v1/pay/wallet',{'orderId':order_id})
    def payment(self,order_id):
        if not str(order_id).isdigit():raise PrintKKError('Invalid supplier ID')
        return self.call('GET',f'/api/v1/pay/{order_id}')
    def cancel(self,order_id):
        if not str(order_id).isdigit():raise PrintKKError('Invalid supplier ID')
        return self.call('PUT',f'/api/v1/order/cancel/{order_id}',{})
    def create_order(self,order):
        """Draft creation, intentionally never charged during this API call.

        Only admin invokes this, after user payment; payload mirrors public API
        concepts, but supplier-specific acceptance must be proved with a real
        non-customer pilot. On timeout the DB blocks resubmission automatically.
        """
        import json
        a=json.loads(order.shipping_address_json)
        items=json.loads(order.items_json)
        payload={
            'externalOrderId':order.public_id,
            'orderItems':[{'designSpecificationCode':x['printkk_design_specification_code'],
                           'quantity':x['quantity']} for x in items],
            'shippingAddress':{
                'firstName':a['name'].split(' ')[0],
                'lastName':' '.join(a['name'].split(' ')[1:]) or '-',
                'address1':a['line1'],'address2':a.get('line2') or '',
                'city':a['city'],'state':a['province'], 'postalCode':a['postal_code'],
                'country':'CA','phone':a.get('phone') or ''},
            'shippingType':['economy','standard','express']}
        return self.call('POST','/api/v1/order',payload)
