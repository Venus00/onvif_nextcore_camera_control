import express from "express";
import cors from "cors"; // <-- add this

import CameraSetupAPI, {
  NetworkAPI,
  PTZAPI,
  EventsAPI,
  SystemAPI,
  StorageAPI,
  LiveAPI,
  CameraClient,
} from "./util";


const app = express();
app.use(express.json());
app.use(cors());
// ============ CAMERA CONFIGURATION ============

interface CameraInfo {
  ip: string;
  username: string;
  password: string;
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

  const DigestFetch = (await import("digest-fetch")).default;
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
    const { channel = 0, config = 2, ...params } = body;
    const response = await setup.setVideoColor(params, channel, config);
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
    const { channel = 0, config = 2, ...params } = body;
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
    const { channel = 0, config = 2, ...params } = body;
    const response = await setup.setVideoExposure(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  })
);

// White Balance
app.get(
  "/camera/:camId/video/whitebalance",
  route(async ({ setup }) => ({ config: await setup.getVideoWhiteBalance() }))
);

// Zoom
app.get(
  "/camera/:camId/video/zoom",
  route(async ({ setup }) => ({ config: await setup.getVideoZoom() }))
);

// Focus
app.get(
  "/camera/:camId/video/focus",
  route(async ({ setup }) => ({ config: await setup.getVideoFocus() }))
);

// Defog
app.get(
  "/camera/:camId/video/defog",
  route(async ({ setup }) => ({ config: await setup.getVideoDefog() }))
);

// Flip
app.get(
  "/camera/:camId/video/flip",
  route(async ({ setup }) => ({ config: await setup.getVideoFlip() }))
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
    const { channel = 0, speed = 4 } = body;
    const response = await ptz.moveUp(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/down",
  route(async ({ ptz }, body) => {
    const { channel = 0, speed = 4 } = body;
    const response = await ptz.moveDown(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/left",
  route(async ({ ptz }, body) => {
    const { channel = 0, speed = 4 } = body;
    const response = await ptz.moveLeft(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/right",
  route(async ({ ptz }, body) => {
    const { channel = 0, speed = 4 } = body;
    const response = await ptz.moveRight(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/move/stop",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.stopMove(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/zoom/in",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.zoomIn(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/zoom/out",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.zoomOut(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/zoom/stop",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.stopZoom(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/focus/near",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.focusNear(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/focus/far",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.focusFar(channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/preset/goto",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    const response = await ptz.gotoPreset(presetId, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/preset/set",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    const response = await ptz.setPreset(presetId, channel);
    return { response, ok: ptz.isSuccess(response) };
  })
);

app.post(
  "/camera/:camId/ptz/preset/clear",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    const response = await ptz.clearPreset(presetId, channel);
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


