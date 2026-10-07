import { YOOKASSA_NETWORKS, createAllowList } from './networks.js';

const API = 'https://api.yookassa.ru/v3';
const TIMEOUT_MS = 15_000;

const rub = (kop) => (kop / 100).toFixed(2);

// ЮKassa adapter. Notifications carry no signature, so the sender IP is checked against
// YooKassa's published subnets and the payment state is always re-read from the API.
export function createYooKassa({ shopId, secretKey, vatCode = 1, fetchImpl = fetch }) {
  if (!shopId || !secretKey) return null;
  const auth = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
  async function call(method, path, { body, idempotenceKey } = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json', ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`YooKassa ${response.status}: ${data.code ?? ''} ${data.description ?? ''}`.trim());
    return data;
  }
  const normalize = (payment) => ({
    id: payment.id,
    status: payment.status,
    paid: payment.paid === true,
    amountKop: Math.round(Number(payment.amount?.value) * 100),
    refundedKop: Math.round(Number(payment.refunded_amount?.value ?? 0) * 100),
    orderId: payment.metadata?.orderId ?? null,
    savedMethodId: payment.payment_method?.saved ? payment.payment_method.id : null,
    confirmationUrl: payment.confirmation?.confirmation_url ?? null,
  });
  return {
    name: 'yookassa',
    isTrustedSender: createAllowList(YOOKASSA_NETWORKS),
    async createPayment({ order, description, returnUrl, email, savePaymentMethod = false, paymentMethodId = null }) {
      const amount = { value: rub(order.amountKop), currency: order.currency ?? 'RUB' };
      const body = {
        amount,
        capture: true,
        description: description.slice(0, 128),
        metadata: { orderId: order.id },
        // 54-ФЗ receipt through «Чеки от ЮKassa»: one service line, full prepayment.
        receipt: { customer: { email }, items: [{ description: description.slice(0, 128), quantity: '1.00', amount,
          vat_code: vatCode, payment_mode: 'full_payment', payment_subject: 'service' }] },
        ...(paymentMethodId ? { payment_method_id: paymentMethodId }
          : { confirmation: { type: 'redirect', return_url: returnUrl }, ...(savePaymentMethod ? { save_payment_method: true } : {}) }),
      };
      return normalize(await call('POST', '/payments', { body, idempotenceKey: order.id }));
    },
    async getPayment(id) { return normalize(await call('GET', `/payments/${encodeURIComponent(id)}`)); },
  };
}
