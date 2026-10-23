const express=require('express'),http=require('http'),{WebSocketServer,WebSocket}=require('ws'),crypto=require('crypto');
const app=express();app.use(express.static(__dirname+'/public'));app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size}));
const srv=http.createServer(app),wss=new WebSocketServer({server:srv}),rooms=new Map();
const games=[['triangulo','Triângulo dos Dados',24],['velha','Velha dos Dados',20],['corrida16','Corrida do 1 ao 6',30],['trilha','Trilha com Dado',36],['estrela','Corrida da Estrela',28],['chegada','Corrida da Chegada',40]];
const send=(s,o)=>{if(s.readyState===WebSocket.OPEN)s.send(JSON.stringify(o))}, err=(s,t)=>send(s,{error:t});
function broadcast(r){if(r.winner&&!r.scoredCurrent){const winner=r.players.find(p=>p.name===r.winner);if(winner){r.scores??={};r.scores[winner.id]=(r.scores[winner.id]||0)+1}r.scoredCurrent=true}let data={type:'state',code:r.code,game:r.game,players:r.players.map(p=>({id:p.id,name:p.name,pos:p.pos,rows:p.rows||[]})),host:r.host,turn:r.turn,started:r.started,winner:r.winner,draw:!!r.draw,board:r.board||Array(36).fill(''),matchNo:r.matchNo||0,activePair:r.game[0]==='velha'&&r.players.length>=2?[(r.matchNo||0)%r.players.length,((r.matchNo||0)+1)%r.players.length]:[],roll:r.roll,scores:r.scores||{},velhaDiceReady:!!r.velhaDiceReady};r.players.forEach(p=>send(p.ws,{...data,you:p.id}))}
function velhaVence(board,mark){for(let r=0;r<6;r++)for(let c=0;c<6;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){const er=r+2*dr,ec=c+2*dc;if(er>=0&&er<6&&ec>=0&&ec<6&&[0,1,2].every(k=>board[(r+k*dr)*6+c+k*dc]===mark))return true}return false}

