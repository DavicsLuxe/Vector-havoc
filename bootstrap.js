/* VECTOR HAVOC launcher. Your GitHub repo has the server files at the top level but the browser files (public/ folder: index.html,
   css, js, vendor, icons) are missing, so the server answered 404. The complete game is inside vector-havoc.zip in this repo.
   This file unpacks that zip once into ./game and starts the real server from there. It changes no game code.
   Once you upload the full folder structure properly (public/index.html etc.), you can switch the start command back to: node server.js */
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const ROOT=__dirname,OUT=path.join(ROOT,'game'),ZIP=path.join(ROOT,'vector-havoc.zip');
function unzip(file,out){
  const b=fs.readFileSync(file);let e=b.length-22;while(e>=0&&b.readUInt32LE(e)!==0x06054b50)e--;
  if(e<0)throw new Error('not a zip');
  const n=b.readUInt16LE(e+10);let p=b.readUInt32LE(e+16),cnt=0;
  for(let i=0;i<n;i++){
    if(b.readUInt32LE(p)!==0x02014b50)throw new Error('bad central directory');
    const method=b.readUInt16LE(p+10),csize=b.readUInt32LE(p+20),nl=b.readUInt16LE(p+28),xl=b.readUInt16LE(p+30),cl=b.readUInt16LE(p+32),lho=b.readUInt32LE(p+42);
    const name=b.toString('utf8',p+46,p+46+nl);p+=46+nl+xl+cl;
    const rel=name.split('/').slice(1).join('/');            /* strip the top "vector-havoc/" folder */
    if(!rel||rel.includes('..'))continue;
    const dest=path.join(out,rel);
    if(name.endsWith('/')){fs.mkdirSync(dest,{recursive:true});continue;}
    const lnl=b.readUInt16LE(lho+26),lxl=b.readUInt16LE(lho+28),ds=lho+30+lnl+lxl,raw=b.subarray(ds,ds+csize);
    const data=method===0?raw:zlib.inflateRawSync(raw);
    fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);cnt++;
  }
  return cnt;
}
if(!fs.existsSync(path.join(OUT,'public','index.html'))){
  console.log('Unpacking game from vector-havoc.zip ...');
  console.log('Unpacked '+unzip(ZIP,OUT)+' files');
}
process.chdir(OUT);
require(path.join(OUT,'server.js'));
