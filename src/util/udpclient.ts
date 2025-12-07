import dgram from 'dgram';
import { createWebSocketServer } from './websocket.js';
import type { WebSocketServer } from './websocket.js';

// Object classification types
const OBJECT_CLASSES: Record<number, string> = {
    0x01: "Human",
    0x02: "Car",
    0x03: "Truck",
    0x04: "Motorcycle",
    0x05: "Animal",
    0x06: "Static Object",
};

export interface TrackedObject {
    classification: number;
    classificationName: string;
    trackId: number;
    x: number;
    y: number;
    z: number;
}

export interface ParsedFrame {
    header: number;
    objectCount: number;
    objects: TrackedObject[];
    crc: number;
    crcValid: boolean;
}

/**
 * Calculate Checksum
 * Checksum = (sum of all data bytes except header and checksum) & 0xFF
 */
function calculateChecksum(buffer: Buffer): number {
    let sum = 0;
    // Sum all bytes except the first (header) and last (checksum)
    for (let i = 1; i < buffer.length; i++) {
        sum += buffer.readUInt8(i);
    }
    return sum & 0xFF;
}

/**
 * Parse the UDP frame containing tracked objects
 * Frame structure:
 * - Header (1B) - Must be 0xFB
 * - Object Count (1B)
 * - Objects (14B each): [CLS(1B), ID_TRACK(1B), X(4B), Y(4B), Z(4B)]
 * - Checksum (1B)
 * 
 * Total size formula: 2 + (14 × nb_objects) + 1
 * Minimum size: 3 bytes (Header + NbObj + Checksum, no objects)
 */
function parseFrame(buffer: Buffer): ParsedFrame | null {
    try {
        // Minimum frame size: Header(1) + NbObj(1) + Checksum(1) = 3 bytes
        if (buffer.length < 3) {
            console.error(`Frame too short: ${buffer.length} bytes`);
            return null;
        }

        let offset = 0;

        // Read Header (1 byte) - Must be 0xFB
        const header = buffer.readUInt8(offset);
        offset += 1;

        // Validate header
        if (header !== 0xFB) {
            console.error(`Invalid header: Expected 0xFB, got 0x${header.toString(16).toUpperCase()}`);
            return null;
        }

        // Read Object Count (1 byte)
        const objectCount = buffer.readUInt8(offset);
        offset += 1;

        // Expected size: 2 (header + count) + (14 * objectCount) + 1 (checksum)
        const expectedSize = 2 + (14 * objectCount) + 1;
        if (buffer.length !== expectedSize) {
            console.error(`Invalid frame size. Expected ${expectedSize}, got ${buffer.length}`);
            return null;
        }

        // Parse objects
        const objects: TrackedObject[] = [];
        for (let i = 0; i < objectCount; i++) {
            // CLS (1 byte)
            console.log(buffer.readUInt8(offset))
            const classification = buffer.readUInt8(offset);
            offset += 1;

            // ID_TRACK (1 byte)
            const trackId = buffer.readUInt8(offset);
            offset += 1;

            // X (4 bytes, float)
            const x = buffer.readInt32BE(offset);
            offset += 4;

            // Y (4 bytes, float)
            const y = buffer.readInt32BE(offset);
            offset += 4;

            // Z (4 bytes, float)
            const z = buffer.readInt32BE(offset);
            offset += 4;

            objects.push({
                classification,
                classificationName: OBJECT_CLASSES[classification] || "Unknown",
                trackId,
                x,
                y,
                z,
            });
        }

        // Read Checksum (1 byte)
        const receivedChecksum = buffer.readUInt8(offset) & 0xFF;
        offset += 1;

        // Calculate checksum on all data except header and checksum itself
        const dataForChecksum = buffer.slice(0, buffer.length - 1);
        const calculatedChecksum = calculateChecksum(dataForChecksum);
        const checksumValid = receivedChecksum === calculatedChecksum;

        // Debug logging
        console.log(`Frame dump: ${buffer.toString('hex')}`);
        console.log(`Received checksum: 0x${receivedChecksum.toString(16).toUpperCase()}`);
        console.log(`Calculated checksum: 0x${calculatedChecksum.toString(16).toUpperCase()}`);
        console.log(`Data for checksum: ${dataForChecksum.toString('hex')}`);

        if (!checksumValid) {
            console.warn(`Checksum mismatch! Received: 0x${receivedChecksum.toString(16).toUpperCase()}, Calculated: 0x${calculatedChecksum.toString(16).toUpperCase()}`);
        }

        return {
            header,
            objectCount,
            objects,
            crc: receivedChecksum,
            crcValid: checksumValid,
        };
    } catch (err: any) {
        console.error("Error parsing frame:", err.message);
        return null;
    }
}
export interface UDPClientConfig {
    wsPort?: number;
    localPort?: number;      // Local port to bind and receive data on
    remoteHost?: string;     // Remote server IP (for filtering/logging)
    remotePort?: number;     // Remote server port (for filtering/logging)
    initialMessage?: string | Buffer;  // Optional initial message to send on connection
}

