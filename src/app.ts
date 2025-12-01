

import express from "express";
import bodyParser from "body-parser";
import { CameraInfo, cameras, type VideoEncoderConfig } from "./util/camera";
import { focusMove, focusStop, getVideoEncoderConfiguration, setVideoEncoderConfiguration } from "./util/api";
import onvif from 'node-onvif';
// @ts-ignore
import cors from 'cors';
// Use require for digest-fetch to avoid ESM/CJS import issues
// @ts-ignore
import DigestFetch from 'digest-fetch'
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

app.post('/ptz/:camId/zoom', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { client, ip } = getCameraClient(camId);

    // Configurable target and tolerance
    const target = typeof req.body.target === 'number' ? req.body.target : 44;
    const tolerance = typeof req.body.tolerance === 'number' ? req.body.tolerance : 1;
    const maxTries = typeof req.body.maxTries === 'number' ? req.body.maxTries : 100;
    const pollInterval = typeof req.body.pollInterval === 'number' ? req.body.pollInterval : 100; // ms

    // Get initial zoom value
    let zoomValue: number | null = null;
    let stopped = false;
    let tries = 0;
    let direction: 'in' | 'out' | null = null;
    let code: string | null = null;

    // Fetch initial zoom value
    const statusResInit = await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=getStatus`);
    const statusTextInit = await statusResInit.text();
    console.log(statusTextInit)
    const matchInit = statusTextInit.match(/status\.ZoomValue=([\d\.\-]+)/);
    if (matchInit) {
      zoomValue = parseFloat(matchInit[1]);
    }
    if (zoomValue === null) throw new Error('Could not read initial zoom value');

    // Decide initial direction
    if (zoomValue < target - tolerance) {
      direction = 'in';
      code = 'ZoomTele';
    } else if (zoomValue > target + tolerance) {
      direction = 'out';
      code = 'ZoomWide';
    } else {
      // Already within range
      return res.json({ success: true, camera: camId, zoomValue, stopped: true, message: 'Already within target range' });
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
      const burst = 200;

      await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=${currentZoomCommand}&arg1=0&arg2=0&arg3=${speed}`);
      await new Promise(r => setTimeout(r, burst));
      await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=0&code=${currentZoomCommand}&arg1=${speed}&arg2=0&arg3=0`);
      // Wait a moment for camera to settle
      await new Promise(r => setTimeout(r, 50));
      // Check status
      const statusRes = await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=getStatus`);
      const statusText = await statusRes.text();
      console.log(statusText)
      const match = statusText.match(/status\.ZoomValue=([\d\.\-]+)/);
      if (match) {
        zoomValue = parseFloat(match[1]);
        if (zoomValue >= target - tolerance && zoomValue <= target + tolerance) {
          stopped = true;
          break;
        }
        // If we cross the range, change direction
        if (direction === 'in' && zoomValue > target + tolerance) {
          direction = 'out';
          currentZoomCommand = 'ZoomWide';
        } else if (direction === 'out' && zoomValue < target - tolerance) {
          direction = 'in';
          currentZoomCommand = 'ZoomTele';
        }
      }
      tries++;
    }

    res.json({ success: true, camera: camId, zoomValue, stopped, target, tolerance });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Focus auto-move endpoint (like zoom)
