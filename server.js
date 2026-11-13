'use strict';
/* VECTOR HAVOC server: static files, WebSocket game protocol, profiles + store, voice signalling, PIN-protected developer API. */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const {WebSocketServer}=require('ws');
const CFG=require('./config');
const PRO=require('./profiles');
const {Room}=require('./game');
const {defaultMaps,gen,genWorld}=require('./maps');

const PORT=+process.env.PORT||3000;
const DEV_PIN=String(process.env.DEV_PIN||'8881');
const PUB=path.join(__dirname,'public'),MUSIC=path.join(CFG.DATA,'music'),ICONS=path.join(CFG.DATA,'icons'),BANS=path.join(CFG.DATA,'bans.json'),AUTHF=path.join(CFG.DATA,'auth.json');
fs.mkdirSync(ICONS,{recursive:true});
const TURN=process.env.TURN_URL?{urls:process.env.TURN_URL.split(','),username:process.env.TURN_USER||'',credential:process.env.TURN_PASS||''}:null;
const ICE=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}].concat(TURN?[TURN]:[]);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.m4a':'audio/mp4','.webm':'audio/webm'};

/* ---------- developer PIN (env default, changeable from the console and stored hashed) ---------- */
let authRec=null;try{authRec=JSON.parse(fs.readFileSync(AUTHF,'utf8'));}catch(e){}
const scrypt=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');
function checkPin(pin){
  pin=String(pin||'');
  if(authRec){const a=Buffer.from(scrypt(pin,authRec.salt)),b=Buffer.from(authRec.hash);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
  const A=Buffer.from(pin),B=Buffer.from(DEV_PIN);if(A.length!==B.length){crypto.timingSafeEqual(A,A);return false;}return crypto.timingSafeEqual(A,B);
}
function setPin(pin){const salt=crypto.randomBytes(16).toString('hex');authRec={salt,hash:scrypt(pin,salt)};fs.writeFileSync(AUTHF,JSON.stringify(authRec));}

let bans={};try{bans=JSON.parse(fs.readFileSync(BANS,'utf8'));}catch(e){}
const saveBans=()=>{try{fs.writeFileSync(BANS,JSON.stringify(bans));}catch(e){}};
const ipOf=(req)=>{const x=process.env.TRUST_PROXY==='0'?'':String(req.headers['x-forwarded-for']||'').split(',')[0].trim();return x||req.socket.remoteAddress||'?';};

/* ---------- hub ---------- */
const clients=new Set(),rooms=new Map();let locked=false,banner='';
const send=(ws,o)=>{if(ws&&ws.readyState===1&&ws.bufferedAmount<1.5e6){try{ws.send(JSON.stringify(o));}catch(e){}}};
const lookOf=(prof,cls)=>{const e=prof.equip;return{s:e.skins[cls]||'',w:e.wskins||{},b:e.bling||[]};};
function pushProfile(c,extra){if(c&&c.prof)send(c.ws,Object.assign({t:'prof',p:PRO.view(c.prof)},extra||{}));}
function notifyPid(pid,extra){for(const c of clients)if(c.prof&&c.prof.id===pid)pushProfile(c,extra);}
const hub={
  sendRoster(room){
    const list=[...room.players.values()].map(p=>({i:p.id,n:p.name,t:p.team,c:p.cls,k:p.k,d:p.d,b:p.bot?1:0,v:p.voice?1:0,lk:p.look||null,lv:p.lvl||0,pl:p.place||0,al:p.alive?1:0,sq:p.sq,si:p.si}));
    for(const p of room.humans())send(p.ws,{t:'r',p:list});
  },
  sendWorld(room){
    const md=room.mapDef,msg={t:'w',room:room.code,mode:room.modeId,priv:room.priv?1:0,practice:room.practice?1:0,map:{id:md.id,name:md.name,rows:md.rows,theme:md.theme||'neon',br:md.br?1:0},pickups:room.pickups.map(k=>({id:k.id,x:k.x,y:k.y,type:k.type,up:k.up?1:0}))};
    for(const p of room.humans())send(p.ws,{...msg,you:p.id,team:p.team});
    room.rosterDirty=true;
  },
  sendVoiceGains(room){
    const cfg=CFG.get(),hear=cfg.player.hearing*1.2,vs=room.humans().filter(p=>p.voice);
    if(vs.length<2)return;
    for(const a of vs){const g={};for(const b of vs){if(a===b)continue;
      const d=Math.hypot(a.x-b.x,a.y-b.y),mate=room.allied(a,b);
      let v=mate?1:Math.max(0,1-d/hear);if(!mate&&!b.alive)v=0;if(!a.alive&&!mate&&room.type!=='br')v=0;if(mate&&b.alive&&a.alive)v=Math.max(.35,v);g[b.id]=Math.round(v*100)/100;}
      send(a.ws,{t:'vg',g});}
  },
  award(p,a){
    const prof=p.pid&&PRO.get(p.pid);if(!prof)return;const r=PRO.award(prof,a);
    if(p.client)send(p.ws,{t:'rw',coins:r.coins,xp:r.xp,win:a.win?1:0,place:a.place||0,p:PRO.view(prof)});
  }
};
function newCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ';for(;;){let c='';for(let i=0;i<4;i++)c+=A[(Math.random()*A.length)|0];if(!rooms.has(c))return c;}}
function makeRoom(opts){const r=new Room(newCode(),opts,hub);rooms.set(r.code,r);return r;}
function findRoom(modeId,mapId){
  const cfg=CFG.get(),max=cfg.match.maxPlayers;let best=null;
  for(const r of rooms.values()){if(r.priv||r.practice||r.locked||r.modeId!==modeId)continue;if(r.humans().length>=max)continue;
    if(r.type==='br'&&r.phase!=='countdown')continue;
    if(mapId&&r.mapId!==mapId)continue;if(!best||r.humans().length>best.humans().length)best=r;}
  return best||makeRoom({mode:modeId,map:mapId});
}
function joinRoom(c,room){
  leave(c);
  const prof=c.prof,cfg=CFG.get();let cls=prof.equip.op;if(!PRO.ownsOp(prof,cfg,cls)||!cfg.classes[cls])cls=Object.keys(cfg.classes).find(k=>PRO.ownsOp(prof,cfg,k));
  const p=room.add({name:prof.name,cls,ws:c.ws,client:c,pid:prof.id,look:lookOf(prof,cls)});
  c.room=room;c.p=p;hub.sendWorld(room);
  send(c.ws,{t:'cfg',cfg:CFG.publicCfg(),ice:ICE,banner});pushProfile(c);
  for(const q of room.humans())send(q.ws,{t:'sys',m:p.name+' joined'});
}
function leave(c){
  if(!c.room)return;const room=c.room,p=c.p;room.remove(p);
  for(const q of room.humans()){send(q.ws,{t:'sys',m:p.name+' left'});send(q.ws,{t:'pl',id:p.id});}
  c.room=null;c.p=null;
}
const kickClient=(c,why)=>{send(c.ws,{t:'kick',m:why||'Removed by an admin.'});try{c.ws.close();}catch(e){}};

/* ---------- http ---------- */
const sessions=new Map();
const fails={};let globalFails=[],globalLock=0;
function body(req,limit){return new Promise((res,rej)=>{const ch=[];let n=0;req.on('data',d=>{n+=d.length;if(n>limit){rej(new Error('too large'));req.destroy();return;}ch.push(d);});req.on('end',()=>res(Buffer.concat(ch)));req.on('error',rej);});}
const json=(res,code,o,extra)=>{const s=JSON.stringify(o);res.writeHead(code,Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},extra||{}));res.end(s);};
function authed(req){const h=String(req.headers.authorization||'');const t=h.startsWith('Bearer ')?h.slice(7):'';const e=sessions.get(t);if(!e||e<Date.now()){sessions.delete(t);return false;}return true;}
function devState(){
  const cfg=CFG.get();
  return{config:cfg,online:[...clients].filter(c=>c.p).length,profiles:PRO.count(),pending:PRO.pendingCount(),rooms:[...rooms.values()].map(r=>({code:r.code,mode:r.modeId,map:r.mapId,priv:r.priv,practice:r.practice,phase:r.phase,locked:r.locked,tl:Math.round(r.timeLeft),score:r.score,
    players:[...r.players.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,team:p.team,cls:p.cls,k:p.k,d:p.d,voice:p.voice,pid:p.pid||'',ip:p.client?p.client.ip:'',rtt:p.client?p.client.rtt||0:0,fps:p.client?p.client.fps||0:0,sq:p.sq}))})),tx:PRO.listTx(150),
    bans:Object.keys(bans),locked,banner,uptime:Math.round(process.uptime()),pinIsDefault:!authRec&&DEV_PIN==='8881',persist:{dataDir:CFG.DATA}};
}
function pushCfg(){for(const c of clients)if(c.ws.readyState===1)send(c.ws,{t:'cfg',cfg:CFG.publicCfg(),ice:ICE,banner});}
async function devApi(req,res,u){
  const ip=ipOf(req);
  if(u.pathname==='/api/dev/login'&&req.method==='POST'){
    const now=Date.now();globalFails=globalFails.filter(t=>now-t<600000);
    const f=fails[ip]||(fails[ip]={n:0,t:now,lock:0});
    if(now<globalLock||now<f.lock)return json(res,429,{error:'Too many attempts. Try again later.'});
    let o={};try{o=JSON.parse((await body(req,1024)).toString()||'{}');}catch(e){}
    if(checkPin(o.pin)){f.n=0;const tok=crypto.randomBytes(24).toString('hex');sessions.set(tok,now+12*3600e3);return json(res,200,{token:tok});}
    f.n++;globalFails.push(now);if(f.n>=5){f.lock=now+5*60e3;f.n=0;}if(globalFails.length>=40){globalLock=now+15*60e3;globalFails=[];}
    return json(res,401,{error:'Wrong PIN'});
  }
  if(!authed(req))return json(res,401,{error:'Not signed in'});
  try{
    const P=u.pathname,M=req.method;
    if(P==='/api/dev/state'&&M==='GET')return json(res,200,devState());
    if(P==='/api/dev/config'&&M==='POST'){const o=JSON.parse((await body(req,4e6)).toString());CFG.set(o.config);pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    if(P==='/api/dev/genmap'&&M==='POST'){
      const o=JSON.parse((await body(req,1024)).toString()||'{}'),n=(v,a,b,d)=>Math.max(a,Math.min(b,isFinite(+v)?+v|0:d));
      if(o.world){const m=genWorld('tmp','tmp',{seed:n(o.seed,1,1e9,1),w:n(o.w,48,120,96)&~1,h:n(o.h,40,80,72)});return json(res,200,{rows:m.rows});}
      const w=n(o.w,24,80,48)&~1,h=n(o.h,16,50,30);
      const m=gen('tmp','tmp',{seed:n(o.seed,1,1e9,1),buildings:n(o.buildings,0,60,16),crates:n(o.crates,0,60,20),water:n(o.water,0,10,0),tall:!!o.tall,w,h,maxW:5,maxH:4});
      return json(res,200,{rows:m.rows});}
    if(P==='/api/dev/reset'&&M==='POST'){
      const o=JSON.parse((await body(req,1024)).toString()||'{}');const cur=CFG.get();
      if(o.what==='maps'){const next=CFG.clone(cur);next.maps=defaultMaps();next.mapOrder=Object.keys(next.maps).filter(i=>!next.maps[i].br);CFG.set(next);}
      else if(o.what==='store'){const next=CFG.clone(cur),d=CFG.clone(CFG.DEFAULTS);next.store=d.store;next.daily=d.daily;CFG.set(next);}
      else{const keep={maps:cur.maps,mapOrder:cur.mapOrder,music:cur.music,store:cur.store,daily:cur.daily,custom:cur.custom};const d=CFG.clone(CFG.DEFAULTS);CFG.set(Object.assign(d,keep));}
      pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    if(P==='/api/dev/music'&&M==='POST'){
      const ext=String(u.query.ext||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(!['mp3','ogg','wav','m4a','webm'].includes(ext))return json(res,400,{error:'Use mp3, ogg, wav, m4a or webm'});
      const buf=await body(req,25e6);if(buf.length<2000)return json(res,400,{error:'File looks empty'});
      const id=crypto.randomBytes(5).toString('hex'),file=id+'.'+ext;fs.writeFileSync(path.join(MUSIC,file),buf);
      const cfg=CFG.clone(CFG.get());cfg.music.tracks.push({id,name:String(u.query.name||'Track').slice(0,60),file,where:'both'});CFG.set(cfg);pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    const m=P.match(/^\/api\/dev\/music\/([a-f0-9]+)$/);
    if(m&&M==='DELETE'){
      const cfg=CFG.clone(CFG.get()),i=cfg.music.tracks.findIndex(t=>t.id===m[1]);if(i<0)return json(res,404,{error:'No such track'});
      const [t]=cfg.music.tracks.splice(i,1);try{fs.unlinkSync(path.join(MUSIC,path.basename(t.file)));}catch(e){}CFG.set(cfg);pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    if(P==='/api/dev/logo'&&M==='POST'){
      const o=JSON.parse((await body(req,3e6)).toString()),sz=+o.size;if(![192,512].includes(sz))return json(res,400,{error:'size must be 192 or 512'});
      const b=Buffer.from(String(o.data||'').replace(/^data:image\/png;base64,/,''),'base64');if(b.length<200||b.slice(1,4).toString()!=='PNG')return json(res,400,{error:'Send a PNG'});
      fs.writeFileSync(path.join(ICONS,'icon-'+sz+'.png'),b);return json(res,200,{ok:true});}
    if(P==='/api/dev/logo'&&M==='DELETE'){for(const s of [192,512])try{fs.unlinkSync(path.join(ICONS,'icon-'+s+'.png'));}catch(e){}return json(res,200,{ok:true});}
    if(P==='/api/dev/orders'&&M==='GET')return json(res,200,{orders:PRO.listOrders()});
    if(P==='/api/dev/order'&&M==='POST'){
      const o=JSON.parse((await body(req,1024)).toString()),r=PRO.setOrder(String(o.id||''),o.a,'dev');if(r.err)return json(res,400,{error:r.err});
      notifyPid(r.pid,{note:o.a==='approve'?'Your order '+o.id+' was approved!':'Your order '+o.id+' was declined.'});return json(res,200,{ok:true,orders:PRO.listOrders()});}
    if(P==='/api/dev/profiles'&&M==='GET')return json(res,200,{profiles:PRO.search(u.query.q)});
    if(P==='/api/dev/grant'&&M==='POST'){
      const o=JSON.parse((await body(req,2048)).toString()),r=PRO.grant(String(o.pid||''),{coins:o.coins,item:o.item,remove:!!o.remove});if(r.err)return json(res,400,{error:r.err});
      notifyPid(o.pid,{note:'The team updated your account.'});return json(res,200,{ok:true,profiles:PRO.search(o.pid)});}
    if(P==='/api/dev/pin'&&M==='POST'){
      const o=JSON.parse((await body(req,1024)).toString());if(!checkPin(o.current))return json(res,400,{error:'Current PIN is wrong'});
      const np=String(o.next||'');if(np.length<4||np.length>32)return json(res,400,{error:'New PIN must be 4 to 32 characters'});setPin(np);sessions.clear();return json(res,200,{ok:true});}
    if(P==='/api/dev/backup'&&M==='GET'){
      const b={format:'vb-backup-1',at:Date.now(),config:CFG.get(),profiles:PRO.backup().profiles,orders:PRO.backup().orders,bans};
      return json(res,200,b,{'Content-Disposition':'attachment; filename="vector-blackout-backup-'+new Date().toISOString().slice(0,10)+'.json"'});}
    if(P==='/api/dev/restore'&&M==='POST'){
      const b=JSON.parse((await body(req,40e6)).toString());if(b.format!=='vb-backup-1')return json(res,400,{error:'Not a Vector Blackout backup'});
      if(b.config)CFG.set(b.config);PRO.restoreBackup(b);if(b.bans){bans=b.bans;saveBans();}pushCfg();return json(res,200,{ok:true});}
    if(P==='/api/dev/act'&&M==='POST'){
      const o=JSON.parse((await body(req,4096)).toString());
      const findP=id=>{for(const r of rooms.values()){const p=r.players.get(id);if(p&&!p.bot)return p;}return null;};
      switch(o.a){
        case 'kick':{const p=findP(o.id);if(p&&p.client)kickClient(p.client,o.m);break;}
        case 'ban':{const p=findP(o.id);if(p&&p.client){bans[p.client.ip]=Date.now();saveBans();kickClient(p.client,'You have been banned.');}break;}
        case 'unban':delete bans[o.ip];saveBans();break;
        case 'say':{const m=String(o.m||'').slice(0,200);for(const c of clients)send(c.ws,{t:'sys',m:'[ADMIN] '+m,big:1});break;}
        case 'banner':banner=String(o.m||'').slice(0,200);pushCfg();break;
        case 'lock':locked=!!o.v;break;
        case 'reload':for(const c of clients)send(c.ws,{t:'reload'});break;
        case 'closeRoom':{const r=rooms.get(o.code);if(r){for(const p of r.humans())if(p.client)kickClient(p.client,'Room closed by an admin.');rooms.delete(o.code);}break;}
        case 'restart':{const r=rooms.get(o.code);if(r){if(o.map)r.mapId=o.map;r.keepMap=true;r.loadMatch();hub.sendWorld(r);}break;}
        case 'fill':{const r=rooms.get(o.code);if(r)r.balanceBots();break;}
        default:return json(res,400,{error:'Unknown action'});
      }
      return json(res,200,{ok:true,state:devState()});}
  }catch(e){return json(res,400,{error:String(e.message||e)});}
  json(res,404,{error:'Not found'});
}
function serveFile(req,res,file,cache){
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
    const ext=path.extname(file).toLowerCase(),type=MIME[ext]||'application/octet-stream',h={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':cache||'no-cache','X-Content-Type-Options':'nosniff'};
    const rg=req.headers.range&&/bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if(rg){let s=rg[1]?+rg[1]:0,e=rg[2]?+rg[2]:st.size-1;if(s>=st.size||e<s){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end();}
      e=Math.min(e,st.size-1);res.writeHead(206,{...h,'Content-Range':`bytes ${s}-${e}/${st.size}`,'Content-Length':e-s+1});return fs.createReadStream(file,{start:s,end:e}).pipe(res);}
    res.writeHead(200,{...h,'Content-Length':st.size});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
  });
}
const server=http.createServer((req,res)=>{
  const u=url.parse(req.url,true);let p;try{p=decodeURIComponent(u.pathname||'/');}catch(e){res.writeHead(400);return res.end();}
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','microphone=(self)');
  if(p==='/health'){res.writeHead(200);return res.end('ok');}
  if(p.startsWith('/api/dev/'))return devApi(req,res,u);
  if(p==='/api/config')return json(res,200,{cfg:CFG.publicCfg(),ice:ICE});
  if(p.startsWith('/music/'))return serveFile(req,res,path.join(MUSIC,path.basename(p)),'public, max-age=3600');
  if(p==='/manifest.webmanifest'){const a=CFG.get().app,b=CFG.get().brand;return json(res,200,{name:a.name,short_name:a.short,description:b.tagline,start_url:'./',scope:'./',display:'fullscreen',display_override:['fullscreen','standalone'],orientation:'landscape',background_color:a.theme,theme_color:a.theme,
    icons:[{src:'icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},{'Cache-Control':'no-cache','Content-Type':'application/manifest+json'});}
  const im=p.match(/^\/icons\/(icon-(?:192|512)\.png)$/);
  if(im){const custom=path.join(ICONS,im[1]);return serveFile(req,res,fs.existsSync(custom)?custom:path.join(PUB,'icons',im[1]),'no-cache');}
  if(p==='/')p='/index.html';if(p==='/dev')p='/dev.html';
  const f=path.normalize(path.join(PUB,p));if(!f.startsWith(PUB)){res.writeHead(403);return res.end();}
  serveFile(req,res,f,p.startsWith('/vendor/')?'public, max-age=86400':undefined);
});

/* ---------- websocket ---------- */
const wss=new WebSocketServer({server,maxPayload:16384,path:'/ws'});
wss.on('connection',(ws,req)=>{
  const ip=ipOf(req);
  if(bans[ip]){send(ws,{t:'kick',m:'You are banned from this server.'});return ws.close();}
  const c={ws,ip,room:null,p:null,prof:null,msgs:0,msgT:Date.now(),chatT:0,payT:0};clients.add(c);
  send(ws,{t:'hi',cfg:CFG.publicCfg(),ice:ICE,banner,online:[...clients].filter(x=>x.p).length});
  ws.on('message',raw=>{
    const now=Date.now();if(now-c.msgT>1000){c.msgT=now;c.msgs=0;}if(++c.msgs>90)return;
    let m;try{m=JSON.parse(raw);}catch(e){return;}if(!m||typeof m.t!=='string')return;
    const p=c.p,room=c.room,prof=c.prof;
    switch(m.t){
      case 'auth':{
        let r=null;if(m.pid&&m.tok){const pr=PRO.auth(m.pid,m.tok);if(pr)r={p:pr,tok:m.tok};}
        let fresh=false;if(!r){const n=PRO.create(m.name);r={p:n.p,tok:n.tok};fresh=true;}
        c.prof=r.p;send(ws,{t:'prof',p:PRO.view(r.p),pid:r.p.id,tok:fresh?r.tok:undefined,fresh:fresh?1:0});break;}
      case 'restore':{const r=PRO.restore(m.code);if(!r)return send(ws,{t:'err',m:'That backup code is not valid'});c.prof=r.p;send(ws,{t:'prof',p:PRO.view(r.p),pid:r.p.id,tok:r.tok,fresh:1,restored:1});break;}
      case 'prof':if(prof)pushProfile(c);break;
      case 'name':{if(!prof)break;const r=PRO.rename(prof,m.n);if(r.err)return send(ws,{t:'err',m:r.err});pushProfile(c);break;}
      case 'buy':{if(!prof)break;const r=PRO.buy(prof,String(m.id));if(r.err)send(ws,{t:'err',m:r.err});else send(ws,{t:'bought',id:m.id});pushProfile(c);break;}
      case 'equip':{if(!prof)break;PRO.equip(prof,m.eq);pushProfile(c);break;}
      case 'sclaim':{if(!prof)break;const r=PRO.claimSeason(prof,m.tier,m.track);if(r.err)send(ws,{t:'err',m:r.err});else send(ws,{t:'sclaimok',msg:r.msg,tier:m.tier|0,track:m.track});pushProfile(c);break;}
      case 'draw':{if(!prof)break;if(now-c.payT<900)return send(ws,{t:'err',m:'Slow down a moment'});c.payT=now;const r=PRO.draw(prof,m.n===10?10:1);if(r.err)send(ws,{t:'err',m:r.err});else send(ws,{t:'drawok',res:r.res});pushProfile(c);break;}
      case 'daily':{if(!prof)break;const r=PRO.claimDaily(prof);if(r.err)send(ws,{t:'err',m:r.err});else send(ws,{t:'dailyok',msg:r.msg,reward:r.reward,i:r.dayIndex});pushProfile(c);break;}
      case 'order':{
        if(!prof)break;if(now-c.payT<2500)return send(ws,{t:'err',m:'Slow down a moment'});c.payT=now;
        const r=PRO.createOrder(prof,m,ip);if(r.err)return send(ws,{t:'err',m:r.err});send(ws,{t:'orderok',order:{id:r.order.id,label:r.order.label,naira:r.order.naira}});pushProfile(c);break;}
      case 'join':{
        if(!prof)return send(ws,{t:'err',m:'Still signing in, try again in a second'});
        if(locked)return send(ws,{t:'err',m:'Server is locked for maintenance.'});
        const cfg=CFG.get();let mode=cfg.modes[m.mode]?m.mode:Object.keys(cfg.modes)[0],map=cfg.maps[m.map]?m.map:null,r;
        const code=String(m.room||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,4);
        if(m.practice){if(rooms.size>=40)return send(ws,{t:'err',m:'Server is busy. Try again soon.'});r=makeRoom({mode,map,priv:true,practice:true,diff:cfg.match.difficulty[m.diff]?m.diff:'normal',keepMap:!!map});}
        else if(m.create){if(rooms.size>=40)return send(ws,{t:'err',m:'Server is full of rooms. Try quick play.'});r=makeRoom({mode,map,priv:true,keepMap:!!map});}
        else if(code){r=rooms.get(code);if(!r||r.practice)return send(ws,{t:'err',m:'No room with code '+code});if(r.humans().length>=cfg.match.maxPlayers)return send(ws,{t:'err',m:'That room is full.'});}
        else{if(rooms.size>=40&&![...rooms.values()].some(x=>!x.priv&&x.modeId===mode))return send(ws,{t:'err',m:'Server is busy. Try again soon.'});r=findRoom(mode,map);}
        joinRoom(c,r);break;}
      case 'in':{
        if(!p||!room)break;
        const inp={seq:m.seq|0,mx:Math.max(-1,Math.min(1,+m.mx||0)),my:Math.max(-1,Math.min(1,+m.my||0)),a:isFinite(+m.a)?+m.a:p.a,fire:m.fire?1:0,ab:m.ab?1:0,rl:m.rl?1:0,j:m.j?1:0,c:m.c?1:0,sl:m.sl?1:0,sw:m.sw?1:0,gr:m.gr?1:0,use:m.use?1:0,rv:m.rv?1:0,ssb:m.ssb?1:0,ads:m.ads?1:0};
        p.q.push(inp);if(p.q.length>8)p.q.shift();break;}
      case 'dbg':{if(!process.env.HAVOC_TEST||!p||!room)break;const C0=CFG.get();if(m.x!=null){p.x=+m.x;p.y=+m.y;p.para=0;p.z=0;p.vz=0;}if(m.wid&&C0.weapons[m.wid]){p.wid=m.wid;p.ammo=C0.weapons[m.wid].mag;}if(m.gren)p.gren=m.gren;if(m.ss)p.ss=100;if(m.k==='tpveh'){const v=room.veh.find(q=>q.k===m.v&&!q.dead);if(v){p.x=v.x-30;p.y=v.y;p.para=0;p.z=0;p.vz=0;}}else if(m.k==='skip'){room.phaseT=0.05;}else if(m.k==='kill'){const o=[...room.players.values()].find(q=>q!==p&&q.sq===p.sq&&q.alive);if(o)room.kill(o,null,null);}else if(m.k==='land'){p.para=0;p.z=0;p.vz=0;}break;}
      case 'dbgtp':{if(!process.env.HAVOC_TEST||!p||!room||!p.alive)break;const v=room.veh.filter(q=>String(q.k)===String(m.k||'car'))[0];if(v){p.para=0;p.z=0;p.vz=0;p.x=v.x-30;p.y=v.y;}break;}
case 'em':{if(!p||!room||!p.alive||p.veh||p.para||now-(c.emT||0)<2500)break;const k=String(m.k||'');if(!['salute','backflip','flex','dance','wave'].includes(k))break;c.emT=now;room.ev({e:'em',i:p.id,k});break;}
      case 'cls':{if(p&&room&&prof){const cfg=CFG.get();if(cfg.classes[m.c]&&PRO.ownsOp(prof,cfg,m.c)){p.nextCls=m.c;p.look=lookOf(prof,m.c);}}break;}
      case 'chat':{
        if(!p||!room||now-c.chatT<700)break;c.chatT=now;let txt=String(m.m||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,160);if(!txt)break;
        let team=false;if(txt.startsWith('/t ')){team=true;txt=txt.slice(3);}
        for(const q of room.humans()){if(team&&room.team&&q.team!==p.team)continue;send(q.ws,{t:'c',i:p.id,n:p.name,tm:p.team,team:team?1:0,m:txt});}
        break;}
      case 'vo':{
        if(!p||!room)break;p.voice=!!m.on;room.rosterDirty=true;
        if(p.voice)send(ws,{t:'vp',ids:room.humans().filter(q=>q!==p&&q.voice).map(q=>q.id),ice:ICE});
        else for(const q of room.humans())if(q!==p)send(q.ws,{t:'vx',id:p.id});
        break;}
      case 'sig':{
        if(!p||!room||typeof m.d!=='object'||JSON.stringify(m.d).length>8000)break;
        const q=room.players.get(m.to|0);if(q&&!q.bot&&q.voice&&p.voice)send(q.ws,{t:'sig',from:p.id,d:m.d});break;}
      case 'leave':leave(c);break;
      case 'ping':if(isFinite(+m.rtt))c.rtt=Math.max(0,Math.min(5000,+m.rtt|0));if(isFinite(+m.fps))c.fps=Math.max(0,Math.min(500,+m.fps|0));send(ws,{t:'pong',c:m.c});break;
    }
  });
  const gone=()=>{leave(c);clients.delete(c);};
  ws.on('close',gone);ws.on('error',gone);
});

/* ---------- main loop ---------- */
const TICK=1000/30;let next=Date.now();
function loop(){
  const cfg=CFG.get();
  for(const r of rooms.values()){
    try{
      r.step();
      if(r.humans().length){for(const p of r.humans())send(p.ws,r.snapshotFor(p,cfg));r.events.length=0;}
    }catch(e){console.error('room error',r.code,e);}
    if(r.emptyT>20)rooms.delete(r.code);
  }
  next+=TICK;const d=next-Date.now();if(d<-250)next=Date.now();setTimeout(loop,Math.max(0,d));
}
loop();
process.on('uncaughtException',e=>console.error('uncaught',e));
server.listen(PORT,()=>console.log(`VECTOR HAVOC listening on :${PORT}  (developer console: /dev, ${authRec?'PIN changed in console':DEV_PIN==='8881'?'PIN 8881 - change it':'PIN from DEV_PIN'}) data dir: ${CFG.DATA}`));
