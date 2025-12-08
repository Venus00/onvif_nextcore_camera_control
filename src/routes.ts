import express from "express";
import cors from "cors"; // <-- add this
// import DigestFetch from "digest-fetch";
// const DigestFetch = require("digest-fetch");
import DigestFetch from "digest-fetch";
import CameraSetupAPI, {
  NetworkAPI,
  PTZAPI,
  EventsAPI,
  SystemAPI,
  StorageAPI,
  LiveAPI,
  CameraClient,
} from "./util";
import { createUDPClient } from "./util/udpclient.js";

const { udpServer, wsServer } = createUDPClient({
  wsPort: 8080,
  localPort: 5013,        // Local port to bind (receive responses)
  remoteHost: '127.0.0.1', // Python server address
  remotePort: 5012,        // Python server port
  initialMessage: Buffer.from('HELLO')
});

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
      // console.log(`PTZFocusHD: ${focusValue}`);
    }
  } catch (err: any) {
    console.error("Error fetching PTZFocusHD:", err.message);
  }
}

// Start monitoring PTZFocusHD every 1 second
// setInterval(() => {
//   monitorPTZFocusHD("cam2");
// }, 1000);

const app = express();
app.use(express.json());
app.use(cors());
// ============ CAMERA CONFIGURATION ============

interface CameraInfo {
  ip: string;
  username: string;
  password: string;
}

function getCameraClient(camId: string) {
  const cfg: CameraInfo = cameras[camId] as CameraInfo;
  if (!cfg) throw new Error(`Unknown camera id: ${camId}`);
  return { client: new DigestFetch(cfg.username, cfg.password), ip: cfg.ip };
}
app.use(express.json());

// ============ CAMERA CONFIGURATION ============

interface CameraInfo {
  ip: string;
  username: string;
  password: string;
}

const cameras: Record<string, CameraInfo> = {
  cam1: { ip: "192.168.1.108", username: "admin", password: "2899100*-+" },
  cam2: { ip: "192.168.1.109", username: "admin", password: "2899100*-+" },
};

// ============ CACHED API INSTANCES ============

interface CameraAPIs {
  setup: CameraSetupAPI;
  network: NetworkAPI;
  ptz: PTZAPI;
  events: EventsAPI;
  system: SystemAPI;
  storage: StorageAPI;
  live: LiveAPI;
}

const apiCache: Record<string, CameraAPIs> = {};

async function getAPIs(camId: string): Promise<CameraAPIs> {
  if (apiCache[camId]) return apiCache[camId];

  const cam = cameras[camId];
  if (!cam) throw new Error(`Camera ${camId} not found`);

  const digestClient = new DigestFetch(cam.username, cam.password);

  const client: CameraClient = {
    async fetch(url: string) {
      const response = await digestClient.fetch(url);
      return { text: async () => await response.text() };
    },
  };

  const connection = { client, ip: cam.ip };

  apiCache[camId] = {
    setup: new CameraSetupAPI(connection),
    network: new NetworkAPI(connection),
    ptz: new PTZAPI(connection),
    events: new EventsAPI(connection),
    system: new SystemAPI(connection),
    storage: new StorageAPI(connection),
    live: new LiveAPI(connection),
  };

  return apiCache[camId];
}

// ============ HELPER ============

