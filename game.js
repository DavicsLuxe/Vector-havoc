'use strict';
/* Authoritative room simulation: players + bots, weapons, abilities, pickups, modes (TDM, FFA, Grid Control, Gun Game, Battle Royale), fog-of-war snapshots. */
const VB=require('./public/js/shared.js');
const CFG=require('./config');
const Bots=require('./bots');
const install=require('./havoc');
const {TS,DT}=VB;
let NEXT_ID=1;
const r1=n=>Math.round(n*10)/10;
const rnd=(a,b)=>a+Math.random()*(b-a);
const NAMES=['Tunde','Ngozi','Kelechi','Femi','Amara','Dayo','Sade','Obi','Zainab','Chidi','Ife','Bisi','Emeka','Yemi','Kola','Nneka','Tolu','Efe','Uche','Lara','Seun','Ada','Musa','Hauwa'];

class Room{
  constructor(code,opts,hub){
    this.code=code;this.hub=hub;this.priv=!!opts.priv;this.practice=!!opts.practice;this.diff=opts.diff||'normal';this.modeId=opts.mode;this.mapId=opts.map;this.keepMap=!!opts.keepMap;
    this.players=new Map();this.events=[];this.zoneState=-1;this.tick=0;this.emptyT=0;this.flowCache=new Map();this.rosterDirty=true;this.rosterT=0;this.locked=false;this.proj=[];this.veh=[];this.tags=[];this.sqPt={};this.nid=1;this.squads=false;
    this.loadMatch();
  }
  cfg(){return CFG.get();}
  loadMatch(){
    const cfg=this.cfg();
    if(!cfg.modes[this.modeId])this.modeId=Object.keys(cfg.modes)[0];
    this.mode=cfg.modes[this.modeId];this.type=this.mode.type||this.modeId;this.team=this.type==='tdm'||this.type==='zone';this.squads=this.type==='br';
    if(Array.isArray(this.mode.maps)&&this.mode.maps.length&&!this.mode.maps.includes(this.mapId)&&this.mode.maps.every(id=>cfg.maps[id]))this.mapId=this.mode.maps[0];
    /* battle royale needs an open-world map, arena modes need arena maps */
    const wantBR=this.type==='br',ok=id=>cfg.maps[id]&&!!cfg.maps[id].br===wantBR;
    if(!ok(this.mapId))this.mapId=wantBR?(Object.keys(cfg.maps).find(id=>cfg.maps[id].br)||Object.keys(cfg.maps)[0]):(cfg.mapOrder.find(ok)||cfg.mapOrder[0]);
    this.mapDef=cfg.maps[this.mapId];this.map=VB.parseMap(this.mapDef);this.flowCache.clear();
    this.pickups=this.map.pickups.map((p,i)=>({id:i,x:p.x,y:p.y,type:p.type,up:true,t:0}));
    this.phase='countdown';this.phaseT=this.type==='br'?12:cfg.match.countdown;this.timeLeft=this.mode.timeLimit||300;this.matchT=0;
    this.noHumanT=0;this.score=[0,0];this.zi=0;this.zoneT=0;this.zoneCap=0;this.winner=null;this.awarded=false;this.deadCount=0;
    this.ladder=this.type==='gungame'?(this.mode.ladder||['pistol']):null;
    this.br=this.type==='br'?this.initBR():null;this.proj=[];this.tags=[];this.sqPt={};this.winSq=-1;this.spawnVehicles();
    for(const p of this.players.values()){p.k=0;p.d=0;p.sc=0;p.lvl=0;p.place=0;p.spec=0;p.rewarded=false;p.ss=0;p.uav=0;p.late=false;p.veh=0;p.joinedAt=0;if(this.team&&p.team<0)p.team=this.pickTeam();if(!this.team)p.team=-1;this.spawn(p,true);}
    this.rosterDirty=true;this.balanceBots();this.formSquads();for(const p of this.players.values())if(this.squads)this.spawn(p,true);
  }
  initBR(){
    const m=this.mode,map=this.map,r0=m.radii[0],cx=map.pw/2+rnd(-200,200),cy=map.ph/2+rnd(-150,150);
    const b={ph:0,st:'wait',t:m.wait[0],cx,cy,r:r0,ncx:cx,ncy:cy,nr:r0};this.nextCircle(b);return b;
  }
  nextCircle(b){
    const m=this.mode,nr=m.radii[Math.min(b.ph+1,m.radii.length-1)];
    if(b.ph+1>=m.radii.length){b.ncx=b.cx;b.ncy=b.cy;b.nr=b.r;b.st='final';return;}
    const slack=Math.max(0,b.r-nr),a=Math.random()*Math.PI*2,d=Math.random()*slack*.8;
    b.ncx=Math.max(nr,Math.min(this.map.pw-nr,b.cx+Math.cos(a)*d));b.ncy=Math.max(nr,Math.min(this.map.ph-nr,b.cy+Math.sin(a)*d));b.nr=nr;
  }
  humans(){const a=[];for(const p of this.players.values())if(!p.bot)a.push(p);return a;}
  bots(){const a=[];for(const p of this.players.values())if(p.bot)a.push(p);return a;}
  pickTeam(){let a=0,b=0;for(const p of this.players.values()){if(p.team===0)a++;else if(p.team===1)b++;}return a<=b?0:1;}
  diffInfo(){const d=this.cfg().match.difficulty||{};return this.practice?(d[this.diff]||d.normal||{skill:.5,dmg:.8}):{skill:this.cfg().match.botSkill,dmg:(d.normal||{dmg:.8}).dmg};}
  add(opts){
    const cfg=this.cfg();const clsId=cfg.classes[opts.cls]?opts.cls:Object.keys(cfg.classes)[0];
    const p={id:NEXT_ID++,name:opts.name,bot:!!opts.bot,ws:opts.ws||null,client:opts.client||null,pid:opts.pid||null,look:opts.look||null,team:this.team?(opts.team!=null?opts.team:this.pickTeam()):-1,cls:clsId,nextCls:clsId,wid:'pistol',
      x:0,y:0,vx:0,vy:0,a:0,hp:100,armor:0,alive:false,rsT:0,ammo:0,rlT:0,fcd:0,abT:0,abCD:0,dashT:0,dashDx:0,dashDy:0,surge:false,cloak:false,
      k:0,d:0,sc:0,lvl:0,place:0,spec:0,invT:0,q:[],last:{mx:0,my:0,a:0,fire:0,ab:0,rl:0,seq:0},seq:0,fp:0,voice:false,noise:0,hitT:0,skill:opts.skill||.5,dmgMul:opts.dmgMul||1,born:Date.now(),joinedAt:this.matchT,z:0,vz:0,st:0,slT:0,slCD:0,slDx:1,slDy:0,ads:0,para:0,veh:0,seat:0,alt:null,gren:2,tags:[],scan:0,revT:0,revBy:0,ss:0,uav:0,sq:-1,si:0,mk:0,mkT:0,crT:0,usePrev:false,procSeq:-9};
    this.players.set(p.id,p);
    if(this.type==='br'&&this.phase!=='countdown'&&!p.bot){p.alive=false;p.place=0;p.late=true;p.rsT=0;}else this.spawn(p,true);
    this.rosterDirty=true;if(!p.bot)this.balanceBots();this.formSquads();return p;
  }
  remove(p){if(p.veh)this.exitVeh(p,true);this.players.delete(p.id);this.rosterDirty=true;if(!p.bot)this.balanceBots();this.formSquads();}
  /* keep rooms lively with bots; they leave as humans arrive */
  balanceBots(){
    const cfg=this.cfg(),hum=this.humans().length;
    if(hum===0){for(const b of this.bots())this.players.delete(b.id);return;}
    let want=this.type==='br'?(this.mode.minBots||23):(this.mode.fill?this.mode.fill:(this.practice?8:Math.max(0,cfg.match.botFill|0)));
    want=Math.min(want,this.type==='br'?40:cfg.match.maxPlayers+10);
    let bots=this.bots(),need=Math.max(0,want-hum);
    if(this.type==='br'&&this.phase!=='countdown')need=bots.length; /* never add or drop bots mid battle royale */
    while(bots.length>need){const b=bots.pop();this.players.delete(b.id);this.rosterDirty=true;}
    this.evenTeams();
    const cls=Object.keys(cfg.classes).filter(k=>!cfg.classes[k].locked),di=this.diffInfo();
    const commons=Object.keys(cfg.store.items).filter(k=>{const i=cfg.store.items[k];return i.type==='skin'&&!i.exclusive&&i.coins<=800&&!(i.naira>0&&!i.coins);});
    while(bots.length<need){
      let team=-1;if(this.team){let a=0,b=0;for(const p of this.players.values()){if(p.team===0)a++;else b++;}team=a<=b?0:1;}
      const nm=NAMES[(Math.random()*NAMES.length)|0]+'_'+(10+(Math.random()*89|0)),c=cls[(Math.random()*cls.length)|0];
      const skin=commons.filter(k=>{const o=cfg.store.items[k].op;return o==='any'||o===c;});
      const look=Math.random()<.5&&skin.length?{s:skin[(Math.random()*skin.length)|0],w:{},b:[]}:null;
      bots.push(this.add({name:nm,bot:true,team,cls:c,look,skill:Math.max(.12,Math.min(.95,di.skill+rnd(-.1,.1))),dmgMul:di.dmg}));
    }
    this.evenTeams();
  }
  evenTeams(){
    if(!this.team)return;
    for(let n=0;n<8;n++){
      const t=[[],[]];for(const p of this.players.values())if(p.team===0||p.team===1)t[p.team].push(p);
      if(Math.abs(t[0].length-t[1].length)<=1)return;
      const big=t[0].length>t[1].length?0:1,bot=t[big].find(p=>p.bot);if(!bot)return;
      bot.team=1-big;this.spawn(bot,true);this.rosterDirty=true;
    }
  }
  /* ---------- spawning ---------- */
  spawn(p,quiet){
    const cfg=this.cfg();if(cfg.classes[p.nextCls])p.cls=p.nextCls;const cls=cfg.classes[p.cls];
    const set=this.team?(p.team===0?this.map.spawns.A:this.map.spawns.B):this.map.spawns.F;
    let best=null,bs=-1;const cand=set.slice().sort(()=>Math.random()-.5).slice(0,this.type==='br'?60:6);
    for(const s of cand){let md=1e9;for(const o of this.players.values()){if(o===p||!o.alive||(this.team&&o.team===p.team))continue;md=Math.min(md,Math.hypot(o.x-s.x,o.y-s.y));}
      if(md>bs){bs=md;best=s;}}
    best=best||{x:this.map.pw/2,y:this.map.ph/2};
    if(this.squads&&p.sq>=0){const pt=this.sqPt[p.sq];if(pt){const near=set.filter(s=>Math.hypot(s.x-pt.x,s.y-pt.y)<150);best=near.length?near[(Math.random()*near.length)|0]:pt;}else this.sqPt[p.sq]={x:best.x,y:best.y};}
    p.x=best.x+rnd(-4,4);p.y=best.y+rnd(-4,4);p.vx=p.vy=0;p.alive=true;p.hp=(cls.hp||cfg.player.hp)*(this.mode.hpMul||1);p.maxHp=p.hp;p.armor=0;
    let wid=cls.primary;
    if(this.type==='br')wid=this.mode.startWeapon;else if(this.type==='gungame')wid=this.ladder[Math.min(p.lvl,this.ladder.length-1)];
    p.wid=cfg.weapons[wid]?wid:Object.keys(cfg.weapons)[0];p.ammo=cfg.weapons[p.wid].mag;p.rlT=0;p.fcd=0;p.abT=0;p.abCD=Math.min(cls.cd||0,4);
    p.dashT=0;p.surge=false;p.cloak=false;p.invT=cfg.match.spawnProtect||1.5;p.q.length=0;
    if(p.veh)this.exitVeh(p,true);p.z=0;p.vz=0;p.st=0;p.slT=0;p.slCD=0;p.ads=0;p.para=0;p.tags=[];p.scan=0;p.revT=0;p.crT=0;
    p.alt=(this.type!=='br'&&this.type!=='gungame'&&p.wid!=='pistol'&&cfg.weapons.pistol)?{w:'pistol',am:cfg.weapons.pistol.mag}:null;
    p.gren=this.type==='gungame'?0:(this.type==='br'?1:2);
    p.a=this.team?(p.team===0?0:Math.PI):rnd(0,Math.PI*2);
    if(!quiet)this.ev({e:'sp',i:p.id,x:r1(p.x),y:r1(p.y)});
  }
  ev(e,only){this.events.push(only?{...e,_to:only}:e);}
  aliveCount(){let n=0;for(const p of this.players.values())if(p.alive)n++;return n;}
  /* ---------- fixed step ---------- */
  step(){
    const cfg=this.cfg();this.tick++;this.events=[];
    const hum=this.humans().length;
    if(!hum){this.emptyT+=DT;return;}this.emptyT=0;
    if(this.phase==='countdown'){this.phaseT-=DT;if(this.phaseT<=0){this.phase='live';this.formSquads();this.ev({e:'go'});if(this.type==='br')this.dropAll();}}
    else if(this.phase==='live'){this.timeLeft-=DT;this.matchT+=DT;this.modeTick(cfg);if(this.timeLeft<=0)this.endMatch('time');}
    else if(this.phase==='end'){this.phaseT-=DT;if(this.phaseT<=0)this.nextMatch();}
    for(const p of this.players.values())this.stepPlayerSim(p,cfg);
    this.stepVehicles();this.stepProj();this.stepTags();
    for(const k of this.pickups)if(!k.up&&k.t<1e8){k.t-=DT;if(k.t<=0){k.up=true;this.ev({e:'pk',id:k.id,u:1});}}
    if(this.rosterDirty&&(this.tick-this.rosterT)>=15){this.rosterT=this.tick;this.rosterDirty=false;this.hub.sendRoster(this);}
    if(this.tick%8===0)this.hub.sendVoiceGains(this);
  }
  modeTick(cfg){
    if(this.type==='br'){this.brTick();return;}
    if(this.type!=='zone'||!this.map.zones.length)return;
    const z=this.map.zones[this.zi],R=this.mode.zoneRadius||96;
    this.zoneT+=DT;if(this.zoneT>=(this.mode.zoneMove||40)){this.zoneT=0;this.zi=(this.zi+1)%this.map.zones.length;this.ev({e:'zn',zi:this.zi});}
    let a=0,b=0;for(const p of this.players.values())if(p.alive&&Math.hypot(p.x-z.x,p.y-z.y)<R){if(p.team===0)a++;else if(p.team===1)b++;}
    this.zoneState=a&&!b?0:b&&!a?1:a&&b?-2:-1;
    if(this.zoneState>=0){this.zoneCap+=DT;if(this.zoneCap>=1){this.zoneCap-=1;this.score[this.zoneState]++;this.checkLimit();}}
  }
  brTick(){
    const b=this.br,m=this.mode;b.t-=DT;
    if(this.noHumanT&&this.matchT-this.noHumanT>45){this.endMatch('bots');return;}
    if(b.st==='wait'&&b.t<=0){b.st='shrink';b.t=m.shrink[Math.min(b.ph,m.shrink.length-1)];b.sr=b.r;b.scx=b.cx;b.scy=b.cy;this.ev({e:'zn',zi:b.ph+1,br:1});}
    else if(b.st==='shrink'){
      const dur=m.shrink[Math.min(b.ph,m.shrink.length-1)],k=1-Math.max(0,b.t)/dur;
      b.r=b.sr+(b.nr-b.sr)*k;b.cx=b.scx+(b.ncx-b.scx)*k;b.cy=b.scy+(b.ncy-b.scy)*k;
      if(b.t<=0){b.ph++;b.r=b.nr;b.cx=b.ncx;b.cy=b.ncy;b.st='wait';b.t=m.wait[Math.min(b.ph,m.wait.length-1)];this.nextCircle(b);}
    }
    const dps=m.dps[Math.min(b.ph,m.dps.length-1)];
    for(const p of this.players.values()){
      if(!p.alive)continue;
      if(Math.hypot(p.x-b.cx,p.y-b.cy)>b.r){p.hp-=dps*DT;p.zoneHit=true;if(p.hp<=0)this.kill(p,null,null);}else p.zoneHit=false;
    }
  }
  stepPlayerSim(p,cfg){
    let w=cfg.weapons[p.wid]||cfg.weapons[Object.keys(cfg.weapons)[0]];const cls=cfg.classes[p.cls]||cfg.classes[Object.keys(cfg.classes)[0]];
    let inp;
    if(p.bot){Bots.think(this,p,cfg);inp=p.binp;}
    else{if(p.q.length>4)p.q.splice(0,p.q.length-2);if(p.q.length){inp=p.q.shift();p.seq=inp.seq;p.last=inp;}else inp=p.last;}
    if(this.phase==='end')inp={mx:0,my:0,a:p.a,fire:0,ab:0,rl:0,seq:-5};
    if(p.mkT>0)p.mkT-=DT;if(p.crT>0)p.crT-=DT;
    if(!p.alive){if(this.squads||p.late)return;p.rsT-=DT;if(p.rsT<=0&&this.phase!=='end')this.spawn(p);return;}
    const fresh=inp.seq!==p.procSeq;p.procSeq=inp.seq;
    const useEdge=!!inp.use&&!p.usePrev;p.usePrev=!!inp.use;
    if(p.invT>0)p.invT-=DT;if(p.fcd>0)p.fcd-=DT;if(p.hitT>0)p.hitT-=DT;
    if(p.abT>0){p.abT-=DT;if(p.abT<=0){p.abT=0;}}
    p.cloak=cls.ability==='cloak'&&p.abT>0;p.surge=cls.ability==='surge'&&p.abT>0;
    if(p.surge)p.hp=Math.min(p.maxHp||cls.hp||cfg.player.hp,p.hp+14*DT);
    if(useEdge&&this.phase==='live'){if(p.veh)this.exitVeh(p);else if(!p.para)this.tryEnter(p);}
    const veh=p.veh?this.vehById(p.veh):null;if(p.veh&&!veh)p.veh=0;
    if(veh){
      p.a=inp.a;p.ads=0;p.st=0;p.z=0;
      if(p.seat===0)veh.inp={th:-(inp.my||0),sr:inp.mx||0,j:inp.j,c:inp.c};
      p.noise=Math.hypot(veh.vx,veh.vy)>120?.5:0;
    }else if(p.para){this.paraStep(p,inp,cfg);}
    else{
      if(inp.ab&&p.abCD<=0&&p.abT<=0&&cls.ability!=='dash'){p.abT=cls.dur||3;p.abCD=cls.cd||10;this.ev({e:'ab',i:p.id,k:cls.ability,x:r1(p.x),y:r1(p.y)});
        p.cloak=cls.ability==='cloak';p.surge=cls.ability==='surge';}
      p.dashJust=false;p.slideJust=false;VB.stepInput(p,inp,DT,cfg,this.map);
      if(p.dashJust)this.ev({e:'ab',i:p.id,k:'dash',x:r1(p.x),y:r1(p.y)});
      if(p.slideJust)this.ev({e:'sl',i:p.id});
      p.noise=p.st===1?0:(Math.hypot(p.vx,p.vy)>cfg.player.speed*.6?.4:(p.noise>0?p.noise-DT:0));
    }
    const grounded=!p.para&&!veh;
    if(fresh&&inp.sw&&p.alt&&!p.para)this.swapWeapon(p,cfg);
    if(fresh&&inp.gr&&p.gren>0&&!p.para&&this.phase==='live')this.throwGrenade(p,inp);
    if(fresh&&inp.ssb&&p.ss>=100){p.ss=0;p.uav=cfg.match.uavTime||12;this.ev({e:'uav',i:p.id});}
    if(p.uav>0)p.uav-=DT;
    /* dog tag scan (hold) */
    if(inp.rv&&p.tags.length&&grounded&&Math.hypot(p.vx,p.vy)<70){
      p.scan+=DT;
      if(p.scan>=(cfg.match.scanTime||2.5)){p.scan=0;const oid=p.tags.shift(),o=this.players.get(oid);
        if(o&&!o.alive&&o.sq===p.sq&&o.revT<=0&&this.phase==='live'){o.revT=cfg.match.reviveFlight||6;o.revBy=p.id;this.ev({e:'rv',i:o.id,by:p.id,n:o.name,t:o.revT});}}
    }else p.scan=Math.max(0,p.scan-DT*2);
    w=cfg.weapons[p.wid]||w;
    if(p.rlT>0){p.rlT-=DT;if(p.rlT<=0){p.rlT=0;p.ammo=w.mag;}}
    else if(!p.para&&((inp.rl&&p.ammo<w.mag)||p.ammo<=0)){if(p.ammo<w.mag){p.rlT=w.reload;this.ev({e:'rl',i:p.id},null);}}
    const fire=!!inp.fire,canFire=!p.para&&!(veh&&p.seat===0);
    if(canFire&&fire&&p.fcd<=0&&p.rlT<=0&&p.ammo>0&&this.phase==='live'&&(w.auto||!p.fp))this.shoot(p,w);
    p.fp=fire;
    if(grounded)for(const k of this.pickups){if(!k.up)continue;if(Math.abs(k.x-p.x)>22||Math.abs(k.y-p.y)>22)continue;this.takePickup(p,k,cfg);}
  }
  swapWeapon(p,cfg){
    const a=p.alt;p.alt={w:p.wid,am:p.ammo};p.wid=cfg.weapons[a.w]?a.w:p.wid;p.ammo=a.am;p.rlT=0;p.fcd=.35;this.ev({e:'sw',i:p.id,w:p.wid});
  }
  pickWeapon(cfg,not){
    const ids=Object.keys(cfg.weapons).filter(i=>i!==not);let tot=0;for(const i of ids)tot+=Math.max(0,cfg.weapons[i].lootWeight==null?1:cfg.weapons[i].lootWeight);
    let r=Math.random()*tot;for(const i of ids){r-=Math.max(0,cfg.weapons[i].lootWeight==null?1:cfg.weapons[i].lootWeight);if(r<=0)return i;}return ids[0];
  }
  takePickup(p,k,cfg){
    const cls=cfg.classes[p.cls],maxHp=cls.hp||cfg.player.hp,m=cfg.match;let ok=false;
    if(k.type==='h'){if(p.hp<(p.maxHp||maxHp)){p.hp=Math.min(p.maxHp||maxHp,p.hp+m.pickupHeal);ok=true;}}
    else if(k.type==='a'){if(p.armor<cfg.player.armorMax){p.armor=Math.min(cfg.player.armorMax,p.armor+m.pickupArmor);ok=true;}}
    else if(k.type==='w'){if(this.type!=='gungame'){const nw=this.pickWeapon(cfg,p.wid);if(!p.alt&&p.wid!==nw&&this.type==='br')p.alt={w:p.wid,am:p.ammo};p.wid=nw;p.ammo=cfg.weapons[p.wid].mag;p.rlT=0;ok=true;if(p.gren<3)p.gren++;}}
    else if(k.type==='c'){p.abCD=0;p.invT=Math.max(p.invT,.4);ok=true;}
    if(!ok)return;k.up=false;k.t=this.type==='br'?1e9:m.pickupRespawn;this.ev({e:'pk',id:k.id,u:0,by:p.id,w:k.type==='w'?p.wid:undefined});
  }
  /* ---------- weapons ---------- */
  spreadMul(p){
    let m=1;if(p.st===1)m=.7;else if(p.st===2)m=1.5;
    if(p.z>2)m=2.2;else if(Math.hypot(p.vx,p.vy)>40)m*=1.0;else m*=.8;
    if(p.ads)m*=.5;if(p.veh)m*=1.6;return m;
  }
  shoot(p,w){
    p.fcd=60/Math.max(1,w.rpm);p.ammo--;p.invT=0;p.noise=.5;
    if(w.proj==='rocket'){this.fireRocket(p,w);return;}
    const map=this.map,R=this.cfg().player.radius,pel=Math.max(1,w.pellets|0),rays=[],sm=this.spreadMul(p);
    let ox=p.x+Math.cos(p.a)*14,oy=p.y+Math.sin(p.a)*14;if(!VB.bulletClear(map,p.x,p.y,ox,oy)){ox=p.x;oy=p.y;}
    const dmgTo=new Map(),vdm=new Map();
    for(let i=0;i<pel;i++){
      const ang=p.a+(Math.random()-.5)*2*(w.spread||0)*sm*Math.PI/180,dx=Math.cos(ang),dy=Math.sin(ang);
      let len=VB.rayGrid(map,ox,oy,dx,dy,w.range,VB.BULLET_SOLID),hit=null,vh=null;
      for(const t of this.players.values()){
        if(t===p||!t.alive||t.invT>0||t.dashT>0||t.veh||t.para)continue;if(this.allied(p,t))continue;
        const d=VB.rayCircle(ox,oy,dx,dy,t.x,t.y,(R+1)*(t.st>0?.85:1),len);if(d>=0&&d<=len){len=d;hit=t;vh=null;}
      }
      for(const v of this.veh){if(v.dead||(v.k==='heli'&&v.z>150))continue;
        const occ=v.seats.map(id=>id&&this.players.get(id)).filter(Boolean);if(occ.length&&occ.every(o=>this.allied(p,o)))continue;if(p.veh===v.id)continue;
        const d=VB.rayCircle(ox,oy,dx,dy,v.x,v.y,this.vk(v.k).r,len);if(d>=0&&d<=len){len=d;vh=v;hit=null;}}
      if(hit){let dm=w.damage;if(pel>1)dm*=1-.55*Math.min(1,len/w.range);dmgTo.set(hit,(dmgTo.get(hit)||0)+dm);}
      else if(vh)vdm.set(vh,(vdm.get(vh)||0)+w.damage*.7);
      rays.push([Math.round(ang*1000)/1000,Math.round(len)]);
    }
    this.ev({e:'s',i:p.id,x:r1(ox),y:r1(oy),a:Math.round(p.a*1000)/1000,w:p.wid,ls:rays});
    for(const [t,dm] of dmgTo)this.hurt(t,dm,p,w);
    for(const [v,dm] of vdm){this.damageVeh(v,dm,p);this.ev({e:'ht',k:0,v:1},p.id);}
  }
  hurt(t,dm,by,w,wl,kind,sx,sy){
    const cfg=this.cfg();if(!t.alive||t.invT>0||t.para)return;
    if(by&&by.bot)dm*=by.dmgMul||1;
    if(t.surge)dm*=.55;
    const ab=Math.min(t.armor,dm*(cfg.player.armorAbsorb||.6));t.armor-=ab;dm-=ab;t.hp-=dm;t.hitT=.3;
    const fx=by&&by!==t?by.x:(sx!=null?sx:t.x),fy=by&&by!==t?by.y:(sy!=null?sy:t.y);
    this.ev({e:'dm',a:Math.round(Math.atan2(fy-t.y,fx-t.x)*100)/100,n:Math.round(dm)},t.id);
    if(by&&by!==t)this.ev({e:'ht',k:t.hp<=0?1:0},by.id);
    if(t.hp<=0)this.kill(t,by&&by!==t?by:(by===t?t:null),w,wl,kind);
  }
  kill(t,by,w,wl,kind){
    const cfg=this.cfg();t.alive=false;t.hp=0;t.d++;t.rsT=this.mode.respawn||cfg.player.respawn;t.dashT=0;t.abT=0;t.cloak=false;t.surge=false;t.ss=0;t.scan=0;t.slT=0;t.para=0;
    if(t.veh)this.exitVeh(t,true);
    const self=by===t;
    if(by&&!self){by.k++;by.ss=Math.min(100,by.ss+(cfg.match.ssPerKill||34));by.mk=by.mkT>0?by.mk+1:1;by.mkT=4;
      if(this.type==='tdm')this.score[by.team]++;else if(this.type==='ffa')by.sc++;
      else if(this.type==='gungame'){by.lvl++;by.sc=by.lvl;if(by.lvl<this.ladder.length){const wid=this.ladder[by.lvl];if(cfg.weapons[wid]){by.wid=wid;by.ammo=cfg.weapons[wid].mag;by.rlT=0;}}}}
    if(this.type==='br'){t.spec=by&&by.alive&&!self?by.id:0;}
    const dist=by&&!self?Math.hypot(by.x-t.x,by.y-t.y):0;
    this.ev({e:'k',a:by&&!self?by.id:(self?t.id:0),v:t.id,w:wl||(by?by.wid:''),x:r1(t.x),y:r1(t.y),z:by?0:1,d:Math.round(dist),sl:by&&!self&&by.st===2?1:0,ai:by&&!self&&by.z>2?1:0,mk:by&&!self?by.mk:0,kd:kind||'gun',av:by&&!self&&by.veh?1:0});
    this.rosterDirty=true;
    if(this.type==='br')this.onSquadDeath(t);
    this.checkLimit();
  }
  checkLimit(){
    if(this.phase!=='live')return;const lim=this.mode.scoreLimit||30;
    if(this.type==='br'){
      const alive=[...this.players.values()].filter(p=>p.alive);
      const humansAlive=alive.some(p=>!p.bot);
      if(this.aliveSquads().size<=1){this.endMatch('last');return;}
      if(!humansAlive&&!this.noHumanT)this.noHumanT=this.matchT;
      return;
    }
    if(this.team){if(this.score[0]>=lim||this.score[1]>=lim)this.endMatch('limit');}
    else if(this.type==='gungame'){for(const p of this.players.values())if(p.lvl>=this.ladder.length){this.endMatch('limit');break;}}
    else{for(const p of this.players.values())if(p.sc>=lim){this.endMatch('limit');break;}}
  }
  endMatch(why){
    if(this.phase==='end')return;this.phase='end';this.phaseT=this.cfg().match.endScreen;
    let win=null;
    if(this.team)win=this.score[0]===this.score[1]?-1:(this.score[0]>this.score[1]?0:1);
    else if(this.type==='br'){
      const a=[...this.players.values()].filter(p=>p.alive),tot=new Map();for(const p of a)tot.set(p.sq,(tot.get(p.sq)||0)+p.hp);
      let ws=-1,bh=-1;for(const [sq,h] of tot)if(h>bh){bh=h;ws=sq;}this.winSq=ws;
      for(const p of this.players.values()){if(p.sq===ws)p.place=1;else if(!p.place)p.place=2;}
      const w=a.find(p=>p.sq===ws)||[...this.players.values()].find(p=>p.sq===ws);win=w?w.id:-1;}
    else if(this.type==='gungame'){let b=null;for(const p of this.players.values())if(!b||p.lvl>b.lvl||(p.lvl===b.lvl&&p.k>b.k))b=p;win=b?b.id:-1;}
    else{let b=null;for(const p of this.players.values())if(!b||p.sc>b.sc)b=p;win=b?b.id:-1;}
    this.winner=win;
    const arr=[...this.players.values()].map(p=>({i:p.id,n:p.name,t:p.team,k:p.k,d:p.d,b:p.bot?1:0,pl:p.place||0,lv:p.lvl,sq:p.sq,si:p.si}));
    if(this.type==='br')arr.sort((a,b)=>(a.pl||99)-(b.pl||99));else if(this.type==='gungame')arr.sort((a,b)=>b.lv-a.lv||b.k-a.k);else arr.sort((a,b)=>b.k-a.k||a.d-b.d);
    this.ev({e:'end',win,why,score:this.score,rows:arr,next:this.nextMapId(),mode:this.type,wsq:this.winSq});
    this.giveRewards(win);
  }
  rewardPlayer(p,won){
    if(p.rewarded||!p.pid||p.bot)return;p.rewarded=true;
    const cfg=this.cfg(),R=cfg.match.reward,mins=Math.min(6,Math.max(0,(this.matchT-p.joinedAt)/60));if(mins<.3||p.late)return;
    const onlyBots=this.humans().length<=1;
    let coins=R.participate+p.k*R.perKill+mins*R.perMinute+(won?R.win:0),xp=R.xpParticipate+p.k*R.xpPerKill+(won?R.xpWin:0);
    if(this.type==='br'&&p.place>0&&p.place<=R.brPlace.length)coins+=R.brPlace[p.place-1];
    let mul=1;if(this.practice)mul=R.practiceMul;else if(onlyBots)mul=R.botMatchMul;
    coins=Math.min(R.cap,Math.round(coins*mul));xp=Math.round(xp*(this.practice?R.practiceMul:1));
    this.hub.award(p,{coins,xp,kills:p.k,deaths:p.d,win:won,place:p.place});
  }
  giveRewards(win){
    if(this.awarded)return;this.awarded=true;
    for(const p of this.humans()){const won=this.team?p.team===win:(this.squads?p.sq===this.winSq:p.id===win);this.rewardPlayer(p,won);}
  }
  nextMapId(){const o=Array.isArray(this.mode.maps)&&this.mode.maps.length?this.mode.maps:this.cfg().mapOrder;if(this.type==='br')return this.mapId;if(!o.length)return this.mapId;return o[(o.indexOf(this.mapId)+1)%o.length];}
  nextMatch(){if(!(this.priv&&this.keepMap))this.mapId=this.nextMapId();this.loadMatch();this.hub.sendWorld(this);}
  /* ---------- queries ---------- */
  flow(gx,gy){
    const m=this.map,key=gy*m.w+gx;let f=this.flowCache.get(key);if(f)return f;
    f=new Int16Array(m.w*m.h).fill(-1);const q=[gx+gy*m.w];f[q[0]]=0;
    for(let h=0;h<q.length;h++){const c=q[h],x=c%m.w,y=(c/m.w)|0,d=f[c];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=m.w||ny>=m.h)continue;const n=nx+ny*m.w;if(f[n]>=0||VB.MOVE_SOLID.has(m.rows[ny][nx]))continue;f[n]=d+1;q.push(n);}}
    if(this.flowCache.size>32)this.flowCache.clear();this.flowCache.set(key,f);return f;
  }
  sees(r,e,cfg){
    if(r===e)return 0;
    const vis=cfg.player.vision,hear=cfg.player.hearing,map=this.map;
    const check=(o)=>{
      const d=Math.hypot(e.x-o.x,e.y-o.y);
      const cl=cfg.classes[o.cls];
      if(cl&&cl.ability==='scan'&&o.abT>0&&d<(cl.radius||560))return 1;
      if(d>vis)return 0;if(e.cloak&&d>110)return 0;
      return VB.los(map,o.x,o.y,e.x,e.y)?1:0;
    };
    if((this.team||this.squads)&&this.allied(r,e))return 1;
    if(check(r))return 1;
    if(this.team||this.squads)for(const o of this.players.values())if(o!==r&&o.alive&&this.allied(o,r)&&check(o))return 1;
    if(!e.cloak&&e.noise>0&&Math.hypot(e.x-r.x,e.y-r.y)<hear)return 2;
    return 0;
  }
  specTarget(r){
    let t=this.players.get(r.spec);if(t&&t.alive)return t;
    if(this.squads&&r.sq>=0){t=[...this.players.values()].find(p=>p.alive&&p.sq===r.sq&&p!==r);if(t){r.spec=t.id;return t;}}
    for(const p of this.players.values())if(p.alive&&!p.bot){t=p;break;}
    if(!t)for(const p of this.players.values())if(p.alive){t=p;break;}
    r.spec=t?t.id:0;return t;
  }
  entry(e,v){
    let f=1;if(e.cloak)f|=2;if(e.surge)f|=4;if(e.dashT>0)f|=8;if(e.invT>0)f|=64;if(e.rlT>0)f|=128;if(e.para)f|=256;if(e.slT>0)f|=512;
    if(v===2)return{i:e.id,x:Math.round(e.x/48)*48,y:Math.round(e.y/48)*48,a:0,h:100,f:16};
    return{i:e.id,x:r1(e.x),y:r1(e.y),a:Math.round(e.a*100)/100,h:Math.max(1,Math.round(100*e.hp/(e.maxHp||100))),f,w:e.wid,vx:Math.round(e.vx),vy:Math.round(e.vy),z:r1(e.z||0),s:e.st||0,vh:e.veh||0,sa:e.seat||0,ar:this.armorTier(e.armor)};
  }
  snapshotFor(r,cfg){
    const list=[];
    const view=(!r.alive&&this.squads)?(this.specTarget(r)||r):((!r.alive&&this.type==='br')?(this.specTarget(r)||r):r);
    for(const e of this.players.values()){
      if(e===view||!e.alive)continue;const v=this.sees(view,e,cfg);if(!v)continue;
      list.push(this.entry(e,v));
    }
    if(view!==r&&view.alive&&r.id!==view.id)list.push(this.entry(view,1));
    const evs=[];
    for(const e of this.events){
      if(e._to){if(e._to!==r.id)continue;const{_to,...c}=e;evs.push(c);continue;}
      if(e.e==='s'||e.e==='ab'||e.e==='sp'||e.e==='rk'){
        const who=this.players.get(e.i);if(who&&who!==view){
          const d=Math.hypot(who.x-view.x,who.y-view.y),mate=this.allied(who,view);
          if(!mate&&d>1100&&!list.some(l=>l.i===e.i))continue;}
      }
      if(e.e==='ex'||e.e==='vi'||e.e==='cr'){if(Math.hypot(e.x-view.x,e.y-view.y)>1500)continue;}
      if(e.e==='rl'){const who=this.players.get(e.i);if(!who||(who!==view&&!list.some(l=>l.i===e.i)))continue;}
      evs.push(e);
    }
    const near=(o,d)=>Math.hypot(o.x-view.x,o.y-view.y)<d;
    const s={t:'s',k:this.tick,ack:r.seq,
      me:{x:r1(r.x),y:r1(r.y),vx:r1(r.vx),vy:r1(r.vy),hp:Math.round(r.hp),mh:Math.round(r.maxHp||100),ar:Math.round(r.armor),am:r.ammo,rl:Math.round(r.rlT*100)/100,cd:Math.round(r.abCD*100)/100,at:Math.round(r.abT*100)/100,dt:r.dashT,ddx:Math.round(r.dashDx*100)/100,ddy:Math.round(r.dashDy*100)/100,sg:r.surge?1:0,al:r.alive?1:0,rs:Math.round(Math.max(0,r.rsT)*10)/10,wid:r.wid,cls:r.cls,inv:r.invT>0?1:0,sk:r.k,sd:r.d,lv:r.lvl,pl:r.place,zh:r.zoneHit?1:0,
        zz:r1(r.z||0),vz:r1(r.vz||0),stc:r.st||0,slt:Math.round((r.slT||0)*100)/100,slc:Math.round((r.slCD||0)*100)/100,aw:r.alt?r.alt.w:'',aa:r.alt?r.alt.am:0,gn:r.gren,ss:Math.round(r.ss),uv:Math.round(Math.max(0,r.uav)*10)/10,tg:r.tags.length,sn:Math.round(r.scan/(cfg.match.scanTime||2.5)*100)/100,vh:r.veh||0,sat:r.seat||0,pa:r.para?1:0,rvt:Math.round(r.revT*10)/10,sq:r.sq,si:r.si,mk:r.mk},
      p:list,ev:evs,ph:this.phase,pt:Math.round(this.phaseT*10)/10,tl:Math.round(this.timeLeft),sc:this.score,zi:this.zi,zs:this.zoneState==null?-1:this.zoneState,al:this.aliveCount()};
    if(this.veh.length){s.vh=[];for(const v of this.veh)if(near(v,1100)||v.id===r.veh)s.vh.push({i:v.id,k:v.k,x:r1(v.x),y:r1(v.y),a:Math.round(v.a*1000)/1000,h:Math.max(1,Math.round(100*v.hp/v.mh)),z:r1(v.z),r:Math.round(v.rot*100)/100,vf:Math.round(v.vf||0),vl:Math.round(v.vl||0),vx:Math.round(v.vx),vy:Math.round(v.vy),s:v.seats});}
    if(this.proj.length){s.pr=[];for(const q of this.proj)if(near(q,1100))s.pr.push({i:q.id,k:q.k,x:r1(q.x),y:r1(q.y),a:Math.round(Math.atan2(q.vy,q.vx)*100)/100});}
    if(this.squads&&view.sq>=0){
      s.tgs=this.tags.filter(g=>g.sq===view.sq).map(g=>({i:g.id,x:Math.round(g.x),y:Math.round(g.y),o:g.o,t:Math.round(g.t)}));
      s.sqd=[];for(const m of this.players.values())if(m.sq===view.sq)s.sqd.push({i:m.id,si:m.si,h:m.alive?Math.max(1,Math.round(100*m.hp/(m.maxHp||100))):0,ar:this.armorTier(m.armor),al:m.alive?1:0,rv:Math.round(m.revT*10)/10,v:m.veh?1:0,pa:m.para?1:0,x:Math.round(m.x),y:Math.round(m.y),b:m.bot?1:0});
    }
    /* UAV: your squad / team scorestreak shows enemies on the radar only */
    let uav=false;for(const o of this.players.values())if(o.alive&&o.uav>0&&(o===view||this.allied(o,view))){uav=true;break;}
    if(uav){s.uvp=[];for(const e of this.players.values())if(e.alive&&!this.allied(e,view)&&e!==view)s.uvp.push([Math.round(e.x/8)*8,Math.round(e.y/8)*8]);}
    if(view!==r)s.sp={x:r1(view.x),y:r1(view.y),a:Math.round(view.a*100)/100,i:view.id};
    if(this.br){const b=this.br;s.br={x:Math.round(b.cx),y:Math.round(b.cy),r:Math.round(b.r),nx:Math.round(b.ncx),ny:Math.round(b.ncy),nr:Math.round(b.nr),ph:b.ph,st:b.st,t:Math.round(b.t)};}
    return s;
  }
}
install(Room);
module.exports={Room};
