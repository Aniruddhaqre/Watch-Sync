const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

// Create a standard HTTP server first
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Server is running");
});

// Attach WebSocket to that server
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on("connection", (ws) => {
    console.log("Peer connected");

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === "join") {
                ws.room = data.room;
                if (!rooms.has(data.room)) rooms.set(data.room, []);
                if (rooms.get(data.room).length < 2) {
                    rooms.get(data.room).push(ws);
                }
            } else {
                const clients = rooms.get(ws.room) || [];
                clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (e) { console.error("Message error", e); }
    });

    ws.on("close", () => {
        if (!ws.room) return;
        const clients = (rooms.get(ws.room) || []).filter(c => c !== ws);
        if (clients.length === 0) rooms.delete(ws.room);
        else rooms.set(ws.room, clients);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});