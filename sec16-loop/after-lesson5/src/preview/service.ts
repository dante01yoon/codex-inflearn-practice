import { randomUUID } from 'node:crypto';
import { hasReservationOverlap } from '../rules/overlap.ts';
import { canCheckInGeneralReservation } from '../rules/checkin.ts';
import { reduceNoShowAndSuccession } from '../rules/no-show-succession.ts';
import { reducePaymentApproval } from '../rules/payment.ts';
import type { PaymentSnapshot } from '../rules/payment.ts';
import { stations, dataInfo, getCharger, reasons, supported } from './data.ts';
import { store, MINUTE, save, notice } from './store.ts';
import type { Booking, Order } from './store.ts';
import { clientConfig, paymentReady, toss, requestRefund } from './payments.ts';

function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function active(userId: string) { return store.bookings.some(b => b.userId === userId && b.occupiesActiveReservation); }
function pending(userId: string) { return store.orders.some(o => o.userId === userId && o.status === 'pending' && o.expiresAtMs > store.nowMs); }
function ownBooking(userId: string, id: string) {
  const booking = store.bookings.find(b => b.id === id && b.userId === userId);
  requireThat(booking, '자신의 예약만 조작할 수 있습니다.'); return booking;
}
function occupancies(excludeOrder?: string) {
  return [
    ...store.bookings.filter(b => b.occupiesActiveReservation).map(b => ({ charger: b, range: { startMs: b.originalStartMs, endMs: b.originalEndMs }, kind: 'confirmed' as const })),
    ...store.orders.filter(o => o.id !== excludeOrder && o.status === 'pending' && store.nowMs < o.expiresAtMs).map(o => ({ charger: o, range: { startMs: o.startMs, endMs: o.endMs }, kind: 'valid-hold' as const })),
    ...store.bookings.filter(b => b.queue?.activePaymentRequest && (!excludeOrder || !store.orders.some(o => o.id === excludeOrder && o.sourceId === b.id)))
      .map(b => ({ charger: b, range: { startMs: b.originalStartMs, endMs: b.originalEndMs }, kind: 'valid-hold' as const })),
  ];
}
function publicOrder(o: Order) {
  return { id: o.id, stationName: o.stationName, statId: o.statId, chgerId: o.chgerId,
    startMs: o.startMs, endMs: o.endMs, expiresAtMs: o.expiresAtMs, status: o.status,
    paidAmount: o.state.paidAmount, refundedAmount: o.state.refundedAmount, refundStatus: o.state.refundStatus, launched:o.launched, paymentMode:o.paymentMode, note: o.note };
}
function publicBooking(b: Booking) {
  return { ...b, queue: undefined, orderId: undefined,
    checkinDeadlineMs: b.succession ? b.confirmedAtMs + 15 * MINUTE : b.originalStartMs + 15 * MINUTE,
    canCheckIn: !b.succession && b.status === 'confirmed' && canCheckInGeneralReservation(b.originalStartMs, store.nowMs) };
}
export function stateFor(userId: string) {
  const requests = store.bookings.filter(b => b.queue?.activePaymentRequest?.userId === userId).map(b => ({
    sourceId: b.id, stationName: b.stationName, statId: b.statId, chgerId: b.chgerId,
    ...b.queue!.activePaymentRequest!, undecided: b.undecided,
    canPay: !b.undecided && b.originalEndMs - b.queue!.activePaymentRequest!.expiresAtMs >= 30 * MINUTE,
  }));
  return { nowMs: store.nowMs, userId, accounts: store.accounts.map(a => ({ id: a.id, name: a.name })), dataInfo,
    bookings: store.bookings.filter(b => b.userId === userId).map(publicBooking),
    orders: store.orders.filter(o => o.userId === userId).map(publicOrder),
    waiters: store.waiters.filter(w => w.userId === userId).map(w => {
      const b = store.bookings.find(b => b.id === w.sourceId)!;
      const expired = b.queue?.expiredWaiterIds ?? [];
      const queue = store.waiters.filter(x => x.sourceId === w.sourceId && !expired.includes(x.userId)).sort((a,b) => a.appliedAtMs - b.appliedAtMs);
      return { ...w, stationName: b.stationName, startMs: b.originalStartMs, endMs: b.originalEndMs,
        position: queue.findIndex(x => x.id === w.id) + 1,
        status: expired.includes(userId) ? '만료' : store.bookings.some(x => x.succession && x.userId === userId && x.originalStartMs === b.originalStartMs && x.statId === b.statId && x.chgerId === b.chgerId) ? '승계 확정' : b.queue?.activePaymentRequest?.userId === userId ? '결제 요청' : b.undecided ? '미정' : '대기 중', undecided: b.undecided };
    }), requests, events: store.events.filter(e => e.userId === userId).slice(-15).reverse(),
    payment: { available: paymentReady() } };
}
export function searchStations(query: string) {
  return stations.filter(s => `${s.name} ${s.address}`.includes(query)).slice(0,200).map(s => ({
    id: s.id, name: s.name, address: s.address, lat: s.lat, lng: s.lng,
    chargerCount: s.chargers.length, bookableCount: s.chargers.filter(c => !reasons(c).length).length,
  }));
}
export function stationDetails(id: string, userId: string) {
  const s = stations.find(s => s.id === id); requireThat(s, '충전소를 찾을 수 없습니다.');
  return { ...s, chargers: s.chargers.map(c => ({ ...c, reasons: reasons(c), connectors: supported(c) })),
    // 공유 시간표에는 예약자의 개인정보를 포함하지 않는다.
    schedule: store.bookings.filter(b => b.statId === id && (b.occupiesActiveReservation || b.queue?.activePaymentRequest)).map(b => ({
      id: b.id, chgerId: b.chgerId, startMs: b.originalStartMs, endMs: b.originalEndMs,
      own: b.userId === userId, status: b.occupiesActiveReservation ? '확정 예약' : '승계 결제 대기',
      canWait: b.occupiesActiveReservation && !b.succession && b.userId !== userId,
    })),
    holds: store.orders.filter(o => o.statId === id && o.status === 'pending' && o.expiresAtMs > store.nowMs).map(o => ({ chgerId: o.chgerId, startMs: o.startMs, endMs: o.endMs, expiresAtMs: o.expiresAtMs })),
  };
}
function newOrder(userId: string, statId: string, chgerId: string, startMs: number, endMs: number, connector: string, sourceId: string | null, expiresAtMs: number) {
  const c = getCharger(statId, chgerId); requireThat(c, '충전기 원본 정보가 없습니다.');
  requireThat(!reasons(c, connector).length, reasons(c, connector).join(' · '));
  requireThat(connector, '자기 차량의 커넥터를 선택해 주세요.');
  requireThat(!active(userId), '진행 중 예약은 계정당 1건입니다.');
  requireThat(!pending(userId), '결제 대기 주문이 있습니다. 재시도·점유 해제 정책 미정');
  requireThat(paymentReady(), '토스 테스트 키 준비가 필요합니다.');
  const id = `ev-${randomUUID()}`;
  const order: Order = { id, userId, statId, chgerId, stationName: c.name, startMs, endMs, connector,
    createdAtMs: store.nowMs, expiresAtMs, sourceId, status: 'pending', launched: false, note: null,
    state: { orderId: id, paymentKey: '', userId, expectedAmount: 3000, holdExpiresAtMs: expiresAtMs,
      reservation: null, paidAmount: 0, refundAmount: 0, refundedAmount: 0, refundStatus: 'none' } };
  store.orders.push(order); notice(userId, '결제 대기 · 3,000원 승인 확인 후 예약 확정'); save(); return { order: publicOrder(order), ...clientConfig(userId) };
}
export function createOrder(userId: string, input: any) {
  const { statId, chgerId, startMs, duration, connector } = input;
  requireThat(typeof statId === 'string' && typeof chgerId === 'string' && typeof connector === 'string', '충전기·커넥터를 선택해 주세요.');
  requireThat(Number.isSafeInteger(startMs) && startMs >= store.nowMs && startMs <= store.nowMs + 7 * 24 * 60 * MINUTE, '시작은 현재부터 7일 이내여야 합니다.');
  requireThat(startMs % (30 * MINUTE) === 0 && [30,60,90].includes(duration), '00·30분 시작, 30·60·90분 이용만 가능합니다.');
  const endMs = startMs + duration * MINUTE;
  requireThat(!hasReservationOverlap({ statId, chgerId }, { startMs, endMs }, occupancies()), '겹치는 예약 또는 임시 점유가 있습니다. 다른 시간 또는 같은 구간 대기를 선택해 주세요.');
  return newOrder(userId, statId, chgerId, startMs, endMs, connector, null, store.nowMs + 10 * MINUTE);
}
export function joinWaitlist(userId: string, id: string, connector: string) {
  const b = store.bookings.find(b => b.id === id && b.occupiesActiveReservation && !b.succession);
  requireThat(b && b.userId !== userId, '다른 운전자의 일반 확정 예약에만 대기할 수 있습니다.');
  const c = getCharger(b.statId,b.chgerId);
  requireThat(typeof connector === 'string' && connector && c, '대기할 차량의 커넥터를 직접 선택해 주세요.');
  requireThat(!reasons(c,connector).length,reasons(c,connector).join(' · '));
  requireThat(!store.waiters.some(w => w.userId === userId && !store.bookings.find(b => b.id === w.sourceId)?.queue?.expiredWaiterIds.includes(userId)), '대기는 계정당 1건입니다. 요청 후 대기 제한 해제 정책은 미정입니다.');
  requireThat(!store.waiters.some(w => w.sourceId === id && w.appliedAtMs === store.nowMs), '동시각 대기 순서 미정 · 시연 시계를 1초 진행한 후 신청해 주세요.');
  store.waiters.push({ id: randomUUID(), userId, sourceId: id, appliedAtMs: store.nowMs, connector });
  notice(userId, '같은 충전기·원래 시작·종료 구간 대기 신청 · 결제 0원'); save();
}
export function successionOrder(userId: string, id: string) {
  const b = store.bookings.find(b => b.id === id);
  const request = b?.queue?.activePaymentRequest;
  requireThat(b && request?.userId === userId && request.expiresAtMs > store.nowMs, '유효한 본인 승계 결제 요청이 없습니다.');
  requireThat(!b.undecided, b.undecided ?? '미정');
  requireThat(b.originalEndMs - request.expiresAtMs >= 30 * MINUTE, '결제 중 잔여 30분 경계 판정 미정');
  requireThat(!store.orders.some(o => o.sourceId === id && o.userId === userId), '승계 결제창 재개방·재시도 정책 미정');
  const waiter = store.waiters.find(w=>w.sourceId===id && w.userId===userId);
  requireThat(waiter?.connector,'대기자의 선택 커넥터 정보가 없습니다.');
  return newOrder(userId, b.statId, b.chgerId, b.originalStartMs, b.originalEndMs, waiter.connector, id, request.expiresAtMs);
}
export function launchOrder(userId: string, id: string) {
  const o = store.orders.find(o => o.id === id && o.userId === userId);
  requireThat(o && o.status === 'pending' && o.expiresAtMs > store.nowMs, '유효한 본인 결제 대기 주문이 없습니다.');
  requireThat(!o.launched, '진행 중인 결제창을 먼저 닫고 닫힘을 확인해 주세요.');
  requireThat(o.state.paymentKey === '' && !o.paymentMode,'승인 확인 중이거나 결과 확인이 필요한 주문입니다.');
  o.launched = true; o.note = '결제창 진행 중 · 승인 전 미확정 · 닫으면 기존 기한 안에서 재결제 가능'; save(); return publicOrder(o);
}
export function paymentClosed(userId: string, id: string) {
  const o = store.orders.find(o=>o.id===id && o.userId===userId);
  requireThat(o && o.status==='pending' && o.expiresAtMs>store.nowMs,'결제 기한이 만료되었거나 유효한 본인 주문이 없습니다.');
  requireThat(o.state.paidAmount===0 && o.state.paymentKey==='' && !o.paymentMode,'승인 확인 중·승인 완료·결과 불명 주문은 다시 결제할 수 없습니다.');
  o.launched=false; o.note='결제창 닫힘 · 결제 미확정 · 기존 기한 안에서 다시 결제 가능';
  notice(userId,o.note); save(); return publicOrder(o);
}
export function paymentFailed(userId: string, id: string) {
  const o = store.orders.find(o => o.id === id && o.userId === userId);
  if (o && o.state.paidAmount === 0) { o.note = '승인 없는 결제 · 확정되지 않음 · 인증 실패 재시도 정책 미정'; notice(userId, o.note); save(); }
}
export async function approve(userId: string, input: any) {
  const o = store.orders.find(o => o.id === input.orderId && o.userId === userId);
  requireThat(o, '본인 주문이 없습니다.');
  requireThat(o.paymentMode !== 'simulated','시연용 모의 주문을 토스 결제 승인으로 처리할 수 없습니다.');
  requireThat(input.amount === 3000 && typeof input.paymentKey === 'string' && input.paymentKey.length <= 200 && input.paymentKey.length > 0, '주문 금액·결제 식별자가 올바르지 않습니다.');
  if (o.state.paidAmount > 0) return publicOrder(o);
  requireThat(o.state.paymentKey === '' || o.state.paymentKey === input.paymentKey, '주문에 연결된 결제 식별자가 다릅니다.');
  if (o.status === 'review') throw new Error(o.note ?? '결제 결과 확인 필요 · 재시도 미정');
  o.state = { ...o.state, paymentKey: input.paymentKey }; save();
  o.paymentMode='toss-test'; save();
  // 토스 결제 조회로 카드 여부를 먼저 확인하여 비카드를 승인하지 않는다.
  let payment;
  try {
    payment = await toss(`/${encodeURIComponent(input.paymentKey)}`);
    requireThat(payment.method === '카드' && payment.orderId === o.id && payment.paymentKey === input.paymentKey && payment.totalAmount === 3000 && payment.currency === 'KRW', '카드·주문·3,000원·KRW 대조 실패');
    if (o.sourceId && store.nowMs >= o.expiresAtMs) {
      o.status = 'review'; o.note = '만료된 승계 결제의 승인·보상 정책 미정'; save(); throw new Error(o.note);
    }
    if (!o.sourceId && store.nowMs >= o.startMs + 15 * MINUTE && store.nowMs < o.expiresAtMs) {
      o.status = 'review'; o.note = '일반 예약 시작 +15분 이후 승인 정책 미정'; save(); throw new Error(o.note);
    }
    if (payment.status !== 'DONE') payment = await toss('/confirm', { paymentKey: input.paymentKey, orderId: o.id, amount: 3000 }, `confirm-${o.id}`);
  } catch (error) {
    o.status = 'review'; o.note ??= '결제 승인 결과 확인 필요 · 실패 재시도 정책 미정'; notice(userId, o.note); save(); throw error;
  }
  return await applyApproval(o,payment);
}
export async function simulateApproval(userId: string, id: string) {
  const o=store.orders.find(o=>o.id===id && o.userId===userId);
  requireThat(o,'본인 주문이 없습니다.');
  if(o.paymentMode==='simulated' && o.state.paidAmount>0) return publicOrder(o);
  requireThat(!o.paymentMode && o.state.paymentKey==='' && o.state.paidAmount===0,'실제 토스 승인 확인 중·결과 불명 주문을 모의 승인으로 바꿀 수 없습니다.');
  requireThat(!o.launched,'열린 결제창을 먼저 닫아 주세요.');
  requireThat(o.status==='pending' && store.nowMs<o.expiresAtMs,'모의 승인도 기존 결제 기한 안에서만 가능합니다.');
  requireThat(o.sourceId || store.nowMs<o.startMs+15*MINUTE,'일반 예약 시작 +15분 이후 승인 정책 미정');
  o.paymentMode='simulated';
  // tests/rules/payment-fixtures.ts의 fakePayment와 동일한 규칙 경계 응답 형식.
  // 테스트 모듈 자체는 import하지 않으며 외부 토스 API를 호출하지 않는다.
  const payment: PaymentSnapshot={paymentKey:`fake-payment-${o.id}`,orderId:o.id,method:'카드',status:'DONE',currency:'KRW',totalAmount:3000};
  o.state={...o.state,paymentKey:payment.paymentKey};save();
  return await applyApproval(o,payment);
}
async function applyApproval(o:Order,payment:PaymentSnapshot) {
  const userId=o.userId;
  const c = getCharger(o.statId,o.chgerId);
  const source = store.bookings.find(b => b.id === o.sourceId);
  const placeAvailable = !!c && !reasons(c,o.connector).length && !active(userId)
    && !hasReservationOverlap(o, { startMs:o.startMs,endMs:o.endMs }, occupancies(o.id))
    && (!o.sourceId || (source?.queue?.activePaymentRequest?.userId === userId && !source.undecided));
  // 기존 순수 reducer의 계약: 호출자가 자리·자격을 재검사한다.
  const result = reducePaymentApproval({ ...o.state, holdExpiresAtMs: placeAvailable ? o.expiresAtMs : store.nowMs }, {
    type:'approval-response', payment, receivedAtMs:store.nowMs,
  });
  o.state = result.state;
  if (o.state.reservation) {
    o.status = 'confirmed'; o.note = o.paymentMode==='simulated' ? '시연용 모의 결제 · 가짜 카드 DONE 3,000원 · 예약 확정 (토스 승인 없음)' : '카드 DONE · 3,000원 승인 확인 · 예약 확정';
    store.bookings.push({ id:randomUUID(), userId, statId:o.statId,chgerId:o.chgerId,stationName:o.stationName,
      originalStartMs:o.startMs,originalEndMs:o.endMs,confirmedAtMs:store.nowMs,status:'confirmed',checkedInAtMs:null,
      cancellationReason:null,refundAmount:0,noShowCount:0,occupiesActiveReservation:true,connector:o.connector,
      succession:!!o.sourceId,orderId:o.id,paymentMode:o.paymentMode,queue:null,undecided:o.sourceId ? '승계 체크인·재노쇼 화면은 이번 시연에 미연결' : null });
    if(source?.queue) source.queue = { ...source.queue, activePaymentRequest:null };
    notice(userId,o.note); save();
  } else if (result.effects.length) { o.status='expired'; save(); await requestRefund(o); }
  else { o.status='review'; o.note='카드 DONE 승인 대조 실패 · 미확정'; save(); }
  return publicOrder(o);
}
function atTime(nowMs: number) {
  store.nowMs = nowMs;
  for (const o of store.orders) if (o.status === 'pending' && o.expiresAtMs <= nowMs) {
    o.status='expired'; o.note='10분 결제 점유 만료'; notice(o.userId,o.note);
  }
  for (const b of store.bookings) {
    if (b.succession || b.status === 'checked-in') continue;
    const noShowDue = b.status === 'confirmed' && nowMs >= b.originalStartMs + 15 * MINUTE;
    const expiryDue = b.queue?.activePaymentRequest && nowMs >= b.queue.activePaymentRequest.expiresAtMs;
    if (!noShowDue && !expiryDue) continue;
    const entries = store.waiters.filter(w => w.sourceId === b.id).sort((a,c)=>a.appliedAtMs-c.appliedAtMs);
    const expired = b.queue?.expiredWaiterIds ?? [];
    const candidate = entries.find(w=>!expired.includes(w.userId) && w.userId !== (expiryDue ? b.queue?.activePaymentRequest?.userId : null));
    const blocked = candidate && active(candidate.userId) ? '예약 보유 첫 대기자 처리 미정'
      : expiryDue && b.originalEndMs-nowMs < 30*MINUTE ? '만료 후 잔여 30분 재검사 미정' : null;
    const reservation = { id:b.id,userId:b.userId,statId:b.statId,chgerId:b.chgerId,
      originalStartMs:b.originalStartMs,originalEndMs:b.originalEndMs,checkedInAtMs:b.checkedInAtMs,
      status:b.status,cancellationReason:b.cancellationReason,refundAmount:b.refundAmount,
      noShowCount:b.noShowCount,occupiesActiveReservation:b.occupiesActiveReservation };
    const initial = b.queue ?? { reservation, waiters:[], activePaymentRequest:null, expiredWaiterIds:[] };
    const result = reduceNoShowAndSuccession({ ...initial, reservation,
      waiters:blocked ? [] : entries.map(w=>({ userId:w.userId,appliedAtMs:w.appliedAtMs })) },nowMs);
    if (expiryDue) notice(b.queue!.activePaymentRequest!.userId,'승계 결제 10분 기회 만료');
    Object.assign(b,result.state.reservation); b.queue=result.state; b.undecided=blocked;
    if (noShowDue) notice(b.userId,'노쇼 취소 · 환불 0원 · 시연 시계가 체크인 기한에 도달');
    if(blocked && candidate) notice(candidate.userId,blocked);
    for(const effect of result.effects) notice(effect.request.userId,'노쇼로 결제 기회 도착 · 10분 안에 3,000원 카드 결제 후 승계 확정');
  }
}
export function advanceTo(target: number) {
  requireThat(Number.isSafeInteger(target) && target >= store.nowMs, '시계 역행·초기화 정책 미정');
  requireThat(target-store.nowMs <= 8*24*60*MINUTE,'한 번에 8일 이내로 진행해 주세요.');
  // 미정 이벤트를 건너뛰어 확정한 것으로 처리하지 않는다.
  requireThat(!store.bookings.some(b=>b.status==='checked-in' && target>=b.originalEndMs), '정상 자동 종료·환불 연결은 이번 시연 범위 밖입니다.');
  requireThat(!store.bookings.some(b=>b.succession && b.occupiesActiveReservation && target>=b.confirmedAtMs+15*MINUTE), '승계 체크인·재노쇼 화면은 이번 시연에 미연결 · 종료와 동시 기한 처리 정책 미정');
  while (true) {
    const times = [ ...store.orders.filter(o=>o.status==='pending').map(o=>o.expiresAtMs),
      ...store.bookings.filter(b=>!b.succession && b.status==='confirmed').map(b=>b.originalStartMs+15*MINUTE),
      ...store.bookings.flatMap(b=>b.queue?.activePaymentRequest ? [b.queue.activePaymentRequest.expiresAtMs] : [])
    ].filter(t=>t>store.nowMs && t<=target);
    if(!times.length) break;
    atTime(Math.min(...times));
  }
  atTime(target); save();
}
export function noShow(userId:string,id:string) {
  const b=ownBooking(userId,id);
  requireThat(!b.succession && b.status==='confirmed' && !b.checkedInAtMs,'미체크인 일반 확정 예약만 노쇼 시연 가능합니다.');
  advanceTo(Math.max(store.nowMs,b.originalStartMs+15*MINUTE));
}
export function checkIn(userId:string,id:string) {
  const b=ownBooking(userId,id);
  requireThat(!b.succession,'승계 체크인 화면은 이번 시연에 미연결');
  requireThat(b.status==='confirmed' && canCheckInGeneralReservation(b.originalStartMs,store.nowMs),'체크인은 시작 10분 전부터 시작 15분 후 미만에 가능합니다.');
  b.status='checked-in';b.checkedInAtMs=store.nowMs;notice(userId,'체크인 완료 · 체크인만으로 환불하지 않음');save();
}
