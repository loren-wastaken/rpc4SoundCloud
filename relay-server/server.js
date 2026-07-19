// rpc4SoundCloud — relay server
//
// Why this exists: neither a browser tab nor Discord's renderer process can
// *accept* incoming connections, so we need one small always-running process
// that both sides connect *out* to. Its job is dead simple: whatever message
// one client sends, broadcast it to every other connected client.
//
// Run with: npm install && npm start

const { WebSocketServer } = require("ws");

const PORT = 6989;
const wss = new WebSocketServer({ port: PORT });
const clients = new Set();

wss.on("connection", socket => {
  clients.add(socket);
  console.log(`[relay] client connected (${clients.size} total)`);

  socket.on("message", data => {
    for (const other of clients) {
      if (other !== socket && other.readyState === other.OPEN) {
        other.send(data.toString());
      }
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
    console.log(`[relay] client disconnected (${clients.size} total)`);
  });
});

console.log(`[relay] rpc4SoundCloud relay listening on ws://localhost:${PORT}`);
