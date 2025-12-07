import express, { Request, Response } from 'express';
import bodyParser from "body-parser";
import { CameraInfo, cameras, type VideoEncoderConfig } from "./util/camera";
import {
  focusMove,
  focusStop,
  getVideoEncoderConfiguration,
  setVideoEncoderConfiguration,
} from "./util/api";
import onvif from "node-onvif";
// @ts-ignore
import cors from "cors";
// Use require for digest-fetch to avoid ESM/CJS import issues
// @ts-ignore
import DigestFetch from "digest-fetch";
import { executeCommand, PtzCommand } from "./util/pelcoD";
//{"pan":0.5,"tilt":0.2,"zoom":0.1,"time":2,"stop":true}
async function discoverCameras() {
  console.log("Starting ONVIF discovery...");
  try {
    // onvif.startDiscovery expects a callback or a timeout, not two arguments. Remove iface argument for compatibility.
    onvif.startDiscovery((deviceInfo: any) => {
      console.log(deviceInfo);
    });
  } catch (err) {
    console.error(err);
  }
}

// Run the scan
const app = express();
app.use(cors());
app.use(bodyParser.json());
const PORT = 3000;

// Get HeatImagingThermometry config
app.get("/thermal/:camId/thermometry", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { client, ip } = getCameraClient(camId);
    const url = `http://${ip}/cgi-bin/configManager.cgi?action=getConfig&name=HeatImagingThermometry`;
    const response = await client.fetch(url);
    const text = await response.text();
    res.type("text/plain").send(text);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.post("/ptz/:camId/zoom", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { client, ip } = getCameraClient(camId);

    // Configurable target and tolerance
    const target = typeof req.body.target === "number" ? req.body.target : 44;
    const tolerance =
      typeof req.body.tolerance === "number" ? req.body.tolerance : 0;
    const maxTries =
      typeof req.body.maxTries === "number" ? req.body.maxTries : 100;
    const pollInterval =
      typeof req.body.pollInterval === "number" ? req.body.pollInterval : 100; // ms

    // Get initial zoom value
    let zoomValue: number | null = null;
    let stopped = false;
    let tries = 0;
    let direction: "in" | "out" | null = null;
    let code: string | null = null;

    // Fetch initial zoom value
    const statusResInit = await client.fetch(
      `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
    );
    const statusTextInit = await statusResInit.text();
    console.log(statusTextInit);
    const matchInit = statusTextInit.match(/status\.ZoomValue=([\d\.\-]+)/);
    if (matchInit) {
      zoomValue = parseFloat(matchInit[1]);
    }
    if (zoomValue === null)
      throw new Error("Could not read initial zoom value");

    // Decide initial direction
    if (zoomValue < target - tolerance) {
      direction = "in";
      code = "ZoomTele";
    } else if (zoomValue > target + tolerance) {
      direction = "out";
      code = "ZoomWide";
    } else {
      // Already within range
      return res.json({
        success: true,
        camera: camId,
        zoomValue,
        stopped: true,
        message: "Already within target range",
      });
    }

    // Start zoom in or out, then stop, then check
    let currentZoomCommand = code;
    let zooming = true;
    while (tries < maxTries && zooming) {
      // Dynamically adjust speed, fixed burst time
      let diff = Math.abs((zoomValue ?? target) - target);
      let speed = 1;
      if (diff > 100) speed = 5;
      else if (diff > 30) speed = 3;
      else if (diff > 10) speed = 2;
      // else speed = 1;
      const burst = 50;

      await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=${currentZoomCommand}&arg1=0&arg2=0&arg3=${speed}`
      );
      await new Promise((r) => setTimeout(r, burst));
      await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=0&code=${currentZoomCommand}&arg1=${speed}&arg2=0&arg3=0`
      );
      // Wait a moment for camera to settle
      await new Promise((r) => setTimeout(r, 50));
      // Check status
      const statusRes = await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
      );
      const statusText = await statusRes.text();
      console.log(statusText);
      const match = statusText.match(/status\.ZoomValue=([\d\.\-]+)/);
      if (match) {
        zoomValue = parseFloat(match[1]);
        if (
          zoomValue >= target - tolerance &&
          zoomValue <= target + tolerance
        ) {
          stopped = true;
          break;
        }
        // If we cross the range, change direction
        if (direction === "in" && zoomValue > target + tolerance) {
          direction = "out";
          currentZoomCommand = "ZoomWide";
        } else if (direction === "out" && zoomValue < target - tolerance) {
          direction = "in";
          currentZoomCommand = "ZoomTele";
        }
      }
      tries++;
    }

    res.json({
      success: true,
      camera: camId,
      zoomValue,
      stopped,
      target,
      tolerance,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Monitor PTZFocusHD value continuously
app.get("/focus/:camId/monitor", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { client, ip } = getCameraClient(camId);

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const intervalId = setInterval(async () => {
      try {
        const statusRes = await client.fetch(
          `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
        );
        const statusText = await statusRes.text();
        const match = statusText.match(/status\.PTZFocusHD=([\d\.\-]+)/);

        if (match) {
          const focusValue = parseFloat(match[1]);
          console.log(`PTZFocusHD: ${focusValue}`);
          res.write(`data: ${JSON.stringify({ focusValue, timestamp: Date.now() })}\n\n`);
        }
      } catch (err: any) {
        console.error("Error fetching PTZFocusHD:", err.message);
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      res.end();
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Focus auto-move endpoint (like zoom)
app.post("/focus/:camId/auto", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { client, ip } = getCameraClient(camId);

    // Configurable target and tolerance
    const target =
      typeof req.body.target === "number" ? req.body.target : 25137;
    const tolerance =
      typeof req.body.tolerance === "number" ? req.body.tolerance : 200;
    const maxTries =
      typeof req.body.maxTries === "number" ? req.body.maxTries : 100;
    const pollInterval =
      typeof req.body.pollInterval === "number" ? req.body.pollInterval : 100; // ms

    // Get initial focus value
    let focusValue: number | null = null;
    let stopped = false;
    let tries = 0;
    let direction: "in" | "out" | null = null;
    let code: string | null = null;

    // Fetch initial focus value
    const statusResInit = await client.fetch(
      `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
    );
    const statusTextInit = await statusResInit.text();
    console.log(statusTextInit);
    const matchInit = statusTextInit.match(/status\.PTZFocusHD=([\d\.\-]+)/);
    if (matchInit) {
      focusValue = parseFloat(matchInit[1]);
    }
    if (focusValue === null)
      throw new Error("Could not read initial focus value");

    // Decide initial direction
    if (focusValue < target - tolerance) {
      direction = "in";
      code = "FocusNear";
    } else if (focusValue > target + tolerance) {
      direction = "out";
      code = "FocusFar";
    } else {
      // Already within range
      return res.json({
        success: true,
        camera: camId,
        focusValue,
        stopped: true,
        message: "Already within target range",
      });
    }

    // Start focus in or out, then stop, then check
    let currentFocusCommand = code;
    let focusing = true;
    while (tries < maxTries && focusing) {
      // Dynamically adjust speed, fixed burst time
      let diff = Math.abs((focusValue ?? target) - target);
      let speed = 1;
      if (diff > 100) speed = 5;
      else if (diff > 30) speed = 3;
      else if (diff > 10) speed = 2;
      // else speed = 1;
      const burst = 200;

      await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=${currentFocusCommand}&arg1=0&arg2=0&arg3=${speed}`
      );
      await new Promise((r) => setTimeout(r, burst));
      await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=0&code=${currentFocusCommand}&arg1=0&arg2=0&arg3=0`
      );
      // Wait a moment for camera to settle
      await new Promise((r) => setTimeout(r, 50));
      // Check status
      const statusRes = await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
      );
      const statusText = await statusRes.text();
      console.log(statusText);
      const match = statusText.match(/status\.PTZFocusHD=([\d\.\-]+)/);
      if (match) {
        focusValue = parseFloat(match[1]);
        if (
          focusValue >= target - tolerance &&
          focusValue <= target + tolerance
        ) {
          stopped = true;
          break;
        }
        // If we cross the range, change direction
        if (direction === "in" && focusValue > target + tolerance) {
          direction = "out";
          currentFocusCommand = "FocusFar";
        } else if (direction === "out" && focusValue < target - tolerance) {
          direction = "in";
          currentFocusCommand = "FocusNear";
        }
      }
      tries++;
    }

    res.json({
      success: true,
      camera: camId,
      focusValue,
      stopped,
      target,
      tolerance,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/ptz/:camId/position3d", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { arg3 } = req.body; // arg1: x, arg2: y, arg3: z (zoom)
    const { client, ip } = getCameraClient(camId);

    // Clamp values to [-8191, 8191] for x and y
    // z (zoom) can be positive, negative, or 0
    const z = Number(arg3);

    // Send PTZ 3D positioning command
    // Example: http://<ip>/cgi-bin/ptz.cgi?action=start&code=Position3D&arg1=x&arg2=y&arg3=z
    const url = `http://${ip}/cgi-bin/ptz.cgi?action=start&code=Position3D&arg1=${0}&arg2=${0}&arg3=${z}&arg4=null`;
    const response = await client.fetch(url);
    const text = await response.text();
    res.json({ success: true, camera: camId, url, response: text });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/camera/:camId/video-encoder", async (req, res) => {
  const cam = cameras[req.params.camId];
  if (!cam) return res.status(404).json({ error: "Camera not found" });

  const response = await getVideoEncoderConfiguration(req.params.camId);
  console.log("Current Encoder Config:", response);
  res.status(200).json({ response });
});

