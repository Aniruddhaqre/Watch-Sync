const WebSocket = require("ws");

// Use Render's port or default to 8080 for local testing
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = new Map();

wss.on("connection", (ws) => {
  console.log("New connection established");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      ws.room = data.room;
      
      // Limit to 50 rooms
      if (!rooms.has(data.room) && rooms.size >= 50) {
        ws.send(JSON.stringify({ type: "error", message: "Server full" }));
        return;
      }

      if (!rooms.has(data.room)) {
        rooms.set(data.room, []);
      }
      
      // Limit to 2 people per room
      if (rooms.get(data.room).length >= 2) {
        ws.send(JSON.stringify({ type: "error", message: "Room full" }));
        return;
      }

      rooms.get(data.room).push(ws);
      console.log(`User joined room: ${data.room}`);
      return;
    }

    const clients = rooms.get(ws.room) || [];
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });

  ws.on("close", () => {
    if (!ws.room) return;
    const clients = rooms.get(ws.room) || [];
    const updated = clients.filter((c) => c !== ws);
    if (updated.length === 0) {
      rooms.delete(ws.room);
    } else {
      rooms.set(ws.room, updated);
    }
  });
});

console.log(`Server is running on port ${PORT}`);