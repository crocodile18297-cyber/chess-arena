const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "chess-arena" }));

const rooms = new Map();
const socketRooms = new Map();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode() {
  let code;
  do { code = Array.from({length: 5}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function snapshot(room) {
  return {
    code: room.code, fen: room.game.fen(), turn: room.game.turn(),
    players: { white: room.players.white ? { name: room.players.white.name, connected: room.players.white.connected } : null,
               black: room.players.black ? { name: room.players.black.name, connected: room.players.black.connected } : null },
    history: room.game.history({ verbose: true }).map(m => ({ san: m.san, color: m.color, from: m.from, to: m.to })),
    status: room.game.isCheckmate() ? "checkmate" : room.game.isStalemate() ? "stalemate" :
      room.game.isThreefoldRepetition() ? "repetition" : room.game.isInsufficientMaterial() ? "insufficient" :
      room.game.isDraw() ? "draw" : room.game.isCheck() ? "check" : "playing",
    winner: room.game.isCheckmate() ? (room.game.turn() === "w" ? "black" : "white") : null
  };
}
function sendState(room) { io.to(room.code).emit("room:state", snapshot(room)); }
function leaveCurrent(socket) {
  const code = socketRooms.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code); socketRooms.delete(socket.id);
  if (room) {
    for (const color of ["white", "black"]) {
      if (room.players[color]?.id === socket.id) room.players[color].connected = false;
    }
    sendState(room);
  }
}
io.on("connection", socket => {
  socket.on("room:create", ({name} = {}, reply = () => {}) => {
    leaveCurrent(socket);
    const code = makeCode();
    const room = { code, game: new Chess(), players: { white: {id: socket.id, name: String(name||"Игрок").slice(0,18), connected:true}, black: null } };
    rooms.set(code, room); socket.join(code); socketRooms.set(socket.id, code);
    reply({ok:true, code, color:"white"}); sendState(room);
  });
  socket.on("room:join", ({code, name} = {}, reply = () => {}) => {
    const key = String(code||"").trim().toUpperCase();
    const room = rooms.get(key);
    if (!room) return reply({ok:false, error:"Комната не найдена. Проверь код."});
    if (room.players.black?.connected || room.players.white?.id === socket.id) return reply({ok:false, error:"В комнате уже два игрока."});
    leaveCurrent(socket);
    room.players.black = {id:socket.id, name:String(name||"Игрок").slice(0,18), connected:true};
    socket.join(key); socketRooms.set(socket.id,key);
    reply({ok:true, code:key, color:"black"}); sendState(room);
  });
  socket.on("room:move", ({from,to,promotion} = {}, reply = () => {}) => {
    const room = rooms.get(socketRooms.get(socket.id));
    if (!room) return reply({ok:false,error:"Сначала войди в комнату."});
    const color = ["white","black"].find(c => room.players[c]?.id === socket.id);
    if (!color || !room.players[color].connected) return reply({ok:false,error:"Игрок не подключён."});
    if ((room.game.turn()==="w" ? "white":"black") !== color) return reply({ok:false,error:"Сейчас ход соперника."});
    try {
      const move = room.game.move({from,to,promotion:promotion || "q"});
      if (!move) return reply({ok:false,error:"Недопустимый ход."});
      reply({ok:true}); sendState(room);
    } catch { reply({ok:false,error:"Недопустимый ход."}); }
  });
  socket.on("room:restart", (_data, reply = () => {}) => {
    const room = rooms.get(socketRooms.get(socket.id));
    if (!room) return reply({ok:false,error:"Комната не найдена."});
    if (room.players.white?.id !== socket.id) return reply({ok:false,error:"Начать новую партию может белый игрок."});
    room.game = new Chess(); sendState(room); reply({ok:true});
  });
  socket.on("disconnect", () => {
    const code = socketRooms.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (room) {
      for (const color of ["white","black"]) if (room.players[color]?.id === socket.id) room.players[color].connected = false;
      socketRooms.delete(socket.id); sendState(room);
    }
  });
});
server.listen(PORT, "0.0.0.0", () => console.log("Chess Arena listening on", PORT));
