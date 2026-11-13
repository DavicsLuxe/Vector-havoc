'use strict';
/* VECTOR HAVOC server extensions for Room: squads + dog tags + revive, parachute drops, vehicles (ATV, car, helicopter),
   grenades + rockets + explosions, scorestreak UAV. Installed onto Room.prototype by game.js. */
const VB=require('./public/js/shared.js');
const {TS,DT}=VB;
const r1=n=>Math.round(n*10)/10;
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const BS=VB.BULLET_SOLID;

module.exports=function install(Room){
const P=Room.prototype;

P.allied=function(a,b){
  if(!a||!b)return false;if(a===b)return true;
  if(this.team)return a.team===b.team;
  if(this.squads)return a.sq>=0&&a.sq===b.sq;
  return false;
};
P.vk=function(k){return Object.assign({},(this.cfg().vehicles||{})[k]);};
P.vehById=function(id){for(const v of this.veh)if(v.id===id)return v;return null;};
P.aliveSquads=function(){const s=new Set();for(const p of this.players.values())if(p.alive&&p.sq>=0)s.add(p.sq);return s;};
P.armorTier=a=>a>66?3:a>33?2:a>0?1:0;

/* ---------- squads ---------- */
P.formSquads=function(){
  if(!this.squads)return;
  const size=Math.max(1,this.mode.squad|0||4),counts=new Map(),order=[];
  const humans=this.humans().filter(p=>!p.late).sort((a,b)=>a.id-b.id),bots=this.bots().sort((a,b)=>a.id-b.id);
  const put=p=>{let s=null;for(const [id,c] of counts)if(c<size){s=id;break;}if(s==null)s=counts.size;counts.set(s,(counts.get(s)||0)+1);p.sq=s;order.push(p);};
  for(const p of humans)put(p);for(const p of bots)put(p);
  for(const p of this.players.values())if(!order.includes(p)){p.sq=-1;p.si=0;}
  const idx=new Map();for(const p of order){const i=idx.get(p.sq)||0;p.si=i;idx.set(p.sq,i+1);}
  this.rosterDirty=true;
};
/* the whole lobby drops from the sky when the match goes live */
P.dropAll=function(){
  for(const p of this.players.values()){if(!p.alive)continue;p.z=380;p.vz=0;p.para=1;p.invT=8;this.exitVeh(p,true);}
};

/* ---------- vehicles ---------- */
P.spawnVehicles=function(){
  this.veh=[];const spec=this.mode.vehicles;if(!spec||(!this.mapDef.br&&!this.mode.vehiclesAnywhere))return;
  const m=this.map,free=(tx,ty,r)=>{for(let y=ty-r;y<=ty+r;y++)for(let x=tx-r;x<=tx+r;x++)if(VB.MOVE_SOLID.has(VB.tile(m,x,y)))return false;return true;};
  for(const k of ['car','atv','heli']){
    const n=Math.min(40,spec[k]|0),sp=this.vk(k);if(!sp.mh)continue;const r=k==='heli'?3:2;
    for(let i=0,tries=0;i<n&&tries<600;tries++){
      const tx=4+((Math.random()*(m.w-8))|0),ty=4+((Math.random()*(m.h-8))|0);
      if(!free(tx,ty,r))continue;const x=tx*TS+TS/2,y=ty*TS+TS/2;
      if(this.veh.some(v=>Math.hypot(v.x-x,v.y-y)<TS*7))continue;
      this.veh.push({id:this.nid++,k,x,y,a:Math.floor(Math.random()*8)*Math.PI/4,vx:0,vy:0,vf:0,hp:sp.mh,mh:sp.mh,seats:new Array(sp.n||2).fill(0),z:0,vz:0,rot:0,dead:0,last:0,inp:null,wr:0});i++;
    }
  }
};
P.tryEnter=function(p){
  let best=null,bd=1e9;
  for(const v of this.veh){if(v.dead)continue;const d=Math.hypot(v.x-p.x,v.y-p.y),reach=v.k==='heli'?60:46;if(d>reach||d>=bd)continue;
    if(v.k==='heli'&&v.z>6)continue;
    const occ=v.seats.map(id=>id&&this.players.get(id)).filter(Boolean);if(occ.some(o=>!this.allied(o,p)))continue;
    if(v.seats.every(s=>s))continue;best=v;bd=d;}
  if(!best)return false;
  const s=best.seats.findIndex(x=>!x);best.seats[s]=p.id;p.veh=best.id;p.seat=s;p.z=0;p.vz=0;p.para=0;p.slT=0;p.ads=0;p.st=0;
  this.ev({e:'ve',i:p.id,v:best.id,s,k:best.k});return true;
};
P.exitVeh=function(p,silent){
  if(!p.veh)return;const v=this.vehById(p.veh);const seat=p.seat;p.veh=0;p.seat=0;
  if(!v)return;v.seats[seat]=0;
  const side=(seat%2?-1:1),a=v.a+Math.PI/2*side;
  p.x=v.x+Math.cos(a)*(v.k==='heli'?40:28);p.y=v.y+Math.sin(a)*(v.k==='heli'?40:28);p.vx=v.vx*.5;p.vy=v.vy*.5;
  VB.moveCircle(this.map,p,0,0,this.cfg().player.radius);
  if(v.k==='heli'&&v.z>10){p.z=v.z;p.vz=0;p.para=1;p.invT=Math.max(p.invT,2);}else{p.z=0;p.para=0;}
  if(!silent)this.ev({e:'vx',i:p.id,v:v.id});
};
P.damageVeh=function(v,dm,by){
  if(v.dead)return;v.hp-=dm;if(by)v.last=by.id;if(v.hp<=0)this.destroyVeh(v);
};
P.destroyVeh=function(v){
  if(v.dead)return;v.dead=1;
  for(const id of v.seats){const o=id&&this.players.get(id);if(o)this.exitVeh(o,true);}
  this.explode(v.x,v.y,115,140,this.players.get(v.last)||null,'veh','veh');
};
P.stepVehicles=function(){
  if(!this.veh.length)return;
  for(const v of this.veh){
    if(v.dead)continue;const sp=this.vk(v.k);
    const inp=v.inp||{th:0,sr:0,j:0,c:0};v.inp=null;
    for(let s=0;s<v.seats.length;s++){const id=v.seats[s];if(!id)continue;const o=this.players.get(id);if(!o||!o.alive||o.veh!==v.id)v.seats[s]=0;}
    const drv=v.seats[0]?this.players.get(v.seats[0]):null;
    if(v.k==='heli')this.stepHeli(v,sp,inp,!!drv);else this.stepCar(v,sp,inp);
    if(v.dead)continue;
    for(const id of v.seats){const o=id&&this.players.get(id);if(o){o.x=v.x;o.y=v.y;o.vx=v.vx;o.vy=v.vy;}}
    /* crush */
    if(v.k!=='heli'){const speed=Math.hypot(v.vx,v.vy);
      if(speed>150)for(const t of this.players.values()){
        if(!t.alive||t.veh||t.para||t.crT>0)continue;if(Math.hypot(t.x-v.x,t.y-v.y)>sp.r+11)continue;
        if(drv&&this.allied(drv,t))continue;
        t.crT=.6;this.hurt(t,speed*.2,drv||null,null,'crush','crush',v.x,v.y);
        v.vx*=.93;v.vy*=.93;this.ev({e:'cr',x:r1(t.x),y:r1(t.y)});}}
  }
  this.veh=this.veh.filter(v=>!v.dead);
};
P.stepCar=function(v,sp,inp){
  const map=this.map,c=Math.cos(v.a),s=Math.sin(v.a);
  let vf=v.vx*c+v.vy*s,vl=-v.vx*s+v.vy*c;const th=clamp(inp.th||0,-1,1);
  if(th>0)vf+=(vf<-5?sp.brake:sp.acc)*th*DT;
  else if(th<0)vf-=(vf>5?sp.brake:sp.acc*.55)*(-th)*DT;
  else vf*=Math.max(0,1-1.4*DT);
  vf=clamp(vf,-sp.vmax*.4,sp.vmax);
  const hb=!!inp.j;vl*=Math.exp(-(hb?1.2:sp.grip)*DT);if(hb)vf*=1-.9*DT;
  const auth=clamp(vf/120,-1,1);
  v.a+=clamp(inp.sr||0,-1,1)*sp.steer*auth*DT*(hb?1.5:1)*(1-.3*Math.min(1,Math.abs(vf)/sp.vmax));
  const c2=Math.cos(v.a),s2=Math.sin(v.a);
  let vx=c2*vf-s2*vl,vy=s2*vf+c2*vl;
  const e={x:v.x,y:v.y};VB.moveCircle(map,e,vx*DT,vy*DT,sp.r);
  const mvx=(e.x-v.x)/DT,mvy=(e.y-v.y)/DT,want=Math.hypot(vx,vy),got=Math.hypot(mvx,mvy);
  if(want>130&&got<want*.55){
    const drv=this.players.get(v.seats[0]);
    this.damageVeh(v,(want-got)*.11,drv||null);vf*=-.25;vl*=.3;vx=c2*vf-s2*vl;vy=s2*vf+c2*vl;this.ev({e:'vi',x:r1(v.x),y:r1(v.y),n:Math.round(want)});
  }else{vx=mvx;vy=mvy;}
  v.x=e.x;v.y=e.y;v.vx=vx;v.vy=vy;v.vf=vf;v.vl=vl;
};
P.stepHeli=function(v,sp,inp,piloted){
  v.rot=piloted?Math.min(1,v.rot+DT*.45):Math.max(0,v.rot-DT*.3);
  const lift=piloted&&v.rot>.7,asc=(inp.j?1:0)-(inp.c?1:0);
  if(lift)v.vz+=(asc*110-v.vz)*Math.min(1,DT*2.5);
  else v.vz+=((v.z>0?-55:0)-v.vz)*Math.min(1,DT*1.5);
  let nz=v.z+v.vz*DT;if(nz<=0){nz=0;v.vz=0;}v.z=Math.min(190,nz);
  if(piloted&&v.z>2)v.a+=clamp(inp.sr||0,-1,1)*1.7*DT;
  const th=(piloted&&v.z>6)?clamp(inp.th||0,-1,1):0,c=Math.cos(v.a),s=Math.sin(v.a);
  v.vx+=c*th*sp.acc*DT;v.vy+=s*th*sp.acc*DT;
  const drag=Math.exp(-(v.z>6?.75:4)*DT);v.vx*=drag;v.vy*=drag;
  const sv=Math.hypot(v.vx,v.vy);if(sv>sp.vmax){v.vx*=sp.vmax/sv;v.vy*=sp.vmax/sv;}
  const e={x:v.x,y:v.y};
  if(v.z<56)VB.moveCircle(this.map,e,v.vx*DT,v.vy*DT,sp.r);else{e.x=clamp(e.x+v.vx*DT,sp.r,this.map.pw-sp.r);e.y=clamp(e.y+v.vy*DT,sp.r,this.map.ph-sp.r);}
  if(Math.hypot(e.x-v.x-v.vx*DT,e.y-v.y-v.vy*DT)>2){v.vx*=.3;v.vy*=.3;}
  v.x=e.x;v.y=e.y;v.vf=v.vx*c+v.vy*s;v.vl=-v.vx*s+v.vy*c;
};

/* ---------- parachute ---------- */
P.paraStep=function(p,inp,cfg){
  const mx=inp.mx||0,my=inp.my||0,l=Math.hypot(mx,my)||1,k=Math.min(1,l),spd=p.z>140?250:190;
  p.vx+=(mx/l*k*spd-p.vx)*Math.min(1,DT*3);p.vy+=(my/l*k*spd-p.vy)*Math.min(1,DT*3);
  p.x=clamp(p.x+p.vx*DT,12,this.map.pw-12);p.y=clamp(p.y+p.vy*DT,12,this.map.ph-12);
  p.a=inp.a;p.vz=p.z>140?-120:-42;p.z+=p.vz*DT;p.st=0;p.ads=0;p.slT=0;
  if(p.z<=0){p.z=0;p.vz=0;p.para=0;p.invT=Math.max(p.invT,.8);VB.moveCircle(this.map,p,0,0,cfg.player.radius);this.ev({e:'ld',i:p.id,x:r1(p.x),y:r1(p.y)});}
};

/* ---------- grenades, rockets, explosions ---------- */
P.throwGrenade=function(p,inp){
  p.gren--;const a=p.a,sp=330+(p.ads?0:40);
  this.proj.push({id:this.nid++,k:'g',x:p.x+Math.cos(a)*14,y:p.y+Math.sin(a)*14,vx:Math.cos(a)*sp+p.vx*.4,vy:Math.sin(a)*sp+p.vy*.4,t:2.1,by:p.id});
  this.ev({e:'gt',i:p.id});
};
P.fireRocket=function(p,w){
  const a=p.a,ox=p.x+Math.cos(a)*16,oy=p.y+Math.sin(a)*16,s=VB.bulletClear(this.map,p.x,p.y,ox,oy);
  this.proj.push({id:this.nid++,k:'r',x:s?ox:p.x,y:s?oy:p.y,vx:Math.cos(a)*560,vy:Math.sin(a)*560,t:3,by:p.id,dmg:w.damage,rad:w.radius||100,wid:p.wid});
  this.ev({e:'rk',i:p.id,x:r1(p.x),y:r1(p.y),a:Math.round(a*1000)/1000});
};
P.stepProj=function(){
  const map=this.map;
  for(let i=this.proj.length-1;i>=0;i--){
    const q=this.proj[i];q.t-=DT;const owner=this.players.get(q.by)||null;let boom=false;
    if(q.k==='g'){
      const nx=q.x+q.vx*DT,ny=q.y+q.vy*DT;
      if(BS.has(VB.tile(map,Math.floor(nx/TS),Math.floor(q.y/TS))))q.vx*=-.45;else q.x=nx;
      if(BS.has(VB.tile(map,Math.floor(q.x/TS),Math.floor(ny/TS))))q.vy*=-.45;else q.y=ny;
      q.vx*=.982;q.vy*=.982;if(q.t<=0)boom=true;
    }else{
      const nx=q.x+q.vx*DT,ny=q.y+q.vy*DT;
      if(!VB.bulletClear(map,q.x,q.y,nx,ny))boom=true;
      else{
        for(const t of this.players.values()){if(!t.alive||t.para||t.veh||(owner&&this.allied(owner,t)&&t!==owner))continue;if(t===owner&&q.t>2.75)continue;
          if(Math.hypot(t.x-nx,t.y-ny)<13){boom=true;break;}}
        if(!boom)for(const v of this.veh){if(v.dead)continue;const occ=v.seats.map(id=>id&&this.players.get(id)).filter(Boolean);if(owner&&occ.length&&occ.every(o=>this.allied(owner,o)))continue;if(Math.hypot(v.x-nx,v.y-ny)<this.vk(v.k).r+4&&(v.k!=='heli'||v.z<110)){boom=true;break;}}
        q.x=nx;q.y=ny;if(q.t<=0)boom=true;
      }
    }
    if(boom){this.proj.splice(i,1);this.explode(q.x,q.y,q.k==='g'?92:q.rad,q.k==='g'?105:q.dmg,owner,q.k==='g'?'frag':'rocket',q.k==='g'?'frag':'rocket');}
  }
};
P.explode=function(x,y,rad,dmg,owner,wl,kind){
  this.ev({e:'ex',x:r1(x),y:r1(y),r:rad,k:kind});
  for(const t of this.players.values()){
    if(!t.alive||t.para)continue;const d=Math.hypot(t.x-x,t.y-y);if(d>rad)continue;
    if(owner&&t!==owner&&this.allied(owner,t))continue;
    if(d>16&&!VB.bulletClear(this.map,x,y,t.x,t.y))continue;
    let dm=dmg*(1-clamp(d/rad,0,1)*.85);if(t===owner)dm*=.5;if(t.veh)dm*=.3;
    this.hurt(t,dm,owner&&owner!==t?owner:(owner===t?t:null),null,wl,kind,x,y);
  }
  for(const v of this.veh){if(v.dead)continue;const d=Math.hypot(v.x-x,v.y-y);if(d>rad+14)continue;
    this.damageVeh(v,dmg*(1-clamp(d/(rad+14),0,1)*.7)*1.1,owner);}
};

/* ---------- dog tags + revive ---------- */
P.onSquadDeath=function(t){
  if(!this.squads||t.sq<0)return;
  if(t.tags.length){for(const o of t.tags)this.tags.push({id:this.nid++,x:t.x,y:t.y,sq:t.sq,o,t:90});t.tags=[];}
  t.revT=0;
  const mates=[...this.players.values()].filter(m=>m.sq===t.sq&&m!==t);
  const livingMate=mates.find(m=>m.alive);
  if(livingMate){
    this.tags.push({id:this.nid++,x:t.x,y:t.y,sq:t.sq,o:t.id,t:90});
    t.spec=livingMate.id;
    for(const m of mates)if(m.alive&&!m.bot)this.ev({e:'dt',n:t.name,i:t.id,x:r1(t.x),y:r1(t.y)},m.id);
  }else{
    const place=this.aliveSquads().size+1;
    for(const m of [t,...mates]){m.place=place;m.revT=0;}
    this.tags=this.tags.filter(g=>g.sq!==t.sq);
    for(const m of [t,...mates])if(!m.bot)this.rewardPlayer(m,false);
  }
};
P.stepTags=function(){
  if(!this.tags.length&&!this.squads)return;
  for(let i=this.tags.length-1;i>=0;i--){
    const g=this.tags[i];g.t-=DT;const o=this.players.get(g.o);
    if(g.t<=0||!o||o.alive||o.revT>0){this.tags.splice(i,1);continue;}
    for(const p of this.players.values()){
      if(!p.alive||p.sq!==g.sq||p.veh||p.para||p.tags.length>=3||p.id===g.o)continue;
      if(Math.abs(p.x-g.x)>26||Math.abs(p.y-g.y)>26)continue;
      p.tags.push(g.o);this.tags.splice(i,1);this.ev({e:'tc',n:o.name,i:o.id},p.id);break;
    }
  }
  /* revival flights */
  for(const o of this.players.values()){
    if(o.alive||o.revT<=0)continue;o.revT-=DT;if(o.revT>0)continue;o.revT=0;
    const by=this.players.get(o.revBy),who=(by&&by.alive&&by.sq===o.sq)?by:[...this.players.values()].find(m=>m.alive&&m.sq===o.sq);
    if(!who||this.phase!=='live')continue;
    const cfg=this.cfg();
    o.alive=true;o.maxHp=o.maxHp||100;o.hp=o.maxHp*.5;o.armor=0;o.x=who.x+rnd(-36,36);o.y=who.y+rnd(-36,36);VB.moveCircle(this.map,o,0,0,cfg.player.radius);
    o.vx=o.vy=0;o.z=360;o.vz=0;o.para=1;o.invT=4;o.wid=this.mode.startWeapon&&cfg.weapons[this.mode.startWeapon]?this.mode.startWeapon:o.wid;o.ammo=cfg.weapons[o.wid].mag;o.rlT=0;o.alt=null;o.gren=1;o.tags=[];o.place=0;o.spec=0;o.scan=0;o.veh=0;
    this.ev({e:'rvd',i:o.id,x:r1(o.x),y:r1(o.y),n:o.name});this.rosterDirty=true;
  }
};
};
