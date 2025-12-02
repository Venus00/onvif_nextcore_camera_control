// src/ptz.ts
import { SerialPort } from "serialport";

const DEFAULT_PORT = process.env.CAMERA_PORT ?? "/dev/ttyUSB0";
const DEFAULT_BAUD = Number(process.env.CAMERA_BAUD ?? "9600");
// Pelco-D camera address (1–255), usually set via camera OSD/DIP
const CAMERA_ADDRESS = Number(process.env.CAMERA_ADDR ?? "1");

export type PtzCommand =
  | { type: "up"; speed?: number }
  | { type: "down"; speed?: number }
  | { type: "left"; speed?: number }
  | { type: "right"; speed?: number }
  | { type: "upLeft"; speed?: number }
  | { type: "upRight"; speed?: number }
  | { type: "downLeft"; speed?: number }
  | { type: "downRight"; speed?: number }
  | { type: "stop" }
  | { type: "zoomIn"; speed?: number }
  | { type: "zoomOut"; speed?: number }
  | { type: "focusNear" }
  | { type: "focusFar" }
  | { type: "irisOpen" }
  | { type: "irisClose" }
  | { type: "raw"; hex: string };

class PtzController {
  private port: SerialPort;

  constructor(path: string, baudRate: number) {
    this.port = new SerialPort({
      path,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: true,
    });

    this.port.on("error", (err) => {
      console.error("[PTZ] Serial error:", err);
    });

    this.port.on("open", () => {
      console.log(`[PTZ] Opened serial port ${path} @ ${baudRate} baud`);
    });
  }

  private async write(buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.write(buffer, (err) => {
        if (err) return reject(err);
        this.port.drain((drainErr) => {
          if (drainErr) return reject(drainErr);
          resolve();
        });
      });
    });
  }

  /**
   * Build a Pelco-D frame.
   * Format: [0xFF, addr, cmd1, cmd2, data1, data2, checksum]
   * checksum = (addr + cmd1 + cmd2 + data1 + data2) & 0xFF
   */
  private buildFrame(
    addr: number,
    cmd1: number,
    cmd2: number,
    data1: number,
    data2: number
  ): Buffer {
    const a = addr & 0xff;
    const c1 = cmd1 & 0xff;
    const c2 = cmd2 & 0xff;
    const d1 = data1 & 0xff;
    const d2 = data2 & 0xff;

    const checksum = (a + c1 + c2 + d1 + d2) & 0xff; // 8-bit modulo 256 :contentReference[oaicite:1]{index=1}

    return Buffer.from([0xff, a, c1, c2, d1, d2, checksum]);
  }

  // ---- High-level PTZ actions ----

  // speed: 0x00–0x3F usually, pan speed in data1, tilt speed in data2
  async up(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x08; // bit3: Up :contentReference[oaicite:2]{index=2}
    const data1 = 0x00; // pan speed
    const data2 = speed; // tilt speed
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async down(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x10; // bit4: Down
    const data1 = 0x00;
    const data2 = speed;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async left(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x04; // bit2: Left
    const data1 = speed; // pan speed
    const data2 = 0x00;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async right(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x02; // bit1: Right
    const data1 = speed; // pan speed
    const data2 = 0x00;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async stop(): Promise<void> {
    // Command bytes 0, data speeds 0 = no motion
    const cmd1 = 0x00;
    const cmd2 = 0x00;
    const data1 = 0x00;
    const data2 = 0x00;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async zoomIn(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x20; // bit5: Zoom Tele (in)
    const data1 = 0x00;
    const data2 = speed; // some cameras ignore speed here, but it's ok
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async zoomOut(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x40; // bit6: Zoom Wide (out)
    const data1 = 0x00;
    const data2 = speed;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async upLeft(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x08 | 0x04; // Up + Left
    const data1 = speed; // pan speed
    const data2 = speed; // tilt speed
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async upRight(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x08 | 0x02; // Up + Right
    const data1 = speed;
    const data2 = speed;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async downLeft(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x10 | 0x04; // Down + Left
    const data1 = speed;
    const data2 = speed;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async downRight(speed = 0x20): Promise<void> {
    const cmd1 = 0x00;
    const cmd2 = 0x10 | 0x02; // Down + Right
    const data1 = speed;
    const data2 = speed;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

  async focusNear(): Promise<void> {
    const cmd1 = 0x01; // bit0: Focus Near
    const cmd2 = 0x00;
    const data1 = 0x00;
    const data2 = 0x00;
    const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, data1, data2);
    await this.write(frame);
  }

async focusFar(): Promise<void> {
  const cmd1 = 0x00;
  const cmd2 = 0x80; // bit7 of Command 2: Focus Far
  const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, 0x00, 0x00);
  await this.write(frame);
}

async irisOpen(): Promise<void> {
  const cmd1 = 0x02; // bit1: Iris Open
  const cmd2 = 0x00;
  const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, 0x00, 0x00);
  await this.write(frame);
}

async irisClose(): Promise<void> {
  const cmd1 = 0x04; // bit2: Iris Close
  const cmd2 = 0x00;
  const frame = this.buildFrame(CAMERA_ADDRESS, cmd1, cmd2, 0x00, 0x00);
  await this.write(frame);
}

  /**
   * Send a raw 7-byte Pelco-D frame: [FF, addr, cmd1, cmd2, data1, data2, checksum]
   * If you pass only 6 bytes (no checksum), it will calculate and append it.
   */
  async sendRawHex(hex: string): Promise<void> {
    let clean = hex.replace(/[^0-9a-fA-F]/g, ""); // remove spaces, 0x, etc.

    if (clean.length !== 12 && clean.length !== 14) {
      throw new Error(
        "Hex must be 12 (no checksum) or 14 (with checksum) hex characters"
      );
    }

    // Convert hex → bytes
    const bytes = Buffer.from(clean, "hex");

    if (bytes.length === 7) {
      // full frame provided
      await this.write(bytes);
      return;
    }

    if (bytes.length === 6) {
      const [sync, addr, cmd1, cmd2, data1, data2] = bytes;
      if (sync !== 0xff) throw new Error("First byte must be FF");

      const checksum = (addr + cmd1 + cmd2 + data1 + data2) & 0xff;
      const frame = Buffer.from([
        sync,
        addr,
        cmd1,
        cmd2,
        data1,
        data2,
        checksum,
      ]);
      await this.write(frame);
      return;
    }
  }
}

const controller = new PtzController(DEFAULT_PORT, DEFAULT_BAUD);

export async function executeCommand(cmd: PtzCommand): Promise<void> {
  switch (cmd.type) {
    case "up":
      return controller.up(cmd.speed);
    case "down":
      return controller.down(cmd.speed);
    case "left":
      return controller.left(cmd.speed);
    case "right":
      return controller.right(cmd.speed);
    case "upLeft":
      return controller.upLeft(cmd.speed);
    case "upRight":
      return controller.upRight(cmd.speed);
    case "downLeft":
      return controller.downLeft(cmd.speed);
    case "downRight":
      return controller.downRight(cmd.speed);
    case "stop":
      return controller.stop();
    case "zoomIn":
      return controller.zoomIn(cmd.speed);
    case "zoomOut":
      return controller.zoomOut(cmd.speed);
    case "focusNear":
      return controller.focusNear();
    case "focusFar":
      return controller.focusFar();
    case "irisOpen":
      return controller.irisOpen();
    case "irisClose":
      return controller.irisClose();
    case "raw":
      return controller.sendRawHex(cmd.hex);
  }
}
