import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';

// US-16 / T-26 및 US-11 / T-32·T-33의 순수 규칙 계약만 작성한다.
// 화면·저장·토스 호출·결제 승인·승계 확정은 검증하지 않는다.
// 후보는 같은 원래 구간의 대기자이며 진행 중 예약이 없다. 동률은 사용하지 않는다.
// C-01 승인 시 잔여시간 재검사, C-03 예약 보유 후보, C-04 동시 이벤트는 제외한다.
// 잡을 회귀: 기한의 포함/제외 오류, 체크인 보호 누락, 잘못된 환불,
// 배열 순서로 후보 선택, 중복 요청, 30분 경계의 반전, 원래 구간 변경.
interface Reservation {
  readonly id: string;
  readonly userId: string;
  readonly statId: string;
  readonly chgerId: string;
  readonly originalStartMs: number;
  readonly originalEndMs: number;
  readonly checkedInAtMs: number | null;
  readonly status: 'confirmed' | 'checked-in' | 'cancelled';
  readonly cancellationReason: 'no-show' | null;
  readonly refundAmount: number;
  readonly noShowCount: number;
  readonly occupiesActiveReservation: boolean;
}
interface Waiter {
  readonly userId: string;
  readonly appliedAtMs: number;
}
interface PaymentRequest {
  readonly userId: string;
  readonly amount: number;
  readonly requestedAtMs: number;
  readonly expiresAtMs: number;
  readonly originalStartMs: number;
  readonly originalEndMs: number;
}
interface State {
  readonly reservation: Reservation;
  readonly waiters: readonly Waiter[];
  readonly activePaymentRequest: PaymentRequest | null;
  readonly expiredWaiterIds: readonly string[];
}
interface Result {
  readonly state: State;
  readonly effects: readonly { readonly type: 'request-payment'; readonly request: PaymentRequest }[];
}
type Reducer = (state: State, nowMs: number) => Result;

function at(time: string): number {
  return Date.parse(`2026-10-09T${time}+09:00`);
}

function initialState(end = '15:30:00'): State {
  return {
    reservation: {
      id: 'reservation-A', userId: 'driver-A', statId: 'station-01', chgerId: '01',
      originalStartMs: at('14:00:00'), originalEndMs: at(end), checkedInAtMs: null,
      status: 'confirmed', cancellationReason: null, refundAmount: 0,
      noShowCount: 0, occupiesActiveReservation: true,
    },
    // 의도적으로 역순 입력: 신청 시각이 더 이른 B를 골라야 한다.
    waiters: [
      { userId: 'driver-C', appliedAtMs: at('10:00:01') },
      { userId: 'driver-B', appliedAtMs: at('10:00:00') },
    ],
    activePaymentRequest: null,
    expiredWaiterIds: [],
  };
}

function advance(state: State, time: string): Result {
  const exported = rules as unknown as Record<string, unknown>;
  expect(exported.reduceNoShowAndSuccession,
    '미구현: src/rules/index.ts에 reduceNoShowAndSuccession 공개 함수가 없습니다',
  ).toBeTypeOf('function');
  return (exported.reduceNoShowAndSuccession as Reducer)(state, at(time));
}

function firstRequest(end = '15:30:00'): PaymentRequest {
  return {
    userId: 'driver-B', amount: 3000, requestedAtMs: at('14:15:00'),
    expiresAtMs: at('14:25:00'), originalStartMs: at('14:00:00'), originalEndMs: at(end),
  };
}

