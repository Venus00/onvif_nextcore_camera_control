import { WebSocketServer, WebSocket } from 'ws';

interface TrackedObject {
    classification: number;
    classificationName: string;
    trackId: number;
    x: number;
    y: number;
    z: number;
}

interface ParsedFrame {
    header: number;
    objectCount: number;
    objects: TrackedObject[];
    crc: number;
    crcValid: boolean;
}

/**
 * Create WebSocket server for real-time data streaming
 */
export function createWebSocketServer(port: number = 8080) {
    const wss = new WebSocketServer({ port });
    const clients = new Set<WebSocket>();

    wss.on('connection', (ws) => {
        console.log(`[WebSocket] New client connected. Total clients: ${clients.size + 1}`);
        clients.add(ws);

        ws.on('close', () => {
            clients.delete(ws);
            console.log(`[WebSocket] Client disconnected. Total clients: ${clients.size}`);
        });

        ws.on('error', (err) => {
            console.error('[WebSocket] Client error:', err.message);
            clients.delete(ws);
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to object tracking stream',
            timestamp: Date.now()
        }));
    });

    console.log(`\n🌐 WebSocket server started on ws://localhost:${port}`);
    console.log(`   Clients can connect to receive real-time object tracking data\n`);

    return {
        wss,
        broadcast: (data: ParsedFrame) => {
            const message = JSON.stringify({
                type: 'tracking_data',
                timestamp: Date.now(),
                data: {
                    header: data.header,
                    objectCount: data.objectCount,
                    crcValid: data.crcValid,
                    objects: data.objects
                }
            });

            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        },
        close: () => {
            clients.forEach(client => client.close());
            wss.close();
        }
    };
}


export { WebSocketServer };
// Example client-side WebSocket connection:
// const ws = new WebSocket('ws://localhost:8080');
// ws.onmessage = (event) => {
//   const data = JSON.parse(event.data);
//   console.log('Received:', data);
// };
