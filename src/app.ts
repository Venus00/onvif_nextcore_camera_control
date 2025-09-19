import express from "express";
import bodyParser from "body-parser";
import { CameraInfo, cameras,type VideoEncoderConfig } from "./util/camera";
import { focusMove, focusStop, getVideoEncoderConfiguration, setVideoEncoderConfiguration } from "./util/api";
import onvif from 'node-onvif';
import cors from 'cors';

//{"pan":0.5,"tilt":0.2,"zoom":0.1,"time":2,"stop":true}
async function discoverCameras() {
  console.log("Starting ONVIF discovery...");
  try {
    onvif.startDiscovery(
      (deviceInfo) => console.log(deviceInfo),
      { iface: "192.168.11.104" } // your server IP on camera subnet
    );
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

        const config:VideoEncoderConfig  = req.body; // {encoding, width, height, framerate, bitrate, quality, govLength, profile}
        const result = await setVideoEncoderConfiguration("cam1",config);
        console.log("Set Response:", result);
        res.status(200).json({ message: "Encoder configuration set successfully" });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});


app.post('/ptz/:camId/move', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { direction, time,speed } = req.body; // direction: "up", "down", "left", "right", "zoom_in", "zoom_out", "stop"

    const device = await getDevice(camId);
    console.log("device",device)
    const profile = device.getCurrentProfile();
    console.log("profile",profile)
    const token = profile.token;
    let focus = 0.0;
    // Default speed values
    let velocity = { x: 0.0, y: 0.0, z: 0.0 };

    switch (direction) {
      case 'up':
        velocity.y = speed / 5;
        break;
      case 'down':
        velocity.y = -speed / 5;
        break;
      case 'left':
        velocity.x = -speed / 5;
        break;
      case 'right':
        velocity.x = speed / 5;
        break;
      case 'zoom_in':
        velocity.z = speed / 5;
        break;
      case 'zoom_out':
        velocity.z = -speed / 5;
        break;
      case 'focus_in':
        focus = speed / 5;
        await device.services.imaging?.move({
          VideoSourceToken: profile.videoSource.token,
          Focus: { Continuous: { Speed: 0.5 } }
        });
        
        // Stop focusing
        await device.services.imaging?.stop({
          VideoSourceToken: profile.videoSource.token,
          Focus: true
        });
        return res.json({ success: true, action: 'focus_in' });
      case 'focus_out':
        focus = -(speed / 5);
        await device.ptzMove({
          profileToken: token,
          speed: { x: 0.0, y: 0.0, z: 0.0 },
          focus: { x: focus },
          timeout: time ? `PT${time}S` : 'PT1S'
        });
      case 'stop':
        await device.ptzStop({ profileToken: token, panTilt: true, zoom: true });
        return res.json({ success: true, action: 'stopped' });
      default:
        return res.status(400).json({ success: false, error: 'Invalid direction' });
    }
    // Perform PTZ move
    const result = await device.ptzMove({
      profileToken: token,
      speed: velocity,
      timeout: time ? `PT${time}S` : 'PT1S' // default 1 second if not provided
    });

    res.json({ success: true, result });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});



async function getDevice(camId:string) {
    const cfg :CameraInfo = cameras[camId] as CameraInfo;
    if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
    console.log(`http://${cfg.ip}:80/onvif/device_service`)
    const device = new onvif.OnvifDevice({
      xaddr: `http://${cfg.ip}:80/onvif/device_service`,
      user: cfg?.username,
      pass: cfg?.password
    });
    const service = new onvif.OnvifServiceDevice({
      xaddr: `http://${cfg.ip}:80/onvif/device_service`,
      user: cfg?.username,
      pass: cfg?.password
    });
    console.log("service",service.getCapabilities())
    await device.init();
    return device;
}
app.post('/focus/:camId/in', async (req, res) => {
  try {
    const { camId } = req.params;
    const device = await getDevice(camId);
    const profile = device.getCurrentProfile();
    const token = profile.token;
    const response = await focusMove(camId, 1,token); // speed 0.5 = focus in
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
    const response = await focusMove(camId, 1,token); // speed -0.5 = focus out
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
    const response = await focusStop(camId,token);
    res.json({ message: "Focus stopped", response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(PORT, async () => {
  await  discoverCameras()
  
  console.log(`Service Backend server running on http://localhost:${PORT}`)});
