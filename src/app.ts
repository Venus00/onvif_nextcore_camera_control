import express from "express";
import bodyParser from "body-parser";
import { CameraInfo, cameras,type VideoEncoderConfig } from "./util/camera";
import { getVideoEncoderConfiguration, setVideoEncoderConfiguration } from "./util/api";
import onvif from 'node-onvif';
//{"pan":0.5,"tilt":0.2,"zoom":0.1,"time":2,"stop":true}
//rtsp://192.168.10.57:8554/cam1
async function discoverCameras() {
  try {
    console.log('Starting ONVIF discovery...');
    
    onvif.startDiscovery((info) => {
        // Show the information of the found device
        console.log("here is the result")
        console.log(JSON.stringify(info, null, '  '));
        onvif.startProbe().then((device_list) => {
            // Show the information of the found devices
            console.log(JSON.stringify(device_list, null, '  '));
          }).catch((error) => {
            console.error(error);
          });
      });
      setTimeout(() => {
           onvif.startDiscovery()
      }, 3000);
     
  } catch (err) {
    console.error('Error during discovery:', err);
  }
}

// Run the scan
//discoverCameras();
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
      const { pan, tilt, zoom, speed, time } = req.body;
  
      const device = await getDevice(camId);
  
      // Get first profile (most cameras have at least one)
      const profile = device.getCurrentProfile();
      const token = profile.token;
      console.log(token)
      // Move PTZ
      const result =await device.ptzMove({
        speed: {
          x: pan ?? 0.0,  // pan speed -1 to 1
          y: tilt ?? 0.0, // tilt speed -1 to 1
          z: zoom ?? 0.0  // zoom speed -1 to 1
        },
        timeout: time   // in seconds
      });
      console.log("result")
    //   // Stop PTZ after timeout if requested
      if (req.body.stop) {
        await device.ptzStop({
            profileToken: token,
            panTilt: true,
            zoom: true
          });
      }
  
      res.json({ success: true, result });
    } catch (err:any) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

async function getDevice(camId:string) {
    const cfg :CameraInfo = cameras[camId] as CameraInfo;
    if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
    console.log(`http://${cfg.ip}:8899/onvif/device_service`)
    const device = new onvif.OnvifDevice({
      xaddr: `http://${cfg.ip}:8899/onvif/device_service`,
      user: cfg?.username,
      pass: cfg?.password
    });
  
    await device.init();
    return device;
}



app.listen(PORT, () => console.log(`Service Backend server running on http://localhost:${PORT}`));
