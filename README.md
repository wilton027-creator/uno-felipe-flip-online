# UNO Felipe Flip Online — MVP multiplayer

## Recursos
- Salas com código e convite por link; 2 a 8 jogadores, sem cadastro.
- Cartas privadas por conexão, turnos validados no servidor, Flip claro/escuro, +1/+2/+5, Pular, Pular Todos, Inverter, Coringa, Comprar até a cor, aviso UNO, vitória e reconexão por token salvo no navegador.
- Funciona em navegador de celular ou desktop; interface em português.

## Testar localmente
Instale Node.js 20 ou superior e execute:

```bash
npm install
npm start
```

Abra http://localhost:3000 em duas janelas (de preferência uma anônima) para simular jogadores.

## Publicar (Render)
1. Envie a pasta para um repositório GitHub.
2. Em https://dashboard.render.com escolha **New > Web Service** e conecte o repositório, ou importe `render.yaml` como Blueprint.
3. Build: `npm install`; Start: `npm start`; Node 20+.
4. Compartilhe o endereço HTTPS do Render e o botão de convite dentro do jogo.

**Atenção:** Vercel Serverless isolado não hospeda este servidor Socket.IO persistente. O Render ou outro host Node com WebSocket é indicado.

## Limites conhecidos / antes de uso público
- Estado das partidas é mantido em memória: reinício ou suspensão do serviço apaga salas e partidas; a camada gratuita pode dormir.
- Não há armazenamento, chat, matchmaking público, pontuação entre partidas, bot ou autenticação.
- Regras implementadas são uma aproximação jogável do Flip; ainda é necessário validar todas as exceções oficiais, especialmente desafios de coringas e a sequência exata de compra/jogada.
- O baralho foi modelado com lados emparelhados aleatoriamente, não com pareamento físico licenciado; é um protótipo independente, não afiliado à Mattel.
- Para escala, adicionar persistência (Redis/Postgres), timers e testes automatizados das regras.
