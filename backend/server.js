const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ========================= ZONE LOGIC =========================
function getZoneFromLatLng(lat, lng) {
  const latZone = Math.floor(lat * 50);
  const lngZone = Math.floor(lng * 50);
  return `zone-${latZone}-${lngZone}`;
}

// ========================= MEMORY =========================
const zoneUsers = new Map();      // room -> [{username, peerId, socketId, isCLI}]
const messageHistory = new Map(); // room -> [messages]

// ========================= HELPERS =========================
function getOrCreateRoom(room) {
  if (!zoneUsers.has(room)) zoneUsers.set(room, []);
  return zoneUsers.get(room);
}

// Build the member list for a room (web + CLI peers)
function buildMemberList(room) {
  return (zoneUsers.get(room) || []).map(u => ({
    username: u.username,
    peerId: u.peerId,
    isWebRTC: !u.isCLI,
  }));
}

// Broadcast updated member list to all web sockets in a room
function broadcastMemberList(room) {
  const members = buildMemberList(room);
  io.to(room).emit("zone-members", members);
}

// ========================= SOCKET HANDLING =========================
io.on("connection", (socket) => {
  console.log("🌐 Connected:", socket.id);

  // ================= CLI BRIDGE REGISTRATION =================
  // CLI calls this to register itself as a bridge for a room
  // Payload: { room, username, peerId }
  socket.on("register-cli-bridge", ({ room, username, peerId }) => {
    socket.join(room);
    socket.data = { isCLI: true, room, username, peerId };

    console.log(`🔗 CLI bridge registered: ${username} for room: ${room}`);

    // Add CLI user to zone members
    const users = getOrCreateRoom(room);
    // Remove stale entry if any
    const filtered = users.filter(u => u.peerId !== peerId);
    filtered.push({ username, peerId, socketId: socket.id, isCLI: true });
    zoneUsers.set(room, filtered);

    // Send existing members to CLI (optional, for awareness)
    socket.emit("zone-members", buildMemberList(room));

    // Notify all web clients in zone (including member list update)
    socket.to(room).emit("cli-peer-joined", { username, peerId });
    broadcastMemberList(room);

    // Send chat history to CLI
    const history = messageHistory.get(room) || [];
    if (history.length > 0) {
      socket.emit("chat-history", history.slice(-10));
    }
  });

  // ================= JOIN NETWORK (Web clients) =================
  socket.on("join-network", ({ username, lat, lng, peerId }) => {
    try {
      const room = getZoneFromLatLng(lat, lng);

      socket.join(room);
      socket.data = { username, room, peerId, isCLI: false };

      console.log(`📍 ${username} joined ${room}`);

      // Store user
      const users = getOrCreateRoom(room);
      const filtered = users.filter(u => u.peerId !== peerId);
      filtered.push({ username, peerId, socketId: socket.id, isCLI: false });
      zoneUsers.set(room, filtered);

      // Send existing users (web only — for WebRTC signaling)
      const webUsers = filtered.filter(u => !u.isCLI && u.peerId !== peerId);
      socket.emit("existing-users", webUsers);

      // Send ALL zone members (web + CLI) so UI can show them
      socket.emit("zone-members", buildMemberList(room));

      // Notify others in the web room
      socket.to(room).emit("user-joined", { username, peerId });

      // Send room info back so frontend knows its zone
      socket.emit("zone-info", { room });

      // Send chat history
      socket.emit("chat-history", messageHistory.get(room) || []);

      // Notify CLI bridges in this room that a web user joined
      socket.to(room).emit("web-user-joined", { username, peerId, room });

      // Broadcast updated member list to all in room
      broadcastMemberList(room);

    } catch (err) {
      console.error("❌ Join error:", err);
    }
  });

  // ================= CHAT HANDLING =================
  socket.on("chat", (data) => {
    try {
      const { username, msg, room } = data;
      if (!room) return;

      console.log(`💬 [${room}] ${username}: ${msg}`);

      const message = {
        username,
        msg,
        timestamp: new Date().toISOString()
      };

      // Save history (last 100 messages)
      if (!messageHistory.has(room)) messageHistory.set(room, []);
      const history = messageHistory.get(room);
      history.push(message);
      if (history.length > 100) history.shift();

      // Broadcast to ALL sockets in the room (web + CLI bridge)
      io.to(room).emit("chat", message);

    } catch (err) {
      console.error("❌ Chat error:", err);
    }
  });

  // ================= SOS =================
  socket.on("sos", (data) => {
    try {
      const { username, lat, lng, msg } = data;
      const room = lat && lng ? getZoneFromLatLng(lat, lng) : (socket.data?.room || "zone-global");

      console.log(`🚨 SOS from ${username} in ${room}`);

      const alert = {
        username,
        msg: msg || "🚨 SOS EMERGENCY",
        lat,
        lng,
        room,
        timestamp: new Date().toISOString()
      };

      // Broadcast to ALL users globally
      io.emit("sos", alert);

    } catch (err) {
      console.error("❌ SOS error:", err);
    }
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", () => {
    const { room, peerId, username, isCLI } = socket.data || {};

    if (room && peerId && zoneUsers.has(room)) {
      const updated = zoneUsers.get(room).filter(u => u.peerId !== peerId);
      zoneUsers.set(room, updated);

      if (isCLI) {
        console.log(`🔌 CLI bridge disconnected: ${username} from ${room}`);
        socket.to(room).emit("cli-peer-left", { peerId });
      } else {
        socket.to(room).emit("user-left", { peerId });
        console.log(`👋 ${username} left ${room}`);
      }

      // Broadcast updated member list
      broadcastMemberList(room);
    }

    console.log("❌ Disconnected:", socket.id);
  });
});

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  const zones = {};
  for (const [room, users] of zoneUsers.entries()) {
    zones[room] = users.map(u => ({ username: u.username, isCLI: u.isCLI }));
  }
  res.json({
    status: "🚀 STILLALIVE Server Running",
    zones,
  });
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log("═══════════════════════════════════════");
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🌐 Web + CLI Bridge ACTIVE");
  console.log("═══════════════════════════════════════");
});