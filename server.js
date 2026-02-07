const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

// 1. Create HTTP server to handle Render Health Checks (prevents 404)
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Watch Sync Backend is Live");
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

// 2. Heartbeat logic: Check if clients are still there every 30 seconds
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

            if (data.type === "join") {
                ws.room = data.room;

                // Room capacity management
                if (!rooms.has(data.room)) {
                    if (rooms.size >= 50) {
                        ws.send(JSON.stringify({ type: "error", message: "Server capacity reached" }));
                        return;
                    }
                    rooms.set(data.room, []);
                }

                const users = rooms.get(data.room);
                if (users.length >= 2) {
                    ws.send(JSON.stringify({ type: "error", message: "This room is already full (2/2)" }));
                    return;
                }

                users.push(ws);
                console.log(`User joined [${data.room}]. Rooms active: ${rooms.size}`);
                return;
            }

            // Broadcast to other peer
            const clients = rooms.get(ws.room) || [];
            clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });

        } catch (e) {
            console.error("Broadcast Error:", e);
        }
    });

    // 3. THE CLEANUP LOGIC
    ws.on("close", () => {
        if (!ws.room) return;

        const clients = rooms.get(ws.room);
        if (clients) {
            // Remove this specific user
            const remaining = clients.filter(c => c !== ws);

            if (remaining.length === 0) {
                // DELETE ROOM IF EMPTY
                rooms.delete(ws.room);
                console.log(`Cleanup: Room [${ws.room}] deleted. Rooms remaining: ${rooms.size}`);
            } else {
                // UPDATE ROOM WITH REMAINING USER
                rooms.set(ws.room, remaining);
                // Optional: Notify the remaining user their friend left
                remaining[0].send(JSON.stringify({ type: "peer_left" }));
                console.log(`User left [${ws.room}]. 1 user remains.`);
            }
        }
    });

    ws.on("error", console.error);
});

wss.on("close", () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});