describe('US-16 / T-26 — 일반 예약 노쇼 자동 취소', () => {
  it.each(['14:14:59', '14:14:59.999'])(
    'AC-16-1 / 서울 %s에는 노쇼 취소·승계 요청을 하지 않는다', (time) => {
      const state = initialState();
      const result = advance(state, time);
      expect(result.state).toEqual(state);
      expect(result.effects).toEqual([]);
    },
  );

  it.each(['14:15:00', '14:15:00.001'])(
    'AC-08-2·AC-16-1 / 서울 %s에 미체크인 예약을 노쇼 취소하고 진행 제한을 해제한다', (time) => {
      const result = advance(initialState(), time);
      expect(result.state.reservation).toMatchObject({
        status: 'cancelled', cancellationReason: 'no-show', refundAmount: 0,
        noShowCount: 1, occupiesActiveReservation: false,
      });
      expect(result.state.reservation.originalStartMs).toBe(at('14:00:00'));
      expect(result.state.reservation.originalEndMs).toBe(at('15:30:00'));
    },
  );

  it('AC-16-2 / 기한 직전 체크인한 예약은 기한이 지나도 취소·승계하지 않는다', () => {
    const base = initialState();
    const state: State = { ...base,
      reservation: { ...base.reservation, status: 'checked-in', checkedInAtMs: at('14:14:59.999') },
    };
    const result = advance(state, '14:15:00.001');
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('AC-16-1 / 대기자가 없어도 노쇼 취소·환불 0원·진행 제한 해제를 처리한다', () => {
    const result = advance({ ...initialState(), waiters: [] }, '14:15:00');
    expect(result.state.reservation).toMatchObject({ status: 'cancelled',
      cancellationReason: 'no-show', refundAmount: 0, noShowCount: 1, occupiesActiveReservation: false });
    expect(result.state.activePaymentRequest).toBeNull();
    expect(result.effects).toEqual([]);
  });
});

describe('US-11·US-16 / T-32 — 노쇼 후 첫 대기자 결제 요청', () => {
  it('AC-10-3·AC-11-4·AC-16-3 / 첫 신청자 B에게만 3000원 요청하고 승계를 확정하지 않는다', () => {
    const result = advance(initialState(), '14:15:00');
    expect(result.state.activePaymentRequest).toEqual(firstRequest());
    expect(result.effects).toEqual([{ type: 'request-payment', request: firstRequest() }]);
    expect(result.state.reservation.userId).toBe('driver-A');
    expect(result.state.reservation.status).toBe('cancelled');
    expect(result.state.expiredWaiterIds).toEqual([]);
  });

  it.each([
    ['14:30:00', false], // AC 원문: 노쇼 후 잔여 15분.
    ['14:44:59', false],
    ['14:44:59.999', false],
    ['14:45:00', true],
    ['14:45:00.001', true],
    ['15:00:00', true], // AC 원문: 노쇼 후 잔여 45분.
  ] as const)('AC-11-4·AC-16-3 / 종료 %s의 최초 승계 요청 여부는 %s', (end, allowed) => {
    // 이 테스트는 노쇼 직후의 최초 요청만 검증한다(C-01 승인 시 재검사 제외).
    const result = advance(initialState(end), '14:15:00');
    expect(result.state.reservation).toMatchObject({ status: 'cancelled',
      cancellationReason: 'no-show', refundAmount: 0, noShowCount: 1 });
    if (allowed) {
      expect(result.state.activePaymentRequest).toEqual(firstRequest(end));
      expect(result.effects).toEqual([{ type: 'request-payment', request: firstRequest(end) }]);
    } else {
      expect(result.state.activePaymentRequest).toBeNull();
      expect(result.effects).toEqual([]);
    }
  });

  it('AC-16-3 / 같은 노쇼 이벤트를 반복해도 기록·첫 결제 요청은 1건이다', () => {
    const first = advance(initialState(), '14:15:00');
    const second = advance(first.state, '14:15:00');
    const third = advance(second.state, '14:15:01');
    expect(second.state).toEqual(first.state);
    expect(third.state).toEqual(first.state);
    expect(third.state.reservation.noShowCount).toBe(1);
    expect(third.state.reservation.refundAmount).toBe(0);
    expect([...first.effects, ...second.effects, ...third.effects]).toEqual([
      { type: 'request-payment', request: firstRequest() },
    ]);
  });

  it('AC-16-1·AC-16-3 / 입력 예약·대기열을 변경하지 않는다', () => {
    const base = initialState();
    const state = Object.freeze({ ...base, reservation: Object.freeze(base.reservation),
      waiters: Object.freeze(base.waiters.map((waiter) => Object.freeze(waiter))),
      expiredWaiterIds: Object.freeze([] as string[]),
    });
    const before = structuredClone(state);
    const result = advance(state, '14:15:00');
    expect(result.state.reservation.status).toBe('cancelled');
    expect(state).toEqual(before);
  });
});

describe('US-11 / T-33 — 미결제 대기자의 10분 기회 만료', () => {
  // AC-11-3·C-04: 정확히 10분 만료·다음 후보 새 10분은 사용자 답변으로 확정.
  // 결제창 재개방·동시 승인·잔여시간 재검사도 제외한다. 모든 요청 시 잔여시간은 충분하다.
  function awaitingFirstPayment(): State {
    const base = initialState();
    return { ...base,
      reservation: { ...base.reservation, status: 'cancelled', cancellationReason: 'no-show',
        noShowCount: 1, occupiesActiveReservation: false },
      activePaymentRequest: firstRequest(),
    };
  }

  it('AC-11-3·AC-17-2 / 정확히 요청 후 10분에 B를 만료하고 C에게 새 10분 기한을 준다', () => {
    const state = awaitingFirstPayment();
    const result = advance(state, '14:25:00');
    expect(result.state.expiredWaiterIds).toEqual(['driver-B']);
    const expectedRequest: PaymentRequest = {
      userId: 'driver-C', amount: 3000, requestedAtMs: at('14:25:00'),
      expiresAtMs: at('14:35:00'), originalStartMs: at('14:00:00'),
      originalEndMs: at('15:30:00'),
    };
    expect(result.state.activePaymentRequest).toEqual(expectedRequest);
    expect(result.effects).toEqual([{ type: 'request-payment', request: expectedRequest }]);
    expect(result.state.reservation).toEqual(state.reservation);
  });

  it('PRD 4.2 승계 결제 / 요청 10분 직전까지 B의 기회를 유지한다', () => {
    const state = awaitingFirstPayment();
    const result = advance(state, '14:24:59.999');
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('PRD 4.2 승계 결제 / 10분을 초과한 미결제 B를 만료하고 C에게 새 10분 결제를 요청한다', () => {
    const state = awaitingFirstPayment();
    const result = advance(state, '14:25:00.001');
    expect(result.state.expiredWaiterIds).toEqual(['driver-B']);
    expect(result.state.activePaymentRequest).toEqual({
      userId: 'driver-C', amount: 3000, requestedAtMs: at('14:25:00.001'),
      expiresAtMs: at('14:35:00.001'), originalStartMs: at('14:00:00'),
      originalEndMs: at('15:30:00'),
    });
    expect(result.effects).toEqual([{ type: 'request-payment', request: {
      userId: 'driver-C', amount: 3000, requestedAtMs: at('14:25:00.001'),
      expiresAtMs: at('14:35:00.001'), originalStartMs: at('14:00:00'),
      originalEndMs: at('15:30:00'),
    } }]);
    expect(result.state.reservation).toEqual(state.reservation);
  });

  it('PRD 4.2.1 / 만료 이벤트 반복으로 C의 기회를 중복 요청하거나 기한을 연장하지 않는다', () => {
    const first = advance(awaitingFirstPayment(), '14:25:00.001');
    const second = advance(first.state, '14:25:00.001');
    const third = advance(second.state, '14:25:01');
    expect(second.state).toEqual(first.state);
    expect(third.state).toEqual(first.state);
    expect(second.effects).toEqual([]);
    expect(third.effects).toEqual([]);
    expect(first.effects).toHaveLength(1);
    expect(third.state.reservation.noShowCount).toBe(1);
  });
});
