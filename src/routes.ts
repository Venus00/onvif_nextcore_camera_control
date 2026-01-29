import express from "express";
import cors from "cors";
import DigestFetch from "digest-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { setupReactStatic } from "./util/serveReactStatic.js";
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

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ STATE MANAGEMENT ============
interface DetectionState {
  cam1: {
    detectionEnabled: boolean;
    trackingEnabled: boolean;
    trackingObjectId: number | null;
  };
  cam2: {
    detectionEnabled: boolean;
    trackingEnabled: boolean;
    trackingObjectId: number | null;
  };
  autofocus: {
    cam1: boolean;
    cam2: boolean;
  };
}

const stateFilePath = "/home/ubuntu/IA_process/app_state.json";

// Initialize default state
const defaultState: DetectionState = {
  cam1: {
    detectionEnabled: false,
    trackingEnabled: false,
    trackingObjectId: null,
  },
  cam2: {
    detectionEnabled: false,
    trackingEnabled: false,
    trackingObjectId: null,
  },
  autofocus: {
    cam1: false,
    cam2: false,
  },
};

// Load state from file
function loadState(): DetectionState {
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, "utf-8");
      const loadedState = JSON.parse(data);
      console.log("[State] Loaded state from file:", loadedState);
      return { ...defaultState, ...loadedState };
    }
  } catch (error) {
    console.error("[State] Error loading state:", error);
  }
  return defaultState;
}

// // Save state to file
// function saveState(state: DetectionState): void {
//   try {
//     fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
//     console.log('[State] Saved state to file:', state);
//   } catch (error) {
//     console.error('[State] Error saving state:', error);
//   }
// }

// Global state
let detectionState: DetectionState = loadState();

const { udpServer, wsServer } = createUDPClient({
  wsPort: 8080,
  localPort: 5015, // Local port to bind (receive responses)
  remoteHost: "127.0.0.1", // Python server address
  remotePort: 52383, // Python server port
  initialMessage: Buffer.from("HELLO"),
});

