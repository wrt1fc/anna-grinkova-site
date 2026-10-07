import { randomUUID } from 'node:crypto';

// In-memory provider for local development and tests. Never use in production:
// it trusts only loopback senders and "pays" when told to.
export function createTestProvider() {
  const payments = new Map();
  return {
    name: 'test',
    isTrustedSender: (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip),
    async createPayment({ order, returnUrl, savePaymentMethod = false, paymentMethodId = null }) {
      const id = `test-${randomUUID()}`;
      const payment = { id, status: paymentMethodId ? 'succeeded' : 'pending', paid: Boolean(paymentMethodId), amountKop: order.amountKop,
        refundedKop: 0, orderId: order.id, savedMethodId: savePaymentMethod || paymentMethodId ? (paymentMethodId ?? `method-${id}`) : null,
        confirmationUrl: paymentMethodId ? null : `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}test_payment=${id}` };
      payments.set(id, payment);
      return { ...payment };
    },
    async getPayment(id) {
      const payment = payments.get(id);
      if (!payment) throw new Error('test payment not found');
      return { ...payment };
    },
    // Test hook: move a payment to a final state the way a real provider would.
    settle(id, changes) { payments.set(id, { ...payments.get(id), ...changes }); },
  };
}
