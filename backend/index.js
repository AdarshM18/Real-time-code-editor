import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import cors from "cors";

const app = express();
const server = http.createServer(app);

// ✅ Setup CORS for both local and deployed frontend
const allowedOrigins = [
  "http://localhost:5173",          // Vite dev server
  "http://localhost:5000",          // Built app served by backend
  "https://realtime-code-editor-zwp3.onrender.com" // Your deployed frontend (if needed)
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true
}));

app.options("*", cors()); // Preflight support

// ✅ Socket.IO server with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// In-memory room map
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", ({ roomId, userName }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      const roomUsers = rooms.get(currentRoom);
      if (roomUsers) {
        roomUsers.delete(currentUser);
        io.to(currentRoom).emit("userJoined", Array.from(roomUsers));
      }
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    rooms.get(roomId).add(userName);

    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId)));
  });

  socket.on("codeChange", ({ roomId, code }) => {
    socket.to(roomId).emit("codeUpdate", code);
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      const roomUsers = rooms.get(currentRoom);
      if (roomUsers) {
        roomUsers.delete(currentUser);
        io.to(currentRoom).emit("userJoined", Array.from(roomUsers));
        if (roomUsers.size === 0) {
          rooms.delete(currentRoom); // Clean up empty rooms
        }
      }
      socket.leave(currentRoom);
      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom && currentUser) {
      const roomUsers = rooms.get(currentRoom);
      if (roomUsers) {
        roomUsers.delete(currentUser);
        io.to(currentRoom).emit("userJoined", Array.from(roomUsers));
        if (roomUsers.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
    console.log("User Disconnected", socket.id);
  });
});

// Serve frontend in production
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "frontend", "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
