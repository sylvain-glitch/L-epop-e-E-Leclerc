const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();

function json(res, code, obj){
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let s='';
    req.on('data',d=>{ s+=d; if(s.length>1e6) req.destroy(); });
    req.on('end',()=>{ try{ resolve(s?JSON.parse(s):{}); }catch(e){ reject(e); } });
    req.on('error',reject);
  });
}
function code(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c=''; do{ c=''; for(let i=0;i<5;i++) c+=chars[Math.floor(Math.random()*chars.length)]; }while(rooms.has(c));
  return c;
}
function token(){ return crypto.randomBytes(18).toString('hex'); }
function safeName(x, fallback='Joueur'){
  const s=String(x||'').trim().replace(/\s+/g,' ').slice(0,24);
  return s || fallback;
}
function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function publicState(room, viewerId, isHost=false){
  const q = room.deck && room.qIndex < room.deck.length ? room.deck[room.qIndex] : null;
  const revealed = room.phase === 'revealed' || room.phase === 'finished';
  const question = q ? {
    cat:q.cat, theme:q.theme, q:q.q, ctx:q.ctx, a:q.a, pts:q.pts,
    ...(revealed ? {c:q.c, exp:q.exp} : {})
  } : null;
  const players = [...room.players.values()].map(p=>({
    id:p.id, name:p.name, score:p.score, correct:p.correct, answered:p.answered,
    hasAnswered: room.answers.has(p.id)
  }));
  const me = viewerId ? players.find(p=>p.id===viewerId) || null : null;
  const myAnswer = viewerId && room.answers.has(viewerId) ? room.answers.get(viewerId).answer : null;
  return {
    code:room.code,
    phase:room.phase,
    questionNumber: room.phase==='lobby' ? 0 : Math.min(room.qIndex+1, room.target),
    target:room.target,
    players,
    answeredCount:room.answers.size,
    question,
    me,
    myAnswer,
    winnerId: revealed ? room.roundWinnerId : null,
    host:isHost
  };
}
function broadcast(room){
  for(const client of room.clients){
    try{
      const payload = publicState(room, client.viewerId, client.isHost);
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }catch(e){}
  }
}
function getRoom(c){ return rooms.get(String(c||'').toUpperCase()); }
function authHost(room,key){ return room && key && key===room.hostKey; }

