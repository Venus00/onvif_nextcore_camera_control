/**
 * Camera Setup API - Section 3
 * Works with external authenticated client (token-based)
 */

import { profile } from "console";

// ============ TYPES ============

export interface CameraClient {
  fetch(url: string): Promise<{ text(): Promise<string> }>;
}
const VIDEO_COLOR_KEYMAP: Record<string, string> = {
  brightness: "Brightness",
  contrast: "Contrast",
  saturability: "Saturation",
  chromaCNT: "ChromaSuppress",
  gamma: "Gamma",
  hue: "Hue",

  // style: "Style",
  // timeSection: "TimeSection",
  // add others if needed
};

interface VideoModeParams {
  mode: number; // 0 = full-time, 1 = schedule
  config0: number; // 0=Day, 1=Night, 2=Normal
  config1: number;
  timeSection?: string[][]; // [7 days][6 periods]
}
export interface CameraConnection {
  client: CameraClient;
  ip: string;
}

export type Channel = 0 | 1; // 0 = Visible, 1 = Thermal
export type ConfigProfile = 0 | 1 | 2; // 0 = Day, 1 = Night, 2 = Normal

export type ParsedConfig = Record<string, string>;

// ============ PARAM TYPES ============

export interface VideoColorParams {
  Brightness?: number;
  Contrast?: number;
  Saturation?: number;
  Hue?: number;
  Gamma?: number;
  ChromaSuppress?: number;
  Style?:
    | "Gentle"
    | "Standard"
    | "Flamboyant"
    | "WhiteHot"
    | "Lava"
    | "IronRed"
    | "HotIron"
    | "Medical"
    | "Arctic"
    | "Rainbow1"
    | "Rainbow2"
    | "Tint"
    | "BlackHot";
}

export interface DayNightParams {
  Mode?:
    | "Brightness"
    | "Color"
    | "BlackWhite"
    | "AlarmInput"
    | "PhotoresistorExt";
  Delay?: number;
  Sensitivity?: 1 | 2 | 3;
  Type?: "Electron" | "ICR" | "Mechanism";
}

export interface ExposureParams {
  Mode?: "Auto" | "Lowlight" | "Manual" | "Customized";
  AntiFlicker?: "Outdoor" | "50Hz" | "60Hz";
  Gain?: number;
  GainMax?: number;
  GainMin?: number;
  Iris?: number;
  IrisMax?: number;
  IrisMin?: number;
  ShutterSpeed?: string;
  ShutterSpeedMax?: string;
  ShutterSpeedMin?: string;
  SlowShutter?: boolean;
}

export interface WhiteBalanceParams {
  Mode?:
    | "Auto"
    | "Indoor"
    | "Outdoor"
    | "ATW"
    | "Manual"
    | "Sodium"
    | "Natural"
    | "Street";
  RedGain?: number;
  BlueGain?: number;
}

export interface BacklightParams {
  Mode?: "Off" | "BLC" | "WDR" | "HLC" | "SSA";
  GlareLevel?: number;
  WideDynamicRange?: number;
}

export interface ZoomParams {
  DigitalZoom?: boolean;
  Speed?: number;
  ZoomLimit?: number;
}

export interface FocusParams {
  Mode?: "Auto" | "Manual" | "SemiAuto";
  Sensitivity?: "High" | "Default" | "Low";
  IRCorrection?: "Auto" | "IR" | "Multiband";
  FocusLimit?: number;
}

export interface DefogParams {
  Mode?: "Off" | "Auto" | "Manual";
  Intensity?: number;
}

export interface FusionParams {
  Mode?: "Off" | "On";
  FusionRate?: number;
  PlaneOffset?: [number, number];
}

export interface FlipParams {
  Flip?: boolean;
  Mirror?: boolean;
  Rotate90?: 0 | 1 | 2 | 3;
}

export interface DenoiseParams {
  Denoise2D?: number;
  Denoise3D?: number;
}

export interface LightingParams {
  Mode?: "Off" | "Auto" | "Manual" | "SmartIR" | "LaserIR";
  Intensity?: number;
  IRIntensity?: number;
  WhiteLightIntensity?: number;
}

export interface DewaveParams {
  Mode?: "Off" | "Manual" | "Auto";
  Intensity?: 0 | 1 | 2;
}

