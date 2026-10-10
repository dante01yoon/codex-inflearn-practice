import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PaymentState } from '../rules/payment.ts';
import type { NoShowSuccessionState } from '../rules/no-show-succession.ts';

export const MINUTE = 60_000;
export interface Booking {
  id: string; userId: string; statId: string; chgerId: string; stationName: string;
  originalStartMs: number; originalEndMs: number; confirmedAtMs: number;
  status: 'confirmed' | 'checked-in' | 'cancelled'; checkedInAtMs: number | null;
  cancellationReason: 'no-show' | null; refundAmount: number; noShowCount: number;
  occupiesActiveReservation: boolean; connector: string; succession: boolean;
  orderId: string; queue: NoShowSuccessionState | null; undecided: string | null;
  paymentMode?: 'simulated' | 'toss-test';
}
export interface Order {
  id: string; userId: string; statId: string; chgerId: string; stationName: string;
  startMs: number; endMs: number; connector: string; createdAtMs: number;
  expiresAtMs: number; state: PaymentState; sourceId: string | null;
  status: 'pending' | 'confirmed' | 'expired' | 'failed' | 'review';
  launched: boolean; note: string | null;
  paymentMode?: 'simulated' | 'toss-test';
}
export interface WaitEntry { id: string; userId: string; sourceId: string; appliedAtMs: number; connector: string; }
export interface DemoStore {
  version: 1; nowMs: number; accounts: { id: string; name: string; customerKey: string }[];
  orders: Order[]; bookings: Booking[]; waiters: WaitEntry[];
  events: { atMs: number; userId: string; message: string }[];
}
const directory = resolve('.local');
const path = resolve(directory, 'preview-state.json');
export const store: DemoStore = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
  version: 1, nowMs: Date.now(),
  accounts: ['A', 'B', 'C'].map(id => ({ id, name: `운전자 ${id}`, customerKey: randomUUID() })),
  orders: [], bookings: [], waiters: [], events: [],
};
if (store.version !== 1 || !Number.isSafeInteger(store.nowMs)) throw new Error('시연 저장 파일 형식 확인이 필요합니다.');
export function save() {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(`${path}.tmp`, JSON.stringify(store), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
export function notice(userId: string, message: string) {
  store.events.push({ atMs: store.nowMs, userId, message });
}
let tail: Promise<unknown> = Promise.resolve();
export function exclusive<T>(action: () => T | Promise<T>): Promise<T> {
  const result = tail.then(action);
  tail = result.catch(() => undefined);
  return result;
}
