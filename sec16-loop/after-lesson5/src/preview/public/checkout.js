const $=s=>document.querySelector(s), id=new URLSearchParams(location.search).get('orderId');
const fmt=ms=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
async function api(path,body){const r=await fetch(`/api/${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
function fail(text){$('#checkout-message').hidden=false;$('#checkout-message').textContent=text;}
let widgets,methods,payment,order,sdkReady=false,busy=false;
function controls(){
  const canPay=order?.status==='pending'&&!order.launched&&!order.paymentMode;
  $('#pay').disabled=busy||!canPay||!sdkReady;
  $('#simulate').disabled=busy||!canPay;
  $('#closed').hidden=!(order?.status==='pending'&&order.launched&&!order.paymentMode);
  $('#closed').disabled=busy;
}
async function init(){
  const d=await api(`order?id=${encodeURIComponent(id)}`);order=d.order;
  const name=document.createElement('strong');name.textContent=order.stationName;$('#summary').append(name);
  const p=document.createElement('p');p.textContent=`충전기 ${order.chgerId} · ${fmt(order.startMs)} → ${fmt(order.endMs)} · 결제 기한 ${fmt(order.expiresAtMs)} (서울 시연 시계)`;$('#summary').append(p);
  controls();
  if(order.status!=='pending'){fail('유효한 결제 대기 주문이 아닙니다.');return;}
  if(order.launched)fail('결제창을 닫았다면 아래에서 닫힘을 확인한 후 같은 기한 안에 다시 결제하세요.');
  if(!d.config.available){fail('토스 테스트 키 미준비 · 시연용 가짜 승인 버튼을 사용하세요.');return;}
  if(!window.TossPayments){
    await new Promise((resolve,reject)=>{
      const script=document.querySelector('#toss-sdk');
      const timer=setTimeout(()=>reject(new Error('토스 SDK를 불러오지 못했습니다. 시연용 버튼은 사용할 수 있습니다.')),10000);
      script.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});
      script.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('토스 SDK 연결 실패 · 시연용 버튼을 사용하세요.'));},{once:true});
    });
  }
  const toss=TossPayments(d.config.clientKey);
  if(d.config.widget){
    widgets=toss.widgets({customerKey:d.config.customerKey});await widgets.setAmount({currency:'KRW',value:3000});
    methods=await widgets.renderPaymentMethods({selector:'#payment-method',variantKey:'DEFAULT'});
    await widgets.renderAgreement({selector:'#agreement',variantKey:'AGREEMENT'});
  }else{payment=toss.payment({customerKey:d.config.customerKey});$('#payment-method').textContent='신용·체크카드 테스트 결제창으로 이동합니다.';}
  sdkReady=true;controls();
}
$('#closed').addEventListener('click',async()=>{
  if(busy)return;busy=true;controls();
  try{order=await api('closed',{id});fail('결제창 닫힘 확인 · 같은 주문으로 다시 결제할 수 있습니다. 기존 기한은 유지됩니다.');}
  catch(e){fail(e.message);}finally{busy=false;controls();}
});
$('#simulate').addEventListener('click',async()=>{
  if(busy)return;busy=true;controls();
  try{const result=await api('demo-approve',{id});if(result.status==='confirmed')location.href='/?demo=approved';else fail(result.note||'시연용 모의 승인 결과 확인 필요');}
  catch(e){fail(e.message);}finally{busy=false;controls();}
});
$('#pay').addEventListener('click',async()=>{
  if(busy)return;busy=true;controls();
  let launched=false;
  try{
    if(methods){const selected=await methods.getSelectedPaymentMethod();if(selected.code!=='CARD')throw new Error('신용·체크카드를 선택해 주세요. 다른 결제수단은 허용하지 않습니다.');}
    order=await api('launch',{id});launched=true;
    const params={orderId:id,orderName:'서울 충전소 가상 예약금',successUrl:`${location.origin}/payment/success`,failUrl:`${location.origin}/payment/fail?orderId=${encodeURIComponent(id)}`};
    if(widgets)await widgets.requestPayment(params);
    else await payment.requestPayment({...params,method:'CARD',amount:{currency:'KRW',value:3000},card:{flowMode:'DEFAULT'}});
  }catch(e){
    if(launched&&['PAY_PROCESS_CANCELED','USER_CANCEL'].includes(e.code)){
      try{order=await api('closed',{id});fail('결제창을 닫았습니다. 기존 기한 안에서 다시 결제하거나 시연용 가짜 승인을 사용할 수 있습니다.');}
      catch(error){fail(error.message);}
    }else{fail(e.message||'결제창 처리 실패 · 닫았다면 닫힘 확인 버튼을 사용하세요.');}
  }finally{busy=false;controls();}
});
init().catch(e=>fail(e.message||'결제 화면을 불러오지 못했습니다.'));