/* Código das Cores: salas online independentes, com resultados validados no servidor. */
const colorRooms=new Map();
const colorBase=[
  {hex:'#97e05d',name:'Verde',ink:'#172713'},
  {hex:'#ff8eb8',name:'Rosa',ink:'#341027'},
  {hex:'#b499ff',name:'Lilás',ink:'#241543'},
  {hex:'#ffd16c',name:'Amarelo',ink:'#37240b'},
  {hex:'#ff9272',name:'Laranja',ink:'#402015'},
  {hex:'#72ceff',name:'Azul',ink:'#112c3b'}
];
function colorShuffle(values){const list=values.map(x=>({...x}));for(let i=list.length-1;i>0;i--){const j=crypto.randomInt(i+1);[list[i],list[j]]=[list[j],list[i]]}return list}
function colorBroadcast(r){
  const players=r.players.map(p=>({id:p.id,name:p.name,score:p.score,matched:p.matched}));
  const msg={type:'colors_state',code:r.code,host:r.host,players,started:r.started,maxPlayers:r.maxPlayers,
    winner:r.winner,turn:r.turn,round:r.round,size:r.size,challenge:r.challenge,
    colors:r.colors,lastRoll:r.lastRoll};
  r.players.forEach(p=>send(p.ws,{...msg,you:p.id}));
}
function colorsStart(r,repeat=false,size=r.size){
  r.size=size;r.round++;r.turn=0;r.started=true;r.winner=null;
  r.lastRoll='Rodada '+r.round+' iniciada! 🎲';
  if(!repeat||!r.challenge.length){
    r.challenge=Array.from({length:r.size},()=>crypto.randomInt(1,7));
    r.colors=colorShuffle(colorBase);
  }
  r.players.forEach(p=>p.matched=Array(r.size).fill(false));
  colorBroadcast(r);
}
function connectColors(socket){
  let joined=null;
  socket.on('message',raw=>{
    if(raw.length>4096)return err(socket,'Mensagem muito longa');
    let m;try{m=JSON.parse(raw)}catch{return err(socket,'Mensagem inválida')}
    if(!m||typeof m!=='object')return;
    if(m.type==='create'||m.type==='join'){
      if(joined)return err(socket,'Você já entrou em uma sala');
      const name=String(m.name||'').trim().slice(0,26);
      if(!name)return err(socket,'Digite seu nome');
      let r;
      if(m.type==='create'){
        let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(colorRooms.has(code));
        r={code,players:[],host:null,started:false,winner:null,turn:0,round:0,
          maxPlayers:Number.isInteger(m.maxPlayers)&&m.maxPlayers>=2&&m.maxPlayers<=8?m.maxPlayers:6,
          size:m.size===6?6:5,challenge:[],colors:[],lastRoll:'Aguardando jogadores'};
        colorRooms.set(code,r);
      }else{
        r=colorRooms.get(String(m.code||'').trim().toUpperCase());
        if(!r)return err(socket,'Sala não encontrada. Confira o código.');
        if(r.started)return err(socket,'A partida já começou. Aguarde a próxima rodada.');
        if(r.players.length>=r.maxPlayers)return err(socket,'Sala cheia (máximo de '+r.maxPlayers+' jogadores).');
      }
      if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return err(socket,'Este nome já está sendo usado na sala');
      const id=crypto.randomUUID();
      r.players.push({id,name,score:0,matched:Array(r.size).fill(false),ws:socket});
      if(!r.host)r.host=id;
      joined={r,id};colorBroadcast(r);return;
    }
    if(!joined)return err(socket,'Entre em uma sala para jogar');
    const {r,id}=joined,host=r.host===id;
    if(m.type==='start'||m.type==='new_round'||m.type==='repeat_round'){
      if(!host)return err(socket,'Somente quem criou a sala inicia a partida');
      if(r.players.length<2)return err(socket,'São necessários pelo menos 2 jogadores');
      const size=[5,6].includes(m.size)?m.size:r.size;
      if(m.type==='repeat_round'&&size!==r.size)return err(socket,'Para mudar os quadradinhos, escolha Nova rodada');
      colorsStart(r,m.type==='repeat_round',size);
      return;
    }
    if(m.type==='roll'||m.type==='physical_roll'){
      if(!r.started||r.winner)return err(socket,'Aguarde o início da rodada');
      const p=r.players[r.turn];
      if(p?.id!==id)return err(socket,'Agora é a vez de outro jogador');
      if(m.type==='physical_roll'&&(!Number.isInteger(m.dice)||m.dice<1||m.dice>6))return err(socket,'O dado precisa ser de 1 a 6');
      const number=m.type==='physical_roll'?m.dice:crypto.randomInt(1,7);
      const hit=r.challenge.findIndex((n,i)=>n===number&&!p.matched[i]);
      if(hit>=0)p.matched[hit]=true;
      r.lastRoll=p.name+' tirou '+number+(m.type==='physical_roll'?' (dado físico)':'')+(hit>=0?' — acertou!':' — nenhuma casa nova');
      if(p.matched.every(Boolean)){
        p.score++;r.winner={id:p.id,name:p.name};r.started=false;
      }else{
        r.turn=(r.turn+1)%r.players.length;
      }
      colorBroadcast(r);return;
    }
    err(socket,'Ação não reconhecida');
  });
  socket.on('close',()=>{
    if(!joined)return;
    const {r,id}=joined;
    const index=r.players.findIndex(p=>p.id===id);
    if(index<0)return;
    r.players.splice(index,1);
    if(!r.players.length){colorRooms.delete(r.code);return}
    if(r.host===id)r.host=r.players[0].id;
    if(r.started){
      r.started=false;r.winner=null;
      r.lastRoll='Um jogador saiu. O criador pode começar uma nova rodada.';
    }
    if(index<r.turn)r.turn--;
    if(r.turn>=r.players.length)r.turn=0;
    colorBroadcast(r);
  });
}

