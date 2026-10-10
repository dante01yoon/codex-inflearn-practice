import { describe, expect, it } from 'vitest';
import { approve, approval, at, fakePayment, fakeWebhook, FULL_REFUND, pendingPayment, webhook } from './payment-fixtures.js';

// PAYMENT_STATUS_CHANGED의 data는 Payment 객체이다. 서명·HTTP 수신은 이번 범위 밖.
// 웹훅 본문을 승인 근거로 직접 신뢰하지 않고 별도의 가짜 결제 조회 결과를 전달한다.
// https://docs.tosspayments.com/reference/using-api/webhook-events
describe('US-05 / T-16·17·19 — 웹훅과 가짜 결제 조회 응답', () => {
  it('AC-05-8 / 카드 DONE 웹훅과 조회 결과가 일치하고 점유가 유효하면 확정', () => {
    const result = webhook(pendingPayment(), fakeWebhook(), fakePayment(), at('10:09:59'));
    expect(result.state.reservation).toEqual({ orderId: 'fake-order-05', userId: 'driver-01' });
    expect(result.state.paidAmount).toBe(3000);
    expect(result.effects).toEqual([]);
  });

  it('AC-05-6·08 / 본문 DONE이어도 가짜 조회가 IN_PROGRESS이면 확정 금지', () => {
    const result = webhook(pendingPayment(), fakeWebhook(), fakePayment({ status: 'IN_PROGRESS' }), at('10:09:59'));
    expect(result.state.reservation).toBeNull();
    expect(result.state.paidAmount).toBe(0);
    expect(result.effects).toEqual([]);
  });

  for (const method of ['간편결제', '가상계좌']) {
    it(`AC-05-7·08 / 조회 응답의 ${method} DONE은 카드 전용 조건 위반`, () => {
      const payment = fakePayment({ method });
      const result = webhook(pendingPayment(), fakeWebhook(payment), payment, at('10:09:59'));
      expect(result.state.reservation).toBeNull();
    });
  }

  for (const time of ['10:10:00', '10:10:01']) {
    it(`AC-05-3·05·08 / 생성 시각은 만료 전이어도 ${time} 수신이면 예약 없이 전액 환불`, () => {
      const result = webhook(pendingPayment(), fakeWebhook(), fakePayment(), at(time));
      expect(result.state.reservation).toBeNull();
      expect(result.state.refundAmount).toBe(3000);
      expect(result.state.refundedAmount).toBe(0);
      expect(result.state.refundStatus).toBe('requested');
      expect(result.effects).toEqual(FULL_REFUND);
    });
  }

  it('AC-05-4·08 / 동일 웹훅 반복에도 예약 1건·반영 3000원 유지', () => {
    const first = webhook(pendingPayment(), fakeWebhook(), fakePayment(), at('10:09:59'));
    const repeated = webhook(first.state, fakeWebhook(), fakePayment(), at('10:11:00'));
    expect(repeated.state).toEqual(first.state);
    expect(repeated.state.paidAmount).toBe(3000);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-05-4·08 / 승인 응답 다음 웹훅에도 추가 확정·환불 없음', () => {
    const first = approve(pendingPayment(), approval());
    const repeated = webhook(first.state, fakeWebhook(), fakePayment(), at('10:11:00'));
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-05-4·08 / 웹훅 다음 승인 응답에도 추가 확정·환불 없음', () => {
    const first = webhook(pendingPayment(), fakeWebhook(), fakePayment(), at('10:09:59'));
    const repeated = approve(first.state, approval(fakePayment(), at('10:11:00')));
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-05-4·05·08 / 늦은 웹훅과 승인 응답 재전달에도 환불 요청은 1회', () => {
    const first = webhook(pendingPayment(), fakeWebhook(), fakePayment(), at('10:10:01'));
    const repeated = webhook(first.state, fakeWebhook(), fakePayment(), at('10:10:02'));
    const response = approve(repeated.state, approval(fakePayment(), at('10:10:03')));
    expect([...first.effects, ...repeated.effects, ...response.effects]).toEqual(FULL_REFUND);
    expect(response.state.reservation).toBeNull();
    expect(response.state.refundAmount).toBe(3000);
  });

  for (const mismatch of [{ orderId: 'fake-other-order' }, { paymentKey: 'fake-other-payment' }, { totalAmount: 6000 }]) {
    it(`AC-05-7·08 / 조회 응답 ${Object.keys(mismatch)[0]} 불일치로 확정 금지`, () => {
      const result = webhook(pendingPayment(), fakeWebhook(), fakePayment(mismatch), at('10:09:59'));
      expect(result.state.reservation).toBeNull();
    });
  }

  it('AC-05-8 / 다른 주문의 웹훅으로 현재 주문을 확정하지 않는다', () => {
    const result = webhook(pendingPayment(), fakeWebhook(fakePayment({ orderId: 'fake-other-order' })), fakePayment(), at('10:09:59'));
    expect(result.state.reservation).toBeNull();
  });

  it('AC-05-8 / 가상계좌 전용 DEPOSIT_CALLBACK 이벤트로 확정하지 않는다', () => {
    const event = { ...fakeWebhook(), eventType: 'DEPOSIT_CALLBACK' };
    const result = webhook(pendingPayment(), event, fakePayment(), at('10:09:59'));
    expect(result.state.reservation).toBeNull();
  });
});
