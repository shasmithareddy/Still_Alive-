const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function getZone(lat, lng) {
  const latZone = Math.floor(lat * 50);
  const lngZone = Math.floor(lng * 50);
  return `zone-${latZone}-${lngZone}`;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-network", ({ username, lat, lng, peerId }) => {
    try {
      const room = getZone(lat, lng);
      socket.join(room);
      socket.data = { username, room, peerId };
      console.log(`${username} joined ${room}`);

      const users = [...(io.sockets.adapter.rooms.get(room) || [])]
        .map(id => io.sockets.sockets.get(id)?.data)
        .filter(Boolean);

      socket.emit("existing-users", users);
      socket.to(room).emit("user-joined", { username, peerId });
      socket.emit("zone-info", { room });
    } catch (err) {
      console.error("Join error:", err);
    }
  });

  socket.on("disconnect", () => {
    const { room, peerId } = socket.data || {};
    if (room) socket.to(room).emit("user-left", { peerId });
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3001, "0.0.0.0", () => {
  console.log("🚀 Server running on port 3001");
});