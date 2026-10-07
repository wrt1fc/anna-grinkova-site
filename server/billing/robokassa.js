import { createHash, timingSafeEqual } from 'node:crypto';

const PAY_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const RECURRING_URL = 'https://auth.robokassa.ru/Merchant/Recurring';
const STATE_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt';
const TIMEOUT_MS = 15_000;
const ALGORITHMS = new Set(['md5', 'sha256', 'sha384', 'sha512']);
// OpStateExt state codes: 5 created, 10 canceled, 50 in progress, 60 refunded, 80 suspended, 100 paid.
const STATES = { 100: 'succeeded', 60: 'refunded', 10: 'canceled' };
const FOREIGN_CURRENCIES = new Set(['USD', 'EUR', 'KZT']);

const amount = (minor) => (minor / 100).toFixed(2);
const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? null;
const block = (xml, name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '';

// Robokassa adapter, used for cards of foreign banks (Visa/Mastercard from abroad, prices in USD/EUR).
// The payment link and the ResultURL callback are signed with two different shop passwords,
// and the state is re-read through OpStateExt before access is granted.
export function createRobokassa({ merchantLogin, password1, password2, hashAlgorithm = 'sha256', isTest = false, fetchImpl = fetch }) {
  if (!merchantLogin || !password1 || !password2) return null;
  if (!ALGORITHMS.has(hashAlgorithm)) throw new Error('Unsupported Robokassa hash algorithm');
  const hash = (text) => createHash(hashAlgorithm).update(text, 'utf8').digest('hex').toUpperCase();
  const sameHash = (expected, received) => {
    const a = Buffer.from(expected), b = Buffer.from(String(received ?? '').toUpperCase());
    return a.length === b.length && timingSafeEqual(a, b);
  };

  async function recurring({ order, description, previousInvoiceId }) {
    const outSum = amount(order.amountKop);
    const form = new URLSearchParams({ MerchantLogin: merchantLogin, InvoiceID: String(order.invoiceNo), PreviousInvoiceID: previousInvoiceId,
      OutSum: outSum, Description: description.slice(0, 100), Shp_order: order.id,
      SignatureValue: hash(`${merchantLogin}:${outSum}:${order.invoiceNo}:${password1}:Shp_order=${order.id}`) });
    const response = await fetchImpl(RECURRING_URL, { method: 'POST', body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    if (!response.ok || !text.startsWith('OK')) throw new Error(`Robokassa recurring ${response.status}: ${text.slice(0, 80)}`);
    return { id: String(order.invoiceNo), status: 'pending', confirmationUrl: null };
  }

  return {
    name: 'robokassa',
    // The signed Shp_order must come back from OpStateExt; a missing one is treated as a mismatch.
    requiresOrderId: true,
    // Robokassa sends no refund notification: a refund made in its cabinet is also applied on the site by hand (docs/payments.md).
    async createPayment({ order, description, email, savePaymentMethod = false, paymentMethodId = null }) {
      if (!Number.isSafeInteger(order.invoiceNo) || order.invoiceNo < 1) throw new Error('Robokassa needs a numeric invoice number');
      if (paymentMethodId) return recurring({ order, description, previousInvoiceId: paymentMethodId });
      const outSum = amount(order.amountKop);
      const currency = order.currency ?? 'RUB';
      const foreign = FOREIGN_CURRENCIES.has(currency);
      if (!foreign && currency !== 'RUB') throw new Error(`Robokassa cannot take ${currency}`);
      // The order id travels as a Shp_ parameter, so the signed callback names the exact order.
      const signature = hash([merchantLogin, outSum, order.invoiceNo, ...(foreign ? [currency] : []), password1, `Shp_order=${order.id}`].join(':'));
      const params = new URLSearchParams({ MerchantLogin: merchantLogin, OutSum: outSum, InvId: String(order.invoiceNo),
        Description: description.slice(0, 100), SignatureValue: signature, Culture: 'ru', Encoding: 'utf-8', Shp_order: order.id });
      if (foreign) params.set('OutSumCurrency', currency);
      if (email) params.set('Email', email);
      if (savePaymentMethod) params.set('Recurring', 'true');
      if (isTest) params.set('IsTest', '1');
      return { id: String(order.invoiceNo), status: 'pending', confirmationUrl: `${PAY_URL}?${params}` };
    },
    // ResultURL: form fields OutSum, InvId, SignatureValue = hash(OutSum:InvId:Password2:Shp_order=…).
    parseNotification({ rawBody }) {
      const form = new URLSearchParams(rawBody);
      const outSum = form.get('OutSum'), invId = form.get('InvId'), orderId = form.get('Shp_order');
      if (!outSum || !/^\d{1,10}$/.test(invId ?? '') || !orderId) return { ok: false, status: 400 };
      if (!sameHash(hash(`${outSum}:${invId}:${password2}:Shp_order=${orderId}`), form.get('SignatureValue'))) return { ok: false, status: 403 };
      return { ok: true, event: 'payment.succeeded', paymentId: invId };
    },
    acknowledge(paymentId) { return { status: 200, contentType: 'text/plain; charset=utf-8', body: `OK${paymentId}` }; },
    async getPayment(id) {
      const url = new URL(STATE_URL);
      url.search = new URLSearchParams({ MerchantLogin: merchantLogin, InvoiceID: id, Signature: hash(`${merchantLogin}:${id}:${password2}`) });
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const xml = await response.text();
      const resultCode = tag(block(xml, 'Result'), 'Code');
      if (!response.ok || resultCode !== '0') throw new Error(`Robokassa state ${response.status}: result ${resultCode}`);
      const state = STATES[tag(block(xml, 'State'), 'Code')] ?? 'pending';
      const orderId = block(xml, 'UserField').match(/<Name>Shp_order<\/Name>\s*<Value>([^<]*)<\/Value>/)?.[1] ?? null;
      return {
        id, orderId,
        status: state === 'refunded' ? 'succeeded' : state,
        paid: state === 'succeeded' || state === 'refunded',
        refunded: state === 'refunded',
        // OutSum here is in the shop currency (RUB) after conversion, so the service compares it only with RUB orders.
        amountKop: Math.round(Number(tag(block(xml, 'Info'), 'OutSum')) * 100) || null,
        currency: 'RUB',
        refundedKop: 0,
        savedMethodId: state === 'succeeded' ? id : null,
      };
    },
  };
}
