'use strict';
/* Procedural, mirror-symmetric arenas. Generated once, then stored in data/config.json where the dev console can edit them. */
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function gen(id,name,o){
  const W=o.w||48,H=o.h||30,R=rng(o.seed),g=Array.from({length:H},()=>Array(W).fill('.')),half=W>>1;
  for(let x=0;x<W;x++){g[0][x]='#';g[H-1][x]='#';}for(let y=0;y<H;y++){g[y][0]='#';g[y][W-1]='#';}
  const free=(x0,y0,w,h)=>{for(let y=y0-1;y<y0+h+1;y++)for(let x=x0-1;x<x0+w+1;x++){if(x<1||y<1||x>=half-1||y>=H-1)return false;if(g[y][x]!=='.')return false;}return true;};
  const put=(x0,y0,w,h,c)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)g[y][x]=c;};
  /* keep a clear spawn pocket and the centre lane */
  const keep=(x,y)=>(x<8)||(Math.abs(y-H/2)<2&&x>half-10);
  if(o.water){const band=o.water;for(let y=1;y<=band;y++)for(let x=1;x<W-1;x++){g[y][x]='~';g[H-1-y][x]='~';}}
  const top=o.water?o.water+2:2,bot=o.water?H-o.water-3:H-4;
  let placed=0;for(let i=0;i<o.buildings*12&&placed<o.buildings;i++){
    const w=3+Math.floor(R()*(o.maxW||5)),h=2+Math.floor(R()*(o.maxH||4)),x=9+Math.floor(R()*(half-11)),y=top+Math.floor(R()*(bot-top-h));
    if(y<top||y+h>bot)continue;let ok=true;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(keep(xx,yy))ok=false;
    if(ok&&free(x,y,w,h)){put(x,y,w,h,o.tall&&R()<.5?'X':'#');placed++;}
  }
  let cp=0;for(let i=0;i<o.crates*8&&cp<o.crates;i++){
    const x=7+Math.floor(R()*(half-8)),y=top+Math.floor(R()*(bot-top)),w=1+Math.floor(R()*2),h=1+Math.floor(R()*2);
    if(y+h>bot||keep(x,y)||keep(x+w,y+h))continue;if(free(x,y,w,h)){put(x,y,w,h,'x');cp++;}
  }
  /* mirror left -> right */
  for(let y=0;y<H;y++)for(let x=0;x<half;x++)g[y][W-1-x]=g[y][x];
  /* bridge across water */
  if(o.water){for(let y=H/2-2;y<=H/2+1;y++)for(let x=1;x<W-1;x++)if(g[y][x]==='~')g[y][x]='.';}
  /* spawn pockets */
  for(let i=0;i<5;i++){const y=Math.floor(H/2)-2+i;g[y][2]='A';g[y][W-3]='B';}
  g[Math.floor(H/2)-4][3]='A';g[Math.floor(H/2)+4][3]='A';g[Math.floor(H/2)-4][W-4]='B';g[Math.floor(H/2)+4][W-4]='B';
  /* FFA spawns scattered symmetrically on free tiles */
  let f=0;for(let tries=0;tries<400&&f<8;tries++){const x=3+Math.floor(R()*(half-5)),y=3+Math.floor(R()*(H-6));if(g[y][x]==='.'&&g[y][W-1-x]==='.'){g[y][x]='F';g[y][W-1-x]='F';f+=2;}}
  /* zones + pickups on free tiles */
  const setFree=(x,y,c)=>{for(let r=0;r<6;r++){for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx>0&&yy>0&&xx<W-1&&yy<H-1&&g[yy][xx]==='.'){g[yy][xx]=c;return [xx,yy];}}}return null;};
  setFree(W/2-1,Math.floor(H/2),'Z');
  const zc=[[half-9,Math.floor(H*.25)],[half-9,Math.floor(H*.75)]];zc.forEach(([x,y])=>{const p=setFree(x,y,'Z');if(p&&g[p[1]][W-1-p[0]]==='.')g[p[1]][W-1-p[0]]='Z';});
  const pk=[['h',half-4,Math.floor(H*.3)],['h',half-4,Math.floor(H*.7)],['a',half-14,Math.floor(H*.5)-3],['a',half-14,Math.floor(H*.5)+3],['w',half-2,Math.floor(H/2)-1],['c',half-7,Math.floor(H*.5)],['w',half-12,Math.floor(H*.25)],['w',half-12,Math.floor(H*.75)]];
  pk.forEach(([c,x,y])=>{const p=setFree(x,y,c);if(p&&g[p[1]][W-1-p[0]]==='.')g[p[1]][W-1-p[0]]=c;});
  /* seal unreachable floor pockets */
  const sx=2,sy=Math.floor(H/2),seen=Array.from({length:H},()=>Array(W).fill(false)),q=[[sx,sy]];seen[sy][sx]=true;
  const passable=c=>!'#xX~'.includes(c);
  while(q.length){const [x,y]=q.pop();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<W-1&&ny<H-1&&!seen[ny][nx]&&passable(g[ny][nx])){seen[ny][nx]=true;q.push([nx,ny]);}}}
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(passable(g[y][x])&&!seen[y][x])g[y][x]='#';
  return{id,name,desc:o.desc||'',rows:g.map(r=>r.join('')),theme:o.theme||'neon'};
}

