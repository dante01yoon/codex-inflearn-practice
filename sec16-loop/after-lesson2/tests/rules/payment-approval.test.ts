import { describe, expect, it } from 'vitest';
import { approve, approval, at, fakePayment, FULL_REFUND, pendingPayment } from './payment-fixtures.js';

describe('US-05 / T-16·17·19 — 결제 승인 가짜 응답', () => {
  it('AC-05-2·07 / 만료 1초 전 카드 DONE 3000원만 예약 확정', () => {
    const result = approve(pendingPayment(), approval());
    expect(result.state.reservation).toEqual({ orderId: 'fake-order-05', userId: 'driver-01' });
    expect(result.state.paidAmount).toBe(3000);
    expect(result.state.refundAmount).toBe(0);
    expect(result.effects).toEqual([]);
  });

  for (const status of ['READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'ABORTED', 'EXPIRED', 'CANCELED', 'PARTIAL_CANCELED']) {
    it(`AC-05-6·07 / ${status}는 DONE이 아니므로 완료·예약 확정 금지`, () => {
      const result = approve(pendingPayment(), approval(fakePayment({ status })));
      expect(result.state.reservation).toBeNull();
      expect(result.state.paidAmount).toBe(0);
      expect(result.state.refundAmount).toBe(0);
      expect(result.effects).toEqual([]);
    });
  }

  for (const method of ['간편결제', '계좌이체', '가상계좌', null]) {
    it(`AC-05-7 / ${method ?? '미지정'} DONE은 카드 전용 조건을 통과하지 못한다`, () => {
      const result = approve(pendingPayment(), approval(fakePayment({ method })));
      expect(result.state.reservation).toBeNull();
      // 비카드 승인에 대한 별도 보상 정책은 미정. 해당 부수 효과는 여기서 정하지 않는다.
    });
  }

  for (const time of ['10:10:00', '10:10:01']) {
    it(`AC-05-3·05 / ${time}에 도착한 DONE은 예약 없이 전액 환불 요청`, () => {
      const result = approve(pendingPayment(), approval(fakePayment(), at(time)));
      expect(result.state.reservation).toBeNull();
      expect(result.state.paidAmount).toBe(3000);
      expect(result.state.refundAmount).toBe(3000);
      expect(result.state.refundStatus).toBe('requested');
      expect(result.state.refundedAmount).toBe(0);
      expect(result.effects).toEqual(FULL_REFUND);
    });
  }

  for (const totalAmount of [1500, 6000, 3000.5]) {
    it(`AC-05-7 / 금액 ${totalAmount}원은 저장된 정수 3000원과 달라 확정 금지`, () => {
      const result = approve(pendingPayment(), approval(fakePayment({ totalAmount })));
      expect(result.state.reservation).toBeNull();
    });
  }
  for (const mismatch of [{ orderId: 'fake-other-order' }, { paymentKey: 'fake-other-payment' }, { currency: 'USD' }]) {
    it(`AC-05-7 / ${Object.keys(mismatch)[0]} 불일치 승인으로 확정 금지`, () => {
      const result = approve(pendingPayment(), approval(fakePayment(mismatch)));
      expect(result.state.reservation).toBeNull();
    });
  }

  it('AC-05-4 / 이미 확정된 승인을 점유 만료 후 재전달해도 추가 예약·환불 없음', () => {
    const first = approve(pendingPayment(), approval());
    const second = approve(first.state, approval(fakePayment(), at('10:11:00')));
    expect(second.state).toEqual(first.state);
    expect(second.state.paidAmount).toBe(3000);
    expect(second.effects).toEqual([]);
  });

  it('AC-05-4·05 / 늦은 승인 반복에도 전액 환불 요청은 1회', () => {
    const first = approve(pendingPayment(), approval(fakePayment(), at('10:10:01')));
    const second = approve(first.state, approval(fakePayment(), at('10:10:02')));
    expect([...first.effects, ...second.effects]).toEqual(FULL_REFUND);
    expect(second.state.reservation).toBeNull();
    expect(second.state.refundAmount).toBe(3000);
  });

  it('AC-05-5 / 가짜 환불 성공 전에는 요청 상태, 성공 후에만 3000원 반환 기록', () => {
    const first = approve(pendingPayment(), approval(fakePayment(), at('10:10:01')));
    const settled = approve(first.state, { type: 'refund-succeeded', paymentKey: 'fake-payment-05', amount: 3000 });
    expect(first.state.refundedAmount).toBe(0);
    expect(settled.state.reservation).toBeNull();
    expect(settled.state.refundStatus).toBe('succeeded');
    expect(settled.state.refundedAmount).toBe(3000);
    expect(settled.effects).toEqual([]);
  });

  it('AC-05-4·05 / 환불 성공 재전달에도 반환은 3000원·예약은 없음', () => {
    const first = approve(pendingPayment(), approval(fakePayment(), at('10:10:01')));
    const event = { type: 'refund-succeeded', paymentKey: 'fake-payment-05', amount: 3000 } as const;
    const settled = approve(first.state, event);
    const repeated = approve(settled.state, event);
    expect(repeated.state).toEqual(settled.state);
    expect(repeated.state.refundedAmount).toBe(3000);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-05-2 / 동결된 주문·응답 입력을 수정하지 않는다', () => {
    const state = Object.freeze(pendingPayment());
    const event = Object.freeze(approval(Object.freeze(fakePayment())));
    const before = structuredClone({ state, event });
    const result = approve(state, event);
    expect(result.state.reservation).not.toBeNull();
    expect({ state, event }).toEqual(before);
  });
});
