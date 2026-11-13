'use strict';
const fs=require('fs'),path=require('path');
const {defaultMaps}=require('./maps');
const CAT=require('./catalog');
const DATA=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DATA,'config.json');
fs.mkdirSync(path.join(DATA,'music'),{recursive:true});
const clone=o=>JSON.parse(JSON.stringify(o));
const DEFAULTS={
  brand:{title:'VECTOR HAVOC',studio:'VectorGamex',year:'2026',tagline:'Lagos, 2049. Take the sky. Take the grid.',motd:'Welcome back, operator. Daily rewards are waiting.',accent:'#19e6ff',accent2:'#ff9d1a',teamA:'MAINLAND',teamB:'ISLAND',currency:'Coins',rules:'Fog of war is real. Cut the lights, flank the grid, talk to your team. Enemies hear you when you get close. In Battle Royale, loot up, stay inside the grid and be the last one standing.'},
  player:{hp:100,armorMax:100,speed:190,radius:11,respawn:3,dashSpeed:900,vision:640,hearing:420,armorAbsorb:.6},
  weapons:{
    pistol:{name:'K9 Sidearm',model:'pistol',damage:22,rpm:360,mag:12,reload:1.1,spread:1.2,range:720,pellets:1,auto:false,moveSpeed:1,lootWeight:.6,color:'#cfe8ff'},
    revolver:{name:'Mallam Magnum',model:'revolver',damage:46,rpm:150,mag:6,reload:2,spread:.8,range:820,pellets:1,auto:false,moveSpeed:.98,lootWeight:.7,color:'#ffd9a3'},
    smg:{name:'Okada SMG',model:'smg',damage:11,rpm:780,mag:30,reload:1.6,spread:4,range:560,pellets:1,auto:true,moveSpeed:1,lootWeight:1,color:'#ffe08a'},
    rifle:{name:'Naija AR-9',model:'rifle',damage:19,rpm:520,mag:24,reload:1.9,spread:2,range:820,pellets:1,auto:true,moveSpeed:.96,lootWeight:1,color:'#8ff0c3'},
    shotgun:{name:'Danfo Scatter',model:'shotgun',damage:11,rpm:72,mag:6,reload:2.2,spread:9,range:340,pellets:8,auto:false,moveSpeed:.95,lootWeight:.8,color:'#ff9d6a'},
    lmg:{name:'Iron Mama LMG',model:'lmg',damage:14,rpm:640,mag:60,reload:4,spread:5,range:660,pellets:1,auto:true,moveSpeed:.86,lootWeight:.35,color:'#ff7a7a'},
    launcher:{name:'Eko Thunder',model:'launcher',proj:'rocket',radius:104,damage:115,rpm:30,mag:2,reload:3.4,spread:.4,range:1400,pellets:1,auto:false,moveSpeed:.88,lootWeight:.22,color:'#ff7a3d'},
    sniper:{name:'Lagoon Longshot',model:'sniper',damage:88,rpm:46,mag:4,reload:2.6,spread:.15,range:1500,pellets:1,auto:false,moveSpeed:.85,lootWeight:.4,color:'#c9a7ff'}},
  classes:null, /* operators, filled from catalog */
  modes:{
    tdm:{type:'tdm',name:'Team Deathmatch',desc:'Mainland vs Island. First to the kill limit wins.',icon:'TDM',team:true,scoreLimit:30,timeLimit:300},
    ffa:{type:'ffa',name:'Free For All',desc:'Everyone for themselves.',icon:'FFA',team:false,scoreLimit:20,timeLimit:300},
    zone:{type:'zone',name:'Grid Control',desc:'Hold the live zone to power your side. The zone moves.',icon:'ZONE',team:true,scoreLimit:120,timeLimit:360,zoneRadius:96,zoneMove:40},
    gungame:{type:'gungame',name:'Gun Game',desc:'Every kill upgrades your weapon. Finish the ladder first.',icon:'GUN',team:false,scoreLimit:7,timeLimit:420,ladder:['pistol','revolver','smg','shotgun','rifle','lmg','sniper']},
    rush:{type:'tdm',name:'Shipment Rush',desc:'5v5 on a compact yard. 5 second respawns. First to 50 kills.',icon:'RUSH',team:true,scoreLimit:50,timeLimit:600,respawn:5,fill:10,maps:['shipment_yard']},
    br:{type:'br',name:'Battle Royale Squads',desc:'Squads of 4. Drop in by parachute, drive, fly, revive with dog tags. Last squad standing wins.',icon:'BR',team:false,squad:4,scoreLimit:1,timeLimit:1000,radii:[2000,1300,850,520,300,130],wait:[50,45,40,35,30],shrink:[35,30,25,22,18],dps:[1,2,4,7,11],startWeapon:'pistol',hpMul:1.5,minBots:24,vehicles:{car:6,atv:7,heli:2}},
    brsolo:{type:'br',name:'Battle Royale Solo',desc:'Every operator for themselves. Vehicles on the map.',icon:'SOLO',team:false,squad:1,scoreLimit:1,timeLimit:900,radii:[2000,1300,850,520,300,130],wait:[50,45,40,35,30],shrink:[35,30,25,22,18],dps:[1,2,4,7,11],startWeapon:'pistol',hpMul:1.5,minBots:16,vehicles:{car:5,atv:5,heli:1}}},
  vehicles:{
    atv:{name:'Okada ATV',n:2,mh:220,acc:440,vmax:470,grip:9,steer:2.8,r:14,brake:900},
    car:{name:'Muscle Car',n:4,mh:380,acc:420,vmax:560,grip:7,steer:2.2,r:18,brake:900},
    heli:{name:'Eagle Helicopter',n:4,mh:520,acc:330,vmax:340,r:24}},
  match:{countdown:5,endScreen:12,botSkill:.5,botFill:6,maxPlayers:12,spawnProtect:1.5,pickupRespawn:20,pickupHeal:45,pickupArmor:50,
    difficulty:{easy:{name:'Easy',skill:.28,dmg:.55},normal:{name:'Normal',skill:.5,dmg:.8},hard:{name:'Hard',skill:.78,dmg:1}},
    scanTime:2.5,reviveFlight:6,ssPerKill:34,uavTime:12,seasonXpMul:1.5,
    reward:{participate:10,perKill:4,win:40,perMinute:2,xpPerKill:10,xpWin:60,xpParticipate:20,practiceMul:.2,botMatchMul:.6,cap:150,brPlace:[120,80,60,40,30,20]}},
  maps:null,mapOrder:['eko_docks','ikeja_grid','third_mainland'],
  seasons:null,activeSeason:'s1',lucky:{odds:{common:52,rare:28,epic:12,legendary:6,mythic:2},pity:{mythic:50,legendary:10},dupRefund:.25},
  store:{rarities:CAT.rarities,items:CAT.items,coinPacks:CAT.coinPacks,payment:CAT.payment,featuredText:'VectorGamex 2026 exclusives are only sold for naira.'},
  daily:{rewards:CAT.dailyRewards(),title:'Daily Rewards'},
  controls:{aimAssist:.5,fireSize:84,defaultAutoFire:false},
  custom:{css:'',js:'',version:1,notice:''},
  app:{name:'VECTOR HAVOC',short:'HAVOC',theme:'#05080f'},
  music:{tracks:[],useSynth:true,volume:.45}
};
DEFAULTS.classes=clone(CAT.operators);DEFAULTS.seasons=clone(CAT.seasons);
const COLL=new Set(['weapons','classes','modes','maps','seasons','vehicles']),SUBCOLL=new Set(['items','rarities']);
function merge(base,over,depth=0,key=''){
  if(Array.isArray(base)||typeof base!=='object'||base===null)return over===undefined?base:over;
  const out={};
  for(const k of Object.keys(base)){
    if(depth===0&&COLL.has(k)){out[k]=(over&&over[k]&&typeof over[k]==='object'&&Object.keys(over[k]).length)?over[k]:base[k];continue;}
    if(depth===1&&key==='store'&&SUBCOLL.has(k)){out[k]=(over&&over[k]&&typeof over[k]==='object')?over[k]:base[k];continue;}
    out[k]=(over&&k in over)?merge(base[k],over[k],depth+1,k):base[k];
  }
  if(over&&typeof over==='object')for(const k of Object.keys(over))if(!(k in base))out[k]=over[k];
  return out;
}
let cfg;
function load(){
  let saved={};try{saved=JSON.parse(fs.readFileSync(FILE,'utf8'));}catch(e){}
  cfg=merge(DEFAULTS,saved);
  /* upgrade older saved configs: make sure new default maps/modes exist without overwriting dev edits */
  const dm=defaultMaps();if(!cfg.maps||!Object.keys(cfg.maps).length)cfg.maps=dm;
  if(!Object.values(cfg.maps).some(m=>m.br)&&dm.lagos_open)cfg.maps.lagos_open=dm.lagos_open;
  for(const id of ['gungame','br','rush','brsolo'])if(!cfg.modes[id])cfg.modes[id]=clone(DEFAULTS.modes[id]);
  if(!cfg.weapons.launcher)cfg.weapons.launcher=clone(DEFAULTS.weapons.launcher);
  for(const id in CAT.items)if(!cfg.store.items[id]&&CAT.items[id].season)cfg.store.items[id]=clone(CAT.items[id]);
  for(const id in DEFAULTS.maps||{})void id;
  const dm0=defaultMaps();if(!cfg.maps.shipment_yard&&dm0.shipment_yard)cfg.maps.shipment_yard=dm0.shipment_yard;
  for(const id in DEFAULTS.weapons)if(!cfg.weapons[id]&&(!saved.weapons||!Object.keys(saved.weapons).length))cfg.weapons[id]=clone(DEFAULTS.weapons[id]);
  const arenas=Object.keys(cfg.maps).filter(id=>!cfg.maps[id].br);
  cfg.mapOrder=(cfg.mapOrder||[]).filter(id=>cfg.maps[id]&&!cfg.maps[id].br);arenas.forEach(id=>{if(!cfg.mapOrder.includes(id))cfg.mapOrder.push(id);});
  return cfg;
}
function save(){const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(cfg,null,1));fs.renameSync(tmp,FILE);}
function get(){return cfg||load();}
const MODELS=['pistol','revolver','smg','rifle','shotgun','lmg','sniper','launcher'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const HEX=/^#[0-9a-fA-F]{6}$/,ID=/^[a-z0-9_]{2,28}$/;
const TILECH=/^[.#xX~AFBZhawc]+$/;
function sanitize(next){
  const d=merge(DEFAULTS,next);
  const chk=(o,pth)=>{for(const k in o){const v=o[k];if(typeof v==='number'){if(!isFinite(v)||Math.abs(v)>1e7)throw new Error('Bad number at '+pth+k);}else if(v&&typeof v==='object'&&!Array.isArray(v)&&k!=='maps'&&k!=='store'&&k!=='daily')chk(v,pth+k+'.');}};
  chk(d,'');
  const ids=Object.keys(d.maps||{});if(!ids.length)throw new Error('At least one map is required');
  for(const id of ids){const m=d.maps[id];if(!ID.test(id))throw new Error('Bad map id '+id);
    if(!Array.isArray(m.rows)||m.rows.length<12||m.rows.length>80)throw new Error('Map '+id+': 12 to 80 rows');
    const w=m.rows[0].length;if(w<16||w>120)throw new Error('Map '+id+': 16 to 120 columns');
    if(!m.rows.every(r=>typeof r==='string'&&r.length===w))throw new Error('Map '+id+': all rows must be the same width');
    if(!m.rows.every(r=>TILECH.test(r)))throw new Error('Map '+id+': unknown tile character');
    if(/[^#X~]/.test(m.rows[0]+m.rows[m.rows.length-1]))throw new Error('Map '+id+': top and bottom rows must be solid');
    if(!/[ABF]/.test(m.rows.join('')))throw new Error('Map '+id+': needs at least one spawn (A, B or F)');
    m.id=id;m.name=String(m.name||id).slice(0,40);m.desc=String(m.desc||'').slice(0,160);m.br=!!m.br;m.theme=['neon','dock','city','bridge','open'].includes(m.theme)?m.theme:(m.br?'open':'neon');}
  d.mapOrder=(d.mapOrder||[]).filter(id=>d.maps[id]&&!d.maps[id].br);ids.forEach(id=>{if(!d.maps[id].br&&!d.mapOrder.includes(id))d.mapOrder.push(id);});
  if(!d.mapOrder.length)throw new Error('Keep at least one arena (non battle-royale) map');
  for(const k of ['title','studio','tagline','motd','teamA','teamB','rules','currency','year'])d.brand[k]=String(d.brand[k]==null?'':d.brand[k]).slice(0,k==='rules'||k==='motd'?500:80);
  for(const k of ['accent','accent2'])if(!HEX.test(d.brand[k]))throw new Error('Bad colour '+k);
  const num=(o,k,def)=>{if(typeof o[k]!=='number')o[k]=def;};
  for(const id in d.weapons){const w=d.weapons[id];if(!ID.test(id))throw new Error('Bad weapon id '+id);num(w,'damage',10);num(w,'rpm',300);num(w,'mag',10);num(w,'reload',1.5);num(w,'spread',2);num(w,'range',600);num(w,'pellets',1);num(w,'moveSpeed',1);num(w,'lootWeight',1);w.scale=Math.max(.5,Math.min(2,+w.scale||1));
    w.name=String(w.name||id).slice(0,24);if(!HEX.test(w.color||''))w.color='#ffffff';if(!MODELS.includes(w.model))w.model=MODELS.includes(id)?id:'rifle';w.proj=w.proj==='rocket'?'rocket':'';num(w,'radius',100);
    if(w.rpm<=0||w.mag<1||w.pellets<1)throw new Error('Weapon '+id+' has invalid rate/mag/pellets');}
  for(const id in d.classes){const c=d.classes[id];if(!ID.test(id))throw new Error('Bad operator id '+id);if(!['dash','cloak','surge','scan'].includes(c.ability))c.ability='dash';
    num(c,'hp',100);num(c,'speed',1);num(c,'cd',8);num(c,'dur',2);c.name=String(c.name||id).slice(0,24);c.title=String(c.title||'').slice(0,24);c.desc=String(c.desc||'').slice(0,200);if(!HEX.test(c.color||''))c.color='#ffffff';
    if(!d.weapons[c.primary])c.primary=Object.keys(d.weapons)[0];if(c.hp<1)throw new Error('Operator '+id+' needs hp >= 1');
    c.locked=!!c.locked;const L=c.look=c.look||{};for(const k of ['skin','primary','secondary','accent'])if(!HEX.test(L[k]||''))L[k]='#888888';L.sex=L.sex==='f'?'f':'m';L.head=String(L.head||'').slice(0,12);L.pattern=String(L.pattern||'solid').slice(0,12);}
  for(const id in d.modes){const m=d.modes[id];if(!ID.test(id))throw new Error('Bad mode id '+id);if(!['tdm','ffa','zone','gungame','br'].includes(m.type))m.type=['tdm','ffa','zone','gungame','br'].includes(id)?id:'tdm';
    num(m,'scoreLimit',30);num(m,'timeLimit',300);m.name=String(m.name||id).slice(0,30);m.desc=String(m.desc||'').slice(0,160);m.icon=String(m.icon||m.type).slice(0,5).toUpperCase();
    if(m.type==='zone'){num(m,'zoneRadius',96);num(m,'zoneMove',40);}
    if(m.type==='gungame'){if(!Array.isArray(m.ladder)||!m.ladder.length)m.ladder=['pistol','smg','rifle'];m.ladder=m.ladder.filter(w=>d.weapons[w]);if(!m.ladder.length)m.ladder=[Object.keys(d.weapons)[0]];m.scoreLimit=m.ladder.length;}
    if(m.type==='br'){for(const k of ['radii','wait','shrink','dps'])if(!Array.isArray(m[k])||!m[k].length||m[k].some(x=>typeof x!=='number'||!isFinite(x)))m[k]=DEFAULTS.modes.br[k];num(m,'minBots',14);num(m,'hpMul',1.5);m.startWeapon=d.weapons[m.startWeapon]?m.startWeapon:Object.keys(d.weapons)[0];}}
  for(const id in d.modes){const m=d.modes[id];if(m.respawn!=null)m.respawn=clamp(+m.respawn||3,1,30);if(m.fill!=null)m.fill=clamp(Math.round(+m.fill||0),0,30);if(m.type==='br'){m.squad=clamp(Math.round(+m.squad||1),1,4);const v=m.vehicles||{};m.vehicles={car:clamp(v.car|0,0,30),atv:clamp(v.atv|0,0,30),heli:clamp(v.heli|0,0,10)};}
    if(m.maps!=null)m.maps=(Array.isArray(m.maps)?m.maps:[]).filter(i=>d.maps[i]&&!!d.maps[i].br===(m.type==='br'));if(m.maps&&!m.maps.length)delete m.maps;}
  for(const k in d.vehicles){const v=d.vehicles[k];if(!['atv','car','heli'].includes(k)){delete d.vehicles[k];continue;}for(const f of ['n','mh','acc','vmax','grip','steer','r','brake'])if(typeof v[f]!=='number'||!isFinite(v[f]))v[f]=DEFAULTS.vehicles[k][f]||0;v.n=clamp(Math.round(v.n),1,6);v.mh=clamp(v.mh,50,5000);v.name=String(v.name||k).slice(0,30);}
  for(const id in d.seasons){const S=d.seasons[id];if(!ID.test(id))throw new Error('Bad season id '+id);S.id=id;S.name=String(S.name||id).slice(0,40);S.short=String(S.short||'').slice(0,16);S.theme=['neon','rust','tokyo'].includes(S.theme)?S.theme:'neon';S.presented=String(S.presented||'').slice(0,40);S.tagline=String(S.tagline||'').slice(0,200);
    const A=S.artist=S.artist||{};A.name=String(A.name||'').slice(0,60);A.blurb=String(A.blurb||'').slice(0,240);A.spotify=/^https:\/\/open\.spotify\.com\/[A-Za-z0-9_\/\-]+$/.test(String(A.spotify||'').split('?')[0])?String(A.spotify).split('?')[0]:'';
    const P=S.pass=S.pass||{};P.premiumNaira=clamp(Math.round(+P.premiumNaira||0),0,500000);P.tiers=clamp(Math.round(+P.tiers||40),1,100);P.xpPerTier=clamp(Math.round(+P.xpPerTier||240),20,100000);
    for(const tr of ['free','premium']){P[tr]=(Array.isArray(P[tr])?P[tr]:[]).slice(0,100).map(r=>r&&r.type==='item'&&d.store.items[r.item]?{type:'item',item:r.item}:{type:'coins',amount:clamp(Math.round(+(r&&r.amount)||0),0,100000)});while(P[tr].length<P.tiers)P[tr].push({type:'coins',amount:100});}
    const D=S.draw=S.draw||{};D.cost=clamp(Math.round(+D.cost||600),1,1e6);D.cost10=clamp(Math.round(+D.cost10||D.cost*9),1,1e7);D.pool=String(D.pool||id).slice(0,28);}
  if(!d.seasons[d.activeSeason])d.activeSeason=Object.keys(d.seasons)[0];
  const L=d.lucky;for(const r in L.odds)L.odds[r]=Math.max(0,+L.odds[r]||0);L.pity.mythic=clamp(Math.round(+L.pity.mythic||50),1,1000);L.pity.legendary=clamp(Math.round(+L.pity.legendary||10),1,1000);L.dupRefund=clamp(+L.dupRefund||0,0,1);
  if(!Object.keys(d.classes).length||!Object.keys(d.modes).length||!Object.keys(d.weapons).length)throw new Error('Need at least one weapon, operator and mode');
  if(!Object.values(d.classes).some(c=>!c.locked))throw new Error('At least one operator must be free (not locked)');
  /* store */
  const st=d.store;st.rarities=st.rarities&&Object.keys(st.rarities).length?st.rarities:clone(CAT.rarities);
  for(const r in st.rarities){if(!ID.test(r))throw new Error('Bad rarity id '+r);st.rarities[r].name=String(st.rarities[r].name||r).slice(0,20);if(!HEX.test(st.rarities[r].color||''))st.rarities[r].color='#9aa7b8';}
  for(const id in st.items){const it=st.items[id];if(!ID.test(id))throw new Error('Bad item id '+id);
    if(!['skin','wskin','bling','operator'].includes(it.type))throw new Error('Item '+id+': type must be skin, wskin, bling or operator');
    if(!st.rarities[it.rarity])it.rarity=Object.keys(st.rarities)[0];num(it,'coins',0);num(it,'naira',0);it.coins=Math.max(0,Math.round(it.coins));it.naira=Math.max(0,Math.round(it.naira));
    it.season=String(it.season||'').slice(0,28);it.name=String(it.name||id).slice(0,40);it.desc=String(it.desc||'').slice(0,160);it.exclusive=!!it.exclusive;it.featured=!!it.featured;
    if(it.type==='skin'||it.type==='operator')it.op=String(it.op||'any');if(it.type==='wskin')it.weapon=String(it.weapon||'any');
    if(it.type==='operator'&&!d.classes[it.op])throw new Error('Item '+id+': operator '+it.op+' does not exist');
    if(it.type!=='operator'){const L=it.look=it.look||{};for(const k of ['primary','secondary','accent','c1','c2','color','glow','trail'])if(L[k]!=null&&!HEX.test(L[k]))delete L[k];for(const k of ['spd','vel'])if(L[k]!=null)L[k]=Math.max(.1,Math.min(5,+L[k]||1));if(L.wob!=null)L.wob=Math.max(0,Math.min(.03,+L.wob||0));if(L.muzzle!=null)L.muzzle=String(L.muzzle).slice(0,10);L.crystals=!!L.crystals;L.aura=!!L.aura;if(L.head!=null)L.head=String(L.head).slice(0,12);if(L.pattern!=null)L.pattern=String(L.pattern).slice(0,12);}
    if(it.type==='bling')it.slot=['neck','face','ear','wrist','head'].includes(it.slot)?it.slot:'neck';}
  st.coinPacks=(Array.isArray(st.coinPacks)?st.coinPacks:[]).slice(0,12).map((p,i)=>({id:ID.test(p.id||'')?p.id:'pack'+i,name:String(p.name||'Pack').slice(0,30),coins:Math.max(1,Math.round(+p.coins||0)),naira:Math.max(1,Math.round(+p.naira||0)),bonus:String(p.bonus||'').slice(0,30)}));
  const pay=st.payment=st.payment||{};pay.bank=String(pay.bank||'OPay').slice(0,30);pay.account=String(pay.account||'').replace(/[^0-9A-Za-z \-]/g,'').slice(0,30);pay.accountName=String(pay.accountName||'').slice(0,60);pay.note=String(pay.note||'').slice(0,300);
  st.featuredText=String(st.featuredText||'').slice(0,200);
  /* daily */
  d.daily.title=String(d.daily.title||'Daily Rewards').slice(0,40);
  d.daily.rewards=(Array.isArray(d.daily.rewards)?d.daily.rewards:[]).slice(0,100).map(r=>r&&r.type==='item'&&st.items[r.item]?{type:'item',item:r.item,label:String(r.label||'').slice(0,14)}:{type:'coins',amount:Math.max(0,Math.round(+(r&&r.amount)||0)),label:String((r&&r.label)||'').slice(0,14)});
  if(!d.daily.rewards.length)d.daily.rewards=CAT.dailyRewards();
  /* controls, custom, app */
  d.controls.aimAssist=Math.max(0,Math.min(1,+d.controls.aimAssist||0));d.controls.fireSize=Math.max(50,Math.min(140,+d.controls.fireSize||84));d.controls.defaultAutoFire=!!d.controls.defaultAutoFire;
  d.custom.css=String(d.custom.css||'').slice(0,60000);d.custom.js=String(d.custom.js||'').slice(0,120000);d.custom.version=Math.max(1,Math.round(+d.custom.version||1));d.custom.notice=String(d.custom.notice||'').slice(0,300);
  d.app.name=String(d.app.name||d.brand.title).slice(0,40);d.app.short=String(d.app.short||'Game').slice(0,14);if(!HEX.test(d.app.theme||''))d.app.theme='#05080f';
  return d;
}
function set(next){cfg=sanitize(next);save();return cfg;}
/* what clients receive (never includes secrets: no PIN, no orders, no profiles) */
function publicCfg(){const c=get();return{brand:c.brand,player:c.player,weapons:c.weapons,classes:c.classes,modes:c.modes,
  match:{countdown:c.match.countdown,maxPlayers:c.match.maxPlayers,botFill:c.match.botFill,difficulty:c.match.difficulty},music:c.music,
  store:c.store,daily:c.daily,controls:c.controls,custom:c.custom,app:c.app,vehicles:c.vehicles,seasons:c.seasons,activeSeason:c.activeSeason,lucky:c.lucky,
  mapList:Object.keys(c.maps).map(id=>({id,name:c.maps[id].name,desc:c.maps[id].desc,w:c.maps[id].rows[0].length,h:c.maps[id].rows.length,br:!!c.maps[id].br,arena:!c.maps[id].br&&c.mapOrder.includes(id)}))};}
load();
module.exports={get,set,save,load,publicCfg,DATA,DEFAULTS,sanitize,clone};
