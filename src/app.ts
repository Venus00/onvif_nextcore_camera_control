import express from "express";
import bodyParser from "body-parser";
import { CameraInfo, cameras,type VideoEncoderConfig } from "./util/camera";
import { getVideoEncoderConfiguration, setVideoEncoderConfiguration } from "./util/api";
import onvif from 'node-onvif';
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


app.post('/ptz/:camId', async (req, res) => {
  try {
    const camId = req.params.camId;
    const { pan, tilt, zoom, time, stop } = req.body;

    const device = await getDevice(camId);

    // Pick first profile
    const profile = device.getCurrentProfile();
    const token = profile.token;
    console.log("Using profile:", token);

    // Perform PTZ Move
    const result = await device.ptzMove({
      profileToken: token,
      velocity: {
        x: pan ?? 0.0,   // pan speed -1.0 to 1.0
        y: tilt ?? 0.0   // tilt speed -1.0 to 1.0
      },
      zoom: {
        x: zoom ?? 0.0   // zoom speed -1.0 to 1.0
      },
      timeout: time ? `PT${time}S` : undefined // ONVIF expects "PTxS"
    });

    console.log("PTZ Move result:", result);

    // Optionally stop after timeout
    if (stop) {
      await device.ptzStop({
        profileToken: token,
        panTilt: true,
        zoom: true
      });
    }

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
  
    await device.init();
    return device;
}



app.listen(PORT, async () => {
  await  discoverCameras()
  
  console.log(`Service Backend server running on http://localhost:${PORT}`)});
