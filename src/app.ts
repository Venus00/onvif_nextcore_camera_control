
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
app.post('/ptz/:camId/preset', async (req, res) => {
  try {
    console.log("preset", req.body)
    const camId = req.params.camId;
    const { preset } = req.body; // expects a number, e.g., 100 or 35
    const { client, ip } = getCameraClient('cam1');

    // Move to preset using CGI configManager API (GotoPreset)
    // Example: http://<ip>/cgi-bin/configManager.cgi?action=setConfig&PtzPreset[0][<preset>].Enable=true
    const url = `http://${ip}/cgi-bin/configManager.cgi?action=setConfig&PtzPreset[0][1].Name=No1`;
    const response = await client.fetch(url, { method: 'POST' });
    const text = await response.text();
    console.log(text)
    res.json({ success: true, camera: camId, preset, response: text });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/ptz/:camId/move', async (req, res) => {
  try {
    const camId = req.params.camId;

    const { direction, speed = 8, channel = 0, duration = 200 } = req.body;

    const { client, ip } = getCameraClient("cam1");

    let code, args = [0, 0, 0];

    switch (direction) {
      case 'up': code = 'Up'; args = [0, speed, 0]; break;
      case 'down': code = 'Down'; args = [0, speed, 0]; break;
      case 'left': code = 'Left'; args = [0, speed, 0]; break;
      case 'right': code = 'Right'; args = [0, speed, 0]; break;
      case 'zoom_in': code = 'ZoomTele'; args = [0, 0, speed]; break;
      case 'zoom_out': code = 'ZoomWide'; args = [0, 0, speed]; break;
      default: throw new Error("Invalid direction");
    }

    const startUrl = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=${code}&arg1=${args[0]}&arg2=${args[1]}&arg3=${args[2]}`;

    const response = await client.fetch(startUrl);
    const text = await response.text();
    res.json({ success: true, camera: camId, action: direction, response: text, stoppedAfter: duration });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post('/ptz/:camId/stop', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { direction, channel = 0, speed = 8 } = req.body;
    const { client, ip } = getCameraClient('cam1');

    let code;
    switch (direction) {
      case 'up': code = 'Up'; break;
      case 'down': code = 'Down'; break;
      case 'left': code = 'Left'; break;
      case 'right': code = 'Right'; break;
      case 'zoom_in': code = 'ZoomTele'; break;
      case 'zoom_out': code = 'ZoomWide'; break;
      default: throw new Error("Invalid direction");
    }
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