function route(
  handler: (apis: CameraAPIs, body: any, params: any) => Promise<any>
) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const apis = await getAPIs(req.params.camId);
      const result = await handler(apis, req.body, req.params);
      res.json({ success: true, camera: req.params.camId, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// ================================================================
// SECTION 3 - CAMERA SETUP
// ================================================================


// ================================================================
// SECTION 3 - CAMERA SETUP
// ================================================================

app.get(
  "/camera/:camId/setup",
  route(async ({ setup }) => ({ configs: await setup.getAllConfigs() }))
);

// Video Color
app.get(
  "/camera/:camId/video/color",
  route(async ({ setup }) => ({ config: await setup.getVideoColor() }))
);

app.post(
  "/camera/:camId/video/color",
  route(async ({ setup }, body) => {
    const { channel = 0, ...params } = body;
    const response = await setup.setVideoColor(params, channel);
    return { response, ok: setup.isSuccess(response) };
  })
);
// video Sharpness
app.get(
  "/camera/:camId/video/sharpness",
  route(async ({ setup }) => ({ config: await setup.getVideoSharpness() }))
);
app.post(
  "/camera/:camId/video/sharpness",
  route(async ({ setup }, body) => {
    const { channel = 0, ...params } = body;
    const response = await setup.setVideoSharpness(params, channel);
    return { response, ok: setup.isSuccess(response) };
  })
);
//vide mode
app.get(
  "/camera/:camId/video/mode", // Changed from /video/inMode
  route(async ({ setup }) => ({ config: await setup.getVideoMode() }))
);

// Add POST route
app.post(
  "/camera/:camId/video/mode",
  route(async ({ setup }, body) => {
    const { channel = 0, mode, config0, config1, timeSection } = body;
    const response = await setup.setVideoMode(
      { mode, config0, config1, timeSection },
      channel
    );
    return { response, ok: setup.isSuccess(response) };
  })
);
// Day/Night
app.get(
  "/camera/:camId/video/daynight",
  route(async ({ setup }) => ({ config: await setup.getVideoDayNight() }))
);
app.post(
  "/camera/:camId/video/daynight",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoDayNight(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// Exposure
app.get(
  "/camera/:camId/video/exposure",
  route(async ({ setup }) => ({ config: await setup.getVideoExposure() }))
);
app.post(
  "/camera/:camId/video/exposure",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoExposure(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// White Balance
app.get(
  "/camera/:camId/video/whitebalance",
  route(async ({ setup }) => ({ config: await setup.getVideoWhiteBalance() }))
);
app.post(
  "/camera/:camId/video/whitebalance",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoWhiteBalance(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);
// Zoom
app.get(
  "/camera/:camId/video/zoom",
  route(async ({ setup }) => ({ config: await setup.getVideoZoom() }))
);
app.post(
  "/camera/:camId/video/zoom",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoZoom(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// Focus
app.get(
  "/camera/:camId/video/focus",
  route(async ({ setup }) => ({ config: await setup.getVideoFocus() }))
);
app.post(
  "/camera/:camId/video/focus",

  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoFocus(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// Defog
app.get(
  "/camera/:camId/video/defog",
  route(async ({ setup }) => ({ config: await setup.getVideoDefog() }))
);
app.post(
  "/camera/:camId/video/defog",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoDefog(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// Flip
app.get(
  "/camera/:camId/video/flip",
  route(async ({ setup }) => ({ config: await setup.getVideoFlip() }))
);
app.post(
  "/camera/:camId/video/flip",

  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoFlip(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// denoise
app.get(
  "/camera/:camId/video/denoise",
  route(async ({ setup }) => ({ config: await setup.getVideoDenoise() }))
);
app.post(
  "/camera/:camId/video/denoise",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoDenoise(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);
// Backlight
app.get(
  "/camera/:camId/video/backlight",
  route(async ({ setup }) => ({ config: await setup.getVideoBacklight() }))
);

// Encode
app.get(
  "/camera/:camId/encode",
  route(async ({ setup }) => ({ config: await setup.getEncode() }))
);
app.post(
  "/camera/:camId/encode",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setEncode(params, channel);
    return { response, ok: setup.isSuccess(response) };
  })
);

app.get(
  "/camera/:camId/video/videoROI",
  route(async ({ setup }) => ({ config: await setup.getVideoROI() }))
);
app.post(
  "/camera/:camId/video/videoROI",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoROI(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// Title
app.get(
  "/camera/:camId/title",
  route(async ({ setup }) => ({ config: await setup.getChannelTitle() }))
);

// OSD
app.get(
  "/camera/:camId/osd",
  route(async ({ setup }) => ({ config: await setup.getVideoWidget() }))
);

app.post(
  "/camera/:camId/osd",
  route(async ({ setup }, body) => {
    const { channel = 0, ...params } = body;
    const response = await setup.setVideoWidget(params, channel);
    return { response, ok: setup.isSuccess(response) };
  })
);

app.post("/focus/:camId/move", async (req, res) => {
  try {
    console.log("focus move", req.body);
    const camId = 'cam2';
    const { direction, speed = 5, channel = 0 } = req.body;
    const { client, ip } = getCameraClient(camId);
    let code;
    if (direction === "focus_in") code = "FocusNear";
    else if (direction === "focus_out") code = "FocusFar";
    else throw new Error("Invalid direction (use 'in' or 'out')");

    const url = `http://${ip}/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=${code}&arg1=0&arg2=0&arg3==${speed}`;
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
    console.log("focus stop", req.body);
    const camId = 'cam2';
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

// ================================================================
// SECTION 4 - NETWORK
// ================================================================

app.get(
  "/camera/:camId/network",
  route(async ({ network }) => ({ configs: await network.getAllConfigs() }))
);
app.get(
  "/camera/:camId/network/tcpip",
  route(async ({ network }) => ({ config: await network.getNetwork() }))
);
app.get(
  "/camera/:camId/network/dvrip",
  route(async ({ network }) => ({ config: await network.getDVRIP() }))
);
app.get(
  "/camera/:camId/network/web",
  route(async ({ network }) => ({ config: await network.getWeb() }))
);
app.get(
  "/camera/:camId/network/rtsp",
  route(async ({ network }) => ({ config: await network.getRTSP() }))
);
app.get(
  "/camera/:camId/network/https",
  route(async ({ network }) => ({ config: await network.getHttps() }))
);
app.get(
  "/camera/:camId/network/upnp",
  route(async ({ network }) => ({ config: await network.getUPnP() }))
);
app.get(
  "/camera/:camId/network/multicast",
  route(async ({ network }) => ({ config: await network.getMulticast() }))
);
app.get(
  "/camera/:camId/network/qos",
  route(async ({ network }) => ({ config: await network.getQoS() }))
);
app.get(
  "/camera/:camId/network/onvif",
  route(async ({ network }) => ({ config: await network.getONVIF() }))
);

app.post(
  "/camera/:camId/network/rtsp",
  route(async ({ network }, body) => {
    const response = await network.setRTSP(body);
    return { response, ok: network.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/network/onvif",
  route(async ({ network }, body) => {
    const response = await network.setONVIF(body.enable);
    return { response, ok: network.isSuccess(response) };
  })
);

// ================================================================
// SECTION 5 - PTZ
// ================================================================

app.get(
  "/camera/:camId/ptz",
  route(async ({ ptz }) => ({ configs: await ptz.getAllConfigs() }))
);
app.get(
  "/camera/:camId/ptz/status",
  route(async ({ ptz }) => ({ status: await ptz.getPTZStatus() }))
);
app.get(
  "/camera/:camId/ptz/presets",
  route(async ({ ptz }) => ({ presets: await ptz.getPresets() }))
);
app.get(
  "/camera/:camId/ptz/tours",
  route(async ({ ptz }) => ({ tours: await ptz.getTours() }))
);
app.get(
  "/camera/:camId/ptz/scantours",
  route(async ({ ptz }) => ({ scanTours: await ptz.getScanTours() }))
);
app.get(
  "/camera/:camId/ptz/autoscan",
  route(async ({ ptz }) => ({ autoScan: await ptz.getAutoScan() }))
);
app.get(
  "/camera/:camId/ptz/idlemotion",
  route(async ({ ptz }) => ({ idleMotion: await ptz.getIdleMotion() }))
);
app.get(
  "/camera/:camId/ptz/powerup",
  route(async ({ ptz }) => ({ powerUp: await ptz.getPowerUp() }))
);

// PTZ Control
app.post(
  "/camera/:camId/ptz/move/up",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveUp(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/down",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveDown(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/left",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveLeft(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/right",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveRight(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/wiper/on",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.wiperOn(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/stop",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.stopMove(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/zoom/in",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.zoomIn(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/zoom/out",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.zoomOut(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/zoom/stop",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.stopZoom(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);


app.post(
  "/camera/:camId/ptz/focus/stop",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.stopFocus(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/focus/near",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.focusNear(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/focus/far",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.focusFar(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/preset/goto",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    console.log("Going to preset", presetId, "on channel", channel);
    const response = await ptz.gotoPreset(presetId.id, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/preset/set",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    console.log("Setting preset", presetId, "on channel", channel);
    let params = { Name: presetId.Name }  ;

    if(presetId.Name){  await ptz.setPresetConfig( presetId.Name, channel, presetId.id); }



//   Name: presetId.Name,

    let response = await ptz.setPreset( presetId.id, channel, presetId.id);

    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/preset/clear",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    console.log("Clearing preset", presetId, "on channel", channel);
    const response = await ptz.clearPreset(presetId.id, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/tour/start",
  route(async ({ ptz }, body) => {
    const { tourId, channel = 0 } = body;
    const response = await ptz.startTour(tourId, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/tour/stop",
  route(async ({ ptz }, body) => {
    const { tourId, channel = 0 } = body;
    const response = await ptz.stopTour(tourId, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/position",
  route(async ({ ptz }, body) => {
    const { pan, tilt, zoom, channel = 0 } = body;
    const response = await ptz.positionAbsolute(pan, tilt, zoom, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/light/on",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.lightOn(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/light/off",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.lightOff(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/wiper",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.wiperOn(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

// ================================================================
// SECTION 6 - EVENTS
// ================================================================

app.get(
  "/camera/:camId/events",
  route(async ({ events }) => ({ configs: await events.getAllConfigs() }))
);
app.get(
  "/camera/:camId/events/motion",
  route(async ({ events }) => ({ config: await events.getMotionDetect() }))
);
app.get(
  "/camera/:camId/events/tamper",
  route(async ({ events }) => ({ config: await events.getTamperDetect() }))
);
app.get(
  "/camera/:camId/events/scenechange",
  route(async ({ events }) => ({ config: await events.getSceneChange() }))
);
app.get(
  "/camera/:camId/events/audio",
  route(async ({ events }) => ({ config: await events.getAudioDetect() }))
);
app.get(
  "/camera/:camId/events/network/disconnect",
  route(async ({ events }) => ({ config: await events.getNetworkDisconnect() }))
);
app.get(
  "/camera/:camId/events/network/ipconflict",
  route(async ({ events }) => ({ config: await events.getIPConflict() }))
);
app.get(
  "/camera/:camId/events/storage/nosd",
  route(async ({ events }) => ({ config: await events.getNoSDCardAlarm() }))
);
app.get(
  "/camera/:camId/events/storage/error",
  route(async ({ events }) => ({ config: await events.getSDCardError() }))
);
app.get(
  "/camera/:camId/events/storage/lowspace",
  route(async ({ events }) => ({ config: await events.getSDCardLowSpace() }))
);
app.get(
  "/camera/:camId/events/fire",
  route(async ({ events }) => ({ config: await events.getFireWarning() }))
);

app.post(
  "/camera/:camId/events/motion",
  route(async ({ events }, body) => {
    const { channel = 0, windowIndex = 0, ...params } = body;
    const response = await events.setMotionDetect(params, channel, windowIndex);
    return { response, ok: events.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/events/tamper",
  route(async ({ events }, body) => {
    const { channel = 0, ...params } = body;
    const response = await events.setTamperDetect(params, channel);
    return { response, ok: events.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/events/audio",
  route(async ({ events }, body) => {
    const { channel = 0, ...params } = body;
    const response = await events.setAudioDetect(params, channel);
    return { response, ok: events.isSuccess(response) };
  })
);

// Alarm event stream URL
app.get(
  "/camera/:camId/events/stream",
  route(async ({ events }, _, params) => {
    const url = events.getAlarmEventUrl(["All"], 20, true);
    return { streamUrl: url };
  })
);

// ================================================================
// SECTION 8 - STORAGE
// ================================================================

app.get(
  "/camera/:camId/storage",
  route(async ({ storage }) => ({ configs: await storage.getAllConfigs() }))
);
app.get(
  "/camera/:camId/storage/record",
  route(async ({ storage }) => ({ config: await storage.getRecordSchedule() }))
);

app.post(
  "/camera/:camId/storage/record",
  route(async ({ storage }, body) => {
    const response = await storage.setRecordSchedule(body);
    return { response, ok: storage.isSuccess(response) };
  })
);
app.get(
  "/camera/:camId/storage/snap",
  route(async ({ storage }) => ({ config: await storage.getSnapSchedule() }))
);
app.get(
  "/camera/:camId/storage/point",
  route(async ({ storage }) => ({ config: await storage.getStoragePoint() }))
);
app.get(
  "/camera/:camId/storage/ftp",
  route(async ({ storage }) => ({ config: await storage.getFTP() }))
);
app.get(
  "/camera/:camId/storage/nas",
  route(async ({ storage }) => ({ config: await storage.getNAS() }))
);
app.get(
  "/camera/:camId/storage/media",
  route(async ({ storage }) => ({ config: await storage.getMediaGlobal() }))
);
app.get(
  "/camera/:camId/storage/device",
  route(async ({ storage }) => ({ info: await storage.getStorageDeviceInfo() }))
);

app.post(
  "/camera/:camId/storage/ftp",
  route(async ({ storage }, body) => {
    const response = await storage.setFTP(body);
    return { response, ok: storage.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/storage/nas",
  route(async ({ storage }, body) => {
    const response = await storage.setNAS(body);
    return { response, ok: storage.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/storage/format",
  route(async ({ storage }, body) => {
    const { device = "/dev/mmcblk0p1" } = body;
    const response = await storage.formatStorage(device);
    return { response, ok: storage.isSuccess(response) };
  })
);

// ================================================================
// SECTION 9 - SYSTEM
// ================================================================

app.get(
  "/camera/:camId/system",
  route(async ({ system }) => ({ configs: await system.getAllConfigs() }))
);
app.get(
  "/camera/:camId/system/info",
  route(async ({ system }) => ({ info: await system.getDeviceInfo() }))
);
app.get(
  "/camera/:camId/system/time",
  route(async ({ system }) => ({ time: await system.getCurrentTime() }))
);
app.get(
  "/camera/:camId/system/ntp",
  route(async ({ system }) => ({ config: await system.getNTP() }))
);
app.get(
  "/camera/:camId/system/channels",
  route(async ({ system }) => ({ count: await system.getChannelCount() }))
);

app.post(
  "/camera/:camId/system/time",
  route(async ({ system }, body) => {
    const { time } = body; // Format: yyyy-MM-dd HH:mm:ss
    const response = await system.setCurrentTime(time);
    return { response, ok: system.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/system/ntp",
  route(async ({ system }, body) => {
    const response = await system.setNTP(body);
    return { response, ok: system.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/system/reboot",
  route(async ({ system }) => {
    const response = await system.reboot();
    return { response, ok: system.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/system/reset",
  route(async ({ system }) => {
    const response = await system.factoryReset();
    return { response, ok: system.isSuccess(response) };
  })
);

// ================================================================
// SECTION 2 - LIVE
// ================================================================

app.get(
  "/camera/:camId/live/rtsp",
  route(async ({ live }, _, params) => {
    const cam = cameras[params.camId];
    return {
      main: live.getRTSPUrl(1, 0, cam.username, cam.password),
      sub1: live.getRTSPUrl(1, 1, cam.username, cam.password),
      sub2: live.getRTSPUrl(1, 2, cam.username, cam.password),
      thermal: live.getRTSPUrl(2, 0, cam.username, cam.password),
    };
  })
);

app.get(
  "/camera/:camId/live/snapshot",
  route(async ({ live }) => {
    return {
      visible: live.getSnapshotUrl(1),
      thermal: live.getSnapshotUrl(2),
    };
  })
);

app.get(
  "/camera/:camId/live/thermal",
  route(async ({ live }) => {
    return { config: await live.getThermalConfig() };
  })
);

app.post(
  "/camera/:camId/live/temperature",
  route(async ({ live }, body) => {
    const { x, y, channel = 2 } = body;
    const temp = await live.getPointTemperature(x, y, channel);
    return { temperature: temp };
  })
);

app.post(
  "/camera/:camId/live/thermal/enable",
  route(async ({ live }, body) => {
    const { enable } = body;
    const response = await live.setThermalEnabled(enable);
    return { response, ok: live.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/live/thermal/unit",
  route(async ({ live }, body) => {
    const { unit } = body; // 'Centigrade' | 'Fahrenheit'
    const response = await live.setTemperatureUnit(unit);
    return { response, ok: live.isSuccess(response) };
  })
);

// Object Tracking
app.post("/track/object/:id", async (req, res) => {
  try {
    const objectId = parseInt(req.params.id);
    console.log(`[Tracking] Request to track object ID: ${objectId}`);

    // Send tracking command to backend on port 9898
    try {
      const backendResponse = await fetch(`http://localhost:9898/track/object/${objectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ objectId })
      });

      const backendData = await backendResponse.json();
      console.log(`[Tracking] Backend response:`, backendData);

      res.json({
        success: true,
        objectId,
        message: `Tracking enabled for object ${objectId}`,
        backendResponse: backendData
      });
    } catch (backendError: any) {
      console.error('[Tracking] Backend connection error:', backendError.message);

      // Still return success to frontend even if backend fails
      res.json({
        success: true,
        objectId,
        message: `Tracking request received for object ${objectId}`,
        warning: 'Backend server not available',
        backendError: backendError.message
      });
    }
  } catch (error: any) {
    console.error('[Tracking] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/track/stop", async (req, res) => {
  try {
    console.log(`[Tracking] Request to stop tracking`);

    // Send stop tracking command to backend on port 9898
    try {
      const backendResponse = await fetch(`http://localhost:9898/track/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const backendData = await backendResponse.json();
      console.log(`[Tracking] Backend stop response:`, backendData);

      res.json({
        success: true,
        message: `Tracking stopped`,
        backendResponse: backendData
      });
    } catch (backendError: any) {
      console.error('[Tracking] Backend connection error:', backendError.message);

      // Still return success to frontend even if backend fails
      res.json({
        success: true,
        message: `Stop tracking request received`,
        warning: 'Backend server not available',
        backendError: backendError.message
      });
    }
  } catch (error: any) {
    console.error('[Tracking] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Camera API server running on port ${PORT}`);
  console.log(`\nTest endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/camera/cam1/system/info`);
  console.log(`  GET  http://localhost:${PORT}/camera/cam1/ptz/status`);
  console.log(`  GET  http://localhost:${PORT}/camera/cam1/network`);
  console.log(`  GET  http://localhost:${PORT}/camera/cam1/events`);
  console.log(`  GET  http://localhost:${PORT}/camera/cam1/storage`);
  console.log(`  GET  http://localhost:${PORT}/camera/cam1/live/rtsp`);
  console.log(`  POST http://localhost:${PORT}/camera/cam1/ptz/move/up`);
});

export default app;
