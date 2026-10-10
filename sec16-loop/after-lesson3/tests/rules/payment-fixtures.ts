import { expect } from 'vitest';
import * as rules from '../../src/rules/index.js';

// 테스트 전용 계약. 대체 결제 구현, HTTP 호출, 실제 인증키를 제공하지 않는다.
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
  readonly reservation: null | { readonly orderId: string; readonly userId: string };
  readonly paidAmount: number;
  readonly refundAmount: number;
  readonly refundedAmount: number;
  readonly refundStatus: 'none' | 'requested' | 'succeeded';
}
export type PaymentEffect = { readonly type: 'refund'; readonly paymentKey: string; readonly amount: number };
export interface PaymentResult {
  readonly state: PaymentState;
  readonly effects: readonly PaymentEffect[];
}
export interface PaymentWebhook {
  readonly eventType: string;
  readonly createdAt: string;
  readonly data: PaymentSnapshot;
}
export type ApprovalEvent =
  | { readonly type: 'approval-response'; readonly payment: PaymentSnapshot; readonly receivedAtMs: number }
  | { readonly type: 'refund-succeeded'; readonly paymentKey: string; readonly amount: number };
type ApprovalReducer = (state: PaymentState, event: ApprovalEvent) => PaymentResult;
type WebhookReducer = (state: PaymentState, event: PaymentWebhook,
  verifiedPayment: PaymentSnapshot, receivedAtMs: number) => PaymentResult;

export function at(time: string): number {
  return Date.parse(`2026-10-09T${time}+09:00`);
}
export function pendingPayment(): PaymentState {
  return { orderId: 'fake-order-05', paymentKey: 'fake-payment-05', userId: 'driver-01',
    expectedAmount: 3000, holdExpiresAtMs: at('10:10:00'), reservation: null,
    paidAmount: 0, refundAmount: 0, refundedAmount: 0, refundStatus: 'none' };
}
// 공식 Payment 객체 중 순수 규칙 경계에 전달할 필드만 추출한 가짜 응답이다.
// https://docs.tosspayments.com/reference
export function fakePayment(overrides: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return { paymentKey: 'fake-payment-05', orderId: 'fake-order-05', method: '카드',
    status: 'DONE', currency: 'KRW', totalAmount: 3000, ...overrides };
}
export function fakeWebhook(payment = fakePayment()): PaymentWebhook {
  return { eventType: 'PAYMENT_STATUS_CHANGED', createdAt: '2026-10-09T10:09:59.000000', data: payment };
}
export function approve(state: PaymentState, event: ApprovalEvent): PaymentResult {
  const exported = rules as unknown as Record<string, unknown>;
  expect(exported.reducePaymentApproval,
    '미구현: src/rules/index.ts에 reducePaymentApproval 공개 함수가 없습니다').toBeTypeOf('function');
  return (exported.reducePaymentApproval as ApprovalReducer)(state, event);
}
export function webhook(state: PaymentState, event: PaymentWebhook,
  verifiedPayment: PaymentSnapshot, receivedAtMs: number): PaymentResult {
  const exported = rules as unknown as Record<string, unknown>;
  expect(exported.reducePaymentWebhook,
    '미구현: src/rules/index.ts에 reducePaymentWebhook 공개 함수가 없습니다').toBeTypeOf('function');
  return (exported.reducePaymentWebhook as WebhookReducer)(state, event, verifiedPayment, receivedAtMs);
}
export function approval(payment = fakePayment(), receivedAtMs = at('10:09:59')): ApprovalEvent {
  return { type: 'approval-response', payment, receivedAtMs };
}
export const FULL_REFUND = [{ type: 'refund', paymentKey: 'fake-payment-05', amount: 3000 }] as const;