export interface EncodeVideoParams {
  Compression?: "H.264" | "H.265" | "MJPEG";
  Resolution?: string;
  BitRateControl?: "CBR" | "VBR";
  BitRate?: number;
  FPS?: number;
  GOP?: number;
  Quality?: number;
  Profile?: "Baseline" | "Main" | "High";
}

export interface AudioEncodeParams {
  AudioEnable?: boolean;
  Compression?: "AAC" | "MPEG2" | "Layer2";
  Frequency?: 8000 | 16000;
}

export interface VideoWidgetParams {
  ChannelTitleEnable?: boolean;
  TimeEnable?: boolean;
  WeekEnable?: boolean;
}

export interface ROIParams {
  Enable?: boolean;
  Level?: number;
  Rect?: [number, number, number, number];
}

export interface PIPParams {
  Enable?: boolean;
  Position?: "LeftTop" | "RightTop" | "LeftBottom" | "RightBottom";
  Size?: "Small" | "Middle" | "Large";
}

// ============ MAIN CLASS ============

export class CameraSetupAPI {
  private client: CameraClient;
  private ip: string;

  constructor(connection: CameraConnection) {
    this.client = connection.client;
    this.ip = connection.ip;
  }

  // ============ CORE METHODS ============

  private buildUrl(path: string): string {
    return `http://${this.ip}${path}`;
  }

  private async request(url: string): Promise<string> {
    const response = await this.client.fetch(url);
    return await response.text();
  }

  private parseResponse(text: string): ParsedConfig {
    const result: ParsedConfig = {};
    const lines = text.trim().split("\n");

    for (const line of lines) {
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();
        result[key] = value;
      }
    }

