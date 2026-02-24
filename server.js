const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

// 1. Create HTTP server to handle Render Health Checks
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Watch Sync Signaling Server is Live");
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

// 2. Heartbeat logic
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            // Guard: Prevent actions if the user hasn't joined a room yet
            if (data.type !== "join" && !ws.room) {
                ws.send(JSON.stringify({ type: "error", message: "You must join a room first." }));
                return;
            }

            // 3. Message Router
            switch (data.type) {
                case "join":
                    handleJoin(ws, data.room);
                    break;
                
               // WebRTC Signaling Types
                case "offer":
                case "answer":
                case "ice-candidate":
                
                // Custom App Sync Types
                case "play": 
                case "pause":
                case "seek":
                case "sync":
                    broadcastToPeer(ws, data);
                    break;

                default:
                    console.warn("Unknown message type received:", data.type);
            }
        } catch (e) {
            console.error("Invalid JSON or parsing error:", e);
        }
    });

    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", console.error);
});

// --- HELPER FUNCTIONS ---

function handleJoin(ws, roomId) {
    if (!roomId) return;
    ws.room = roomId;

    if (!rooms.has(roomId)) {
        if (rooms.size >= 50) {
            ws.send(JSON.stringify({ type: "error", message: "Server capacity reached" }));
            return;
        }
        rooms.set(roomId, []);
    }

    const roomUsers = rooms.get(roomId);

    if (roomUsers.length >= 2) {
        ws.send(JSON.stringify({ type: "error", message: "This room is already full (2/2)" }));
        return;
    }

    roomUsers.push(ws);
    console.log(`User joined [${roomId}]. Users in room: ${roomUsers.length}`);

    // WEBRTC TRIGGER: If room is full, tell clients they can start the WebRTC handshake
   // WEBRTC TRIGGER: Tell ONLY the second user to initiate the call to avoid collisions
    if (roomUsers.length === 2) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ready" }));
        }
    }
}

function broadcastToPeer(ws, data) {
    const roomUsers = rooms.get(ws.room);
    if (!roomUsers) return;

    roomUsers.forEach(client => {
        // Send to the OTHER person in the room
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function handleDisconnect(ws) {
    if (!ws.room) return;

    const roomUsers = rooms.get(ws.room);
    if (roomUsers) {
        const remaining = roomUsers.filter(c => c !== ws);

        if (remaining.length === 0) {
            rooms.delete(ws.room);
            console.log(`Cleanup: Room [${ws.room}] deleted. Active rooms: ${rooms.size}`);
        } else {
            rooms.set(ws.room, remaining);
            // Notify the remaining peer so they can update their UI and close their WebRTC connection
            remaining[0].send(JSON.stringify({ type: "peer_left" }));
            console.log(`User left [${ws.room}]. 1 user remains.`);
        }
    }
}

// Cleanup interval on server shutdown
wss.on("close", () => clearInterval(interval));

server.listen(PORT, () => {
    console.log(`Signaling Server running on port ${PORT}`);
});