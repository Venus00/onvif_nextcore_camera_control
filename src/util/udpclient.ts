import dgram from 'dgram';
import { createWebSocketServer } from './websocket.js';
import type { WebSocketServer } from './websocket.js';

// Object classification types (COCO dataset)
const OBJECT_CLASSES: Record<number, string> = {
    0x00: "person",
    0x01: "bicycle",
    0x02: "car",
    0x03: "motorcycle",
    0x04: "airplane",
    0x05: "bus",
    0x06: "train",
    0x07: "truck",
    0x08: "boat",
    0x09: "traffic light",
    0x0a: "fire hydrant",
    0x0b: "stop sign",
    0x0c: "parking meter",
    0x0d: "bench",
    0x0e: "bird",
    0x0f: "cat",
    0x10: "dog",
    0x11: "horse",
    0x12: "sheep",
    0x13: "cow",
    0x14: "elephant",
    0x15: "bear",
    0x16: "zebra",
    0x17: "giraffe",
    0x18: "backpack",
    0x19: "umbrella",
    0x1a: "handbag",
    0x1b: "tie",
    0x1c: "suitcase",
    0x1d: "frisbee",
    0x1e: "skis",
    0x1f: "snowboard",
    0x20: "sports ball",
    0x21: "kite",
    0x22: "baseball bat",
    0x23: "baseball glove",
    0x24: "skateboard",
    0x25: "surfboard",
    0x26: "tennis racket",
    0x27: "bottle",
    0x28: "wine glass",
    0x29: "cup",
    0x2a: "fork",
    0x2b: "knife",
    0x2c: "spoon",
    0x2d: "bowl",
    0x2e: "banana",
    0x2f: "apple",
    0x30: "sandwich",
    0x31: "orange",
    0x32: "broccoli",
    0x33: "carrot",
    0x34: "hot dog",
    0x35: "pizza",
    0x36: "donut",
    0x37: "cake",
    0x38: "chair",
    0x39: "couch",
    0x3a: "potted plant",
    0x3b: "bed",
    0x3c: "dining table",
    0x3d: "toilet",
    0x3e: "tv",
    0x3f: "laptop",
    0x40: "mouse",
    0x41: "remote",
    0x42: "keyboard",
    0x43: "cell phone",
    0x44: "microwave",
    0x45: "oven",
    0x46: "toaster",
    0x47: "sink",
    0x48: "refrigerator",
    0x49: "book",
    0x4a: "clock",
    0x4b: "vase",
    0x4c: "scissors",
    0x4d: "teddy bear",
    0x4e: "hair drier",
    0x4f: "toothbrush",
};

export interface TrackedObject {
    classification: number;
    classificationName: string;
    trackId: number;
    x: number;
    x1: number;
    y: number;
    y1: number;
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
 * - Objects (14B each): [CLS(1B), ID_TRACK(1B), X(2B), X1(2B), Y(2B), Y1(2B), Z(4B)]
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

            // X (2 bytes)
            const x = buffer.readInt16BE(offset);
            offset += 2;

            // X1 (2 bytes)
            const x1 = buffer.readInt16BE(offset);
            offset += 2;

            // Y (2 bytes)
            const y = buffer.readInt16BE(offset);
            offset += 2;

            // Y1 (2 bytes)
            const y1 = buffer.readInt16BE(offset);
            offset += 2;

            // Z (4 bytes)
            const z = buffer.readInt32BE(offset);
            offset += 4;

            objects.push({
                classification,
                classificationName: OBJECT_CLASSES[classification] || "Unknown",
                trackId,
                x,
                x1,
                y,
                y1,
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

    const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const wsServer = createWebSocketServer(wsPort);

    client.on('error', (err) => {
        console.error(`[UDP Client] Error:\n${err.stack}`);
        client.close();
    });

    client.on('message', (msg, rinfo) => {
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
        console.log(`\n🔌 UDP Client bound to 0.0.0.0:${localPort}`);
        console.log(`   Ready to receive data from Python server at ${remoteHost}:${remotePort}`);

        // Send initial message to remote server after binding
        if (remoteHost && remotePort) {
            const message = initialMessage || Buffer.from("PING")
            console.log(`   Sending initial message to ${remoteHost}:${remotePort}...`);

            client.send(message, remotePort, remoteHost, (err) => {
                if (err) {
                    console.error(`[UDP Client] ❌ Failed to send initial message:`, err.message);
                } else {
                    console.log(`[UDP Client] ✅ Initial message sent to ${remoteHost}:${remotePort}`);
                    console.log(`   Waiting for response from Python server...\n`);
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