    return result;
  }

  private formatParams(
    prefix: string,
    params: Record<string, any>,
    channel?: number,
    config?: number,
  ): string {
    const bracket =
      config !== undefined
        ? `[${channel ?? 0}][${config}]`
        : channel !== undefined
          ? `[${channel}]`
          : "";

    const parts: string[] = [];

    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          parts.push(
            `${prefix}${bracket}.${key}[${i}]=${encodeURIComponent(v)}`,
          );
        });
      } else {
        parts.push(`${prefix}${bracket}.${key}=${encodeURIComponent(value)}`);
      }
    }
    console.log(parts);
    return parts.join("&");
  }

  // ============ GENERIC GET/SET ============

  async getConfig(configName: string): Promise<ParsedConfig> {
    const url = this.buildUrl(
      `/cgi-bin/configManager.cgi?action=getConfig&name=${configName}`,
    );
    const text = await this.request(url);
    return this.parseResponse(text);
  }

  async setConfig(paramString: string): Promise<string> {
    const url = this.buildUrl(
      `/cgi-bin/configManager.cgi?action=setConfig&${paramString}`,
    );
    console.log(paramString);
    const text = await this.request(url);
    return text.trim();
  }

  // ============ 3.1 CAMERA CONDITIONS ============

  // 3.1.1 VideoColor
  async getVideoColor(): Promise<ParsedConfig> {
    return this.getConfig("VideoColor");
  }

  // helper map: frontendKey -> camera param name
  async setVideoColor(
    params: Record<string, any>,
    channel: number = 0,
  ): Promise<string> {
    const PROFILE_TO_INDEX: Record<string, number> = {
      daytime: 0,
      nighttime: 1,
      normal: 2,
    };

    const VIDEO_COLOR_KEYMAP: Record<string, string> = {
      brightness: "Brightness",
      contrast: "Contrast",
      saturability: "Saturation",
      chromaCNT: "ChromaSuppress",
      gamma: "Gamma",
      hue: "Hue",
    };
    let profileName = "normal";
    const mapped: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k === "profile") {
        profileName = v;
        continue;
      } // ⛔ DO NOT send profile=...
      const camKey = VIDEO_COLOR_KEYMAP[k] ?? k;
      mapped[camKey] = v;
    }

    const config = PROFILE_TO_INDEX[profileName];
    console.log("Mapped VideoColor params:", config, profileName);
    return this.setConfig(
      this.formatParams("VideoColor", mapped, channel, config),
    );
  }

  // 3.1.2 VideoSharpness
  async getVideoSharpness(): Promise<ParsedConfig> {
    return this.getConfig("VideoInSharpness");
  }

  // Add to your backend client class (next to setVideoColor)
  async setVideoSharpness(
    params: Record<string, any>,
    channel: number = 0,
  ): Promise<string> {
    const PROFILE_TO_INDEX: Record<string, number> = {
      daytime: 0,
      nighttime: 1,
      normal: 2,
    };

    // UI key -> camera parameter name
    const SHARPNESS_KEYMAP: Record<string, string> = {
      sharpness: "Sharpness",
      sharpnessCNT: "Level", // sometimes called Level in device
      mode: "Mode", // e.g. Mode=1
      IDEGain: "IDEGain", // thermal / special params (if present)
      IDELevel: "IDELevel",
      IDEMode: "IDEMode",
    };

    let profileName: "daytime" | "nighttime" | "normal" = "normal";
    const mapped: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k === "profile") {
        if (
          typeof v === "string" &&
          (v === "daytime" || v === "nighttime" || v === "normal")
        ) {
          profileName = v;
        }
        continue;
      }
      const camKey = SHARPNESS_KEYMAP[k] ?? k;
      mapped[camKey] = v;
    }

    const config = PROFILE_TO_INDEX[profileName];
    // formatParams will construct: table.VideoInSharpness[0][<config>].<Param>=<value>
    return this.setConfig(
      this.formatParams("VideoInSharpness", mapped, channel, config),
    );
  }

  // 3.1.3 VideoDenoise
  async getVideoDenoise(): Promise<ParsedConfig> {
    return this.getConfig("VideoInDenoise");
  }

  async setVideoDenoise(
    params: DenoiseParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInDenoise", params, channel, config),
    );
  }

  // 3.1.4 VideoFlip
  async getVideoFlip(): Promise<ParsedConfig> {
    return this.getConfig("VideoImageControl");
  }

  async setVideoFlip(
    params: FlipParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoImageControl", params, channel, config),
    );
  }

  // 3.1.5 VideoStabilizer
  async(): Promise<ParsedConfig> {
    return this.getConfig("VideoImageControl");
  }

  async setVideoStabilizer(
    stable: number,
    channel: Channel = 0,
    config: ConfigProfile = 0,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams(
        "VideoImageControl",
        { Stable: stable },
        channel,
        config,
      ),
    );
  }

  // 3.1.6 VideoExposure
  async getVideoExposure(): Promise<ParsedConfig> {
    return this.getConfig("VideoInExposure");
  }

  async setVideoExposure(
    params: ExposureParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInExposure", params, channel, config),
    );
  }

  // 3.1.7 VideoBacklight
  async getVideoBacklight(): Promise<ParsedConfig> {
    return this.getConfig("VideoInBacklight");
  }

  async setVideoBacklight(
    params: BacklightParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInBacklight", params, channel, config),
    );
  }

  // 3.1.8 VideoWhiteBalance
  async getVideoWhiteBalance(): Promise<ParsedConfig> {
    return this.getConfig("VideoInWhiteBalance");
  }

  async setVideoWhiteBalance(
    params: WhiteBalanceParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInWhiteBalance", params, channel, config),
    );
  }

  // 3.1.9 VideoDayNight
  async getVideoDayNight(): Promise<ParsedConfig> {
    return this.getConfig("VideoInDayNight");
  }

  async setVideoDayNight(
    params: DayNightParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInDayNight", params, channel, config),
    );
  }

  // 3.1.10 VideoZoom
  async getVideoZoom(): Promise<ParsedConfig> {
    return this.getConfig("VideoInZoom");
  }

  async setVideoZoom(
    params: ZoomParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInZoom", params, channel, config),
    );
  }

  // 3.1.11 VideoFocus
  async getVideoFocus(): Promise<ParsedConfig> {
    return this.getConfig("VideoInFocus");
  }

  async setVideoFocus(
    params: FocusParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInFocus", params, channel, config),
    );
  }

  // 3.1.12 VideoLighting
  async getVideoLighting(): Promise<ParsedConfig> {
    return this.getConfig("VideoInLighting");
  }

  async setVideoLighting(
    params: LightingParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInLighting", params, channel, config),
    );
  }

  // 3.1.13 VideoDefog
  async getVideoDefog(): Promise<ParsedConfig> {
    return this.getConfig("VideoInDefog");
  }

  async setVideoDefog(
    params: DefogParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInDefog", params, channel, config),
    );
  }

  // 3.1.14 VideoFFC (Thermal)
  async getVideoFFC(): Promise<ParsedConfig> {
    return this.getConfig("VideoInFFC");
  }

  async setVideoFFC(
    params: { Mode?: "Auto" | "Manual"; Period?: number },
    channel: Channel = 1,
  ): Promise<string> {
    return this.setConfig(this.formatParams("VideoInFFC", params, channel));
  }

  // 3.1.15 VideoFusion (Bispectral)
  async getVideoFusion(): Promise<ParsedConfig> {
    return this.getConfig("VideoInFusion");
  }

  async setVideoFusion(
    params: FusionParams,
    channel: Channel = 1,
    config: ConfigProfile = 0,
  ): Promise<string> {
    const parts: string[] = [];
    const bracket = `[${channel}][${config}]`;

    for (const [key, value] of Object.entries(params)) {
      if (key === "PlaneOffset" && Array.isArray(value)) {
        parts.push(`VideoInFusion${bracket}.PlaneOffset[0]=${value[0]}`);
        parts.push(`VideoInFusion${bracket}.PlaneOffset[1]=${value[1]}`);
      } else {
        parts.push(
          `VideoInFusion${bracket}.${key}=${encodeURIComponent(String(value))}`,
        );
      }
    }

    return this.setConfig(parts.join("&"));
  }

  // 3.1.16 VideoDewave
  async getVideoDewave(): Promise<ParsedConfig> {
    return this.getConfig("VideoInDewave");
  }

  async setVideoDewave(
    params: DewaveParams,
    channel: Channel = 0,
    config: ConfigProfile = 2,
  ): Promise<string> {
    return this.setConfig(
      this.formatParams("VideoInDewave", params, channel, config),
    );
  }

  // 3.1.17 VideoMode
  async getVideoMode(): Promise<ParsedConfig> {
    const result = this.getConfig("VideoInMode");
    console.log("getVideoMode result:", result);

    return result;
  }

  // Replace your current setVideoMode with this:

  async setVideoMode(
    params: VideoModeParams,
    channel: Channel = 0,
  ): Promise<string> {
    const parts: string[] = [];

    // Mode
    parts.push(`VideoInMode[${channel}].Mode=${params.mode}`);

    // ========================
    if (params.mode === 1) {
      // Expect params.timeSection like: string[7][N]
      // e.g. "0 06:30:59-18:30:00" for each period
      parts.push(
        `VideoInMode[${channel}].TimeSection[0][0]=${params.timeSection?.[0]?.[0]}`,
      );

      return this.setConfig(parts.join("&"));
    }

    // Config[0] and Config[1]
    parts.push(`VideoInMode[${channel}].Config[0]=${params.config0}`);
    parts.push(`VideoInMode[${channel}].Config[1]=${params.config1}`);

    // TimeSection (if provided, for schedule mode)
    if (params.timeSection && Array.isArray(params.timeSection)) {
      params.timeSection.forEach((day, dayIndex) => {
        day.forEach((period, periodIndex) => {
          parts.push(
            `VideoInMode[${channel}].TimeSection[${dayIndex}][${periodIndex}]=${period}`,
          );
        });
      });
    }

    return this.setConfig(parts.join("&"));
  }
  // ============ 3.2 ENCODE SETTINGS ============

  // 3.2.1 Encode
  async getEncode(): Promise<ParsedConfig> {
    return this.getConfig("Encode");
  }

  async setEncode(
    params: EncodeVideoParams,
    channel: Channel = 0,
  ): Promise<string> {
    // console.log("setEncode params:", params);
    const mainStreamResult = await this.setMainStreamEncode(params, channel);
    // const subStreamResult = await this.setSubStreamEncode(params, channel);
    return `${mainStreamResult}`;
  }

  async setMainStreamEncode(
    params: EncodeVideoParams,
    channel: Channel = 0,
    extraStream: number = 0,
  ): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
    console.log("setEncode params:", parts.join("&"));

    return this.setConfig(parts.join("&"));
  }

  // 3.2.2 ChannelTitle
  async getChannelTitle(): Promise<ParsedConfig> {
    return this.getConfig("ChannelTitle");
  }

  async setChannelTitle(name: string, channel: Channel = 0): Promise<string> {
    return this.setConfig(
      `ChannelTitle[${channel}].Name=${encodeURIComponent(name)}`,
    );
  }

  // 3.2.3 & 3.2.4 VideoWidget (OSD)
  async getVideoWidget(): Promise<ParsedConfig> {
    return this.getConfig("VideoWidget");
  }

  async setVideoWidget(
    params: VideoWidgetParams,
    channel: Channel = 0,
  ): Promise<string> {
    return this.setConfig(this.formatParams("VideoWidget", params, channel));
  }

  // 3.2.5 TextOverlay
  async setTextOverlay(
    text: string,
    enable: boolean = true,
    channel: Channel = 0,
    index: number = 0,
  ): Promise<string> {
    const parts = [
      `VideoWidget[${channel}].TextOverlay[${index}].Enable=${enable}`,
      `VideoWidget[${channel}].TextOverlay[${index}].Text=${encodeURIComponent(text)}`,
    ];
    return this.setConfig(parts.join("&"));
  }

  // 3.2.8 GPSInfo
  async getGPSInfo(): Promise<ParsedConfig> {
    return this.getConfig("GPSInfo");
  }

  // 3.2.9 VideoROI
  async getVideoROI(): Promise<ParsedConfig> {
    return this.getConfig("VideoEncodeROI");
  }

  async setVideoROI(
    params: ROIParams,
    channel: Channel = 0,
    stream: number = 0,
    roiIndex: number = 0,
  ): Promise<string> {
    const parts: string[] = [];
    const prefix = `VideoEncodeROI[${channel}]`;

    for (const [key, value] of Object.entries(params)) {
      if (key === "Rect" && Array.isArray(value)) {
        for (let i = 0; i < 4; i++) {
          parts.push(`${prefix}.Rect[${i}]=${value[i]}`);
        }
      } else {
        parts.push(`${prefix}.${key}=${encodeURIComponent(String(value))}`);
      }
    }
    // console.log("setVideoROI params:", parts.join("&"));
    return this.setConfig(parts.join("&"));
  }

  // 3.2.10 VideoPIP
  async getVideoPIP(): Promise<ParsedConfig> {
    return this.getConfig("VideoInPIP");
  }

  async setVideoPIP(params: PIPParams, channel: Channel = 0): Promise<string> {
    return this.setConfig(this.formatParams("VideoInPIP", params, channel));
  }

  // 3.2.11 AudioEncode
  async setAudioEncode(
    params: AudioEncodeParams,
    channel: Channel = 0,
    streamType: "MainFormat" | "ExtraFormat" = "MainFormat",
    index: number = 0,
  ): Promise<string> {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(params)) {
      if (key === "AudioEnable") {
        parts.push(
          `Encode[${channel}].${streamType}[${index}].AudioEnable=${value}`,
        );
      } else {
        parts.push(
          `Encode[${channel}].${streamType}[${index}].Audio.${key}=${encodeURIComponent(String(value))}`,
        );
      }
    }

    return this.setConfig(parts.join("&"));
  }

  // ============ BULK OPERATIONS ============

  async getAllConfigs(): Promise<Record<string, ParsedConfig>> {
    const configNames = [
      "VideoColor",
      "VideoInSharpness",
      "VideoInDenoise",
      "VideoInFlip",
      "VideoImageControl",
      "VideoInExposure",
      "VideoInBacklight",
      "VideoInWhiteBalance",
      "VideoInDayNight",
      "VideoInZoom",
      "VideoInFocus",
      "VideoInLighting",
      "VideoInDefog",
      "VideoInFFC",
      "VideoInFusion",
      "VideoInDewave",
      "VideoInMode",
      "Encode",
      "ChannelTitle",
      "VideoWidget",
      "VideoInROI",
      "VideoInPIP",
    ];

    const results: Record<string, ParsedConfig> = {};

    for (const name of configNames) {
      try {
        results[name] = await this.getConfig(name);
      } catch (e: any) {
        results[name] = { error: e.message || `Failed to get ${name}` };
      }
    }

    return results;
  }

  // ============ UTILITY ============

  extractValues(
    config: ParsedConfig,
    channel: number = 0,
    configProfile?: number,
  ): Record<string, string> {
    const pattern =
      configProfile !== undefined
        ? new RegExp(`\\[${channel}\\]\\[${configProfile}\\]\\.(.+)$`)
        : new RegExp(`\\[${channel}\\]\\.(.+)$`);

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(config)) {
      const match = key.match(pattern);
      if (match) {
        result[match[1]] = value;
      }
    }

    return result;
  }

  isSuccess(response: string): boolean {
    return response.toUpperCase() === "OK";
  }
}

export default CameraSetupAPI;