/* Open-world battle royale map: lagoon, streets, hollow buildings with doors and loot, boulders/trees, crates. */
function genWorld(id,name,o){
  const W=o.w||96,H=o.h||72,R=rng(o.seed),g=Array.from({length:H},()=>Array(W).fill('.'));
  for(let x=0;x<W;x++){g[0][x]='#';g[H-1][x]='#';}for(let y=0;y<H;y++){g[y][0]='#';g[y][W-1]='#';}
  const blob=(cx,cy,r)=>{for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){const d=Math.hypot(x-cx,(y-cy)*1.15),n=Math.sin(x*.45+cy)*1.6+Math.cos(y*.4+cx)*1.6;if(d<r+n)g[y][x]='~';}};
  blob(W*.86,H*.84,W*.13);blob(W*.12,H*.16,W*.045);
  const free=(x0,y0,w,h,pad)=>{for(let y=y0-pad;y<y0+h+pad;y++)for(let x=x0-pad;x<x0+w+pad;x++){if(x<2||y<2||x>=W-2||y>=H-2)return false;if(g[y][x]!=='.')return false;}return true;};
  const blds=[];const loot=[];
  const cellW=16,cellH=14;
  for(let cy=0;cy<H;cy+=cellH)for(let cx=0;cx<W;cx+=cellW){
    const n=1+Math.floor(R()*1.7);
    for(let k=0;k<n*8&&blds.filter(b=>b.cx===cx&&b.cy===cy).length<n;k++){
      const bw=5+Math.floor(R()*7),bh=5+Math.floor(R()*4),x=cx+2+Math.floor(R()*Math.max(1,cellW-bw-3)),y=cy+2+Math.floor(R()*Math.max(1,cellH-bh-3));
      if(!free(x,y,bw,bh,2))continue;
      for(let yy=y;yy<y+bh;yy++)for(let xx=x;xx<x+bw;xx++)g[yy][xx]=(yy===y||yy===y+bh-1||xx===x||xx===x+bw-1)?'#':'.';
      /* doors: at least two, on different sides */
      const sides=[0,1,2,3].sort(()=>R()-.5).slice(0,2+(R()<.5?1:0));
      for(const sd of sides){
        if(sd===0||sd===1){const dx=x+2+Math.floor(R()*(bw-5)),yy=sd===0?y:y+bh-1;g[yy][dx]='.';g[yy][dx+1]='.';}
        else{const dy=y+2+Math.floor(R()*(bh-5)),xx=sd===2?x:x+bw-1;g[dy][xx]='.';g[dy+1][xx]='.';}
      }
      /* inner crates + loot, kept away from walls so doors stay clear */
      if(bw>=8&&bh>=6)for(let c=0;c<1+Math.floor(R()*3);c++){const ix=x+3+Math.floor(R()*(bw-6)),iy=y+3+Math.floor(R()*(bh-6));if(g[iy][ix]==='.')g[iy][ix]='x';}
      const lc=1+Math.floor(R()*3);for(let l=0;l<lc;l++){const ix=x+1+Math.floor(R()*(bw-2)),iy=y+1+Math.floor(R()*(bh-2));if(g[iy][ix]==='.'){const r=R();g[iy][ix]=r<.45?'w':r<.7?'a':'h';}}
      blds.push({x,y,bw,bh,cx,cy});
    }
  }
  /* outdoor trees/boulders (X), crates (x) in clumps */
  for(let i=0;i<46;i++){const x=3+Math.floor(R()*(W-6)),y=3+Math.floor(R()*(H-6));const n=1+Math.floor(R()*4);for(let k=0;k<n;k++){const xx=x+Math.floor(R()*3)-1,yy=y+Math.floor(R()*3)-1;if(free(xx,yy,1,1,1))g[yy][xx]='X';}}
  for(let i=0;i<60;i++){const x=3+Math.floor(R()*(W-6)),y=3+Math.floor(R()*(H-6)),len=1+Math.floor(R()*4),hz=R()<.5;for(let k=0;k<len;k++){const xx=x+(hz?k:0),yy=y+(hz?0:k);if(free(xx,yy,1,1,1))g[yy][xx]='x';}}
  /* outdoor loot */
  for(let i=0;i<70;i++){const x=3+Math.floor(R()*(W-6)),y=3+Math.floor(R()*(H-6));if(g[y][x]==='.'){const r=R();g[y][x]=r<.4?'w':r<.7?'h':'a';}}
  /* spawns */
  const sp=[];for(let t=0;t<2000&&sp.length<48;t++){const x=3+Math.floor(R()*(W-6)),y=3+Math.floor(R()*(H-6));if(g[y][x]!=='.')continue;if(sp.some(p=>Math.hypot(p[0]-x,p[1]-y)<9))continue;sp.push([x,y]);g[y][x]='F';}
  /* seal unreachable floor */
  const start=sp[0]||[W>>1,H>>1],seen=Array.from({length:H},()=>Array(W).fill(false)),q=[start];seen[start[1]][start[0]]=true;
  const passable=c=>!'#xX~'.includes(c);
  while(q.length){const [x,y]=q.pop();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<W-1&&ny<H-1&&!seen[ny][nx]&&passable(g[ny][nx])){seen[ny][nx]=true;q.push([nx,ny]);}}}
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(passable(g[y][x])&&!seen[y][x])g[y][x]='#';
  return{id,name,desc:o.desc||'',rows:g.map(r=>r.join('')),theme:'open',br:true};
}
function defaultMaps(){
  const list=[
    gen('eko_docks','Eko Docks',{seed:7,buildings:16,crates:22,tall:true,water:3,maxW:6,maxH:4,desc:'Container stacks and open lagoon edges. Long sightlines, hard cover.',theme:'dock'}),
    gen('ikeja_grid','Ikeja Grid',{seed:21,buildings:30,crates:14,maxW:4,maxH:3,desc:'Tight alleys and blind corners. Shotguns welcome.',theme:'city'}),
    gen('third_mainland','Third Mainland',{seed:99,buildings:8,crates:28,water:6,maxW:5,maxH:3,desc:'A bridge over the lagoon. Hold the middle or lose the span.',theme:'bridge'})];
  list.push(gen('shipment_yard','Shipment Yard',{seed:5,w:34,h:20,buildings:3,crates:16,tall:true,maxW:4,maxH:3,desc:'Compact container yard. Non-stop action, five second respawns.',theme:'dock'}));
  list.push(genWorld('lagos_open','Lagos Open World',{seed:2026,desc:'Battle Royale. A whole district, a lagoon, and a shrinking grid. Loot up and survive.'}));
  const out={};list.forEach(m=>out[m.id]=m);return out;
}
module.exports={gen,genWorld,defaultMaps};