wss.on('connection',(s,req)=>{if((req.url||'').split('?')[0]==='/cores-ws')return connectColors(s);let joined; s.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return err(s,'Mensagem inválida')} if(!m||typeof m!=='object')return;
if(m.type==='create'||m.type==='join'){if(joined)return err(s,'Você já entrou');let name=String(m.name||'').trim().slice(0,24);if(!name)return err(s,'Digite seu nome');let r;if(m.type==='create'){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));r={code,game:games[0],players:[],turn:0,started:false,winner:null,roll:null,host:null};rooms.set(code,r)}else{r=rooms.get(String(m.code||'').trim().toUpperCase());if(!r)return err(s,'Sala não encontrada');if(r.started)return err(s,'Partida já começou');if(r.players.length>=8)return err(s,'Sala cheia')}if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return err(s,'Nome já usado');let id=crypto.randomUUID();r.players.push({id,name,ws:s,pos:0});r.host??=id;joined={r,id};broadcast(r);return}
if(!joined)return err(s,'Entre na sala');let {r,id}=joined,host=r.host===id;
if(m.type==='game'){if(!host||r.started)return err(s,'Somente o criador escolhe o jogo');let g=games.find(g=>g[0]===m.game);if(!g)return err(s,'Jogo inválido');r.game=g;r.scoredCurrent=false;r.velhaDiceReady=false;r.matchNo=0;r.board=Array(36).fill('');r.draw=false;r.players.forEach(p=>p.pos=0)}
else if(m.type==='start'){if(!host||r.players.length<2)return err(s,'São necessários 2 jogadores e o criador');r.players.forEach(p=>{p.pos=0;p.rows=[]});r.started=true;r.scoredCurrent=false;r.winner=null;r.draw=false;r.board=Array(36).fill('');r.turn=0;r.roll=null;r.velhaDiceReady=false}
else if(m.type==='mark'){if(r.game[0]!=='velha'||!r.started||r.winner||r.draw)return err(s,'Jogo da Velha não está em andamento');if(!r.velhaDiceReady)return err(s,'Jogue o dado primeiro para decidir quem começa');const pair=[(r.matchNo||0)%r.players.length,((r.matchNo||0)+1)%r.players.length];if(r.players[pair[r.turn]]?.id!==id)return err(s,'Não é a sua vez');if(!Number.isInteger(m.cell)||m.cell<0||m.cell>35)return err(s,'Casa inválida');r.board??=Array(36).fill('');if(r.board[m.cell])return err(s,'Esta casa já está ocupada');const mark=r.turn===0?'X':'O';r.board[m.cell]=mark;r.roll=r.players[pair[r.turn]].name+' marcou '+mark;if(velhaVence(r.board,mark)){r.winner=r.players[pair[r.turn]].name;r.started=false}else if(r.board.every(Boolean)){r.draw=true;r.started=false;r.roll='Empate! Ninguém venceu.'}else r.turn=r.turn===0?1:0}
else if(m.type==='roll'||m.type==='physical_roll'){if(r.game[0]==='velha'){if(!r.started||r.winner||r.draw)return err(s,'Inicie a partida primeiro');if(r.velhaDiceReady)return err(s,'O início já foi sorteado. Agora escolha uma casa');if(!host)return err(s,'Somente quem criou a sala sorteia quem começa');if(m.type==='physical_roll'&&(!Number.isInteger(m.dice)||m.dice<1||m.dice>6))return err(s,'Informe um número de 1 a 6');const dice=m.type==='physical_roll'?m.dice:crypto.randomInt(1,7);r.turn=dice%2===1?0:1;r.velhaDiceReady=true;const pair=[(r.matchNo||0)%r.players.length,((r.matchNo||0)+1)%r.players.length];r.roll='Dado '+dice+(m.type==='physical_roll'?' (dado físico)':'')+': '+r.players[pair[r.turn]].name+' começa!';broadcast(r);return}if(!r.started||r.winner||r.players[r.turn]?.id!==id)return err(s,'Não é sua vez');if(m.type==='physical_roll'&&(!Number.isInteger(m.dice)||m.dice<1||m.dice>6))return err(s,'O dado físico precisa ser um número de 1 a 6');let p=r.players[r.turn],dice=m.type==='physical_roll'?m.dice:crypto.randomInt(1,7),move=dice;if(r.game[0]==='estrela'&&dice===6)move=8;let next=Math.min(r.game[2],p.pos+move);if(r.game[0]==='triangulo'){p.rows??=[];if(dice>=2&&!p.rows.includes(dice))p.rows.push(dice);if(dice===1&&[2,3,4,5,6].every(n=>p.rows.includes(n))){r.winner=p.name;r.started=false}r.roll=p.name+' tirou '+dice; if(!r.winner)r.turn=(r.turn+1)%r.players.length;broadcast(r);return}if(r.game[0]==='trilha'||r.game[0]==='estrela'){const casas=r.game[0]==='trilha'?{4:2,9:-2,15:2,21:-2,27:2,33:-2}:{5:2,11:-2,17:2,23:-2};if(casas[next])next=Math.max(0,Math.min(r.game[2],next+casas[next]));}p.pos=next;r.roll=p.name+' tirou '+dice+(m.type==='physical_roll'?' (dado físico)':'');if(next===r.game[2]){r.winner=p.name;r.started=false}else r.turn=(r.turn+1)%r.players.length}
else if(m.type==='reset'){if(!host)return err(s,'Só o criador reinicia');if(r.game[0]==='velha'&&(r.winner||r.draw))r.matchNo=(r.matchNo||0)+1;r.started=false;r.scoredCurrent=false;r.winner=null;r.draw=false;r.board=Array(36).fill('');r.turn=0;r.roll=null;r.velhaDiceReady=false;r.players.forEach(p=>{p.pos=0;p.rows=[]})}
else return;broadcast(r)
});s.on('close',()=>{if(!joined)return;let {r,id}=joined;let index=r.players.findIndex(p=>p.id===id);if(index<0)return;r.players.splice(index,1);if(r.host===id)r.host=r.players[0]?.id||null;if(index<r.turn)r.turn--;if(r.turn>=r.players.length)r.turn=0;if(r.game[0]==='velha'){r.matchNo=0;r.started=false;r.board=Array(36).fill('');r.winner=null;r.draw=false;}if(r.players.length<2)r.started=false;if(!r.players.length)rooms.delete(r.code);else broadcast(r)})});
srv.listen(process.env.PORT||3000,'0.0.0.0');