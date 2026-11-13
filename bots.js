'use strict';
/* Bot brains. Built to be beatable and fair: limited field of view, reaction delay, aim error that grows with distance and movement,
   burst fire, short memory, and no wallhacks. Skill (0..1) and a damage multiplier come from the difficulty setting. */
const VB=require('./public/js/shared.js');
const {TS,DT}=VB;
const TAU=Math.PI*2;
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};
const lerp=(a,b,t)=>a+(b-a)*t;

function think(room,b,cfg){
  const inp=b.binp||(b.binp={mx:0,my:0,a:b.a,fire:0,ab:0,rl:0,seq:1,j:0,c:0,sl:0,sw:0,gr:0,use:0,rv:0,ssb:0,ads:0});
  inp.seq++;inp.ab=0;inp.rl=0;inp.fire=0;inp.mx=0;inp.my=0;inp.j=0;inp.c=0;inp.sl=0;inp.sw=0;inp.gr=0;inp.use=0;inp.rv=0;inp.ssb=0;inp.ads=0;
  if(!b.alive){b.tgt=null;return;}
  const sk=b.skill,w=cfg.weapons[b.wid],cls=cfg.classes[b.cls],map=room.map,vis=cfg.player.vision;
  const B=b.brain||(b.brain={tT:0,goal:null,goalT:0,react:0,errT:0,err:0,stuckT:0,lx:b.x,ly:b.y,strafe:1,strafeT:0,burstT:0,pauseT:0,fireTog:false,mem:null,memT:0,idle:0,seen:0,cover:null,coverT:0,coverCheck:0,flankT:0,flank:null,engaged:0,slideCD:0,grCD:3+Math.random()*6,useCD:0});
  const maxHp=b.maxHp||cls.hp||100;
  /* ---- perception: forward cone + close awareness + line of sight ---- */
  B.tT-=DT;const acq=room.br?(room.matchT<45||b.hp>=b.maxHp?Math.min(vis,room.matchT<45?380:vis*.85):vis):vis;
  if(B.tT<=0){
    B.tT=.2+Math.random()*.15;let best=null,bd=1e9;
    for(const e of room.players.values()){
      if(e===b||!e.alive||room.allied(e,b)||e.invT>.6)continue;
      const dx=e.x-b.x,dy=e.y-b.y,d=Math.hypot(dx,dy);if(d>acq||(e.cloak&&d>110)||d>=bd)continue;
      const inCone=Math.abs(angDiff(b.a,Math.atan2(dy,dx)))<1.22||d<130;   /* ~140 degree cone, or someone right next to you */
      if(!inCone)continue;
      if(VB.los(map,b.x,b.y,e.x,e.y)){best=e;bd=d;}
    }
    if(best&&(!b.tgt||b.tgt.id!==best.id)){B.react=lerp(.95,.3,sk)+Math.random()*.3;B.burstT=0;B.pauseT=0;}
    if(best){B.mem={x:best.x,y:best.y};B.memT=1.4+sk;}
    else if(b.tgt&&B.memT>0){/* lost sight: remember where they were briefly */}
    b.tgt=best;
    /* noises: a nearby moving or firing enemy turns the bot's head even without line of sight */
    if(!best&&B.memT<=0){for(const e of room.players.values()){if(e===b||!e.alive||room.allied(e,b)||e.noise<=0)continue;const d=Math.hypot(e.x-b.x,e.y-b.y);if(d<cfg.player.hearing*.8){B.mem={x:e.x+(Math.random()-.5)*120,y:e.y+(Math.random()-.5)*120};B.memT=1.2;break;}}}
  }
  if(b.tgt&&!b.tgt.alive)b.tgt=null;
  if(B.memT>0)B.memT-=DT;
  const t=b.tgt;
  /* ---- goals ---- */
  B.goalT-=DT;B.idle=t?0:B.idle+DT;
  const m=map;
  const pickGoal=()=>{
    if(room.br){
      const z=room.br,out=Math.hypot(b.x-z.cx,b.y-z.cy)>z.r*.92;
      const tx=z.st==='shrink'||z.st==='final'?z.ncx:z.ncx,ty=z.st==='shrink'||z.st==='final'?z.ncy:z.ncy;
      if(out||z.st==='shrink')return{x:tx+(Math.random()-.5)*z.nr*.7,y:ty+(Math.random()-.5)*z.nr*.7};
      /* loot nearby first */
      let bestK=null,bd=900;for(const k of room.pickups){if(!k.up)continue;const d=Math.hypot(k.x-b.x,k.y-b.y);const need=k.type==='h'?(b.hp<maxHp*.7?1:0):k.type==='a'?(b.armor<50?1:0):k.type==='w'?1:0;if(need&&d<bd){bd=d;bestK=k;}}
      if(bestK)return{x:bestK.x,y:bestK.y};
      return{x:tx+(Math.random()-.5)*z.nr*.8,y:ty+(Math.random()-.5)*z.nr*.8};
    }
    if(b.hp<maxHp*.45){const hp=room.pickups.filter(k=>k.up&&k.type==='h').sort((p,q)=>Math.hypot(p.x-b.x,p.y-b.y)-Math.hypot(q.x-b.x,q.y-b.y))[0];if(hp)return{x:hp.x,y:hp.y};}
    if(room.type==='zone'&&m.zones.length&&Math.random()<.7){const z=m.zones[room.zi];return{x:z.x+(Math.random()-.5)*90,y:z.y+(Math.random()-.5)*90};}
    if(B.mem&&B.memT>0)return{x:B.mem.x,y:B.mem.y};
    const ups=room.pickups.filter(k=>k.up);if(ups.length&&Math.random()<.3){const k=ups[(Math.random()*ups.length)|0];return{x:k.x,y:k.y};}
    for(let i=0;i<30;i++){const x=1+((Math.random()*(m.w-2))|0),y=1+((Math.random()*(m.h-2))|0);if(!VB.MOVE_SOLID.has(m.rows[y][x]))return{x:x*TS+TS/2,y:y*TS+TS/2};}
    return{x:m.pw/2,y:m.ph/2};
  };
  if(!B.goal||B.goalT<=0||Math.hypot(B.goal.x-b.x,B.goal.y-b.y)<28){B.goal=pickGoal();B.goalT=3+Math.random()*4;}
  /* leaving the safe zone overrides everything */
  if(room.br&&Math.hypot(b.x-room.br.cx,b.y-room.br.cy)>room.br.r&&!t){B.goal={x:room.br.cx,y:room.br.cy};B.goalT=2;}
  /* ---- squad behaviour: ride with humans, collect dog tags, revive ---- */
  B.useCD-=DT;B.grCD-=DT;B.slideCD-=DT;B.coverCheck-=DT;
  let ally=null;if(room.squads&&b.sq>=0){for(const o of room.players.values())if(o!==b&&o.alive&&o.sq===b.sq&&!o.bot){ally=o;break;}}
  if(b.veh){const v=room.vehById(b.veh);
    if(!ally||ally.veh!==b.veh||!v){if(B.useCD<=0){inp.use=1;B.useCD=1.2;}}
    /* passengers still fight, but never drive */
  }else if(!b.para&&ally&&ally.veh&&B.useCD<=0&&!t){
    const v=room.vehById(ally.veh);if(v&&v.seats.some(s=>!s)){const d=Math.hypot(v.x-b.x,v.y-b.y);if(d<46){inp.use=1;B.useCD=1.2;}else if(d<900){B.goal={x:v.x,y:v.y};B.goalT=1;}}
  }
  if(room.squads&&b.sq>=0&&!b.veh&&!b.para&&!t){
    if(b.tags.length&&b.tags.length>0){inp.rv=1;B.goal={x:b.x,y:b.y};B.goalT=.5;}
    else{let bt=null,bd=700;for(const g of room.tags)if(g.sq===b.sq){const d=Math.hypot(g.x-b.x,g.y-b.y);if(d<bd){bd=d;bt=g;}}if(bt){B.goal={x:bt.x,y:bt.y};B.goalT=1;}
      else if(ally&&!ally.veh&&Math.hypot(ally.x-b.x,ally.y-b.y)>260&&B.goalT<2.5&&Math.random()<.6){B.goal={x:ally.x+(Math.random()-.5)*120,y:ally.y+(Math.random()-.5)*120};B.goalT=3;}}
  }
  /* ---- movement ---- */
  let dest=B.goal;
  if(t){
    const d=Math.hypot(t.x-b.x,t.y-b.y),pref=w.range<450?170:w.range>1000?520:320;
    if(d>pref*1.3)dest={x:t.x,y:t.y};
    else if(d<pref*.55){dest=null;inp.mx=(b.x-t.x)/d;inp.my=(b.y-t.y)/d;}
    else dest=null;
    B.strafeT-=DT;if(B.strafeT<=0){B.strafe=Math.random()<.5?-1:1;B.strafeT=.7+Math.random()*1.4;}
    if(!dest){const ax=(t.x-b.x)/d,ay=(t.y-b.y)/d,k=(.45+.35*sk)*(B.react>0?.3:1);inp.mx+=-ay*B.strafe*k;inp.my+=ax*B.strafe*k;}
    B.engaged+=DT;
    /* under fire: slide-shoot sideways, then keep firing out of the slide */
    if(b.hitT>0&&sk>.3&&B.slideCD<=0&&!b.veh&&!b.para&&Math.random()<.35){inp.sl=1;B.slideCD=2.5+Math.random()*2;if(!inp.mx&&!inp.my){inp.mx=-(t.y-b.y)/d*B.strafe;inp.my=(t.x-b.x)/d*B.strafe;}}
    /* cover: low health or reloading, find a wall that breaks line of sight to the target, crouch there */
    const wantCover=!b.veh&&!b.para&&(b.hp<maxHp*.5||b.rlT>0||B.coverT>0)&&sk>.25;
    if(wantCover){
      if(B.coverCheck<=0){B.coverCheck=1.2;let best=null,bdd=1e9;
        for(let i=0;i<26;i++){const tx=Math.floor(b.x/TS)+((Math.random()*15)|0)-7,ty=Math.floor(b.y/TS)+((Math.random()*15)|0)-7;
          if(tx<1||ty<1||tx>=map.w-1||ty>=map.h-1||VB.MOVE_SOLID.has(map.rows[ty][tx]))continue;
          const cx=tx*TS+TS/2,cy=ty*TS+TS/2;if(VB.los(map,cx,cy,t.x,t.y)&&VB.bulletClear(map,cx,cy,t.x,t.y))continue;
          const dd=Math.hypot(cx-b.x,cy-b.y);if(dd<bdd){bdd=dd;best={x:cx,y:cy};}}
        if(best){B.cover=best;B.coverT=2.5+Math.random()*2;}}
      if(B.cover){const dc=Math.hypot(B.cover.x-b.x,B.cover.y-b.y);if(dc>16)dest=B.cover;else{dest=null;inp.mx=inp.my=0;inp.c=1;}}
    }
    if(B.coverT>0)B.coverT-=DT;
    /* flank: when a fight drags on, swing wide around the target */
    if(!wantCover&&B.engaged>2.5&&sk>.35&&!B.flank&&Math.random()<.01){
      const sd=Math.random()<.5?-1:1,ax=(t.x-b.x)/d,ay=(t.y-b.y)/d,fx=t.x-ay*sd*260-ax*60,fy=t.y+ax*sd*260-ay*60,tx=Math.floor(fx/TS),ty=Math.floor(fy/TS);
      if(tx>0&&ty>0&&tx<map.w-1&&ty<map.h-1&&!VB.MOVE_SOLID.has(map.rows[ty][tx])){B.flank={x:fx,y:fy};B.flankT=3.2;}}
    if(B.flank){B.flankT-=DT;if(B.flankT<=0||Math.hypot(B.flank.x-b.x,B.flank.y-b.y)<30)B.flank=null;else if(!wantCover)dest=B.flank;}
    /* aim down sights at range, throw a grenade at mid range */
    if(d>260&&!b.veh)inp.ads=1;
    if(b.gren>0&&B.grCD<=0&&d>130&&d<330&&B.react<=0&&sk>.3&&Math.random()<.03){inp.gr=1;B.grCD=7+Math.random()*8;}
    if(w.auto===false&&b.alt&&b.ammo<=0&&Math.random()<.2)inp.sw=1;
  }else{B.engaged=Math.max(0,B.engaged-DT*2);B.flank=null;if(B.mem&&B.memT>0&&room.type!=='br'){dest=B.mem;}}
  if(false){}
  if(dest){
    const tx=Math.floor(b.x/TS),ty=Math.floor(b.y/TS),gx=Math.max(0,Math.min(m.w-1,Math.floor(dest.x/TS))),gy=Math.max(0,Math.min(m.h-1,Math.floor(dest.y/TS)));
    if(tx===gx&&ty===gy){const d=Math.hypot(dest.x-b.x,dest.y-b.y)||1;inp.mx=(dest.x-b.x)/d;inp.my=(dest.y-b.y)/d;}
    else{
      const f=room.flow(gx,gy);let bd=f[tx+ty*m.w],bx=0,by=0;if(bd<0)bd=1e9;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=tx+dx,ny=ty+dy;if(nx<0||ny<0||nx>=m.w||ny>=m.h)continue;
        if(dx&&dy&&(VB.MOVE_SOLID.has(m.rows[ty][nx])||VB.MOVE_SOLID.has(m.rows[ny][tx])))continue;
        const v=f[nx+ny*m.w];if(v>=0&&v<bd){bd=v;bx=dx;by=dy;}}
      if(bx||by){const cx=(tx+bx)*TS+TS/2-b.x,cy=(ty+by)*TS+TS/2-b.y,d=Math.hypot(cx,cy)||1;inp.mx=cx/d;inp.my=cy/d;}
      else B.goalT=0;
    }
  }
  B.stuckT+=DT;if(B.stuckT>1){if(Math.hypot(b.x-B.lx,b.y-B.ly)<14&&(inp.mx||inp.my)){B.goalT=0;B.strafe*=-1;}B.stuckT=0;B.lx=b.x;B.ly=b.y;}
  /* ---- aim: slow turn, wobbly aim that gets worse with distance and when running ---- */
  const speedFrac=Math.min(1,Math.hypot(b.vx,b.vy)/cfg.player.speed);
  let want=b.a;
  if(t){
    const d=Math.hypot(t.x-b.x,t.y-b.y);
    want=Math.atan2(t.y-b.y,t.x-b.x);
    B.errT-=DT;if(B.errT<=0){B.errT=.18+Math.random()*.2;const sd=lerp(.30,.045,sk)*(1+speedFrac*.9)*(1+d/900);B.err=(Math.random()+Math.random()+Math.random()-1.5)*sd*1.6;}
    want+=B.err;
  }else if(B.mem&&B.memT>0)want=Math.atan2(B.mem.y-b.y,B.mem.x-b.x);
  else if(inp.mx||inp.my)want=Math.atan2(inp.my,inp.mx);
  const diff=angDiff(b.a,want),turn=lerp(3.2,8,sk)*DT;b.a+=Math.max(-turn,Math.min(turn,diff));inp.a=b.a;
  /* ---- shooting: wait out the reaction time, fire in bursts ---- */
  if(t&&!b.para){
    B.react-=DT;const d=Math.hypot(t.x-b.x,t.y-b.y),aligned=Math.abs(angDiff(b.a,Math.atan2(t.y-b.y,t.x-b.x)))<.13+(1-sk)*.1;
    if(B.react<=0&&d<w.range*.9&&aligned){
      if(B.pauseT>0)B.pauseT-=DT;
      else{
        if(w.auto){inp.fire=1;B.burstT-=DT;if(B.burstT<=0){B.pauseT=lerp(.7,.22,sk)*(.7+Math.random()*.6);B.burstT=lerp(.28,.75,sk)*(.7+Math.random()*.6);}}
        else{B.fireTog=!B.fireTog;inp.fire=B.fireTog?1:0;if(w.rpm<200&&Math.random()<.04)B.pauseT=.3;}
      }
    }
    if(b.abCD<=0&&b.abT<=0){
      const ab=cls.ability;
      if(ab==='dash'&&(b.hp<maxHp*.4||(d>380&&Math.random()<.02))){inp.ab=1;if(b.hp<maxHp*.4){inp.mx=(b.x-t.x)/(d||1);inp.my=(b.y-t.y)/(d||1);}}
      else if(ab==='cloak'&&d>200&&Math.random()<.03)inp.ab=1;
      else if(ab==='surge'&&(b.hp<maxHp*.75||d<220)&&Math.random()<.05)inp.ab=1;
    }
  }else if(b.abCD<=0&&b.abT<=0&&cls.ability==='scan'&&B.idle>3&&Math.random()<.015)inp.ab=1;
  if(b.ammo<w.mag*.35&&!t)inp.rl=1;
  if(b.ss>=100&&Math.random()<.02)inp.ssb=1;
}
module.exports={think};