/**
 * Create UDP client to receive data from remote UDP server
 * Binds to a local port to receive incoming UDP packets
 * @param config Configuration object with optional wsPort, localPort, remoteHost, remotePort
 * @returns Object containing UDP client socket and WebSocket server instance
 */
export function createUDPClient(config: UDPClientConfig = {}): {
    udpClient: dgram.Socket;
    wsServer: ReturnType<typeof createWebSocketServer>
} {
    const {
        wsPort = 8080,
        localPort = 5012,
        remoteHost = 'localhost',
        remotePort = 5012,
        initialMessage
    } = config;

    const client = dgram.createSocket('udp4');
    const wsServer = createWebSocketServer(wsPort);

    client.on('error', (err) => {
        console.error(`[UDP Client] Error:\n${err.stack}`);
        client.close();
    });

    client.on('message', (msg, rinfo) => {
        // Optional: Filter messages from specific remote host
        if (remoteHost && rinfo.address !== remoteHost) {
            console.log(`[UDP] Ignoring message from ${rinfo.address}:${rinfo.port} (expecting ${remoteHost})`);
            return;
        }

        console.log(`\n[UDP] Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);

        const parsed = parseFrame(msg);

        if (parsed) {
            console.log(`\n┌─────────────────────────────────────────────────┐`);
            console.log(`│ Frame Header: 0x${parsed.header.toString(16).toUpperCase().padStart(2, '0')}`);
            console.log(`│ Object Count: ${parsed.objectCount}`);
            console.log(`│ CRC Valid: ${parsed.crcValid ? '✓' : '✗'} (0x${parsed.crc.toString(16).toUpperCase()})`);
            console.log(`└─────────────────────────────────────────────────┘`);

            if (parsed.objects.length > 0) {
                console.log(`\nTracked Objects:`);
                parsed.objects.forEach((obj, index) => {
                    console.log(`  [${index + 1}] ${obj.classificationName} (ID: ${obj.trackId})`);
                    console.log(`      Position: X=${obj.x.toFixed(2)}, Y=${obj.y.toFixed(2)}, Z=${obj.z.toFixed(2)}`);
                });
            }

            // Broadcast to all WebSocket clients
            wsServer.broadcast(parsed);
        }
    });

    client.on('listening', () => {
        const address = client.address();
        console.log(`\n📡 UDP Client listening for remote server data`);
        console.log(`   Local: ${address.address}:${address.port}`);
        console.log(`   Expecting data from: ${remoteHost}:${remotePort || 'any'}`);
        console.log(`   WebSocket server: ws://localhost:${wsPort}`);
        console.log(`   Waiting for object tracking data...\n`);


    });

    // Bind to local port to receive data from remote server
    client.bind(localPort, '0.0.0.0', () => {
        console.log(`\n🔌 Binding to local port ${localPort} to receive UDP data...`);
        // Send initial message to remote server after binding
        if (remoteHost && remotePort) {
            console.log("sending")
            const message = Buffer.from("test")

            client.send(message, remotePort, remoteHost, (err) => {
                if (err) {
                    console.error(`[UDP Client] Failed to send initial message:`, err.message);
                } else {
                    console.log(`[UDP Client] ✅ Sent initial message to ${remoteHost}:${remotePort}`);
                    console.log(`   Message: ${typeof initialMessage === 'string' ? initialMessage : message.toString('hex')}`);
                }
            });
        }
    });

    return { udpClient: client, wsServer };
}

/**
 * Send test frame (for debugging)
 */
export function createTestFrame(objects: Array<{ cls: number, id: number, x: number, y: number, z: number }>): Buffer {
    const header = 0xFB;
    const objectCount = objects.length;

    // Calculate buffer size: 2 (header + count) + (14 * objectCount) + 1 (checksum)
    const bufferSize = 2 + (14 * objectCount) + 1;
    const buffer = Buffer.allocUnsafe(bufferSize);

    let offset = 0;

    // Write Header
    buffer.writeUInt8(header, offset);
    offset += 1;

    // Write Object Count
    buffer.writeUInt8(objectCount, offset);
    offset += 1;

    // Write Objects
    objects.forEach(obj => {
        buffer.writeUInt8(obj.cls & 0xFF, offset);
        offset += 1;

        buffer.writeUInt8(obj.id & 0xFF, offset);
        offset += 1;

        buffer.writeFloatLE(obj.x, offset);
        offset += 4;

        buffer.writeFloatLE(obj.y, offset);
        offset += 4;

        buffer.writeFloatLE(obj.z, offset);
        offset += 4;
    });

    // Calculate and write Checksum (1 byte)
    const dataForChecksum = buffer.slice(0, offset);
    const checksum = calculateChecksum(dataForChecksum);

    // Write checksum as 1 byte
    buffer.writeUInt8(checksum, offset);
    offset += 1;

    return buffer;
}

/**
 * Send fake tracking data to WebSocket clients for testing
 * @param wsServer WebSocket server instance
 * @param interval Interval in milliseconds (default: 1000ms)
 * @returns Interval ID that can be used to stop sending data
 */
export function sendFakeDataToWebSocket(wsServer: WebSocketServer, interval: number = 1000): NodeJS.Timeout {
    console.log(`\n🧪 Starting fake data generator (interval: ${interval}ms)`);

    let frameCount = 0;

    const intervalId = setInterval(() => {
        frameCount++;

        // Generate random number of objects (1-5)
        const objectCount = Math.floor(Math.random() * 5) + 1;
        const objects: TrackedObject[] = [];

        for (let i = 0; i < objectCount; i++) {
            const classifications = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]; // Human, Car, Truck, Motorcycle, Animal, Static
            const randomClass = classifications[Math.floor(Math.random() * classifications.length)] || 0x01;

            objects.push({
                classification: randomClass,
                classificationName: OBJECT_CLASSES[randomClass] || "Unknown",
                trackId: Math.floor(Math.random() * 100) + 1,
                x: Math.random() * 100, // Random X position (0-100)
                y: Math.random() * 100, // Random Y position (0-100)
                z: Math.random() * 10,  // Random Z position (0-10)
            });
        }

        // Create fake parsed frame
        const fakeFrame: ParsedFrame = {
            header: 0xFB,
            objectCount: objects.length,
            objects: objects,
            crc: 0xABCD, // Fake CRC
            crcValid: true,
        };

        console.log(`\n[FAKE DATA #${frameCount}] Broadcasting ${objects.length} object(s)`);
        objects.forEach((obj, idx) => {
            console.log(`  [${idx + 1}] ${obj.classificationName} (ID: ${obj.trackId}) - Pos: (${obj.x.toFixed(2)}, ${obj.y.toFixed(2)}, ${obj.z.toFixed(2)})`);
        });

        // Broadcast to WebSocket clients
        wsServer.broadcast(fakeFrame);

    }, interval);

    console.log(`✅ Fake data generator started. Use clearInterval() to stop.\n`);

    return intervalId;
}