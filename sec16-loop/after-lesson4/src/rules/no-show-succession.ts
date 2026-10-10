const MINUTE_MS = 60_000;

export interface NoShowReservation {
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

export interface SuccessionWaiter {
  readonly userId: string;
  readonly appliedAtMs: number;
}

export interface SuccessionPaymentRequest {
  readonly userId: string;
  readonly amount: number;
  readonly requestedAtMs: number;
  readonly expiresAtMs: number;
  readonly originalStartMs: number;
  readonly originalEndMs: number;
}

export interface NoShowSuccessionState {
  readonly reservation: NoShowReservation;
  readonly waiters: readonly SuccessionWaiter[];
  readonly activePaymentRequest: SuccessionPaymentRequest | null;
  readonly expiredWaiterIds: readonly string[];
}

export interface NoShowSuccessionResult {
  readonly state: NoShowSuccessionState;
  readonly effects: readonly {
    readonly type: 'request-payment';
    readonly request: SuccessionPaymentRequest;
  }[];
}

/**
 * 일반 예약의 AC-16-1~3과 미결제 기회의 AC-11-3 순수 상태 전이.
 * 호출자는 같은 원래 구간의, 진행 중 예약이 없는 대기자만 전달한다.
 * 신청 시각 동률, 결제 승인·동시 이벤트는 이 계약에 포함하지 않는다.
 * 만료 후 다음 요청은 잔여시간이 충분한 경우를 전제로 한다.
 * 시각은 시연용 시계의 epoch milliseconds이며 외부 호출은 하지 않는다.
 */
export function reduceNoShowAndSuccession(
  state: NoShowSuccessionState,
  nowMs: number,
): NoShowSuccessionResult {
  let nextState = state;
  let shouldRequest = false;
  const reservation = state.reservation;

  if (reservation.status === 'confirmed'
    && reservation.checkedInAtMs === null
    && nowMs >= reservation.originalStartMs + 15 * MINUTE_MS) {
    nextState = {
      ...state,
      reservation: {
        ...reservation,
        status: 'cancelled',
        cancellationReason: 'no-show',
        refundAmount: 0,
        noShowCount: reservation.noShowCount + 1,
        occupiesActiveReservation: false,
      },
    };
    // AC-11-4: 최초 노쇼 후 요청에서 정확히 잔여 30분을 포함한다.
    shouldRequest = reservation.originalEndMs - nowMs >= 30 * MINUTE_MS;
  }

  // 체크인한 예약과 노쇼 이외의 상태에는 승계 효과를 만들지 않는다.
  if (nextState.reservation.status !== 'cancelled'
    || nextState.reservation.cancellationReason !== 'no-show') {
    return { state: nextState, effects: [] };
  }

  const activeRequest = nextState.activePaymentRequest;
  if (activeRequest !== null) {
    if (nowMs < activeRequest.expiresAtMs) {
      return { state: nextState, effects: [] };
    }
    nextState = {
      ...nextState,
      activePaymentRequest: null,
      expiredWaiterIds: nextState.expiredWaiterIds.includes(activeRequest.userId)
        ? nextState.expiredWaiterIds
        : [...nextState.expiredWaiterIds, activeRequest.userId],
    };
    shouldRequest = true;
  }

  // 이미 처리된 노쇼 이벤트로 최초 요청을 다시 만들지 않는다.
  if (!shouldRequest) return { state: nextState, effects: [] };

  let firstWaiter: SuccessionWaiter | undefined;
  for (const waiter of nextState.waiters) {
    if (nextState.expiredWaiterIds.includes(waiter.userId)) continue;
    if (firstWaiter === undefined || waiter.appliedAtMs < firstWaiter.appliedAtMs) {
      firstWaiter = waiter;
    }
  }
  if (firstWaiter === undefined) return { state: nextState, effects: [] };

  const request: SuccessionPaymentRequest = {
    userId: firstWaiter.userId,
    amount: 3000,
    requestedAtMs: nowMs,
    expiresAtMs: nowMs + 10 * MINUTE_MS,
    originalStartMs: reservation.originalStartMs,
    originalEndMs: reservation.originalEndMs,
  };
  return {
    state: { ...nextState, activePaymentRequest: request },
    effects: [{ type: 'request-payment', request }],
  };
}
