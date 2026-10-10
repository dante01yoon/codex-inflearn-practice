import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Raw = Record<string, unknown>;
export interface Charger {
  statId: string; chgerId: string; name: string; address: string;
  lat: number | null; lng: number | null; type: string; output: string;
  useTime: string; limitYn: string; delYn: string; status: string; updatedAt: string;
}
export interface Station {
  id: string; name: string; address: string; lat: number | null; lng: number | null;
  chargers: Charger[];
}
const text = (v: unknown) => v === null || v === undefined ? '' : String(v);
const coordinate = (v: unknown) => v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
// 원래 수업 프로젝트의 저장 원본. 상대 경로가 이동된 작업 폴더에서는 이 위치를 읽기만 한다.
// 수업 저장소에는 서울 300곳만 담은 data/ev-small을 넣었습니다. 전체 데이터는 EV_DATA_DIR로 지정하세요.
const originalDirectory = 'data/ev-small';
const dataDirectory = resolve(process.env.EV_DATA_DIR || (existsSync('../ev-map/data/stations.json') ? '../ev-map/data' : originalDirectory));
const stationsPath = resolve(dataDirectory, 'stations.json');
const statusPath = resolve(dataDirectory, 'status.json');
const dashboardPath = resolve(dataDirectory, 'dashboard.json');
function read(path: string): any { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null; }
function records(value: any): Raw[] {
  if (Array.isArray(value)) return value;
  const items = value?.items?.item ?? value?.response?.body?.items?.item ?? value?.data ?? value?.items;
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object' && 'statId' in items) return [items];
  return [];
}
function validTimestamp(value: unknown): number | null {
  const s = text(value);
  if (!/^\d{14}$/.test(s)) return null;
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}+09:00`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms + 9 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0,14) !== s) return null;
  return ms;
}
const source = read(stationsPath);
const updates = new Map<string, Raw>();
for (const row of records(read(statusPath))) {
  const id = `${row.statId}:${row.chgerId}`;
  const time = validTimestamp(row.statUpdDt);
  if (time !== null && time > (validTimestamp(updates.get(id)?.statUpdDt) ?? -Infinity)) updates.set(id, row);
}
const groups = new Map<string, Station>();
const chargerIndex = new Map<string, Charger>();
for (const row of records(source)) {
  const statId = text(row.statId), chgerId = text(row.chgerId);
  if (!statId || !chgerId) continue;
  const update = updates.get(`${statId}:${chgerId}`);
  const latest = update && (validTimestamp(update.statUpdDt) ?? -Infinity) > (validTimestamp(row.statUpdDt) ?? -Infinity) ? update : row;
  const charger: Charger = {
    statId, chgerId, name: text(row.statNm), address: text(row.addr),
    lat: coordinate(row.lat), lng: coordinate(row.lng), type: text(row.chgerType), output: text(row.output),
    useTime: text(row.useTime), limitYn: text(row.limitYn), delYn: text(row.delYn),
    status: text(latest.stat), updatedAt: text(latest.statUpdDt),
  };
  chargerIndex.set(`${statId}:${chgerId}`, charger);
  if (!groups.has(statId)) groups.set(statId, { id: statId, name: charger.name, address: charger.address, lat: charger.lat, lng: charger.lng, chargers: [] });
  groups.get(statId)!.chargers.push(charger);
}
const dashboard = read(dashboardPath);
// 집계만 있을 때는 위치를 표시해도 충전기 식별자나 자격을 만들지 않는다.
if (!groups.size && Array.isArray(dashboard?.stations)) for (const row of dashboard.stations) {
  if (Array.isArray(row)) groups.set(String(row[0]), { id: String(row[0]), name: String(row[1]), address: String(row[2]), lng: coordinate(row[3]), lat: coordinate(row[4]), chargers: [] });
}
export const stations = [...groups.values()];
export const dataInfo = {
  available: chargerIndex.size > 0, stationCount: stations.length, chargerCount: chargerIndex.size,
  fetchedAt: dashboard?.meta?.stationsFetchedAt ?? source?.fetchedAt ?? null,
  statusFetchedAt: dashboard?.meta?.statusFetchedAt ?? null,
  error: chargerIndex.size ? null : '충전기 원본 미준비 — EV_DATA_DIR에 stations.json이 있는 폴더를 지정해 주세요.',
};
export function getCharger(statId: string, chgerId: string) { return chargerIndex.get(`${statId}:${chgerId}`); }
const connectors: Record<string, string[]> = {
  '01': ['DC차데모'], '02': ['AC완속'], '03': ['DC차데모','AC3상'], '04': ['DC콤보'],
  '05': ['DC차데모','DC콤보'], '06': ['DC차데모','AC3상','DC콤보'], '07': ['AC3상'],
  '08': ['DC콤보'], '09': ['NACS'], '10': ['DC콤보','NACS'], '11': ['DC콤보2(버스전용)'],
};
export function supported(c: Charger) { return connectors[c.type] ?? []; }
export function reasons(c: Charger, connector?: string): string[] {
  const result: string[] = [];
  if (c.limitYn !== 'N') result.push(c.limitYn === 'Y' ? '이용 제한' : '이용 제한 정보 없음');
  if (c.delYn !== 'N') result.push(c.delYn === 'Y' ? '삭제된 충전기' : '삭제 여부 정보 없음');
  if (c.useTime !== '24시간 이용가능') result.push(['24시간','00:00~24:00'].includes(c.useTime) ? '24시간 문구 판별 미정' : '24시간 예약 조건 미충족 또는 문구 판별 미정');
  if (!['2','3'].includes(c.status)) result.push(c.status === '4' ? '고장' : c.status === '5' ? '점검' : '상태 확인 불가');
  if (!supported(c).length) result.push('충전기 타입 미정');
  if (connector && !supported(c).includes(connector)) result.push('선택 커넥터 불일치');
  if (connector === 'DC콤보2(버스전용)') result.push('버스전용 차량 자격 미정');
  return result;
}