app.post("/camera/:camId/video-encoder", async (req, res) => {
  const cam = cameras[req.params.camId];
  if (!cam) return res.status(404).json({ error: "Camera not found" });
  try {
    const config: VideoEncoderConfig = req.body; // {encoding, width, height, framerate, bitrate, quality, govLength, profile}
    const result = await setVideoEncoderConfiguration("cam1", config);
    console.log("Set Response:", result);
    res.status(200).json({ message: "Encoder configuration set successfully" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/focus/:camId/move", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { direction, speed = 5, channel = 0 } = req.body;
    const { client, ip } = getCameraClient(camId);
    let code;
    if (direction === "focus_in") code = "FocusNear";
    else if (direction === "focus_out") code = "FocusFar";
    else throw new Error("Invalid direction (use 'in' or 'out')");

    const url = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=${code}&arg1=0&arg2=0&arg3=0`;
    const response = await client.fetch(url);
    const text = await response.text();
    // stop after 1s (you can adjust)

    res.json({ success: true, camera: camId, response: text });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/focus/:camId/stop", async (req, res) => {
  try {
    const camId = req.params.camId;
    const { direction, channel = 0, speed = 3 } = req.body;
    const { client, ip } = getCameraClient(camId);

    let code;
    if (direction === "focus_in") code = "FocusNear";
    else if (direction === "focus_out") code = "FocusFar";
    else throw new Error("Invalid direction (use 'focus_in' or 'focus_out')");

    const url = `http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=${channel}&code=${code}&arg1=0&arg2=0&arg3=0`;
    const response = await client.fetch(url);
    const text = await response.text();

    res.json({
      success: true,
      camera: camId,
      stopped: direction,
      response: text,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PTZ preset movement handler
// Preset-specific zoom/focus targets
const presetTargets: Record<number, { zoom?: number; focus?: number }> = {
  1: { zoom: 44, focus: 25137 },
  2: { zoom: 44, focus: 25137 },
  3: { zoom: 44, focus: 25137 },
  4: { zoom: 44, focus: 25137 },
  5: { zoom: 44, focus: 25137 },
};

app.post("/ptz/:camId/preset", async (req, res) => {
  try {
    console.log("preset", req.body);
    const camId = req.params.camId;
    const { preset } = req.body; // expects a number, e.g., 1, 2, 3, 4, 5

    const { client, ip } = getCameraClient(camId);
    // Move to preset using CGI configManager API (GotoPreset)
    const url = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=GotoPreset&arg1=0&arg2=${preset}&arg3=0&arg4=null`;
    const response = await client.fetch(url);
    const text = await response.text();
    console.log(text);
    // After preset move, trigger zoom/focus if targets defined
    const targets = presetTargets[preset];
    let zoomResult = null;
    let focusResult = null;
    await new Promise((r) => setTimeout(r, 2000));
    if (targets) {
      if (typeof targets.zoom === "number") {
        try {
          const zoomRes = await fetch(`http://localhost:3000/ptz/cam2/zoom`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: targets.zoom }),
          });
          zoomResult = await zoomRes.json();
        } catch (e) {
          zoomResult = { error: String(e) };
        }
      }
      if (typeof targets.focus === "number") {
        try {
          const focusRes = await fetch(
            `http://localhost:3000/focus/cam2/auto`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ target: targets.focus }),
            }
          );
          focusResult = await focusRes.json();
        } catch (e) {
          focusResult = { error: String(e) };
        }
      }
    }

    res.json({
      success: true,
      camera: camId,
      preset,
      response: text,
      zoomResult,
      focusResult,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/ptz/:camId/move", async (req, res) => {
  try {
    let camId = req.params.camId;

    const { direction, speed = 8, channel = 0, duration = 200 } = req.body;

    let code,
      args = [0, 0, 0];

    switch (direction) {
      case "up":
        code = "Down";
        args = [0, speed, 0];
        camId = "cam1";
        break;
      case "down":
        code = "Up";
        args = [0, speed, 0];
        camId = "cam1";
        break;
      case "left":
        code = "Left";
        args = [0, speed, 0];
        camId = "cam1";
        break;
      case "right":
        code = "Right";
        args = [0, speed, 0];
        camId = "cam1";
        break;
      case "zoom_in":
        code = "ZoomTele";
        args = [0, 0, speed];
        break;
      case "zoom_out":
        code = "ZoomWide";
        args = [0, 0, speed];
        break;

      default:
        throw new Error("Invalid direction");
    }
    const { client, ip } = getCameraClient(camId);

    const startUrl = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=${code}&arg1=${args[0]}&arg2=${args[1]}&arg3=${args[2]}`;

    const response = await client.fetch(startUrl);
    console.log(response);
    const text = await response.text();
    // Fetch PTZ status after move
    let ptzStatus = null;
    try {
      const statusRes = await client.fetch(
        `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
      );
      ptzStatus = await statusRes.text();
    } catch (statusErr) {
      ptzStatus = `Failed to fetch PTZ status: ${statusErr}`;
    }
    console.log(ptzStatus);
    res.json({
      success: true,
      camera: camId,
      action: direction,
      response: text,
      ptzStatus,
      stoppedAfter: duration,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/ptz/:camId/stop", async (req, res) => {
  try {
    let camId = req.params.camId;
    const { direction, channel = 0, speed = 8 } = req.body;

    let code;
    switch (direction) {
      case "up":
        code = "Up";
        camId = "cam1";
        break;
      case "down":
        code = "Down";
        camId = "cam1";
        break;
      case "left":
        code = "Left";
        camId = "cam1";
        break;
      case "right":
        code = "Right";
        camId = "cam1";
        break;
      case "zoom_in":
        code = "ZoomTele";
        break;
      case "zoom_out":
        code = "ZoomWide";
        break;
      default:
        throw new Error("Invalid direction");
    }

    const { client, ip } = getCameraClient(camId);

    const url = `http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=${channel}&code=${code}&arg1=${speed}&arg2=0&arg3=0`;
    const response = await client.fetch(url);
    const text = await response.text();

    res.json({
      success: true,
      camera: camId,
      stopped: direction,
      response: text,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getCameraClient(camId: string) {
  const cfg: CameraInfo = cameras[camId] as CameraInfo;
  if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
  return { client: new DigestFetch(cfg.username, cfg.password), ip: cfg.ip };
}

// Continuous PTZFocusHD monitoring (runs independently)
async function monitorPTZFocusHD(camId: string) {
  try {
    const { client, ip } = getCameraClient(camId);
    const statusRes = await client.fetch(
      `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`
    );
    const statusText = await statusRes.text();
    const match = statusText.match(/status\.PTZFocusHD=([\d\.\-]+)/);

    if (match) {
      const focusValue = parseFloat(match[1]);
      console.log(`PTZFocusHD: ${focusValue}`);
    }
  } catch (err: any) {
    console.error("Error fetching PTZFocusHD:", err.message);
  }
}

// Start monitoring PTZFocusHD every 1 second
setInterval(() => {
  monitorPTZFocusHD("cam2");
}, 1000);

async function getDevice(camId: string) {
  const cfg: CameraInfo = cameras[camId] as CameraInfo;
  if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
  console.log(`http://${cfg.ip}:80/onvif/device_service`);
  const device = new onvif.OnvifDevice({
    xaddr: `http://${cfg.ip}:80/onvif/device_service`,
    user: cfg?.username,
    pass: cfg?.password,
  });

  await device.init();
  device.services.device
    .getCapabilities()
    .then((result: any) => {
      console.log(result);
    })
    .catch((error: any) => {
      console.error(error);
    });
  return device;
}

app.post("/focus/:camId/in", async (req, res) => {
  try {
    const { camId } = req.params;
    const device = await getDevice(camId);
    const profile = device.getCurrentProfile();
    const token = profile.token;
    const response = await focusMove(camId, 1, token); // speed 0.5 = focus in
    res.json({ message: "Focus in started", response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/focus/:camId/out", async (req, res) => {
  try {
    const { camId } = req.params;
    const device = await getDevice(camId);
    const profile = device.getCurrentProfile();
    const token = profile.token;
    const response = await focusMove(camId, 1, token); // speed -0.5 = focus out
    res.json({ message: "Focus out started", response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/focus/:camId/stop", async (req, res) => {
  try {
    const { camId } = req.params;

    const device = await getDevice(camId);
    const profile = device.getCurrentProfile();
    const token = profile.token;
    const response = await focusStop(camId, token);
    res.json({ message: "Focus stopped", response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/pelcoD", async (req: Request, res: Response) => {
  const body = req.body as PtzCommand;

  try {
    await executeCommand(body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[PTZ] Error executing command:", err);
    res.status(500).json({
      ok: false,
      error: err?.message ?? "Unknown error",
    });
  }
});

// SMART Protocol API - QPI-SMART Intelligence Protocol
app.post("/smart/:camId/command", async (req: Request, res: Response) => {
  try {
    const camId = req.params.camId;
    const { data } = req.body;

    // Validate data is string
    if (!data || typeof data !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Invalid Pelco-D frame data. Expected hex string.",
        errorCode: 0xe1, // Invalid parameters
      });
    }

    // Convert hex string to byte array
    // Remove any spaces, 0x prefixes, and convert to bytes
    const cleanHex = data.replace(/[\s]/g, '').replace(/0x/gi, '');
    console.log(cleanHex)
    if (cleanHex.length !== 14) { // 7 bytes = 14 hex chars
      return res.status(400).json({
        success: false,
        error: `Invalid Pelco-D frame data. Expected 7 bytes (14 hex characters), got ${cleanHex.length / 2} bytes.`,
        errorCode: 0xe1,
        receivedData: cleanHex,
      });
    }

    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }

    // Parse Pelco-D SMART frame
    // Byte 1: 0xFA (Header SMART)
    // Byte 2: Camera ID
    // Byte 3: SMART_CMD
    // Byte 4: Param 1
    // Byte 5: Param 2
    // Byte 6: Param 3
    // Byte 7: Checksum
    const header = bytes[0];
    const cameraId = bytes[1];
    const smartCmd = bytes[2];
    const param1 = bytes[3];
    const param2 = bytes[4];
    const param3 = bytes[5];
    const receivedChecksum = bytes[6];

    // Validate required parameters are defined
    if (cameraId === undefined || smartCmd === undefined || param1 === undefined || param2 === undefined || param3 === undefined) {
      return res.status(400).json({
        success: false,
        error: "Invalid frame data: missing required parameters",
        errorCode: 0xe1,
      });
    }

    // Validate header
    if (header !== 0xfa) {
      return res.status(400).json({
        success: false,
        error: `Invalid SMART header. Expected 0xFA, got 0x${header.toString(16).toUpperCase()}`,
        errorCode: 0xe1,
      });
    }

    // Validate SMART command
    const validCommands = [0x10, 0x20, 0x30, 0x40];
    if (smartCmd === undefined || !validCommands.includes(smartCmd)) {
      return res.status(400).json({
        success: false,
        error: `Invalid SMART command: 0x${smartCmd !== undefined ? smartCmd.toString(16).toUpperCase() : 'undefined'}`,
        errorCode: 0xe0, // Command not supported
      });
    }

    // Calculate and verify checksum (sum of bytes 2-6)
    const calculatedChecksum = (cameraId + smartCmd + param1 + param2 + param3) % 256;

    if (calculatedChecksum !== receivedChecksum) {
      return res.status(400).json({
        success: false,
        error: `Checksum mismatch. Expected 0x${calculatedChecksum.toString(16).toUpperCase()}, got 0x${receivedChecksum.toString(16).toUpperCase()}`,
        errorCode: 0xe1,
      });
    }

    // Build SMART packet format
    const packet = {
      header: header,
      cameraId: cameraId,
      smartCmd: smartCmd,
      param1: param1,
      param2: param2,
      param3: param3,
    };

    const smartPacket = {
      ...packet,
      checksum: receivedChecksum,
    };

    // Log the command for debugging
    console.log("[SMART Protocol] Command:", {
      camId,
      command: `0x${smartCmd.toString(16).toUpperCase()}`,
      params: [param1, param2, param3],
      packet: smartPacket,
    });

    // Command-specific handling
    let commandName = "Unknown";
    let description = "";

    switch (smartCmd) {
      case 0x10: // Rapid Focus Adaptation
        commandName = "Rapid Focus Adaptation";
        const focusModes = ["Auto", "Low-Light", "Fast-Moving"];
        description = `Mode: ${focusModes[param1] || "Unknown"}`;
        break;

      case 0x20: // Multi-Object Classification Snapshot
        commandName = "Multi-Object Classification Snapshot";
        description = "Scan intelligent - awaiting response on port 52383";
        break;

      case 0x30: // Smart Tracking Lock
        commandName = "Smart Tracking Lock";
        const trackingModes = ["Normal", "Aggressive", "Stealth"];
        description = `Object ID: ${param1}, Mode: ${trackingModes[param2] || "Unknown"}`;
        break;

      case 0x40: // Auto-Record + Edge Learning Trigger
        commandName = "Auto-Record + Edge Learning";
        const reasons = ["Manual", "Object", "Alert"];
        description = `${param1 ? "Start" : "Stop"} - Reason: ${reasons[param2] || "Unknown"}, Duration: ${param3}s`;
        break;
    }

    // Simulate sending to camera (replace with actual serial/network communication)
    // In production, you would send this via UDP/TCP to the camera's control port

    res.json({
      success: true,
      camera: camId,
      command: commandName,
      description,
      packet: smartPacket,
      packetHex: [
        `0x${packet.header.toString(16).toUpperCase()}`,
        `0x${packet.cameraId.toString(16).toUpperCase()}`,
        `0x${packet.smartCmd.toString(16).toUpperCase()}`,
        `0x${packet.param1.toString(16).toUpperCase()}`,
        `0x${packet.param2.toString(16).toUpperCase()}`,
        `0x${packet.param3.toString(16).toUpperCase()}`,
        `0x${receivedChecksum.toString(16).toUpperCase()}`,
      ],
      ports: {
        aiMap: 52383, // AI-MAP Stream (Object positions)
        aiEvent: 52384, // AI-Event Stream
        recording: 52385, // Auto-Record stream
      },
    });
  } catch (err: any) {
    console.error("[SMART Protocol] Error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      errorCode: 0xe4, // Generic error
    });
  }
});

// AI-MAP Stream parser helper endpoint
app.post("/smart/:camId/parse-aimap", async (req: Request, res: Response) => {
  try {
    const { data } = req.body; // Expected: array of bytes or hex string

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ success: false, error: "Invalid data format" });
    }

    const objects = [];
    let i = 1; // Skip header 0xFB
    const nbObjects = data[i++];

    const objectTypes: Record<number, string> = {
      0x01: "Human",
      0x02: "Car",
      0x03: "Truck",
      0x04: "Motorcycle",
      0x05: "Animal",
      0x06: "Static Object",
    };

    for (let obj = 0; obj < nbObjects; obj++) {
      const objectId = data[i++];
      const objectType = data[i++];
      const posX = data[i++];
      const posY = data[i++];
      const posZ = data[i++];
      const velocity = data[i++];
      const direction = data[i++];
      const timestamp = (data[i++] << 24) | (data[i++] << 16) | (data[i++] << 8) | data[i++];

      objects.push({
        id: objectId,
        type: objectTypes[objectType] || "Unknown",
        typeCode: `0x${objectType.toString(16).toUpperCase()}`,
        position: { x: posX, y: posY, z: posZ },
        velocity,
        direction,
        timestamp,
      });
    }

    res.json({
      success: true,
      totalObjects: nbObjects,
      objects,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI-Event Stream parser helper endpoint
app.post("/smart/:camId/parse-aievent", async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ success: false, error: "Invalid data format" });
    }

    const eventTypes: Record<number, string> = {
      0x10: "Intrusion",
      0x11: "Line Crossing",
      0x12: "Loitering",
      0x13: "Abandoned Object",
      0x14: "Reverse Motion",
      0x15: "Crowd Density Alert",
    };

    let i = 1; // Skip header 0xFC
    const eventType = data[i++];
    const objectId = data[i++];
    const posX = data[i++];
    const posY = data[i++];
    const posZ = data[i++];
    const extraData = data[i++];
    const timestamp = (data[i++] << 24) | (data[i++] << 16) | (data[i++] << 8) | data[i++];

    res.json({
      success: true,
      event: {
        type: eventTypes[eventType] || "Unknown",
        typeCode: `0x${eventType.toString(16).toUpperCase()}`,
        objectId,
        position: { x: posX, y: posY, z: posZ },
        extraData,
        timestamp,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Error codes reference endpoint
app.get("/smart/error-codes", (req: Request, res: Response) => {
  res.json({
    errorCodes: {
      "0xE0": "Command not supported",
      "0xE1": "Invalid parameters",
      "0xE2": "Object not found",
      "0xE3": "Camera busy (Tracking Mode)",
      "0xE4": "Focus System Error",
      "0xE5": "Learning Engine Disabled",
    },
  });
});

app.listen(PORT, async () => {
  await discoverCameras();

  console.log(`Service Backend server running on http://localhost:${PORT}`);
});
