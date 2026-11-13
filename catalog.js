'use strict';
/* Default store, rarities, coin packs, daily rewards and operator looks. Everything here is editable live from the developer console. */
const rarities={
  common:{name:'Common',color:'#9aa7b8'},
  rare:{name:'Rare',color:'#3ea6ff'},
  epic:{name:'Epic',color:'#b46cff'},
  legendary:{name:'Legendary',color:'#ffb02e'},
  mythic:{name:'Mythic',color:'#ff3d6e'}
};
/* look: primary = shirt/jacket, secondary = trousers, accent = trim/gloves/visor. head: ''|cap|fila|helmet|gele|durag|beanie|mask|afro|braids|crown. pattern: solid|ankara|camo|stripes|gold|checker */
const operators={
  ronin:{name:'Chike',title:'Vanguard',desc:'Balanced assault. DASH: a burst of speed that slips past bullets.',hp:100,speed:1,primary:'rifle',ability:'dash',cd:6,dur:.18,color:'#19e6ff',look:{sex:'m',skin:'#8a5a3b',primary:'#1b3b63',secondary:'#101c2e',accent:'#19e6ff',head:'cap',pattern:'solid'}},
  ghost:{name:'Zainab',title:'Ghost',desc:'Fast and fragile. CLOAK: nearly invisible to enemies for a few seconds.',hp:80,speed:1.1,primary:'smg',ability:'cloak',cd:14,dur:4,color:'#c9a7ff',look:{sex:'f',skin:'#a8693e',primary:'#2b1f3a',secondary:'#161022',accent:'#c9a7ff',head:'braids',pattern:'solid'}},
  bulwark:{name:'Obinna',title:'Bulwark',desc:'Heavy and tough. SURGE: take 45% less damage and regenerate.',hp:130,speed:.9,primary:'shotgun',ability:'surge',cd:16,dur:3.5,color:'#ff9d1a',look:{sex:'m',skin:'#5b3a24',primary:'#5a3a14',secondary:'#2a1d0c',accent:'#ff9d1a',head:'helmet',pattern:'solid',bulk:1}},
  hacker:{name:'Amaka',title:'Hacker',desc:'Intel specialist. SCAN: reveals enemies through walls for your team.',hp:90,speed:1,primary:'smg',ability:'scan',cd:12,dur:3,radius:560,color:'#8ff0c3',look:{sex:'f',skin:'#7a4a2e',primary:'#14423a',secondary:'#0b2420',accent:'#8ff0c3',head:'afro',pattern:'solid'}},
  sahara:{name:'Sahara',title:'Desert Ghost',desc:'Patient marksman. CLOAK and a Lagoon Longshot make a quiet night.',hp:85,speed:1.05,primary:'sniper',ability:'cloak',cd:15,dur:4.5,color:'#ffd166',locked:true,look:{sex:'f',skin:'#b57a4f',primary:'#6b4a2a',secondary:'#3a2814',accent:'#ffd166',head:'mask',pattern:'solid'}},
  iroko:{name:'Iroko',title:'Ironwood',desc:'Immovable. SURGE with a rifle in hand: stand and deliver.',hp:120,speed:.95,primary:'rifle',ability:'surge',cd:15,dur:4,color:'#b6ff4d',locked:true,look:{sex:'m',skin:'#3e2616',primary:'#1f4d2b',secondary:'#102a17',accent:'#b6ff4d',head:'durag',pattern:'camo',bulk:1}}
};
const S=(name,rarity,coins,o={})=>Object.assign({type:'skin',name,rarity,coins,naira:0,op:'any',exclusive:false,desc:''},o);
const W=(name,rarity,coins,o={})=>Object.assign({type:'wskin',name,rarity,coins,naira:0,weapon:'any',exclusive:false,desc:''},o);
const B=(name,rarity,coins,o={})=>Object.assign({type:'bling',name,rarity,coins,naira:0,slot:'neck',exclusive:false,desc:''},o);
const items={
  op_sahara:{type:'operator',name:'Operator: Sahara',rarity:'epic',coins:3500,naira:0,op:'sahara',exclusive:false,desc:'Unlocks Sahara, the desert marksman.'},
  op_iroko:{type:'operator',name:'Operator: Iroko',rarity:'epic',coins:3500,naira:0,op:'iroko',exclusive:false,desc:'Unlocks Iroko, the ironwood tank.'},
  sk_chike_agbada:S('Agbada Warlord','epic',2000,{op:'ronin',desc:'Chike in flowing white and gold.',look:{primary:'#f2efe4',secondary:'#d4a62a',accent:'#d4a62a',head:'fila',pattern:'gold'},featured:true}),
  sk_chike_danfo:S('Danfo Driver','rare',800,{op:'ronin',desc:'Yellow and black, Lagos traffic style.',look:{primary:'#f5c518',secondary:'#161616',accent:'#161616',head:'cap',pattern:'stripes'}}),
  sk_zainab_gele:S('Gele Queen','legendary',4500,{op:'ghost',desc:'A towering gele and ankara print.',look:{primary:'#c2185b',secondary:'#4a148c',accent:'#ffd54f',head:'gele',pattern:'ankara'},featured:true}),
  sk_zainab_neon:S('Eko Neon','rare',800,{op:'ghost',look:{primary:'#0b0b1a',secondary:'#14143a',accent:'#ff2bd6',head:'braids',pattern:'stripes'}}),
  sk_obinna_oba:S('Oba Obinna','legendary',4500,{op:'bulwark',desc:'Royal purple, gold beads and a crown.',look:{primary:'#4a1a7a',secondary:'#2a0f48',accent:'#ffcf40',head:'crown',pattern:'gold'}}),
  sk_obinna_rust:S('Dockyard Rust','common',300,{op:'bulwark',look:{primary:'#7a3b1d',secondary:'#3a2416',accent:'#d9a066',head:'helmet',pattern:'solid'}}),
  sk_amaka_lagos:S('Lagos Techie','rare',800,{op:'hacker',look:{primary:'#1b1b2f',secondary:'#0b0b16',accent:'#00ffa3',head:'afro',pattern:'checker'}}),
  sk_amaka_ankara:S('Ankara Circuit','epic',2000,{op:'hacker',look:{primary:'#0f766e',secondary:'#134e4a',accent:'#facc15',head:'afro',pattern:'ankara'}}),
  sk_any_naija:S('Naija Pride','rare',800,{look:{primary:'#0a8f3c',secondary:'#f4f4f4',accent:'#0a8f3c',pattern:'stripes'},desc:'Green-white-green.'}),
  sk_any_harmattan:S('Harmattan','common',300,{look:{primary:'#b59a76',secondary:'#6b5a42',accent:'#e8d9b8',pattern:'camo'}}),
  sk_any_jollof:S('Jollof Wars','epic',2000,{look:{primary:'#d9480f',secondary:'#7c1d0a',accent:'#ffd43b',pattern:'ankara'},desc:'Party rice, serious business.'}),
  sk_any_midas:S('Midas','mythic',9000,{look:{primary:'#d4a62a',secondary:'#8a6a12',accent:'#fff3b0',head:'crown',pattern:'gold',glow:'#ffcf40'},naira:0,exclusive:false,desc:'Everything he touches turns to gold.',featured:true}),
  sk_any_founder:S('Founder 2026','mythic',0,{naira:2500,exclusive:true,look:{primary:'#050505',secondary:'#111',accent:'#19e6ff',head:'mask',pattern:'checker',glow:'#19e6ff'},desc:'VectorGamex 2026 exclusive. Only sold for naira.',featured:true}),
  ws_naija_green:W('Naija Green','common',300,{look:{c1:'#0a8f3c',c2:'#f4f4f4',pattern:'stripes'}}),
  ws_okada_yellow:W('Okada Yellow','rare',800,{weapon:'smg',look:{c1:'#f5c518',c2:'#1a1a1a',pattern:'stripes'}}),
  ws_ankara_camo:W('Ankara Print','epic',2000,{look:{c1:'#c2185b',c2:'#ffd54f',pattern:'ankara'}}),
  ws_lagos_neon:W('Lagos Neon','rare',800,{look:{c1:'#12122a',c2:'#00e5ff',pattern:'stripes',glow:'#00e5ff'}}),
  ws_gold_plated:W('Gold Plated','legendary',4500,{look:{c1:'#d4a62a',c2:'#8a6a12',pattern:'gold'},featured:true}),
  ws_obsidian:W('Obsidian Flame','mythic',9000,{look:{c1:'#07070b',c2:'#ff3d6e',pattern:'checker',glow:'#ff3d6e'}}),
  ws_sniper_baobab:W('Baobab Bark','epic',2000,{weapon:'sniper',look:{c1:'#5a3b1d',c2:'#2f6b2f',pattern:'camo'}}),
  ws_founder:W('Founder Chrome','mythic',0,{naira:1500,exclusive:true,look:{c1:'#e6f1ff',c2:'#19e6ff',pattern:'checker',glow:'#19e6ff'},desc:'VectorGamex 2026 exclusive.'}),
  bl_shades:B('Black Shades','common',300,{slot:'face',look:{color:'#111'}}),
  bl_chain_gold:B('Gold Chain','rare',800,{slot:'neck',look:{color:'#ffc933'}}),
  bl_watch_gold:B('Gold Watch','rare',800,{slot:'wrist',look:{color:'#ffc933'}}),
  bl_earring:B('Diamond Studs','epic',2000,{slot:'ear',look:{color:'#bfefff'}}),
  bl_chain_diamond:B('Iced Out Chain','legendary',4500,{slot:'neck',look:{color:'#9be7ff',glow:'#9be7ff'}}),
  bl_crown:B('Oba Beads','mythic',0,{slot:'neck',naira:1200,exclusive:true,look:{color:'#ff3d6e',glow:'#ff3d6e'},desc:'Coral beads for royalty. Naira only.'})
};
const coinPacks=[
  {id:'p500',name:'Starter Pouch',coins:500,naira:500},
  {id:'p1200',name:'Market Bag',coins:1300,naira:1000,bonus:'+300 bonus'},
  {id:'p3000',name:'Agbada Stash',coins:3400,naira:2500,bonus:'+400 bonus'},
  {id:'p8000',name:'Oga Vault',coins:9500,naira:6000,bonus:'+1500 bonus'}
];
function dailyRewards(){
  const r=[];
  for(let d=1;d<=40;d++){
    if(d===20)r.push({type:'item',item:'sk_any_founder',label:'EXCLUSIVE'});
    else if(d===40)r.push({type:'item',item:'ws_founder',label:'EXCLUSIVE'});
    else if(d%7===0)r.push({type:'coins',amount:300+d*5});
    else if(d%10===5)r.push({type:'item',item:['bl_shades','sk_any_harmattan','ws_naija_green','bl_earring'][((d/10)|0)%4]});
    else r.push({type:'coins',amount:40+((d%7)*15)});
  }
  return r;
}
const payment={bank:'OPay',account:'9166388610',accountName:'',note:'Send the exact amount, then keep your order code. Orders are approved by the VectorGamex team, usually within minutes.'};

