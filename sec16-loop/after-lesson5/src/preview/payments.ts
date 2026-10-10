import { reducePaymentApproval } from '../rules/payment.ts';
import type { Order } from './store.ts';
import { store, save, notice } from './store.ts';

export function paymentReady() {
  return /^(test_gck_|test_ck_)/.test(process.env.TOSS_CLIENT_KEY ?? '')
    && /^(test_gsk_|test_sk_)/.test(process.env.TOSS_SECRET_KEY ?? '');
}
export function clientConfig(userId: string) {
  return { available: paymentReady(), clientKey: paymentReady() ? process.env.TOSS_CLIENT_KEY : null,
    widget: (process.env.TOSS_CLIENT_KEY ?? '').startsWith('test_gck_'),
    customerKey: store.accounts.find(a => a.id === userId)?.customerKey };
}
export async function toss(path: string, body?: object, idempotencyKey?: string): Promise<any> {
  if (!paymentReady()) throw new Error('토스 테스트 키 준비가 필요합니다.');
  const response = await fetch(`https://api.tosspayments.com/v1/payments${path}`, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`토스 요청 실패 (${response.status}). 실패 재시도 정책 미정`);
  return data;
}
export async function requestRefund(order: Order) {
  if (order.state.refundStatus !== 'requested' || order.state.refundedAmount > 0) return;
  if (order.paymentMode === 'simulated') {
    order.state = reducePaymentApproval(order.state, { type:'refund-succeeded',paymentKey:order.state.paymentKey,amount:3000 }).state;
    order.note = '시연용 모의 결제 · 자리 확보 실패 · 모의 전액 환불 3,000원';
    notice(order.userId,order.note); save(); return;
  }
  // 먼저 요청 이력을 디스크에 보존한다. 실패 시 자동으로 다시 호출하지 않는다.
  order.note = '3,000원 전액 환불 요청 중'; save();
  try {
    const payment = await toss(`/${encodeURIComponent(order.state.paymentKey)}/cancel`,
      { cancelReason: '가상 예약 자리 확보 실패 또는 점유 만료', cancelAmount: 3000 }, `refund-${order.id}`);
    if (!['CANCELED','PARTIAL_CANCELED'].includes(payment.status)
      || payment.orderId !== order.id || payment.paymentKey !== order.state.paymentKey
      || payment.totalAmount !== 3000 || payment.balanceAmount !== 0) throw new Error('환불 결과 확인 필요');
    order.state = reducePaymentApproval(order.state, { type: 'refund-succeeded', paymentKey: order.state.paymentKey, amount: 3000 }).state;
    order.note = '자리 확보 실패 · 3,000원 전액 환불 완료';
    notice(order.userId, order.note);
  } catch {
    order.note = '전액 환불 결과 확인 필요 · 환불 실패 재시도 정책 미정';
    notice(order.userId, order.note);
  }
  save();
}