// Continuous PTZFocusHD monitoring (runs independently)
async function monitorPTZFocusHD(camId: string) {
  try {
    const { client, ip } = getCameraClient(camId);
    const statusRes = await client.fetch(
      `http://${ip}/cgi-bin/ptz.cgi?action=getStatus`,
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
// setInterval(() => {80
//   monitorPTZFocusHD("cam2");
// }, 1000);

const app = express();
const apiRouter = express.Router();
app.use(express.json());
app.use(cors());
app.use('/api', apiRouter);
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

// ============ CAMERA CONFIGURATION ============

interface CameraInfo {
  ip: string;
  username: string;
  password: string;
}

const cameras: Record<string, CameraInfo> = {
  cam1: { ip: "10.10.0.3", username: "admin", password: "2899100*-+" },
  cam2: { ip: "10.10.0.4", username: "admin", password: "2899100*-+" },
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
  handler: (apis: CameraAPIs, body: any, params: any) => Promise<any>,
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

apiRouter.get(
  "/camera/:camId/setup",
  route(async ({ setup }) => ({ configs: await setup.getAllConfigs() })),
);

// Video Color
apiRouter.get(
  "/camera/:camId/video/color",
  route(async ({ setup }) => ({ config: await setup.getVideoColor() })),
);

apiRouter.post(
  "/camera/:camId/video/color",
  route(async ({ setup }, body) => {
    const { channel = 0, ...params } = body;
    const response = await setup.setVideoColor(params, channel);
    return { response, ok: setup.isSuccess(response) };
  }),
);
// video Sharpness
apiRouter.get(
  "/camera/:camId/video/sharpness",
  route(async ({ setup }) => ({ config: await setup.getVideoSharpness() })),
);
apiRouter.post(
  "/camera/:camId/video/sharpness",
  route(async ({ setup }, body) => {
    const { channel = 0, ...params } = body;
    const response = await setup.setVideoSharpness(params, channel);
    return { response, ok: setup.isSuccess(response) };
  }),
);
//vide mode
apiRouter.get(
  "/camera/:camId/video/mode", // Changed from /video/inMode
  route(async ({ setup }) => ({ config: await setup.getVideoMode() })),
);

// Add POST route
apiRouter.post(
  "/camera/:camId/video/mode",
  route(async ({ setup }, body) => {
    const { channel = 0, mode, config0, config1, timeSection } = body;
    const response = await setup.setVideoMode(
      { mode, config0, config1, timeSection },
      channel,
    );
    return { response, ok: setup.isSuccess(response) };
  }),
);
// Day/Night
apiRouter.get(
  "/camera/:camId/video/daynight",
  route(async ({ setup }) => ({ config: await setup.getVideoDayNight() })),
);
apiRouter.post(
  "/camera/:camId/video/daynight",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoDayNight(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// Exposure
apiRouter.get(
  "/camera/:camId/video/exposure",
  route(async ({ setup }) => ({ config: await setup.getVideoExposure() })),
);
apiRouter.post(
  "/camera/:camId/video/exposure",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoExposure(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// White Balance
apiRouter.get(
  "/camera/:camId/video/whitebalance",
  route(async ({ setup }) => ({ config: await setup.getVideoWhiteBalance() })),
);
apiRouter.post(
  "/camera/:camId/video/whitebalance",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoWhiteBalance(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);
// Zoom
apiRouter.get(
  "/camera/:camId/video/zoom",
  route(async ({ setup }) => ({ config: await setup.getVideoZoom() })),
);
apiRouter.post(
  "/camera/:camId/video/zoom",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoZoom(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// Focus
apiRouter.get(
  "/camera/:camId/video/focus",
  route(async ({ setup }) => ({ config: await setup.getVideoFocus() })),
);
apiRouter.post(
  "/camera/:camId/video/focus",

  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoFocus(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// Defog
apiRouter.get(
  "/camera/:camId/video/defog",
  route(async ({ setup }) => ({ config: await setup.getVideoDefog() })),
);
apiRouter.post(
  "/camera/:camId/video/defog",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoDefog(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// Flip
apiRouter.get(
  "/camera/:camId/video/flip",
  route(async ({ setup }) => ({ config: await setup.getVideoFlip() })),
);
apiRouter.post(
  "/camera/:camId/video/flip",

  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoFlip(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// denoise
apiRouter.get(
  "/camera/:camId/video/denoise",
  route(async ({ setup }) => ({ config: await setup.getVideoDenoise() })),
);
apiRouter.post(
  "/camera/:camId/video/denoise",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoDenoise(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// Video Stabilizer
apiRouter.get(
  "/camera/:camId/video/stabilizer",
  route(async ({ setup }) => ({ config: await setup.getVideoStabilizer() })),
);
apiRouter.post(
  "/camera/:camId/video/stabilizer",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, stabilizer: stablizer } = body;
    const response = await setup.setVideoStabilizer(stablizer, channel, config);
    // Activate digital zoom when setting stabilizer
    const zoomResponse = await setup.setVideoZoom(
      { DigitalZoom: true },
      channel,
      config,
    );
    return { response, zoomResponse, ok: setup.isSuccess(response) };
  }),
);

// Backlight
apiRouter.get(
  "/camera/:camId/video/backlight",
  route(async ({ setup }) => ({ config: await setup.getVideoBacklight() })),
);

// Encode
apiRouter.get(
  "/camera/:camId/encode",
  route(async ({ setup }) => ({ config: await setup.getEncode() })),
);
apiRouter.post(
  "/camera/:camId/encode",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setEncode(params, channel);
    return { response, ok: setup.isSuccess(response) };
  }),
);

apiRouter.get(
  "/camera/:camId/video/videoROI",
  route(async ({ setup }) => ({ config: await setup.getVideoROI() })),
);
apiRouter.post(
  "/camera/:camId/video/videoROI",
  route(async ({ setup }, body) => {
    const { channel = 0, config = 0, ...params } = body;
    const response = await setup.setVideoROI(params, channel, config);
    return { response, ok: setup.isSuccess(response) };
  }),
);

// Title
apiRouter.get(
  "/camera/:camId/title",
  route(async ({ setup }) => ({ config: await setup.getChannelTitle() })),
);

// OSD
apiRouter.get(
  "/camera/:camId/osd",
  route(async ({ setup }) => ({ config: await setup.getVideoWidget() })),
);

apiRouter.post(
  "/camera/:camId/osd",
  route(async ({ setup }, body) => {
    const { channel = 0, ...params } = body;
    const response = await setup.setVideoWidget(params, channel);
    return { response, ok: setup.isSuccess(response) };
  }),
);

apiRouter.post("/focus/:camId/move", async (req, res) => {
  try {
    console.log("focus move", req.body);
    const camId = "cam2";
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

apiRouter.post("/focus/:camId/stop", async (req, res) => {
  try {
    console.log("focus stop", req.body);
    const camId = "cam2";
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

apiRouter.get(
  "/camera/:camId/network",
  route(async ({ network }) => ({ configs: await network.getAllConfigs() })),
);
apiRouter.get(
  "/camera/:camId/network/tcpip",
  route(async ({ network }) => ({ config: await network.getNetwork() })),
);
apiRouter.get(
  "/camera/:camId/network/dvrip",
  route(async ({ network }) => ({ config: await network.getDVRIP() })),
);
apiRouter.get(
  "/camera/:camId/network/web",
  route(async ({ network }) => ({ config: await network.getWeb() })),
);
apiRouter.get(
  "/camera/:camId/network/rtsp",
  route(async ({ network }) => ({ config: await network.getRTSP() })),
);
apiRouter.get(
  "/camera/:camId/network/https",
  route(async ({ network }) => ({ config: await network.getHttps() })),
);
apiRouter.get(
  "/camera/:camId/network/upnp",
  route(async ({ network }) => ({ config: await network.getUPnP() })),
);
apiRouter.get(
  "/camera/:camId/network/multicast",
  route(async ({ network }) => ({ config: await network.getMulticast() })),
);
apiRouter.get(
  "/camera/:camId/network/qos",
  route(async ({ network }) => ({ config: await network.getQoS() })),
);
apiRouter.get(
  "/camera/:camId/network/onvif",
  route(async ({ network }) => ({ config: await network.getONVIF() })),
);

apiRouter.post(
  "/camera/:camId/network/rtsp",
  route(async ({ network }, body) => {
    const response = await network.setRTSP(body);
    return { response, ok: network.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/network/onvif",
  route(async ({ network }, body) => {
    const response = await network.setONVIF(body.enable);
    return { response, ok: network.isSuccess(response) };
  }),
);

// ================================================================
// SECTION 5 - PTZ
// ================================================================

apiRouter.get(
  "/camera/:camId/ptz",
  route(async ({ ptz }) => ({ configs: await ptz.getAllConfigs() })),
);
apiRouter.get(
  "/camera/:camId/ptz/status",
  route(async ({ ptz }) => ({ status: await ptz.getPTZStatus() })),
);
apiRouter.get(
  "/camera/:camId/ptz/presets",
  route(async ({ ptz }) => ({ presets: await ptz.getPresets() })),
);
apiRouter.get(
  "/camera/:camId/ptz/tours",
  route(async ({ ptz }) => ({ tours: await ptz.getTours() })),
);
apiRouter.get(
  "/camera/:camId/ptz/scantours",
  route(async ({ ptz }) => ({ scanTours: await ptz.getScanTours() })),
);
apiRouter.get(
  "/camera/:camId/ptz/autoscan",
  route(async ({ ptz }) => ({ autoScan: await ptz.getAutoScan() })),
);
apiRouter.get(
  "/camera/:camId/ptz/idlemotion",
  route(async ({ ptz }) => ({ idleMotion: await ptz.getIdleMotion() })),
);
apiRouter.get(
  "/camera/:camId/ptz/powerup",
  route(async ({ ptz }) => ({ powerUp: await ptz.getPowerUp() })),
);

// PTZ Control
apiRouter.post(
  "/camera/:camId/ptz/move/up",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveUp(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/move/down",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveDown(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/move/left",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveLeft(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/move/right",
  route(async ({ ptz }, body) => {
    const { channel = 1, speed = 4 } = body;
    const response = await ptz.moveRight(channel, speed);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/wiper/on",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.wiperOn(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/move/stop",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.stopMove(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/zoom/in",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.zoomIn(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/zoom/out",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.zoomOut(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/zoom/stop",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.stopZoom(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/focus/stop",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.stopFocus(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/focus/near",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.focusNear(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/focus/far",
  route(async ({ ptz }, body) => {
    const { channel = 1 } = body;
    const response = await ptz.focusFar(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

// Enable autofocus
apiRouter.post(
  "/camera/:camId/ptz/focus/auto/enable",
  route(async ({ ptz }, body, params) => {
    const { channel = 1 } = body;
    const { camId } = params;

    try {
      // Send autofocus start command to backend on port 9898
      const backendResponse = await fetch(
        `http://localhost:9898/ia_process/focus/${camId}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const backendData = await backendResponse.json();
      console.log(
        `[Autofocus] Backend start response for ${camId}:`,
        backendData,
      );

      // Also enable on camera hardware
      const response = await ptz.autoFocus(true, channel);

      // Update state
      detectionState.autofocus[camId as "cam1" | "cam2"] = true;
      // saveState(detectionState);

      return {
        response,
        ok: ptz.isSuccess(response),
        message: "Autofocus enabled",
        backendResponse: backendData,
        state: detectionState.autofocus,
      };
    } catch (backendError: any) {
      console.error(
        "[Autofocus] Backend connection error:",
        backendError.message,
      );

      // Still enable on camera hardware even if backend fails
      const response = await ptz.autoFocus(true, channel);

      // Update state even if backend fails
      detectionState.autofocus[camId as "cam1" | "cam2"] = true;
      // saveState(detectionState);

      return {
        response,
        ok: ptz.isSuccess(response),
        message: "Autofocus enabled",
        warning: "Backend server not available",
        backendError: backendError.message,
        state: detectionState.autofocus,
      };
    }
  }),
);

// Disable autofocus
apiRouter.post(
  "/camera/:camId/ptz/focus/auto/disable",
  route(async ({ ptz }, body, params) => {
    const { channel = 1 } = body;
    const { camId } = params;

    try {
      // Send autofocus stop command to backend on port 9898
      const backendResponse = await fetch(
        `http://localhost:9898/ia_process/focus/${camId}/stop`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const backendData = await backendResponse.json();
      console.log(
        `[Autofocus] Backend stop response for ${camId}:`,
        backendData,
      );

      // Also disable on camera hardware
      const response = await ptz.autoFocus(false, channel);

      // Update state
      detectionState.autofocus[camId as "cam1" | "cam2"] = false;
      // saveState(detectionState);

      return {
        response,
        ok: ptz.isSuccess(response),
        message: "Autofocus disabled",
        backendResponse: backendData,
        state: detectionState.autofocus,
      };
    } catch (backendError: any) {
      console.error(
        "[Autofocus] Backend connection error:",
        backendError.message,
      );

      // Still disable on camera hardware even if backend fails
      const response = await ptz.autoFocus(false, channel);

      // Update state even if backend fails
      // detectionState.autofocus[camId as 'cam1' | 'cam2'] = false;
      // saveState(detectionState);

      return {
        response,
        ok: ptz.isSuccess(response),
        message: "Autofocus disabled",
        warning: "Backend server not available",
        backendError: backendError.message,
        state: detectionState.autofocus,
      };
    }
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/preset/goto",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    console.log("Going to preset", presetId, "on channel", channel);
    const response = await ptz.gotoPreset(presetId.id, channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/preset/set",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    console.log("Setting preset", presetId, "on channel", channel);
    let params = { Name: presetId.Name };

    if (presetId.Name) {
      await ptz.setPresetConfig(presetId.Name, channel, presetId.id);
    }

    //   Name: presetId.Name,

    let response = await ptz.setPreset(presetId.id, channel, presetId.id);

    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/preset/clear",
  route(async ({ ptz }, body) => {
    const { presetId, channel = 0 } = body;
    console.log("Clearing preset", presetId, "on channel", channel);
    const response = await ptz.clearPreset(presetId.id, channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/tour/start",
  route(async ({ ptz }, body) => {
    const { tourId, channel = 0 } = body;
    const response = await ptz.startTour(tourId, channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/tour/stop",
  route(async ({ ptz }, body) => {
    const { tourId, channel = 0 } = body;
    const response = await ptz.stopMove(1);
    return { response, ok: ptz.isSuccess(response) };
  }),
);
apiRouter.post(
  "/camera/:camId/ptz/tour/update",
  route(async ({ ptz }, body) => {
    const { tourId, channel = 0 } = body;
    console.log("Updating tour", body);
    const response = await ptz.setTourConfig(body.presets, channel, body.id);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/position",
  route(async ({ ptz }, body) => {
    const { pan, tilt, zoom, channel = 0 } = body;
    const response = await ptz.positionAbsolute(pan, tilt, zoom, channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/light/on",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.lightOn(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/light/off",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.lightOff(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/ptz/wiper",
  route(async ({ ptz }, body) => {
    const { channel = 0 } = body;
    const response = await ptz.wiperOn(channel);
    return { response, ok: ptz.isSuccess(response) };
  }),
);

// ================================================================
// SECTION 6 - EVENTS
// ================================================================

apiRouter.get(
  "/camera/:camId/events",
  route(async ({ events }) => ({ configs: await events.getAllConfigs() })),
);
apiRouter.get(
  "/camera/:camId/events/motion",
  route(async ({ events }) => ({ config: await events.getMotionDetect() })),
);
apiRouter.get(
  "/camera/:camId/events/tamper",
  route(async ({ events }) => ({ config: await events.getTamperDetect() })),
);
apiRouter.get(
  "/camera/:camId/events/scenechange",
  route(async ({ events }) => ({ config: await events.getSceneChange() })),
);
apiRouter.get(
  "/camera/:camId/events/audio",
  route(async ({ events }) => ({ config: await events.getAudioDetect() })),
);
apiRouter.get(
  "/camera/:camId/events/network/disconnect",
  route(async ({ events }) => ({
    config: await events.getNetworkDisconnect(),
  })),
);
apiRouter.get(
  "/camera/:camId/events/network/ipconflict",
  route(async ({ events }) => ({ config: await events.getIPConflict() })),
);
apiRouter.get(
  "/camera/:camId/events/storage/nosd",
  route(async ({ events }) => ({ config: await events.getNoSDCardAlarm() })),
);
apiRouter.get(
  "/camera/:camId/events/storage/error",
  route(async ({ events }) => ({ config: await events.getSDCardError() })),
);
apiRouter.get(
  "/camera/:camId/events/storage/lowspace",
  route(async ({ events }) => ({ config: await events.getSDCardLowSpace() })),
);
apiRouter.get(
  "/camera/:camId/events/fire",
  route(async ({ events }) => ({ config: await events.getFireWarning() })),
);

apiRouter.post(
  "/camera/:camId/events/motion",
  route(async ({ events }, body) => {
    const { channel = 0, windowIndex = 0, ...params } = body;
    const response = await events.setMotionDetect(params, channel, windowIndex);
    return { response, ok: events.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/events/tamper",
  route(async ({ events }, body) => {
    const { channel = 0, ...params } = body;
    const response = await events.setTamperDetect(params, channel);
    return { response, ok: events.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/events/audio",
  route(async ({ events }, body) => {
    const { channel = 0, ...params } = body;
    const response = await events.setAudioDetect(params, channel);
    return { response, ok: events.isSuccess(response) };
  }),
);

// Alarm event stream URL
apiRouter.get(
  "/camera/:camId/events/stream",
  route(async ({ events }, _, params) => {
    const url = events.getAlarmEventUrl(["All"], 20, true);
    return { streamUrl: url };
  }),
);

// ================================================================
// SECTION 8 - STORAGE
// ================================================================

apiRouter.get(
  "/camera/:camId/storage",
  route(async ({ storage }) => ({ configs: await storage.getAllConfigs() })),
);
apiRouter.get(
  "/camera/:camId/storage/record",
  route(async ({ storage }) => ({ config: await storage.getRecordSchedule() })),
);

apiRouter.post(
  "/camera/:camId/storage/record",
  route(async ({ storage }, body) => {
    // console.log("Setting record schedule:", body);
    const response = await storage.setRecordSchedule(body);
    return { response, ok: storage.isSuccess(response) };
  }),
);
apiRouter.get(
  "/camera/:camId/storage/snap",
  route(async ({ storage }) => ({ config: await storage.getSnapSchedule() })),
);
apiRouter.get(
  "/camera/:camId/storage/point",
  route(async ({ storage }) => ({ config: await storage.getStoragePoint() })),
);
apiRouter.get(
  "/camera/:camId/storage/ftp",
  route(async ({ storage }) => ({ config: await storage.getFTP() })),
);
apiRouter.get(
  "/camera/:camId/storage/nas",
  route(async ({ storage }) => ({ config: await storage.getNAS() })),
);
apiRouter.get(
  "/camera/:camId/storage/media",
  route(async ({ storage }) => ({ config: await storage.getMediaGlobal() })),
);
apiRouter.get(
  "/camera/:camId/storage/device",
  route(async ({ storage }) => ({
    info: await storage.getStorageDeviceInfo(),
  })),
);

apiRouter.post(
  "/camera/:camId/storage/ftp",
  route(async ({ storage }, body) => {
    const response = await storage.setFTP(body);
    return { response, ok: storage.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/storage/nas",
  route(async ({ storage }, body) => {
    const response = await storage.setNAS(body);
    return { response, ok: storage.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/storage/format",
  route(async ({ storage }, body) => {
    const { device = "/dev/mmcblk0p1" } = body;
    const response = await storage.formatStorage(device);
    return { response, ok: storage.isSuccess(response) };
  }),
);

// ================================================================
// SECTION 9 - SYSTEM
// ================================================================

apiRouter.get(
  "/camera/:camId/system",
  route(async ({ system }) => ({ configs: await system.getAllConfigs() })),
);
apiRouter.get(
  "/camera/:camId/system/info",
  route(async ({ system }) => ({ info: await system.getDeviceInfo() })),
);
apiRouter.get(
  "/camera/:camId/system/time",
  route(async ({ system }) => ({ time: await system.getCurrentTime() })),
);
apiRouter.get(
  "/camera/:camId/system/ntp",
  route(async ({ system }) => ({ config: await system.getNTP() })),
);
apiRouter.get(
  "/camera/:camId/system/channels",
  route(async ({ system }) => ({ count: await system.getChannelCount() })),
);

apiRouter.post(
  "/camera/:camId/system/time",
  route(async ({ system }, body) => {
    const { time } = body; // Format: yyyy-MM-dd HH:mm:ss
    const response = await system.setCurrentTime(time);
    return { response, ok: system.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/system/ntp",
  route(async ({ system }, body) => {
    const response = await system.setNTP(body);
    return { response, ok: system.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/system/reboot",
  route(async ({ system }) => {
    const response = await system.reboot();
    return { response, ok: system.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/system/reset",
  route(async ({ system }) => {
    const response = await system.factoryReset();
    return { response, ok: system.isSuccess(response) };
  }),
);

// System reboot endpoint (reboots the entire server/system)
apiRouter.post("/system/reboot", async (req, res) => {
  try {
    console.log("[System] Reboot request received");

    // Verify authorization or add security check here if needed
    const { confirm } = req.body;

    if (confirm !== true) {
      return res.status(400).json({
        success: false,
        error: "Confirmation required to reboot system",
      });
    }

    // Send response before rebooting
    res.json({
      success: true,
      message:
        "System reboot initiated. Server will be offline for 1-2 minutes.",
    });

    // Execute reboot command after a short delay to allow response to be sent
    setTimeout(() => {
      console.log("[System] Executing system reboot...");
      exec("sudo reboot", (error, stdout, stderr) => {
        if (error) {
          console.error("[System] Reboot error:", error);
          return;
        }
        console.log("[System] Reboot command executed:", stdout);
      });
    }, 1000);
  } catch (error: any) {
    console.error("[System] Reboot error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ================================================================
// SECTION 2 - LIVE
// ================================================================

apiRouter.get(
  "/camera/:camId/live/rtsp",
  route(async ({ live }, _, params) => {
    const cam = cameras[params.camId];
    return {
      main: live.getRTSPUrl(1, 0, cam.username, cam.password),
      sub1: live.getRTSPUrl(1, 1, cam.username, cam.password),
      sub2: live.getRTSPUrl(1, 2, cam.username, cam.password),
      thermal: live.getRTSPUrl(2, 0, cam.username, cam.password),
    };
  }),
);

apiRouter.get(
  "/camera/:camId/live/snapshot",
  route(async ({ live }) => {
    return {
      visible: live.getSnapshotUrl(1),
      thermal: live.getSnapshotUrl(2),
    };
  }),
);

apiRouter.get(
  "/camera/:camId/live/thermal",
  route(async ({ live }) => {
    return { config: await live.getThermalConfig() };
  }),
);

apiRouter.post(
  "/camera/:camId/live/temperature",
  route(async ({ live }, body) => {
    const { x, y, channel = 2 } = body;
    const temp = await live.getPointTemperature(x, y, channel);
    return { temperature: temp };
  }),
);

apiRouter.post(
  "/camera/:camId/live/thermal/enable",
  route(async ({ live }, body) => {
    const { enable } = body;
    const response = await live.setThermalEnabled(enable);
    return { response, ok: live.isSuccess(response) };
  }),
);

apiRouter.post(
  "/camera/:camId/live/thermal/unit",
  route(async ({ live }, body) => {
    const { unit } = body; // 'Centigrade' | 'Fahrenheit'
    const response = await live.setTemperatureUnit(unit);
    return { response, ok: live.isSuccess(response) };
  }),
);

// Object Detection
apiRouter.post("/detection/start", async (req, res) => {
  try {
    const { cameraId = "cam1" } = req.body; // cam1 = optique, cam2 = thermique
    console.log(`[Detection] Request to start detection on ${cameraId}`);

    // Send detection start command to backend on port 9898
    try {
      const backendResponse = await fetch(
        `http://localhost:9898/ia_process/trackobject/${cameraId}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const backendData = await backendResponse.json();
      console.log(`[Detection] Backend response:`, backendData);

      // Update state
      // detectionState[cameraId as 'cam1' | 'cam2'].detectionEnabled = true;
      // saveState(detectionState);

      res.json({
        success: true,
        message: `Detection started`,
        backendResponse: backendData,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    } catch (backendError: any) {
      console.error(
        "[Detection] Backend connection error:",
        backendError.message,
      );

      // Update state even if backend fails
      // detectionState[cameraId as 'cam1' | 'cam2'].detectionEnabled = true;
      // saveState(detectionState);

      // Still return success to frontend even if backend fails
      res.json({
        success: true,
        message: `Detection start request received`,
        warning: "Backend server not available",
        backendError: backendError.message,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    }
  } catch (error: any) {
    console.error("[Detection] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

apiRouter.post("/detection/stop", async (req, res) => {
  try {
    const { cameraId = "cam1" } = req.body; // cam1 = optique, cam2 = thermique
    console.log(`[Detection] Request to stop detection on ${cameraId}`);
    console.log(
      `http://localhost:9898/ia_process/trackobject/${cameraId}/stop`,
    );
    // Send detection stop command to backend on port 9898
    try {
      const backendResponse = await fetch(
        `http://localhost:9898/ia_process/trackobject/${cameraId}/stop`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const backendData = await backendResponse.json();
      console.log(`[Detection] Backend stop response:`, backendData);

      // Update state
      // detectionState[cameraId as 'cam1' | 'cam2'].detectionEnabled = false;
      // saveState(detectionState);

      res.json({
        success: true,
        message: `Detection stopped`,
        backendResponse: backendData,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    } catch (backendError: any) {
      console.error(
        "[Detection] Backend connection error:",
        backendError.message,
      );

      // Update state even if backend fails
      // detectionState[cameraId as 'cam1' | 'cam2'].detectionEnabled = false;
      // saveState(detectionState);

      // Still return success to frontend even if backend fails
      res.json({
        success: true,
        message: `Detection stop request received`,
        warning: "Backend server not available",
        backendError: backendError.message,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    }
  } catch (error: any) {
    console.error("[Detection] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Object Tracking
apiRouter.post("/track/object/:id", async (req, res) => {
  try {
    const objectId = parseInt(req.params.id);
    const { cameraId = "cam1" } = req.body; // cam1 = optique, cam2 = thermique
    console.log(
      `[Tracking] Request to track object ID: ${objectId} on ${cameraId}`,
    );

    // Send tracking command to backend on port 9898
    try {
      const backendResponse = await fetch(
        `http://localhost:9898/ia_process/trackobject_ids/${cameraId}/start/${objectId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const backendData = await backendResponse.json();
      console.log(`[Tracking] Backend response:`, backendData);

      // Update state
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingEnabled = true;
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingObjectId = objectId;
      // saveState(detectionState);

      res.json({
        success: true,
        objectId,
        message: `Tracking enabled for object ${objectId}`,
        backendResponse: backendData,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    } catch (backendError: any) {
      console.error(
        "[Tracking] Backend connection error:",
        backendError.message,
      );

      // Update state even if backend fails
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingEnabled = true;
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingObjectId = objectId;
      // saveState(detectionState);

      // Still return success to frontend even if backend fails
      res.json({
        success: true,
        objectId,
        message: `Tracking request received for object ${objectId}`,
        warning: "Backend server not available",
        backendError: backendError.message,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    }
  } catch (error: any) {
    console.error("[Tracking] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

apiRouter.post("/track/stop", async (req, res) => {
  try {
    const { cameraId = "cam1" } = req.body; // cam1 = optique, cam2 = thermique
    console.log(`[Tracking] Request to stop tracking on ${cameraId}`);

    // Send stop tracking command to backend on port 9898
    try {
      const backendResponse = await fetch(
        `http://localhost:9898/ia_process/trackobject_ids/${cameraId}/stop`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const backendData = await backendResponse.json();
      console.log(`[Tracking] Backend stop response:`, backendData);

      // Update state
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingEnabled = false;
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingObjectId = null;
      // saveState(detectionState);

      res.json({
        success: true,
        message: `Tracking stopped`,
        backendResponse: backendData,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    } catch (backendError: any) {
      console.error(
        "[Tracking] Backend connection error:",
        backendError.message,
      );

      // Update state even if backend fails
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingEnabled = false;
      // detectionState[cameraId as 'cam1' | 'cam2'].trackingObjectId = null;
      // saveState(detectionState);

      // Still return success to frontend even if backend fails
      res.json({
        success: true,
        message: `Stop tracking request received`,
        warning: "Backend server not available",
        backendError: backendError.message,
        state: detectionState[cameraId as "cam1" | "cam2"],
      });
    }
  } catch (error: any) {
    console.error("[Tracking] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get detection/tracking state
apiRouter.get("/detection/state", async (req, res) => {
  try {
    const { cameraId } = req.query;

    // Always read from file to get the latest state
    let state;
    if (!fs.existsSync(stateFilePath)) {
      console.log(
        "[Detection State] State file not found, returning default state",
      );
      state = {
        cam1: {
          tracking: "stopped",
          follow: "stopped",
          focus: "stopped",
        },
        cam2: {
          tracking: "stopped",
          follow: "stopped",
          focus: "stopped",
        },
      };
    } else {
      const fileContent = fs.readFileSync(stateFilePath, "utf-8");
      state = JSON.parse(fileContent);
      console.log("[Detection State] Loaded state from file:", state);
    }

    if (cameraId && (cameraId === "cam1" || cameraId === "cam2")) {
      res.json({
        success: true,
        cameraId,
        state: state[cameraId],
      });
    } else {
      res.json({
        success: true,
        state,
      });
    }
  } catch (error: any) {
    console.error("[Detection State] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get analytics state from file
apiRouter.get("/analytics/state", async (req, res) => {
  try {
    // Check if file exists
    if (!fs.existsSync(stateFilePath)) {
      console.log(
        "[Analytics State] State file not found, returning default state",
      );
      return res.json({
        success: true,
        state: {
          cam1: {
            tracking: "stopped",
            follow: "stopped",
            focus: "stopped",
          },
          cam2: {
            tracking: "stopped",
            follow: "stopped",
            focus: "stopped",
          },
        },
        message: "State file not found, using defaults",
      });
    }

    // Read and parse the state file
    const fileContent = fs.readFileSync(stateFilePath, "utf-8");
    const state = JSON.parse(fileContent);

    console.log("[Analytics State] Loaded state from file:", state);

    res.json({
      success: true,
      state,
    });
  } catch (error: any) {
    console.error("[Analytics State] Error reading state file:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      state: {
        cam1: {
          tracking: "stopped",
          follow: "stopped",
          focus: "stopped",
        },
        cam2: {
          tracking: "stopped",
          follow: "stopped",
          focus: "stopped",
        },
      },
    });
  }
});

// ============ RECORDING ENDPOINTS ============
const activeRecordings = new Map<string, ChildProcessWithoutNullStreams>();

// Start recording from RTSP stream
apiRouter.post("/recording/start", async (req, res) => {
  try {
    const { cameraId, fileName } = req.body;

    if (!cameraId || !fileName) {
      return res
        .status(400)
        .json({ success: false, error: "cameraId and fileName are required" });
    }

    const cam = cameras[cameraId];
    if (!cam) {
      return res
        .status(404)
        .json({ success: false, error: `Camera ${cameraId} not found` });
    }

    // Check if already recording for this camera
    if (activeRecordings.has(cameraId)) {
      return res.status(400).json({
        success: false,
        error: `Recording already in progress for ${cameraId}`,
      });
    }

    // URL encode username and password for RTSP
    const encodedUsername = encodeURIComponent(cam.username);
    const encodedPassword = encodeURIComponent(cam.password);
    const rtspUrl = `rtsp://${encodedUsername}:${encodedPassword}@${cam.ip}:554/cam/realmonitor?channel=1&subtype=0`;
    const outputPath = path.join(__dirname, "../../recordings", fileName);

    // Use ffmpeg to record RTSP stream
    const ffmpeg = spawn("ffmpeg", [
      "-rtsp_transport",
      "tcp",
      "-i",
      rtspUrl,
      "-c",
      "copy",
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov",
      outputPath,
    ]);

    activeRecordings.set(cameraId, ffmpeg);

    ffmpeg.on("close", (code) => {
      console.log(`Recording stopped for ${cameraId} with code ${code}`);
      activeRecordings.delete(cameraId);
    });

    ffmpeg.stderr.on("data", (data) => {
      console.log(`FFmpeg ${cameraId}: ${data}`);
    });

    res.json({
      success: true,
      message: `Recording started for ${cameraId}`,
      fileName,
      outputPath,
    });
  } catch (error: any) {
    console.error("[Recording] Start error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop recording
apiRouter.post("/recording/stop", async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res
        .status(400)
        .json({ success: false, error: "cameraId is required" });
    }

    const ffmpeg = activeRecordings.get(cameraId);
    if (!ffmpeg) {
      return res
        .status(404)
        .json({ success: false, error: `No active recording for ${cameraId}` });
    }

    // Send SIGTERM to gracefully stop ffmpeg
    ffmpeg.kill("SIGTERM");
    activeRecordings.delete(cameraId);

    res.json({
      success: true,
      message: `Recording stopped for ${cameraId}`,
    });
  } catch (error: any) {
    console.error("[Recording] Stop error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download and delete recording
apiRouter.get("/recording/download/:fileName", async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(__dirname, "../../recordings", fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ success: false, error: "Recording not found" });
    }

    // Set headers for download
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", "video/mp4");

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Delete file after streaming completes
    fileStream.on("end", () => {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Error deleting recording ${fileName}:`, err);
        } else {
          console.log(`Recording ${fileName} deleted after download`);
        }
      });
    });

    fileStream.on("error", (error) => {
      console.error(`Error streaming recording ${fileName}:`, error);
      res
        .status(500)
        .json({ success: false, error: "Error downloading recording" });
    });
  } catch (error: any) {
    console.error("[Recording] Download error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Object Detection Photos API
apiRouter.get("/detection/photos", async (req, res) => {
  try {
    const {
      classification,
      startDate,
      endDate,
      minScore,
      maxScore,
      limit = 100,
    } = req.query;

    // Default photos directory (can be configured via environment variable)
    const photosDir =
      "/home/ubuntu/falcon_camera_udp_workers/stockage/ftp_storage/IA";

    // Check if directory exists
    if (!fs.existsSync(photosDir)) {
      return res.json({
        success: true,
        photos: [],
        message: "Detection photos directory not found",
        directory: photosDir,
      });
    }

    // Read all date folders (format: YYYY-MM-DD)
    const dateFolders = fs.readdirSync(photosDir).filter((item) => {
      const fullPath = path.join(photosDir, item);
      return (
        fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item)
      );
    });

    console.log(
      `[Detection Photos] Found ${dateFolders.length} date folders:`,
      dateFolders,
    );

    // Collect all photos from all date folders
    const photos: any[] = [];

    for (const dateFolder of dateFolders) {
      const folderPath = path.join(photosDir, dateFolder);
      const files = fs.readdirSync(folderPath);

      // Process image files in this date folder
      files
        .filter((file) => /\.(jpg|jpeg|png|bmp)$/i.test(file))
        .forEach((filename) => {
          try {
            // Parse filename pattern: classification-YYYYMMDD_HHmmss-score-crop_type-objectId.ext
            // Example: vehicle-20000106_174946-0.78-crop_ther-123.jpg
            const parts = filename.split("-");

            if (parts.length < 3) {
              console.warn(
                `[Detection Photos] Skipping invalid filename: ${filename}`,
              );
              return;
            }

            const classificationName = parts[0];
            const dateStr = parts[1]; // Format: YYYYMMDD_HHmmss
            const scoreStr = parts[2]; // Format: 0.78
            const score = parseFloat(scoreStr) * 100 || 0; // Convert to percentage (0.78 -> 78)

            // Extract objectId from the last part (before file extension)
            // Last part could be like "crop_ther-123.jpg" or just "123.jpg"
            const lastPart = parts[parts.length - 1];
            const objectIdMatch = lastPart.match(/(\d+)\.(jpg|jpeg|png|bmp)$/i);
            const objectId = objectIdMatch ? parseInt(objectIdMatch[1]) : null;

            // Parse date string (YYYYMMDD_HHmmss)
            if (!dateStr || dateStr.length < 15) {
              console.warn(
                `[Detection Photos] Invalid date in filename: ${filename}`,
              );
              return;
            }

            // Split by underscore to separate date and time
            const [datePart, timePart] = dateStr.split("_");

            const year = parseInt(datePart.substring(0, 4));
            const month = parseInt(datePart.substring(4, 6));
            const day = parseInt(datePart.substring(6, 8));
            const hour = parseInt(timePart.substring(0, 2));
            const minute = parseInt(timePart.substring(2, 4));
            const second = parseInt(timePart.substring(4, 6));

            const timestamp = new Date(
              year,
              month - 1,
              day,
              hour,
              minute,
              second,
            );

            photos.push({
              filename,
              dateFolder,
              classification: classificationName,
              timestamp: timestamp.toISOString(),
              score,
              objectId,
              path: `/detection/photos/${dateFolder}/${filename}`,
              size: fs.statSync(path.join(folderPath, filename)).size,
            });
          } catch (err) {
            console.error(
              `[Detection Photos] Error processing file ${filename}:`,
              err,
            );
          }
        });
    }

    console.log(`[Detection Photos] Total photos found: ${photos.length}`);

    // Apply filters
    let filteredPhotos = photos;

    if (classification) {
      filteredPhotos = filteredPhotos.filter(
        (p) =>
          p.classification.toLowerCase() ===
          (classification as string).toLowerCase(),
      );
    }

    if (startDate) {
      const start = new Date(startDate as string);
      filteredPhotos = filteredPhotos.filter(
        (p) => new Date(p.timestamp) >= start,
      );
    }

    if (endDate) {
      const end = new Date(endDate as string);
      filteredPhotos = filteredPhotos.filter(
        (p) => new Date(p.timestamp) <= end,
      );
    }

    if (minScore) {
      filteredPhotos = filteredPhotos.filter(
        (p) => p.score >= parseFloat(minScore as string),
      );
    }

    if (maxScore) {
      filteredPhotos = filteredPhotos.filter(
        (p) => p.score <= parseFloat(maxScore as string),
      );
    }

    // Sort by timestamp (newest first)
    filteredPhotos.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Apply limit
    const limitNum = parseInt(limit as string);
    if (limitNum > 0) {
      filteredPhotos = filteredPhotos.slice(0, limitNum);
    }

    res.json({
      success: true,
      count: filteredPhotos.length,
      total: photos.length,
      photos: filteredPhotos,
      filters: {
        classification,
        startDate,
        endDate,
        minScore,
        maxScore,
        limit,
      },
    });
  } catch (error: any) {
    console.error("[Detection Photos] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get latest crop image for a specific object ID
apiRouter.get("/detection/object/:objectId/crop", async (req, res) => {
  try {
    const { objectId } = req.params;
    const photosDir =
      "/home/ubuntu/falcon_camera_udp_workers/stockage/ftp_storage/IA";

    // Check if directory exists
    if (!fs.existsSync(photosDir)) {
      return res.status(404).json({
        success: false,
        error: "Detection photos directory not found",
      });
    }

    // Read all date folders (format: YYYY-MM-DD)
    const dateFolders = fs.readdirSync(photosDir).filter((item) => {
      const fullPath = path.join(photosDir, item);
      return (
        fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item)
      );
    });

    // Sort date folders descending (newest first)
    dateFolders.sort((a, b) => b.localeCompare(a));

    let latestImage: { path: string; timestamp: Date } | null = null;

    // Search for the latest image with matching objectId
    for (const dateFolder of dateFolders) {
      const folderPath = path.join(photosDir, dateFolder);
      const files = fs
        .readdirSync(folderPath)
        .filter((file) => /\.(jpg|jpeg|png|bmp)$/i.test(file));

      for (const filename of files) {
        try {
          // Parse filename pattern: classification-YYYYMMDD_HHmmss-score-crop_type-objectId.ext
          const parts = filename.split("-");
          if (parts.length < 3) continue;

          // Extract objectId from the last part (before file extension)
          const lastPart = parts[parts.length - 1];
          const objectIdMatch = lastPart.match(/(\d+)\.(jpg|jpeg|png|bmp)$/i);

          if (objectIdMatch && objectIdMatch[1] === objectId) {
            // Parse timestamp from filename
            const dateStr = parts[1]; // Format: YYYYMMDD_HHmmss
            if (!dateStr || dateStr.length < 15) continue;

            const [datePart, timePart] = dateStr.split("_");
            const year = parseInt(datePart.substring(0, 4));
            const month = parseInt(datePart.substring(4, 6));
            const day = parseInt(datePart.substring(6, 8));
            const hour = parseInt(timePart.substring(0, 2));
            const minute = parseInt(timePart.substring(2, 4));
            const second = parseInt(timePart.substring(4, 6));

            const timestamp = new Date(
              year,
              month - 1,
              day,
              hour,
              minute,
              second,
            );

            // Check if this is the latest image so far
            if (!latestImage || timestamp > latestImage.timestamp) {
              latestImage = {
                path: path.join(folderPath, filename),
                timestamp,
              };
            }
          }
        } catch (err) {
          console.error(
            `[Object Crop] Error processing file ${filename}:`,
            err,
          );
        }
      }
    }

    if (!latestImage) {
      return res.status(404).json({
        success: false,
        error: `No crop image found for object ID ${objectId}`,
      });
    }

    // Send the latest image file
    res.sendFile(latestImage.path);
  } catch (error: any) {
    console.error("[Object Crop] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Serve individual detection photo (with date folder)
apiRouter.get("/detection/photos/:dateFolder/:filename", async (req, res) => {
  try {
    const { dateFolder, filename } = req.params;
    const photosDir =
      "/home/ubuntu/falcon_camera_udp_workers/stockage/ftp_storage/IA";
    const filePath = path.join(photosDir, dateFolder, filename);

    // Security check: prevent directory traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(photosDir);

    if (!resolvedPath.startsWith(resolvedDir)) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // Validate date folder format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) {
      return res.status(400).json({
        success: false,
        error: "Invalid date folder format",
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "Photo not found",
      });
    }

    // Send file
    res.sendFile(resolvedPath);
  } catch (error: any) {
    console.error("[Detection Photo] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete all detection photos
apiRouter.delete("/detection/photos", async (req, res) => {
  try {
    const photosDir =
      "/home/ubuntu/falcon_camera_udp_workers/stockage/ftp_storage/IA";

    // Check if directory exists
    if (!fs.existsSync(photosDir)) {
      return res.json({
        success: true,
        message: "Detection photos directory not found",
        deleted: 0,
      });
    }

    // Read all date folders (format: YYYY-MM-DD)
    const dateFolders = fs.readdirSync(photosDir).filter((item) => {
      const fullPath = path.join(photosDir, item);
      return (
        fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item)
      );
    });

    let deletedCount = 0;
    let errorCount = 0;

    // Delete all photos from each date folder
    for (const dateFolder of dateFolders) {
      const folderPath = path.join(photosDir, dateFolder);
      const files = fs
        .readdirSync(folderPath)
        .filter((file) => /\.(jpg|jpeg|png|bmp)$/i.test(file));

      for (const filename of files) {
        try {
          const filePath = path.join(folderPath, filename);
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (err) {
          console.error(`[Detection Photos] Error deleting ${filename}:`, err);
          errorCount++;
        }
      }
    }

    console.log(
      `[Detection Photos] Deleted ${deletedCount} photos from ${dateFolders.length} folders`,
    );

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} detection photos`,
      deleted: deletedCount,
      errors: errorCount,
      folders: dateFolders.length,
    });
  } catch (error: any) {
    console.error("[Detection Photos] Clear all error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ INTRUSION DETECTION API ============
const intrusionPresetsPath = path.join(__dirname, "../../data/intrusion-presets.json");

// Ensure data directory exists
const dataDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize presets file if it doesn't exist
if (!fs.existsSync(intrusionPresetsPath)) {
  fs.writeFileSync(intrusionPresetsPath, JSON.stringify([]), "utf-8");
}

interface IntrusionRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IntrusionPreset {
  id: string;
  name: string;
  cameraId: "cam1" | "cam2";
  timestamp: number;
  rectangles: IntrusionRectangle[];
  imageData: string;
  presetNumber?: number; // Camera PTZ preset number (30-128)
}

// Get all intrusion presets
apiRouter.get("/intrusion/presets", async (req, res) => {
  try {
    const data = fs.readFileSync(intrusionPresetsPath, "utf-8");
    const presets: IntrusionPreset[] = JSON.parse(data);

    res.json({
      success: true,
      presets,
    });
  } catch (error: any) {
    console.error("[Intrusion] Error reading presets:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create new intrusion preset
apiRouter.post("/intrusion/presets", async (req, res) => {
  try {
    const { name, cameraId, rectangles, imageData } = req.body;

    if (!name || !cameraId || !rectangles || !imageData) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, cameraId, rectangles, imageData",
      });
    }

    if (rectangles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one detection zone is required",
      });
    }

    // Read existing presets
    const data = fs.readFileSync(intrusionPresetsPath, "utf-8");
    const presets: IntrusionPreset[] = JSON.parse(data);

    // Find next available preset number (30-128)
    const usedPresetNumbers = presets
      .filter(p => p.cameraId === cameraId && typeof p.presetNumber === 'number')
      .map(p => p.presetNumber as number);

    let presetNumber = 30;
    while (usedPresetNumbers.includes(presetNumber) && presetNumber <= 128) {
      presetNumber++;
    }

    if (presetNumber > 128) {
      return res.status(400).json({
        success: false,
        error: "Maximum number of presets reached (30-128). Please delete an existing preset.",
      });
    }

    // Create PTZ preset on camera
    try {
      const cam = cameras[cameraId];
      if (!cam) {
        throw new Error(`Camera ${cameraId} not found`);
      }

      // Get camera API
      const api = await getAPIs(cameraId);
      // Set the preset at current position
      await api.ptz.setPreset(presetNumber);
      console.log(`[Intrusion] PTZ preset ${presetNumber} "${name}" created on camera ${cameraId}`);
    } catch (ptzError: any) {
      console.error(`[Intrusion] Error setting PTZ preset on camera:`, ptzError);
      return res.status(500).json({
        success: false,
        error: `Failed to create PTZ preset on camera: ${ptzError.message}`,
      });
    }

    // Create new preset with PTZ preset number
    const newPreset: IntrusionPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      cameraId,
      timestamp: Date.now(),
      rectangles,
      imageData,
      presetNumber,
    };

    // Add to presets array
    presets.push(newPreset);

    // Save to file
    fs.writeFileSync(intrusionPresetsPath, JSON.stringify(presets, null, 2), "utf-8");

    console.log(`[Intrusion] Created preset "${name}" for ${cameraId} with ${rectangles.length} zones and PTZ preset #${presetNumber}`);

    res.json({
      success: true,
      preset: newPreset,
    });
  } catch (error: any) {
    console.error("[Intrusion] Error creating preset:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete intrusion preset
apiRouter.delete("/intrusion/presets/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Read existing presets
    const data = fs.readFileSync(intrusionPresetsPath, "utf-8");
    let presets: IntrusionPreset[] = JSON.parse(data);

    // Find preset
    const presetIndex = presets.findIndex((p) => p.id === id);
    if (presetIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Preset not found",
      });
    }

    const deletedPreset = presets[presetIndex];

    // Delete PTZ preset from camera if it has a preset number
    if (deletedPreset.presetNumber) {
      try {
        const api = await getAPIs(deletedPreset.cameraId);
        await api.ptz.clearPreset(deletedPreset.presetNumber);
        console.log(`[Intrusion] Deleted PTZ preset #${deletedPreset.presetNumber} from camera ${deletedPreset.cameraId}`);
      } catch (ptzError: any) {
        console.error(`[Intrusion] Error deleting PTZ preset from camera:`, ptzError);
        // Continue with deletion even if camera preset deletion fails
      }
    }

    // Remove preset from array
    presets = presets.filter((p) => p.id !== id);

    // Save to file
    fs.writeFileSync(intrusionPresetsPath, JSON.stringify(presets, null, 2), "utf-8");

    console.log(`[Intrusion] Deleted preset "${deletedPreset.name}" (${id})`);

    res.json({
      success: true,
      message: "Preset deleted successfully",
      deletedPreset,
    });
  } catch (error: any) {
    console.error("[Intrusion] Error deleting preset:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Start intrusion detection with preset
apiRouter.post("/intrusion/start", async (req, res) => {
  try {
    const { presetId } = req.body;

    if (!presetId) {
      return res.status(400).json({
        success: false,
        error: "Missing presetId",
      });
    }

    // Read presets
    const data = fs.readFileSync(intrusionPresetsPath, "utf-8");
    const presets: IntrusionPreset[] = JSON.parse(data);

    // Find preset
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      return res.status(404).json({
        success: false,
        error: "Preset not found",
      });
    }

    // TODO: Send command to backend to start intrusion detection with zones
    // For now, just log and return success
    console.log(`[Intrusion] Starting intrusion detection with preset "${preset.name}" on ${preset.cameraId}`);
    console.log(`[Intrusion] Detection zones:`, preset.rectangles);

    // You can integrate with your backend here:
    await fetch(`http://localhost:9898/ia_process/intrusion/${preset.cameraId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones: preset.rectangles })
    });

    res.json({
      success: true,
      message: `Intrusion detection started with preset "${preset.name}"`,
      preset,
    });
  } catch (error: any) {
    console.error("[Intrusion] Error starting intrusion detection:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ RECORDINGS ENDPOINT ============
// Serve recorded video files
apiRouter.use(
  "/recordings",
  express.static(path.join(__dirname, "../../recordings")),
);

// Serve React static files (must be after all API routes)
setupReactStatic(app);

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
  console.log(`  GET  http://localhost:${PORT}/detection/photos`);
});

export default app;