app.post('/focus/:camId/auto', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { client, ip } = getCameraClient(camId);

    // Configurable target and tolerance
    const target = typeof req.body.target === 'number' ? req.body.target : 25137;
    const tolerance = typeof req.body.tolerance === 'number' ? req.body.tolerance : 200;
    const maxTries = typeof req.body.maxTries === 'number' ? req.body.maxTries : 100;
    const pollInterval = typeof req.body.pollInterval === 'number' ? req.body.pollInterval : 100; // ms

    // Get initial focus value
    let focusValue: number | null = null;
    let stopped = false;
    let tries = 0;
    let direction: 'in' | 'out' | null = null;
    let code: string | null = null;

    // Fetch initial focus value
    const statusResInit = await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=getStatus`);
    const statusTextInit = await statusResInit.text();
    console.log(statusTextInit)
    const matchInit = statusTextInit.match(/status\.PTZFocusHD=([\d\.\-]+)/);
    if (matchInit) {
      focusValue = parseFloat(matchInit[1]);
    }
    if (focusValue === null) throw new Error('Could not read initial focus value');

    // Decide initial direction
    if (focusValue < target - tolerance) {
      direction = 'in';
      code = 'FocusNear';
    } else if (focusValue > target + tolerance) {
      direction = 'out';
      code = 'FocusFar';
    } else {
      // Already within range
      return res.json({ success: true, camera: camId, focusValue, stopped: true, message: 'Already within target range' });
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

      await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=${currentFocusCommand}&arg1=0&arg2=0&arg3=${speed}`);
      await new Promise(r => setTimeout(r, burst));
      await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=0&code=${currentFocusCommand}&arg1=0&arg2=0&arg3=0`);
      // Wait a moment for camera to settle
      await new Promise(r => setTimeout(r, 50));
      // Check status
      const statusRes = await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=getStatus`);
      const statusText = await statusRes.text();
      console.log(statusText)
      const match = statusText.match(/status\.PTZFocusHD=([\d\.\-]+)/);
      if (match) {
        focusValue = parseFloat(match[1]);
        if (focusValue >= target - tolerance && focusValue <= target + tolerance) {
          stopped = true;
          break;
        }
        // If we cross the range, change direction
        if (direction === 'in' && focusValue > target + tolerance) {
          direction = 'out';
          currentFocusCommand = 'FocusFar';
        } else if (direction === 'out' && focusValue < target - tolerance) {
          direction = 'in';
          currentFocusCommand = 'FocusNear';
        }
      }
      tries++;
    }

    res.json({ success: true, camera: camId, focusValue, stopped, target, tolerance });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.post('/ptz/:camId/position3d', async (req, res) => {
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


app.post('/focus/:camId/move', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { direction, speed = 5, channel = 0 } = req.body;
    const { client, ip } = getCameraClient(camId);
    let code;
    if (direction === 'focus_in') code = 'FocusNear';
    else if (direction === 'focus_out') code = 'FocusFar';
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

app.post('/focus/:camId/stop', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { direction, channel = 0, speed = 3 } = req.body;
    const { client, ip } = getCameraClient(camId);

    let code;
    if (direction === 'focus_in') code = 'FocusNear';
    else if (direction === 'focus_out') code = 'FocusFar';
    else throw new Error("Invalid direction (use 'focus_in' or 'focus_out')");

    const url = `http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=${channel}&code=${code}&arg1=0&arg2=0&arg3=0`;
    const response = await client.fetch(url);
    const text = await response.text();

    res.json({ success: true, camera: camId, stopped: direction, response: text });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PTZ preset movement handler
// Preset-specific zoom/focus targets
const presetTargets: Record<number, { zoom?: number, focus?: number }> = {
  1: { zoom: 1000, focus: 5000 },
  2: { zoom: 2000, focus: 10000 },
  3: { zoom: 3000, focus: 15000 },
  4: { zoom: 4000, focus: 20000 },
  5: { zoom: 5000, focus: 25000 },
};

app.post('/ptz/:camId/preset', async (req, res) => {
  try {
    console.log("preset", req.body)
    const camId = req.params.camId;
    const { preset } = req.body; // expects a number, e.g., 1, 2, 3, 4, 5
    const { client, ip } = getCameraClient('cam1');

    // Move to preset using CGI configManager API (GotoPreset)
    const url = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=GotoPreset&arg1=0&arg2=${preset}&arg3=0&arg4=null`;
    const response = await client.fetch(url);
    const text = await response.text();
    console.log(text)

    // After preset move, trigger zoom/focus if targets defined
    const targets = presetTargets[preset];
    let zoomResult = null;
    let focusResult = null;
    if (targets) {
      if (typeof targets.zoom === 'number') {
        try {
          const zoomRes = await fetch(`http://localhost:3000/ptz/${camId}/zoom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: targets.zoom })
          });
          zoomResult = await zoomRes.json();
        } catch (e) {
          zoomResult = { error: String(e) };
        }
      }
      if (typeof targets.focus === 'number') {
        try {
          const focusRes = await fetch(`http://localhost:3000/focus/${camId}/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: targets.focus })
          });
          focusResult = await focusRes.json();
        } catch (e) {
          focusResult = { error: String(e) };
        }
      }
    }

    res.json({ success: true, camera: camId, preset, response: text, zoomResult, focusResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/ptz/:camId/move', async (req, res) => {
  try {
    let camId = req.params.camId;

    const { direction, speed = 8, channel = 0, duration = 200 } = req.body;

    let code, args = [0, 0, 0];

    switch (direction) {
      case 'up': code = 'Down'; args = [0, speed, 0]; camId = "cam1"; break;
      case 'down': code = 'Up'; args = [0, speed, 0]; camId = "cam1"; break;
      case 'left': code = 'Left'; args = [0, speed, 0]; camId = "cam1"; break;
      case 'right': code = 'Right'; args = [0, speed, 0]; camId = "cam1"; break;
      case 'zoom_in': code = 'ZoomTele'; args = [0, 0, speed]; break;
      case 'zoom_out': code = 'ZoomWide'; args = [0, 0, speed]; break;

      default: throw new Error("Invalid direction");
    }
    const { client, ip } = getCameraClient(camId);

    const startUrl = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=${code}&arg1=${args[0]}&arg2=${args[1]}&arg3=${args[2]}`;

    const response = await client.fetch(startUrl);
    console.log(response)
    const text = await response.text();
    // Fetch PTZ status after move
    let ptzStatus = null;
    try {
      const statusRes = await client.fetch(`http://${ip}/cgi-bin/ptz.cgi?action=getStatus`);
      ptzStatus = await statusRes.text();
    } catch (statusErr) {
      ptzStatus = `Failed to fetch PTZ status: ${statusErr}`;
    }
    console.log(ptzStatus)
    res.json({ success: true, camera: camId, action: direction, response: text, ptzStatus, stoppedAfter: duration });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post('/ptz/:camId/stop', async (req, res) => {
  try {
    let camId = req.params.camId;
    const { direction, channel = 0, speed = 8 } = req.body;

    let code;
    switch (direction) {
      case 'up': code = 'Up'; camId = "cam1"; break;
      case 'down': code = 'Down'; camId = "cam1"; break;
      case 'left': code = 'Left'; camId = "cam1"; break;
      case 'right': code = 'Right'; camId = "cam1"; break;
      case 'zoom_in': code = 'ZoomTele'; break;
      case 'zoom_out': code = 'ZoomWide'; break;
      default: throw new Error("Invalid direction");
    }

    const { client, ip } = getCameraClient(camId);

    const url = `http://${ip}/cgi-bin/ptz.cgi?action=stop&channel=${channel}&code=${code}&arg1=${speed}&arg2=0&arg3=0`;
    const response = await client.fetch(url);
    const text = await response.text();

    res.json({ success: true, camera: camId, stopped: direction, response: text });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// app.post('/ptz/:camId/move', async (req, res) => {
//   try {
//     const camId = req.params.camId;
//     const { direction, time,speed } = req.body; // direction: "up", "down", "left", "right", "zoom_in", "zoom_out", "stop"

//     const device = await getDevice(camId);
//     console.log("device",device)
//     const profile = device.getCurrentProfile();
//     console.log("profile",profile)
//     const token = profile.token;
//     let focus = 0.0;
//     // Default speed values
//     let velocity = { x: 0.0, y: 0.0, z: 0.0 };

//     switch (direction) {
//       case 'up':
//         velocity.y = speed / 5;
//         break;
//       case 'down':
//         velocity.y = -speed / 5;
//         break;
//       case 'left':
//         velocity.x = -speed / 5;
//         break;
//       case 'right':
//         velocity.x = speed / 5;
//         break;
//       case 'zoom_in':
//         velocity.z = speed / 5;
//         break;
//       case 'zoom_out':
//         velocity.z = -speed / 5;
//         break;
//       case 'stop':
//         await device.ptzStop({ profileToken: token, panTilt: true, zoom: true });
//         return res.json({ success: true, action: 'stopped' });
//       default:
//         return res.status(400).json({ success: false, error: 'Invalid direction' });
//     }
//     // Perform PTZ move
//     const result = await device.ptzMove({
//       profileToken: token,
//       speed: velocity,
//       timeout: time ? `PT${time}S` : 'PT1S' // default 1 second if not provided
//     });

//     res.json({ success: true, result });
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

function getCameraClient(camId: string) {
  const cfg: CameraInfo = cameras[camId] as CameraInfo;
  if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
  return { client: new DigestFetch(cfg.username, cfg.password), ip: cfg.ip };
}

async function getDevice(camId: string) {
  const cfg: CameraInfo = cameras[camId] as CameraInfo;
  if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
  console.log(`http://${cfg.ip}:80/onvif/device_service`)
  const device = new onvif.OnvifDevice({
    xaddr: `http://${cfg.ip}:80/onvif/device_service`,
    user: cfg?.username,
    pass: cfg?.password
  });


  await device.init();
  device.services.device.getCapabilities().then((result: any) => {
    console.log(result);
  }).catch((error: any) => {
    console.error(error);
  });
  return device;
}
app.post('/focus/:camId/in', async (req, res) => {
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

app.post('/focus/:camId/out', async (req, res) => {
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

app.post('/focus/:camId/stop', async (req, res) => {
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


app.listen(PORT, async () => {
  await discoverCameras()

  console.log(`Service Backend server running on http://localhost:${PORT}`)
});
