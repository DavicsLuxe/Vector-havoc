'use strict';
/* Player profiles, coins, inventory, daily rewards and naira orders. Server-authoritative: the browser can never grant itself anything. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const CFG=require('./config');
const PF=path.join(CFG.DATA,'profiles.json'),OF=path.join(CFG.DATA,'orders.json'),TF=path.join(CFG.DATA,'tx.json');
let profiles={},orders={},txlog=[],saveT=null,dirty=false;
try{profiles=JSON.parse(fs.readFileSync(PF,'utf8'));}catch(e){}
try{orders=JSON.parse(fs.readFileSync(OF,'utf8'));}catch(e){}
try{txlog=JSON.parse(fs.readFileSync(TF,'utf8'));}catch(e){}
const SALT='vb-profile-salt-v1';
const hash=t=>crypto.createHash('sha256').update(SALT+t).digest('hex');
function flush(){dirty=false;clearTimeout(saveT);saveT=null;try{fs.writeFileSync(PF+'.tmp',JSON.stringify(profiles));fs.renameSync(PF+'.tmp',PF);fs.writeFileSync(OF+'.tmp',JSON.stringify(orders));fs.renameSync(OF+'.tmp',OF);fs.writeFileSync(TF+'.tmp',JSON.stringify(txlog));fs.renameSync(TF+'.tmp',TF);}catch(e){console.error('profile save failed',e.message);}}
function touch(){dirty=true;if(!saveT)saveT=setTimeout(flush,2000);}
process.on('exit',()=>{if(dirty)flush();});
['SIGINT','SIGTERM'].forEach(s=>process.on(s,()=>{if(dirty)flush();process.exit(0);}));
const rid=n=>crypto.randomBytes(n).toString('hex');
const lagosDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const levelOf=xp=>{let l=1,need=120,left=xp;while(left>=need){left-=need;l++;need=Math.round(need*1.12+20);if(l>200)break;}return{lvl:l,into:left,next:need};};
function cleanName(n){n=String(n||'').replace(/[^\p{L}\p{N} _\-.]/gu,'').trim().slice(0,16);return n;}

function logTx(o){txlog.push(Object.assign({ts:Date.now()},o));if(txlog.length>1500)txlog.splice(0,txlog.length-1500);touch();}
const listTx=n=>txlog.slice(-(n||200)).reverse();
function create(name){
  const id=rid(4),tok=rid(12),cfg=CFG.get();
  const firstOp=Object.keys(cfg.classes).find(k=>!cfg.classes[k].locked)||Object.keys(cfg.classes)[0];
  profiles[id]={id,th:hash(tok),name:cleanName(name)||'Op'+(100+(Math.random()*899|0)),created:Date.now(),coins:150,xp:0,owned:[],equip:{op:firstOp,skins:{},wskins:{},bling:[]},daily:{day:0,last:''},stats:{kills:0,deaths:0,wins:0,matches:0},orders:[],season:{id:'',xp:0,prem:false,cf:[],cp:[]},pity:{n:0,leg:0,myth:0}};
  touch();return{p:profiles[id],tok};
}
function auth(pid,tok){const p=profiles[String(pid||'')];if(!p||!tok)return null;const a=Buffer.from(p.th),b=Buffer.from(hash(String(tok)));return a.length===b.length&&crypto.timingSafeEqual(a,b)?p:null;}
const get=id=>profiles[id]||null;
function seasonOf(p){
  const cfg=CFG.get(),id=cfg.activeSeason;
  if(!p.season||p.season.id!==id){const keepPrem=p.season&&p.season.id===id&&p.season.prem;p.season={id,xp:0,prem:!!keepPrem,cf:[],cp:[]};}
  if(!p.pity)p.pity={n:0,leg:0,myth:0};
  return p.season;
}
function seasonView(p){
  const cfg=CFG.get(),S=cfg.seasons[cfg.activeSeason],se=seasonOf(p),P=S.pass,tier=Math.min(P.tiers,Math.floor(se.xp/P.xpPerTier));
  return{id:S.id,xp:se.xp,tier,into:tier>=P.tiers?P.xpPerTier:se.xp-tier*P.xpPerTier,per:P.xpPerTier,prem:!!se.prem,cf:se.cf,cp:se.cp,pity:p.pity};
}
function view(p){
  const cfg=CFG.get(),lv=levelOf(p.xp),today=lagosDay();
  return{id:p.id,name:p.name,coins:p.coins,xp:p.xp,lvl:lv.lvl,xpInto:lv.into,xpNext:lv.next,owned:p.owned,equip:p.equip,
    daily:{day:p.daily.day,canClaim:p.daily.last!==today,len:cfg.daily.rewards.length},stats:p.stats,season:seasonView(p),
    orders:p.orders.slice(-10).map(i=>orders[i]).filter(Boolean).map(o=>({id:o.id,kind:o.kind,label:o.label,naira:o.naira,status:o.status,ts:o.ts}))};
}
const ownsOp=(p,cfg,opId)=>{const c=cfg.classes[opId];return !!c&&(!c.locked||p.owned.some(i=>cfg.store.items[i]&&cfg.store.items[i].type==='operator'&&cfg.store.items[i].op===opId));};
function validateEquip(p,eq){
  const cfg=CFG.get(),it=cfg.store.items,out={op:p.equip.op,skins:{},wskins:{},bling:[]};
  if(eq.op&&ownsOp(p,cfg,eq.op))out.op=eq.op;if(!ownsOp(p,cfg,out.op))out.op=Object.keys(cfg.classes).find(k=>ownsOp(p,cfg,k));
  for(const [op,id] of Object.entries(eq.skins||{})){const i=it[id];if(i&&i.type==='skin'&&p.owned.includes(id)&&(i.op==='any'||i.op===op)&&cfg.classes[op])out.skins[op]=id;}
  for(const [w,id] of Object.entries(eq.wskins||{})){const i=it[id];if(i&&i.type==='wskin'&&p.owned.includes(id)&&(i.weapon==='any'||i.weapon===w)&&cfg.weapons[w])out.wskins[w]=id;}
  const slots={};for(const id of eq.bling||[]){const i=it[id];if(i&&i.type==='bling'&&p.owned.includes(id)&&!slots[i.slot]){slots[i.slot]=1;out.bling.push(id);}}
  return out;
}
function equip(p,eq){p.equip=validateEquip(p,eq||{});touch();return p.equip;}
function grantItem(p,id){if(!p.owned.includes(id)){p.owned.push(id);touch();return true;}return false;}
function buy(p,id){
  const cfg=CFG.get(),it=cfg.store.items[id];if(!it)return{err:'No such item'};
  if(p.owned.includes(id))return{err:'You already own this'};
  if(!(it.coins>0))return{err:it.naira>0?'This item is sold for naira only':'Not for sale'};
  if(it.exclusive&&it.naira>0&&!(it.coins>0))return{err:'Naira only'};
  if(p.coins<it.coins)return{err:'Not enough '+cfg.brand.currency.toLowerCase()};
  p.coins-=it.coins;grantItem(p,id);logTx({type:'buy',pid:p.id,name:p.name,detail:it.name,coins:-it.coins});touch();return{ok:1};
}
function claimDaily(p){
  const cfg=CFG.get(),today=lagosDay();if(p.daily.last===today)return{err:'Already claimed today. Come back tomorrow.'};
  const rw=cfg.daily.rewards,r=rw[p.daily.day%rw.length];let msg;
  if(r.type==='item'){if(grantItem(p,r.item))msg='Unlocked '+cfg.store.items[r.item].name;else{const c=Math.max(200,cfg.store.items[r.item].coins||500);p.coins+=c;msg='Already owned, converted to '+c+' coins';}}
  else{p.coins+=r.amount;msg='+'+r.amount+' coins';}
  p.daily.day++;p.daily.last=today;touch();return{ok:1,msg,reward:r,dayIndex:(p.daily.day-1)%rw.length};
}
function claimSeason(p,tier,track){
  const cfg=CFG.get(),S=cfg.seasons[cfg.activeSeason],se=seasonOf(p),P=S.pass;tier=tier|0;
  if(tier<1||tier>P.tiers)return{err:'No such tier'};if(Math.floor(se.xp/P.xpPerTier)<tier)return{err:'Tier not reached yet'};
  const prem=track==='premium';if(prem&&!se.prem)return{err:'Premium pass required'};
  const list=prem?se.cp:se.cf;if(list.includes(tier))return{err:'Already claimed'};
  const r=(prem?P.premium:P.free)[tier-1];let msg;
  if(r.type==='item'){if(grantItem(p,r.item))msg='Unlocked '+cfg.store.items[r.item].name;else{const c=Math.max(150,Math.round((cfg.store.items[r.item].coins||600)*.25));p.coins+=c;msg='Already owned, converted to '+c+' coins';}}
  else{p.coins+=r.amount;msg='+'+r.amount+' coins';}
  list.push(tier);logTx({type:'pass',pid:p.id,name:p.name,detail:'tier '+tier+' '+track+': '+msg});touch();return{ok:1,msg,reward:r};
}
function pickRarity(p,L){
  const pi=p.pity;
  if(pi.myth+1>=L.pity.mythic)return'mythic';if(pi.leg+1>=L.pity.legendary)return'legendary';
  let tot=0;for(const k in L.odds)tot+=L.odds[k];let r=crypto.randomInt(0,Math.max(1,Math.round(tot*100)))/100;
  for(const k in L.odds){r-=L.odds[k];if(r<0)return k;}return'common';
}
function draw(p,n){
  const cfg=CFG.get(),S=cfg.seasons[cfg.activeSeason],L=cfg.lucky,D=S.draw;n=n===10?10:1;seasonOf(p);
  const cost=n===10?D.cost10:D.cost;if(p.coins<cost)return{err:'Not enough '+cfg.brand.currency.toLowerCase()};
  const pool=Object.entries(cfg.store.items).filter(([id,it])=>it.season===S.id&&!it.exclusive);if(!pool.length)return{err:'This crate is empty right now'};
  p.coins-=cost;const res=[];
  for(let i=0;i<n;i++){
    let rar=pickRarity(p,L),opts=pool.filter(([id,it])=>it.rarity===rar);
    if(!opts.length){rar=Object.keys(L.odds).find(r=>pool.some(([id,it])=>it.rarity===r))||'common';opts=pool.filter(([id,it])=>it.rarity===rar);}
    const [id,it]=opts[crypto.randomInt(0,opts.length)];
    p.pity.n++;p.pity.leg++;p.pity.myth++;if(rar==='mythic'){p.pity.myth=0;p.pity.leg=0;}else if(rar==='legendary')p.pity.leg=0;
    if(grantItem(p,id))res.push({id,rarity:rar,dup:0});else{const c=Math.round(Math.max(60,(it.coins||600))*L.dupRefund);p.coins+=c;res.push({id,rarity:rar,dup:1,coins:c});}
  }
  logTx({type:'draw',pid:p.id,name:p.name,detail:n+' draw(s): '+res.map(r=>r.rarity[0].toUpperCase()).join(''),coins:-cost});touch();return{ok:1,res};
}
function rename(p,n){n=cleanName(n);if(n.length<2)return{err:'Name needs at least 2 characters'};p.name=n;touch();return{ok:1};}
/* ---------- orders ---------- */
function createOrder(p,o,ip){
  const cfg=CFG.get(),st=cfg.store;
  const name=String(o.name||'').replace(/[^\p{L}\p{N} .'\-]/gu,'').trim().slice(0,40),phone=String(o.phone||'').replace(/[^\d+]/g,'').slice(0,16);
  if(name.length<2)return{err:'Enter your full name'};if(phone.replace(/\D/g,'').length<7)return{err:'Enter a valid phone number'};
  const pending=p.orders.map(i=>orders[i]).filter(x=>x&&x.status==='pending');if(pending.length>=5)return{err:'You already have 5 pending orders. Wait for approval.'};
  let kind,ref,label,naira;
  if(o.kind==='pack'){const pk=st.coinPacks.find(x=>x.id===o.ref);if(!pk)return{err:'Unknown pack'};kind='pack';ref=pk.id;label=pk.name+' ('+pk.coins+' coins)';naira=pk.naira;}
  else if(o.kind==='item'){const it=st.items[o.ref];if(!it||!(it.naira>0))return{err:'This item is not sold for naira'};if(p.owned.includes(o.ref))return{err:'You already own this'};kind='item';ref=o.ref;label=it.name;naira=it.naira;}
  else if(o.kind==='pass'){const S=cfg.seasons[cfg.activeSeason],se=seasonOf(p);if(se.prem)return{err:'You already have the premium pass'};if(!(S.pass.premiumNaira>0))return{err:'Pass is not on sale'};kind='pass';ref=S.id;label='Season Pass: '+S.name;naira=S.pass.premiumNaira;}
  else return{err:'Unknown order type'};
  let id;do{id='VB-'+rid(3).toUpperCase();}while(orders[id]);
  orders[id]={id,pid:p.id,pname:p.name,name,phone,kind,ref,label,naira,status:'pending',ts:Date.now(),ip:ip||''};p.orders.push(id);logTx({type:'order',pid:p.id,name:p.name,detail:label+' ref '+id,naira,status:'pending'});touch();
  return{ok:1,order:orders[id]};
}
function setOrder(id,action,by){
  const o=orders[id];if(!o)return{err:'No such order'};if(o.status!=='pending')return{err:'Order already '+o.status};
  const p=profiles[o.pid];
  if(action==='approve'){
    if(!p)return{err:'Profile no longer exists'};const cfg=CFG.get();
    if(o.kind==='pack'){const pk=cfg.store.coinPacks.find(x=>x.id===o.ref);const c=pk?pk.coins:parseInt((o.label.match(/\((\d+) coins\)/)||[])[1]||0);p.coins+=c;}
    else if(o.kind==='pass'){const se=seasonOf(p);if(se.id===o.ref)se.prem=true;else{p.season={id:o.ref,xp:0,prem:true,cf:[],cp:[]};}}
    else{if(!grantItem(p,o.ref)){/* already owned: nothing to add */}}
    o.status='approved';logTx({type:'approved',pid:o.pid,name:o.pname,detail:o.label+' ref '+o.id,naira:o.naira});
  }else if(action==='reject'){o.status='rejected';logTx({type:'rejected',pid:o.pid,name:o.pname,detail:o.label+' ref '+o.id,naira:o.naira});}else return{err:'Unknown action'};
  o.ts2=Date.now();o.by=by||'dev';touch();return{ok:1,order:o,pid:o.pid};
}
function listOrders(){return Object.values(orders).sort((a,b)=>b.ts-a.ts).slice(0,300);}
function pendingCount(){let n=0;for(const k in orders)if(orders[k].status==='pending')n++;return n;}
/* ---------- awards, dev tools ---------- */
function award(p,a){
  if(!p)return null;const c=Math.max(0,Math.round(a.coins||0)),x=Math.max(0,Math.round(a.xp||0));
  p.coins+=c;p.xp+=x;{const se=seasonOf(p),cfg=CFG.get(),P=cfg.seasons[cfg.activeSeason].pass;se.xp=Math.min(P.tiers*P.xpPerTier,se.xp+Math.round(x*(cfg.match.seasonXpMul||1)));}p.stats.kills+=a.kills||0;p.stats.deaths+=a.deaths||0;p.stats.matches+=1;if(a.win)p.stats.wins+=1;touch();return{coins:c,xp:x};
}
function grant(pid,o){
  const p=profiles[pid];if(!p)return{err:'No such profile'};logTx({type:'dev-grant',pid,name:p.name,detail:JSON.stringify({coins:o.coins||0,item:o.item||'',remove:!!o.remove}),coins:+o.coins||0});
  if(o.coins)p.coins=Math.max(0,p.coins+Math.round(+o.coins||0));
  if(o.item){if(o.remove){p.owned=p.owned.filter(i=>i!==o.item);p.equip=validateEquip(p,p.equip);}else if(CFG.get().store.items[o.item])grantItem(p,o.item);else return{err:'No such item'};}
  touch();return{ok:1,profile:p};
}
function search(q){
  q=String(q||'').toLowerCase().trim();const out=[];
  for(const p of Object.values(profiles)){
    const phones=p.orders.map(i=>orders[i]).filter(Boolean).map(o=>o.phone).join(' ');
    if(!q||p.id.includes(q)||p.name.toLowerCase().includes(q)||phones.includes(q))out.push({id:p.id,name:p.name,coins:p.coins,xp:p.xp,owned:p.owned,stats:p.stats,created:p.created,phones:[...new Set(p.orders.map(i=>orders[i]).filter(Boolean).map(o=>o.phone))]});
    if(out.length>=60)break;
  }
  return out;
}
const recoveryCode=(p,tok)=>Buffer.from(JSON.stringify([p.id,tok])).toString('base64url');
function restore(code){try{const [pid,tok]=JSON.parse(Buffer.from(String(code).trim(),'base64url').toString());const p=auth(pid,tok);return p?{p,tok}:null;}catch(e){return null;}}
function backup(){return{profiles,orders,at:Date.now()};}
function restoreBackup(b){if(!b||typeof b.profiles!=='object'||typeof b.orders!=='object')throw new Error('Not a valid backup');profiles=b.profiles;orders=b.orders;flush();}
module.exports={claimSeason,draw,seasonOf,listTx,logTx,create,auth,get,view,equip,buy,claimDaily,rename,createOrder,setOrder,listOrders,pendingCount,award,grant,search,recoveryCode,restore,backup,restoreBackup,validateEquip,ownsOp,flush,lagosDay,levelOf,count:()=>Object.keys(profiles).length};