/* ======== SEASONS ======== */
const SPOT='https://open.spotify.com/artist/3TFFpy4aYlHGjdLGivU4eE';
const V=(name,rarity,coins,naira,o={})=>Object.assign({season:'s1',type:'wskin',name,rarity,coins,naira,weapon:'any',exclusive:false,desc:''},o);
const VS=(name,rarity,coins,naira,o={})=>Object.assign({season:'s1',type:'skin',name,rarity,coins,naira,op:'any',exclusive:false,desc:''},o);
const VB_=(name,rarity,coins,naira,o={})=>Object.assign({season:'s1',type:'bling',name,rarity,coins,naira,slot:'neck',exclusive:false,desc:''},o);
Object.assign(items,{
  ws_vv_cassette:V('Cassette Tape','common',300,0,{look:{c1:'#2a2a33',c2:'#ff6b9d',pattern:'stripes'}}),
  sk_vv_merch:VS('Tour Merch','common',300,0,{look:{primary:'#14141f',secondary:'#0b0b12',accent:'#19e6ff',pattern:'stripes'},desc:'Season 1 crew tee.'}),
  ws_vv_pulse:V('Pulse Wave','rare',800,0,{look:{c1:'#0b1226',c2:'#19e6ff',pattern:'wave',glow:'#19e6ff'}}),
  sk_vv_stage:VS('Stage Lights','rare',800,0,{look:{primary:'#1b1038',secondary:'#0d0820',accent:'#ff2bd6',head:'cap',pattern:'checker',glow:'#ff2bd6'}}),
  ws_vv_vinyl:V('Black Vinyl','epic',2000,0,{look:{c1:'#050507',c2:'#c9a7ff',pattern:'vinyl',glow:'#c9a7ff'}}),
  sk_vv_synth:VS('Synthwave Runner','epic',2000,0,{look:{primary:'#2a0f5a',secondary:'#12082e',accent:'#ff2bd6',head:'cap',pattern:'wave',glow:'#19e6ff'}}),
  bl_vv_headphones:VB_('Studio Headphones','epic',2000,0,{slot:'head',look:{color:'#ff2bd6',glow:'#ff2bd6'}}),
  ws_vv_afterglow:V('Afterglow','legendary',4500,0,{weapon:'shotgun',look:{c1:'#2b0b0b',c2:'#ff9d1a',pattern:'damascus',glow:'#ff9d1a',aura:true}}),
  sk_vv_dj:VS('Night Shift DJ','legendary',4500,0,{look:{primary:'#0a0a14',secondary:'#14142a',accent:'#19e6ff',head:'cap',pattern:'wave',glow:'#19e6ff'}}),
  bl_vv_halo:VB_('Vinyl Halo','legendary',4500,0,{slot:'neck',look:{color:'#ffd166',glow:'#ffd166'}}),
  ws_vv_freq:V('Frequency','mythic',12000,4000,{weapon:'rifle',featured:true,desc:'VectorVibes Mythic. Crystal receiver, aurora shader, aura stream.',look:{c1:'#070a1c',c2:'#19e6ff',pattern:'aurora',glow:'#19e6ff',crystals:true,aura:true,muzzle:'brake',trail:'#19e6ff'}}),
  ws_vv_bass:V('Bassline','mythic',12000,4000,{weapon:'smg',desc:'VectorVibes Mythic. Damascus pulse that follows the beat.',look:{c1:'#14041e',c2:'#ff2bd6',pattern:'damascus',glow:'#ff2bd6',crystals:true,aura:true,muzzle:'brake',trail:'#ff2bd6'}}),
  ws_vv_res:V('Resonance','mythic',12000,4500,{weapon:'sniper',desc:'VectorVibes Mythic. Gold diamond lattice, shattering shards.',look:{c1:'#1a1204',c2:'#ffd166',pattern:'diamond',glow:'#ffd166',crystals:true,aura:true,muzzle:'brake',trail:'#ffd166'}}),
  ws_vv_encore:V('Encore','mythic',12000,4500,{weapon:'launcher',desc:'VectorVibes Mythic. One more round of fireworks.',look:{c1:'#100418',c2:'#ff9d1a',pattern:'aurora',glow:'#ff5a1f',crystals:true,aura:true,muzzle:'brake',trail:'#ff9d1a'}}),
  sk_vv_headliner:VS('The Headliner','mythic',12000,5000,{featured:true,desc:'VectorVibes Mythic operator skin. Light show included.',look:{primary:'#12062a',secondary:'#08031a',accent:'#ffd166',head:'crown',pattern:'wave',glow:'#ff2bd6'}})
});
const seasons={
  s1:{id:'s1',name:'Neon Horizon',short:'SEASON 1',theme:'neon',presented:'VectorVibes',tagline:'The sound of the grid. Mythic guns, a full pass, and a lobby that moves.',
    artist:{name:'VectorVibes',spotify:SPOT,blurb:'Season 1 is presented by VectorVibes. Press play while you drop in.'},
    pass:{premiumNaira:2500,tiers:40,xpPerTier:240,free:[],premium:[]},
    draw:{cost:600,cost10:5400,pool:'s1'}},
  s2:{id:'s2',name:'Rust & Dust',short:'SEASON 2',theme:'rust',presented:'',tagline:'Gritty desert, sand storms and embers. Coming soon.',artist:{name:'',spotify:'',blurb:''},pass:{premiumNaira:2500,tiers:40,xpPerTier:240,free:[],premium:[]},draw:{cost:600,cost10:5400,pool:'s2'}},
  s3:{id:'s3',name:'Tokyo Escape',short:'SEASON 3',theme:'tokyo',presented:'',tagline:'Cherry blossoms and night neon. Coming soon.',artist:{name:'',spotify:'',blurb:''},pass:{premiumNaira:2500,tiers:40,xpPerTier:240,free:[],premium:[]},draw:{cost:600,cost10:5400,pool:'s3'}}
};
/* season pass: 40 tiers. Free track: coins and commons. Premium track: the good stuff, ending in a mythic. */
(function(){
  const f=seasons.s1.pass.free,p=seasons.s1.pass.premium,freeItems={5:'ws_vv_cassette',15:'sk_vv_merch',30:'ws_vv_pulse'};
  const premItems={1:'bl_vv_headphones',8:'sk_vv_stage',12:'ws_vv_vinyl',18:'sk_vv_synth',24:'bl_vv_halo',28:'ws_vv_afterglow',33:'sk_vv_dj',36:'ws_vv_bass',40:'ws_vv_freq'};
  for(let t=1;t<=40;t++){
    f.push(freeItems[t]?{type:'item',item:freeItems[t]}:{type:'coins',amount:t%5===0?150:60});
    p.push(premItems[t]?{type:'item',item:premItems[t]}:{type:'coins',amount:t%4===0?400:150});
  }
})();
module.exports={rarities,operators,items,coinPacks,dailyRewards,payment,seasons};

