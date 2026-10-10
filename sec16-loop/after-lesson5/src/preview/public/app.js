const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(ms,short=false)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',...(short?{}:{second:'2-digit'}),hour12:false}).format(ms);
const day=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
const time=ms=>new Date(ms+9*3600000).toISOString().slice(11,16);
let state, rows=[], selected=null, charger=null, detail=null, duration=60, searchTimer;
let formDate='',formTime='',connector='';
let busy=false;
async function api(path,body){const r=await fetch(`/api/${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
function message(text,error=false){$('#message').hidden=false;$('#message').textContent=text;$('#message').classList.toggle('error',error);}
async function action(fn){if(busy)return;busy=true;document.body.setAttribute('aria-busy','true');try{await fn();}catch(e){message(e.message,true);}finally{busy=false;document.body.removeAttribute('aria-busy');}}
async function refresh(){state=await api('state');$('#account').value=state.userId;$('#clock').textContent=fmt(state.nowMs);renderState();if(selected){detail=await api(`station?id=${encodeURIComponent(selected)}`);renderDetail();}}
async function search(){rows=(await api(`stations?q=${encodeURIComponent($('#search').value.trim())}`)).stations;renderList();renderMap();}
async function selectStation(id){selected=id;charger=null;connector='';detail=await api(`station?id=${encodeURIComponent(id)}`);renderList();renderMap();renderDetail();if(innerWidth<650)$('#station-detail').scrollIntoView({behavior:'smooth',block:'start'});}
function renderList(){ $('#station-count').textContent=`${rows.length.toLocaleString()}곳${rows.length===200?' · 검색으로 좁히기':''}`;$('#station-list').innerHTML=rows.length?rows.map(s=>`<button class="station-row ${selected===s.id?'selected':''}" data-station="${esc(s.id)}"><span class="station-icon" aria-hidden="true">↯</span><span><b>${esc(s.name||'이름 정보 없음')}</b><small>${esc(s.address||'주소 정보 없음')}</small></span><span class="row-end">${s.bookableCount?s.bookableCount+'대 조건 충족':s.chargerCount?'조건 확인':'원본 미준비'}</span></button>`).join(''):'<p class="empty">검색 결과가 없습니다.</p>'; }
function renderMap(){
  const points=rows.filter(s=>s.lat&&s.lng&&s.lat>37&&s.lat<38&&s.lng>126&&s.lng<128);
  let minX=126.78,maxX=127.2,minY=37.42,maxY=37.7;
  if(points.length>1){minX=Math.min(...points.map(s=>s.lng))-.015;maxX=Math.max(...points.map(s=>s.lng))+.015;minY=Math.min(...points.map(s=>s.lat))-.015;maxY=Math.max(...points.map(s=>s.lat))+.015;}
  const x=v=>32+(v-minX)/(maxX-minX)*536,y=v=>330-(v-minY)/(maxY-minY)*290;
  const grid=Array.from({length:7},(_,i)=>`<path d="M${i*100} 0V370 M0 ${i*70}H600" stroke="#dce6d8" stroke-width="1"/>`).join('');
  $('#map').innerHTML=`<rect width="600" height="370" fill="#edf2ea"/>${grid}<text x="20" y="28" fill="#8fa088" font-size="11">37° N / 127° E · 저장된 충전소 위치</text>${points.map(s=>`<g class="marker" role="button" tabindex="0" aria-label="${esc(s.name)} 선택" data-station="${esc(s.id)}"><title>${esc(s.name)}</title>${selected===s.id?`<circle cx="${x(s.lng)}" cy="${y(s.lat)}" r="16" fill="#116c50" opacity=".16"/>`:''}<circle cx="${x(s.lng)}" cy="${y(s.lat)}" r="${selected===s.id?8:5}" fill="${s.bookableCount?'#116c50':'#a8b7ad'}" stroke="white" stroke-width="2"/></g>`).join('')}${!points.length?'<text x="300" y="190" text-anchor="middle" fill="#73827e" font-size="13">표시할 좌표 데이터가 없습니다</text>':''}`;
}
function renderDetail(){
  if(!detail)return;
  if(!detail.chargers.some(c=>c.chgerId===charger))charger=detail.chargers.find(c=>!c.reasons.length)?.chgerId??detail.chargers[0]?.chgerId;
  const c=detail.chargers.find(c=>c.chgerId===charger);
  if(!formDate){const next=Math.ceil(state.nowMs/1800000)*1800000;formDate=day(next);formTime=time(next);}
  const mismatch=connector&&c&&!c.connectors.includes(connector);
  $('#station-detail').innerHTML=`<div class="station-title"><h3>${esc(detail.name||'이름 정보 없음')}</h3><p class="address">${esc(detail.address||'주소 정보 없음')}</p></div>${!c?'<div class="warning">충전기 원본 미준비 · 예약할 충전기 정보를 만들지 않습니다.</div>':`
    <div class="field"><span class="field-label">01 · 충전기 선택</span><div class="charger-options">${detail.chargers.map(x=>`<button class="charger-option ${x.chgerId===charger?'active':''}" data-charger="${esc(x.chgerId)}"><b>충전기 ${esc(x.chgerId)} · ${esc(x.output||'출력 정보 없음')}${x.output?' kW':''}</b><small>${esc(x.connectors.join(' / ')||'커넥터 정보 없음')} · ${x.status==='2'?'충전대기':x.status==='3'?'충전중 · 미래 예약 가능':'상태 확인 필요'}<br>${esc(x.useTime||'운영시간 정보 없음')}${x.reasons.length?' · '+esc(x.reasons.join(' · ')):''}</small></button>`).join('')}</div></div>
    <div class="field"><label for="connector">내 차량 커넥터</label><select id="connector"><option value="">커넥터를 직접 선택하세요</option>${['DC콤보','AC완속','DC차데모','AC3상','NACS','DC콤보2(버스전용)'].map(k=>`<option ${connector===k?'selected':''}>${k}</option>`).join('')}</select><p class="fine">커넥터 계정 저장·진행 중 변경·어댑터 정책은 미정입니다.</p></div>
    <div class="field two"><label>02 · 날짜<input id="date" type="date" value="${esc(formDate)}" min="${day(state.nowMs)}" max="${day(state.nowMs+7*86400000)}"></label><label>시작 시간 · 서울<input id="time" type="time" step="1800" value="${esc(formTime)}"></label></div>
    <div class="field"><span class="field-label">이용 시간</span><div class="duration">${[30,60,90].map(n=>`<button data-duration="${n}" class="${duration===n?'active':''}">${n}분</button>`).join('')}</div></div>
    ${c.reasons.length?`<div class="warning">${esc(c.reasons.join(' · '))}</div>`:mismatch?'<div class="warning">선택한 커넥터를 지원하지 않는 충전기입니다.</div>':connector==='DC콤보2(버스전용)'?'<div class="warning">버스전용 차량 자격 미정</div>':''}
    <div class="fee"><span>03 · 예약금</span><strong>3,000<span>원</span></strong></div><button id="book" class="primary" ${c.reasons.length||mismatch||!connector||connector==='DC콤보2(버스전용)'||!state.payment.available?'disabled':''}>토스 테스트 결제로 예약하기</button>
    <p class="fine">카드 결제만 허용 · 결제 대기 10분 · 승인 확인 후 확정<br>취소 환불: 120분 전 이상 3,000원 / 30분 전 이상 1,500원 / 그 외 0원. 노쇼 환불 0원.<br>상태 갱신: ${esc(c.updatedAt||'정보 없음')} · 실시간 현장 정보가 아닙니다.</p>`}
    <div class="schedule"><h3>선택 충전소 시간표</h3>${detail.schedule.length||detail.holds.length?detail.schedule.map(s=>`<div class="schedule-row"><div>충전기 ${esc(s.chgerId)} · ${esc(s.status)}<p>${fmt(s.startMs,true)} → ${fmt(s.endMs,true)}</p></div>${s.canWait?`<button data-wait="${esc(s.id)}">같은 구간 대기</button>`:''}</div>`).join('')+detail.holds.map(s=>`<div class="schedule-row"><div>충전기 ${esc(s.chgerId)} · 임시 점유<p>${fmt(s.startMs,true)} → ${fmt(s.endMs,true)}<br>${fmt(s.expiresAtMs)} 만료</p></div></div>`).join(''):'<p class="fine">등록된 예약·점유가 없습니다.</p>'}</div>`;
}
function renderState(){
  const bookingCards=state.bookings.map(b=>`<article class="record ${b.cancellationReason==='no-show'?'no-show':''}"><span class="status">${b.paymentMode==='simulated'?'시연용 · ':''}${b.cancellationReason==='no-show'?'노쇼 취소':b.status==='checked-in'?'체크인 완료':b.succession?'승계 확정':'예약 확정'}</span><h3>${esc(b.stationName)}</h3><p>충전기 ${esc(b.chgerId)} · ${esc(b.connector)}</p><p class="timeline">${fmt(b.originalStartMs,true)} → ${fmt(b.originalEndMs,true)}</p><p>체크인 기한 ${fmt(b.checkinDeadlineMs)}</p><p>예약금 3,000원 · ${b.paymentMode==='simulated'?'모의 승인 · 토스 승인 없음':'토스 카드 승인 확인'}${b.cancellationReason==='no-show'?' · 환불 0원':''}</p>${b.undecided?`<p class="warning">${esc(b.undecided)}</p>`:''}<div class="actions">${b.status==='confirmed'&&!b.succession?`<button data-checkin="${esc(b.id)}" ${b.canCheckIn?'':'disabled'}>체크인</button><button data-noshow="${esc(b.id)}">노쇼 시연</button>`:''}<button data-select="${esc(b.statId)}">충전소 보기</button></div>${b.status==='confirmed'&&!b.succession?'<p class="fine">노쇼 시연은 시계를 시작 +15분으로 진행합니다.</p>':''}</article>`);
  const requestCards=state.requests.map(r=>`<article class="record request"><span class="status">승계 결제 기회</span><h3>${esc(r.stationName)}</h3><p>충전기 ${esc(r.chgerId)} · 종료 ${fmt(r.originalEndMs,true)} 유지</p><p class="timeline">결제 기한 ${fmt(r.expiresAtMs)}</p><p>예약금 3,000원 · 결제 승인 후 승계 확정</p>${r.canPay?`<button class="primary" data-succeed="${esc(r.sourceId)}">3,000원 승계 테스트 결제</button>`:`<div class="warning">${esc(r.undecided||'결제 중 잔여 30분 경계 판정 미정')}</div>`}</article>`);
  const waitCards=state.waiters.map(w=>`<article class="record"><span class="status">${esc(w.status)}${w.position>0?' · '+w.position+'순위':''}</span><h3>${esc(w.stationName)}</h3><p class="timeline">${fmt(w.startMs,true)} → ${fmt(w.endMs,true)}</p><p>대기 신청 결제 0원 · 같은 원래 시간 구간</p>${w.undecided?`<p class="warning">${esc(w.undecided)}</p>`:''}</article>`);
  const orderCards=state.orders.filter(o=>o.status!=='confirmed').map(o=>`<article class="record"><span class="status">${o.status==='pending'?'결제 대기':o.status==='expired'?'점유 만료':'결과 확인 필요'}</span><h3>${esc(o.stationName)}</h3><p class="timeline">${fmt(o.startMs,true)} → ${fmt(o.endMs,true)}</p><p>만료 ${fmt(o.expiresAtMs)}</p><p>${o.paymentMode==='simulated'?'시연용 모의 승인':'승인'} ${o.paidAmount.toLocaleString()}원 · 반환 ${o.refundedAmount.toLocaleString()}원</p><p>${esc(o.note||'카드 승인 전 · 예약 미확정')}</p>${o.status==='pending'?`<a class="checkout-back" href="/checkout?orderId=${encodeURIComponent(o.id)}">결제 화면으로 돌아가기</a>`:''}</article>`);
  const cards=[...requestCards,...bookingCards,...waitCards,...orderCards];
  $('#my-state').innerHTML=cards.length?`<div class="record-grid">${cards.join('')}</div>`:'<div class="empty">아직 예약이나 대기 신청이 없습니다. 충전소와 시간을 선택해 보세요.</div>';
  if(state.events.length)$('#my-state').innerHTML+=`<div class="events">${state.events.map(e=>`<p><time>${fmt(e.atMs)}</time>${esc(e.message)}</p>`).join('')}</div>`;
  $('#data-meta').textContent=state.dataInfo.error??`저장 데이터 ${state.dataInfo.stationCount.toLocaleString()}곳 · ${state.dataInfo.chargerCount.toLocaleString()}대 · 수집 시각 ${state.dataInfo.fetchedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(state.dataInfo.fetchedAt)):'정보 없음'} (서울)`;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-station]');if(!b)return;
  action(async()=>{
    if(b.dataset.station)await selectStation(b.dataset.station);
    else if(b.dataset.select)await selectStation(b.dataset.select);
    else if(b.dataset.charger){charger=b.dataset.charger;renderDetail();}
    else if(b.dataset.duration){duration=Number(b.dataset.duration);renderDetail();}
    else if(b.dataset.seconds){await api('clock',{seconds:Number(b.dataset.seconds)});await refresh();}
    else if(b.dataset.wait){await api('wait',{id:b.dataset.wait,connector});message('대기 신청 완료 · 결제 0원');await refresh();}
    else if(b.dataset.noshow){await api('no-show',{id:b.dataset.noshow});message('시계를 체크인 기한으로 진행했습니다. 미체크인 예약은 노쇼 취소됩니다.');await refresh();}
    else if(b.dataset.checkin){await api('check-in',{id:b.dataset.checkin});message('체크인 완료');await refresh();}
    else if(b.dataset.succeed){const d=await api('succession',{id:b.dataset.succeed});location.href=`/checkout?orderId=${encodeURIComponent(d.order.id)}`;}
    else if(b.id==='refresh'){await refresh();await search();}
    else if(b.id==='book'){
      const startMs=Date.parse(`${formDate}T${formTime}:00+09:00`);
      const d=await api('order',{statId:selected,chgerId:charger,startMs,duration,connector});
      location.href=`/checkout?orderId=${encodeURIComponent(d.order.id)}`;
    }
  });
});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-station]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.addEventListener('change',e=>{
  if(e.target.id==='account')action(async()=>{await api('login',{userId:e.target.value});connector='';await refresh();});
  if(e.target.id==='date')formDate=e.target.value;
  if(e.target.id==='time')formTime=e.target.value;
  if(e.target.id==='connector'){connector=e.target.value;renderDetail();}
});
$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>action(search),180);});
async function init(){
  const q=new URLSearchParams(location.search);
  if(location.pathname==='/payment/success'){
    const payload={orderId:q.get('orderId'),paymentKey:q.get('paymentKey'),amount:Number(q.get('amount'))};
    history.replaceState({},'', '/');
    try{const result=await api('confirm',payload);message(result.note||'결제 결과 확인 필요',result.status!=='confirmed');}catch(e){message(e.message,true);}
  } else if(location.pathname==='/payment/fail'){
    const orderId=q.get('orderId'),closed=['PAY_PROCESS_CANCELED','USER_CANCEL'].includes(q.get('code'));history.replaceState({},'','/');
    if(orderId)await api(closed?'closed':'failed',{id:orderId});
    message(closed?'결제창을 닫았습니다. 결제 대기 주문에서 다시 결제하세요. 기존 기한은 유지됩니다.':'결제 승인 없음 · 예약 미확정 · 인증 실패 재시도 정책 미정',!closed);
  } else if(q.get('demo')==='approved'){
    history.replaceState({},'','/');message('시연용 가짜 승인으로 예약을 확정했습니다. 토스 승인·실제 결제는 없습니다.');
  }
  await refresh();await search();
}
action(init);
setInterval(()=>{if(!busy&&document.visibilityState==='visible')action(refresh);},6000);
