/** 외부 응답에서 순수 규칙 검증에 필요한 필드만 전달한다. */
export interface PaymentSnapshot {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly method: string | null;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: number;
}

export interface PaymentState {
  readonly orderId: string;
  readonly paymentKey: string;
  readonly userId: string;
  readonly expectedAmount: number;
  readonly holdExpiresAtMs: number;
  readonly reservation: null | {
    readonly orderId: string;
    readonly userId: string;
  };
  readonly paidAmount: number;
  readonly refundAmount: number;
  readonly refundedAmount: number;
  readonly refundStatus: 'none' | 'requested' | 'succeeded';
}

export type PaymentApprovalEvent =
  | {
    readonly type: 'approval-response';
    readonly payment: PaymentSnapshot;
    readonly receivedAtMs: number;
  }
  | {
    readonly type: 'refund-succeeded';
    readonly paymentKey: string;
    readonly amount: number;
  };

export interface PaymentWebhook {
  readonly eventType: string;
  readonly createdAt: string;
  readonly data: PaymentSnapshot;
}

export interface PaymentEffect {
  readonly type: 'refund';
  readonly paymentKey: string;
  readonly amount: number;
}

export interface PaymentResult {
  readonly state: PaymentState;
  readonly effects: readonly PaymentEffect[];
}

const DEPOSIT_AMOUNT = 3000;

/** AC-05-7: 비카드·불일치 응답의 미정 보상은 처리하지 않는다. */
function matchesApprovedOrder(state: PaymentState, payment: PaymentSnapshot): boolean {
  return payment.method === '카드'
    && payment.status === 'DONE'
    && payment.orderId === state.orderId
    && payment.paymentKey === state.paymentKey
    && payment.currency === 'KRW'
    && state.expectedAmount === DEPOSIT_AMOUNT
    && Number.isInteger(payment.totalAmount)
    && payment.totalAmount === state.expectedAmount;
}

/**
 * US-05 / T-16·17·19의 순수 규칙 부분.
 * 호출자는 주문에 연결된 점유와 자격·자리·사용자 제한을 확인하여 전달한다.
 * 이 계약은 일반 점유 기한과 승인 대조만 다루며 저장·HTTP·토스 호출을 수행하지 않는다.
 * 환불은 요청 효과만 반환하고 성공 이벤트가 도착해야 반환 금액을 기록한다.
 */
export function reducePaymentApproval(
  state: PaymentState,
  event: PaymentApprovalEvent,
): PaymentResult {
  if (event.type === 'refund-succeeded') {
    if (state.refundStatus !== 'requested'
      || event.paymentKey !== state.paymentKey
      || state.refundAmount !== DEPOSIT_AMOUNT
      || state.paidAmount !== DEPOSIT_AMOUNT
      || event.amount !== state.refundAmount) {
      return { state, effects: [] };
    }
    return {
      state: {
        ...state,
        refundStatus: 'succeeded',
        refundedAmount: state.refundAmount,
      },
      effects: [],
    };
  }

  // AC-05-4: 만료 판정보다 먼저 처리 이력을 확인한다. 전달 경로와 무관하게 1회 반영.
  if (state.paidAmount !== 0
    || state.reservation !== null
    || state.refundStatus !== 'none') {
    return { state, effects: [] };
  }

  if (!matchesApprovedOrder(state, event.payment)) {
    return { state, effects: [] };
  }

  // 서비스의 시연용 수신 시각으로 판단한다. 외부 승인 시각으로 점유를 연장하지 않는다.
  if (event.receivedAtMs >= state.holdExpiresAtMs) {
    return {
      state: {
        ...state,
        paidAmount: DEPOSIT_AMOUNT,
        refundAmount: DEPOSIT_AMOUNT,
        refundStatus: 'requested',
      },
      effects: [{ type: 'refund', paymentKey: state.paymentKey, amount: DEPOSIT_AMOUNT }],
    };
  }

  return {
    state: {
      ...state,
      reservation: { orderId: state.orderId, userId: state.userId },
      paidAmount: DEPOSIT_AMOUNT,
    },
    effects: [],
  };
}

/** AC-05-8: 연결된 웹훅의 별도 조회 결과를 동일 승인 규칙으로 처리한다. */
export function reducePaymentWebhook(
  state: PaymentState,
  event: PaymentWebhook,
  verifiedPayment: PaymentSnapshot,
  receivedAtMs: number,
): PaymentResult {
  if (event.eventType !== 'PAYMENT_STATUS_CHANGED'
    || event.data.orderId !== state.orderId
    || event.data.paymentKey !== state.paymentKey) {
    return { state, effects: [] };
  }

  // 본문의 상태·생성 시각은 승인 근거가 아니다. 조회 응답과 서비스 수신 시각을 사용한다.
  return reducePaymentApproval(state, {
    type: 'approval-response',
    payment: verifiedPayment,
    receivedAtMs,
  });
}