const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if(p==='/api/create' && req.method==='POST'){
    try{
      const b=await readBody(req);
      const target=Math.max(10,Math.min(60,Number(b.target)||30));
      const room={code:code(),hostKey:token(),phase:'lobby',target,players:new Map(),clients:new Set(),deck:[],qIndex:0,answers:new Map(),roundWinnerId:null,created:Date.now()};
      rooms.set(room.code,room);
      return json(res,200,{code:room.code,hostKey:room.hostKey});
    }catch(e){ return json(res,400,{error:'Requête invalide'}); }
  }
  if(p==='/api/join' && req.method==='POST'){
    try{
      const b=await readBody(req); const room=getRoom(b.code);
      if(!room) return json(res,404,{error:'Partie introuvable'});
      if(room.phase!=='lobby') return json(res,409,{error:'La partie a déjà commencé'});
      if(room.players.size>=20) return json(res,409,{error:'Partie complète'});
      const id=token();
      room.players.set(id,{id,name:safeName(b.name),score:0,correct:0,answered:0});
      broadcast(room);
      return json(res,200,{playerId:id,code:room.code});
    }catch(e){ return json(res,400,{error:'Requête invalide'}); }
  }
  if(p==='/api/start' && req.method==='POST'){
    const b=await readBody(req).catch(()=>({})); const room=getRoom(b.code);
    if(!authHost(room,b.hostKey)) return json(res,403,{error:'Accès refusé'});
    if(room.players.size<1) return json(res,409,{error:'Ajoutez au moins un joueur'});
    const bank = require('./public/bank-node.cjs');
    room.deck=shuffle(bank).slice(0,room.target);
    room.qIndex=0; room.answers.clear(); room.roundWinnerId=null; room.phase='question';
    broadcast(room); return json(res,200,{ok:true});
  }
  if(p==='/api/answer' && req.method==='POST'){
    const b=await readBody(req).catch(()=>({})); const room=getRoom(b.code);
    if(!room) return json(res,404,{error:'Partie introuvable'});
    if(room.phase!=='question') return json(res,409,{error:'Réponses fermées'});
    const pl=room.players.get(b.playerId); if(!pl) return json(res,403,{error:'Joueur inconnu'});
    if(room.answers.has(pl.id)) return json(res,409,{error:'Réponse déjà enregistrée'});
    const ans=Number(b.answer); if(!Number.isInteger(ans)||ans<0||ans>3) return json(res,400,{error:'Réponse invalide'});
    room.answers.set(pl.id,{answer:ans,at:Date.now()});
    broadcast(room); return json(res,200,{ok:true});
  }
  if(p==='/api/reveal' && req.method==='POST'){
    const b=await readBody(req).catch(()=>({})); const room=getRoom(b.code);
    if(!authHost(room,b.hostKey)) return json(res,403,{error:'Accès refusé'});
    if(room.phase!=='question') return json(res,409,{error:'Action impossible'});
    const q=room.deck[room.qIndex];
    let winner=null;
    for(const pl of room.players.values()){
      const a=room.answers.get(pl.id);
      if(a){ pl.answered++; if(a.answer===q.c){ pl.correct++; if(!winner || a.at<winner.at) winner={id:pl.id,at:a.at}; } }
    }
    room.roundWinnerId=winner?winner.id:null;
    if(winner) room.players.get(winner.id).score += Number(q.pts)||1;
    room.phase='revealed'; broadcast(room); return json(res,200,{ok:true});
  }
  if(p==='/api/next' && req.method==='POST'){
    const b=await readBody(req).catch(()=>({})); const room=getRoom(b.code);
    if(!authHost(room,b.hostKey)) return json(res,403,{error:'Accès refusé'});
    if(room.phase!=='revealed') return json(res,409,{error:'Révélez d’abord la réponse'});
    room.qIndex++;
    room.answers.clear(); room.roundWinnerId=null;
    room.phase = room.qIndex>=room.deck.length ? 'finished' : 'question';
    broadcast(room); return json(res,200,{ok:true});
  }
  if(p==='/api/reset' && req.method==='POST'){
    const b=await readBody(req).catch(()=>({})); const room=getRoom(b.code);
    if(!authHost(room,b.hostKey)) return json(res,403,{error:'Accès refusé'});
    room.phase='lobby'; room.deck=[]; room.qIndex=0; room.answers.clear(); room.roundWinnerId=null;
    for(const pl of room.players.values()){ pl.score=0; pl.correct=0; pl.answered=0; }
    broadcast(room); return json(res,200,{ok:true});
  }
  if(p==='/events' && req.method==='GET'){
    const room=getRoom(url.searchParams.get('code'));
    if(!room){ res.writeHead(404); return res.end(); }
    const viewerId=url.searchParams.get('playerId')||null;
    const hostKey=url.searchParams.get('hostKey')||'';
    const isHost=hostKey===room.hostKey;
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    const client={res,viewerId,isHost}; room.clients.add(client);
    res.write(`data: ${JSON.stringify(publicState(room,viewerId,isHost))}\n\n`);
    const ping=setInterval(()=>{ try{res.write(': ping\n\n');}catch(e){} },20000);
    req.on('close',()=>{ clearInterval(ping); room.clients.delete(client); });
    return;
  }

  let filePath = p==='/' ? path.join(ROOT,'index.html') : path.join(ROOT, p.replace(/^\//,''));
  if(!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(filePath,(err,st)=>{
    if(err||!st.isFile()){ res.writeHead(404); return res.end('Introuvable'); }
    const ext=path.extname(filePath).toLowerCase();
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'});
    fs.createReadStream(filePath).pipe(res);
  });
});

setInterval(()=>{
  const maxAge=12*60*60*1000;
  for(const [k,r] of rooms){ if(Date.now()-r.created>maxAge && r.clients.size===0) rooms.delete(k); }
},30*60*1000).unref();

server.listen(PORT,()=>console.log(`L’Épopée E.Leclerc en ligne : http://localhost:${PORT}`));
