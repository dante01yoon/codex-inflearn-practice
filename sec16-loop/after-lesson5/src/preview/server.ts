import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { exclusive, store, save } from './store.ts';
import { clientConfig } from './payments.ts';
import { searchStations, stationDetails, stateFor, createOrder, joinWaitlist, successionOrder,
  approve, simulateApproval, launchOrder, paymentClosed, paymentFailed, advanceTo, noShow, checkIn } from './service.ts';

const port=Number(process.env.PORT ?? 4173);
const sessions=new Map<string,string>();
const files:Record<string,[string,string]>={
  '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'],
  '/checkout':['checkout.html','text/html'], '/checkout.js':['checkout.js','text/javascript'],
  '/payment/success':['index.html','text/html'], '/payment/fail':['index.html','text/html'],
};
const server=createServer(async(req,res)=>{
  const host=req.headers.host ?? '';
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(host)){res.writeHead(403);res.end();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  const url=new URL(req.url ?? '/',`http://${host}`);
  const cookie=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ev_session='))?.slice(11);
  let session=cookie && sessions.has(cookie) ? cookie : randomUUID();
  if(!sessions.has(session)) { sessions.set(session,'A');res.setHeader('Set-Cookie',`ev_session=${session}; HttpOnly; SameSite=Lax; Path=/`); }
  let userId=sessions.get(session)!;
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try{
    if(req.method==='GET' && files[url.pathname]){
      const [name,type]=files[url.pathname]!;
      const file=await readFile(fileURLToPath(new URL(`./public/${name}`,import.meta.url)));
      res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(file);return;
    }
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(!url.pathname.startsWith('/api/')){json(404,{error:'페이지를 찾을 수 없습니다.'});return;}
    if(req.method==='GET'){
      const data=await exclusive(()=>{
        if(url.pathname==='/api/state')return stateFor(userId);
        if(url.pathname==='/api/stations')return {stations:searchStations(url.searchParams.get('q')??'')};
        if(url.pathname==='/api/station')return stationDetails(url.searchParams.get('id')??'',userId);
        if(url.pathname==='/api/order'){
          const id=url.searchParams.get('id');const o=store.orders.find(o=>o.id===id && o.userId===userId);
          if(!o)throw new Error('본인 주문을 찾을 수 없습니다.');
          return {order:stateFor(userId).orders.find(x=>x.id===id),config:clientConfig(userId)};
        }
        throw new Error('요청을 찾을 수 없습니다.');
      });json(200,data);return;
    }
    if(req.method!=='POST'){json(405,{error:'허용되지 않은 요청입니다.'});return;}
    if(req.headers.origin!==`http://${host}` || !req.headers['content-type']?.startsWith('application/json')){json(403,{error:'같은 출처의 화면에서 요청해 주세요.'});return;}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw new Error('요청이 너무 큽니다.');}
    const input=JSON.parse(raw || '{}');
    const data=await exclusive(async()=>{
      switch(url.pathname){
        case '/api/login':{
          if(!store.accounts.some(a=>a.id===input.userId))throw new Error('테스트 운전자 계정만 선택할 수 있습니다.');
          sessions.delete(session);session=randomUUID();userId=input.userId;sessions.set(session,userId);
          res.setHeader('Set-Cookie',`ev_session=${session}; HttpOnly; SameSite=Lax; Path=/`);return stateFor(userId);
        }
        case '/api/order':return createOrder(userId,input);
        case '/api/wait':joinWaitlist(userId,input.id,input.connector);break;
        case '/api/succession':return successionOrder(userId,input.id);
        case '/api/launch':return launchOrder(userId,input.id);
        case '/api/closed':return paymentClosed(userId,input.id);
        case '/api/demo-approve':return await simulateApproval(userId,input.id);
        case '/api/failed':paymentFailed(userId,input.id);break;
        case '/api/confirm':return await approve(userId,input);
        case '/api/no-show':noShow(userId,input.id);break;
        case '/api/check-in':checkIn(userId,input.id);break;
        case '/api/clock':{
          if(![1,60,600].includes(input.seconds))throw new Error('허용된 시연 진행 단위를 선택해 주세요.');
          advanceTo(store.nowMs+input.seconds*1000);break;
        }
        default:throw new Error('요청을 찾을 수 없습니다.');
      }
      return stateFor(userId);
    });json(200,data);
  }catch(error){
    // 외부 응답과 인증키·결제 식별자는 로그에 출력하지 않는다.
    const message=error instanceof Error && !/test_[a-z]|Basic |Bearer /i.test(error.message) ? error.message : '요청 처리 실패 · 상태 확인이 필요합니다.';
    json(400,{error:message});
  }
});
save();
server.listen(port,'127.0.0.1',()=>console.log(`충전소 예약 시연: http://localhost:${port}`));
server.on('error',(e:NodeJS.ErrnoException)=>{console.error(e.code==='EADDRINUSE'?'포트가 사용 중입니다. PORT로 다른 로컬 포트를 지정해 주세요.':`로컬 서버 실행 실패 (${e.code ?? 'UNKNOWN'})`);process.exitCode=1;});
