/**
 * PTZ API - Section 5
 * Protocol, Control, Preset, Tour, ScanTour, AutoScan, Pattern, IdleMotion, PowerUp, ScheduledTask
 */

import { CameraClient, CameraConnection, ParsedConfig } from './CameraSetupAPI';

// ============ TYPES ============

export type PTZChannel = 0 | 1 | 2; // 0,1=visible, 2=thermal

export type PTZCode =
  | 'Up' | 'Down' | 'Left' | 'Right'
  | 'LeftUp' | 'RightUp' | 'LeftDown' | 'RightDown'
  | 'ZoomWide' | 'ZoomTele'
  | 'FocusNear' | 'FocusFar'
  | 'IrisLarge' | 'IrisSmall'
  | 'SetPreset' | 'GotoPreset' | 'ClearPreset'
  | 'AddTour' | 'DelTour' | 'StartTour' | 'StopTour' | 'ClearTour'
  | 'StartScanTour' | 'StopScanTour'
  | 'AutoPanOn' | 'AutoPanOff'
  | 'SetLeftLimit' | 'SetRightLimit'
  | 'AutoScanOn' | 'AutoScanOff'
  | 'SetPatternBegin' | 'SetPatternEnd' | 'StartPattern' | 'StopPattern' | 'ClearPattern'
  | 'Position' | 'PositionABS' | 'PositionABSHD' | 'PositionABSHDX'
  | 'Continuously' | 'Relatively'
  | 'LightOtherOn' | 'LightOtherOff'
  | 'WiperOn' | 'DefrostOn' | 'DefrostOff'
  | 'FanOn' | 'FanOff' | 'HeaterOn' | 'HeaterOff';

export interface PTZProtocolParams {
  ProtocolName?: string;
  Address?: number;
  Attribute?: number[]; // [BaudRate, DataBits, Parity, StopBit]
}

export interface PresetParams {
  Enable?: boolean;
  Name?: string;
  Position?: [number, number, number]; // [Pan, Tilt, Zoom]
  PanAngleHD?: number;
  TiltAngleHD?: number;
  ZoomMapValue?: number;
  FocusMapValue?: number;
  Type?: 0 | 1; // 0=Regular, 1=iVS
}

export interface TourParams {
  Enable?: boolean;
  Name?: string;
  Presets?: Array<[number, number, number]>; // [[presetId, dwellTime, speed], ...]
}

export interface ScanTourParams {
  Enable?: boolean;
  Name?: string;
  Direction?: 1 | -1; // 1=clockwise, -1=counter
  PanSpeed?: number;
  StartPresetId?: number;
  StopPresetId?: number;
  TiltStepAngle?: number;
}

export interface AutoScanParams {
  LeftEnable?: boolean;
  RightEnable?: boolean;
  LeftDuration?: number;
  RightDuration?: number;
  ScanSpeed?: number;
}

export interface AutoPatternParams {
  RecordState?: boolean;
}

export interface IdleMotionParams {
  Enable?: boolean;
  Function?: 'Preset' | 'Tour' | 'ScanTour' | 'Scan' | 'Pattern';
  PresetId?: number;
  TourId?: number;
  ScanTourId?: number;
  ScanId?: number;
  PatternId?: number;
  Timer?: number; // 1-60 min
}

export interface PowerUpParams {
  Enable?: boolean;
  Function?: 'Auto' | 'Preset' | 'Tour' | 'ScanTour' | 'Scan' | 'Pattern';
  PresetId?: number;
  TourId?: number;
  ScanTourId?: number;
  ScanId?: number;
  PatternId?: number;
}

export interface ScheduledTaskParams {
  Enable?: boolean;
  Function?: 'Preset' | 'Tour' | 'ScanTour' | 'Scan' | 'Pattern';
  PresetId?: number;
  TourId?: number;
  ScanTourId?: number;
  ScanId?: number;
  PatternId?: number;
  AutoHomingTime?: number;
}

// ============ PTZ API CLASS ============

export class PTZAPI {
  private client: CameraClient;
  private ip: string;

  constructor(connection: CameraConnection) {
    this.client = connection.client;
    this.ip = connection.ip;
  }

  private buildUrl(path: string): string {
    return `http://${this.ip}${path}`;
  }

  private async request(url: string): Promise<string> {
        console.log('PTZ Control URL:', url);
    const response = await this.client.fetch(url);
    return await response.text();
  }

  private parseResponse(text: string): ParsedConfig {
    const result: ParsedConfig = {};
    for (const line of text.trim().split('\n')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        result[line.substring(0, eqIndex).trim()] = line.substring(eqIndex + 1).trim();
      }
    }
    return result;
  }

  async getConfig(configName: string): Promise<ParsedConfig> {
    const url = this.buildUrl(`/cgi-bin/configManager.cgi?action=getConfig&name=${configName}`);
    return this.parseResponse(await this.request(url));
  }

  async setConfig(paramString: string): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/configManager.cgi?action=setConfig&${paramString}`);
    return (await this.request(url)).trim();
  }

  isSuccess(response: string): boolean {
    return response.toUpperCase() === 'OK';
  }

  // ========== 5.1 Protocol ==========

  async getPtzProtocol(): Promise<ParsedConfig> {
    return this.getConfig('Ptz');
  }

  async setPtzProtocol(params: PTZProtocolParams, channel: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key === 'Attribute' && Array.isArray(value)) {
        value.forEach((v, i) => parts.push(`Ptz[${channel}].Attribute[${i}]=${v}`));
      } else {
        parts.push(`Ptz[${channel}].${key}=${encodeURIComponent(String(value))}`);
      }
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.2 PTZ Control ==========

  async getPTZStatus(): Promise<ParsedConfig> {
    const url = this.buildUrl('/cgi-bin/ptz.cgi?action=getStatus');
    return this.parseResponse(await this.request(url));
  }

  async ptzControl(
    action: 'start' | 'stop',
    channel: PTZChannel,
    code: PTZCode,
    arg1: number = 0,
    arg2: number = 0,
    arg3: number = 0,
    arg4?: number
  ): Promise<string> {
    let url = this.buildUrl(
      `/cgi-bin/ptz.cgi?action=${action}&channel=0&code=${code}&arg1=${arg1}&arg2=${arg2}&arg3=${arg3}`
    );
    // if (arg4 !== undefined) url += `&arg4=${arg4}`;
    return (await this.request(url)).trim();
  }

  // Convenience methods for common PTZ operations
  async moveUp(channel: PTZChannel = 0, speed: number = 4): Promise<string> {
    return this.ptzControl('start', channel, 'Up', speed);
  }

  async moveDown(channel: PTZChannel = 0, speed: number = 4): Promise<string> {
    return this.ptzControl('start', channel, 'Down', speed);
  }

  async moveLeft(channel: PTZChannel = 0, speed: number = 4): Promise<string> {
    return this.ptzControl('start', channel, 'Left', speed);
  }

  async moveRight(channel: PTZChannel = 0, speed: number = 4): Promise<string> {
    return this.ptzControl('start', channel, 'Right', speed);
  }

  async stopMove(channel: PTZChannel = 0, code: PTZCode = 'Up'): Promise<string> {
    return this.ptzControl('stop', channel, code);
  }

  async zoomIn(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'ZoomTele');
  }

  async zoomOut(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'ZoomWide');
  }

  async stopZoom(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('stop', channel, 'ZoomTele');
  }

  async focusNear(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'FocusNear');
  }

  async focusFar(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'FocusFar');
  }

  async stopFocus(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('stop', channel, 'FocusNear');
  }

  async gotoPreset(presetId: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'GotoPreset', presetId);
  }

  async setPreset(presetId: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'SetPreset', presetId);
  }

  async clearPreset(presetId: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'ClearPreset', presetId);
  }

  async startTour(tourId: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'StartTour', tourId);
  }

  async stopTour(tourId: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'StopTour', tourId);
  }

  async position3D(x: number, y: number, zoom: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'Position', x, y, zoom);
  }

  async positionAbsolute(pan: number, tilt: number, zoom: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'PositionABS', pan, tilt, zoom);
  }

  async positionAbsoluteHD(pan: number, tilt: number, zoom: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'PositionABSHD', pan, tilt, zoom);
  }

  async continuousMove(hSpeed: number, vSpeed: number, zSpeed: number, timeout: number, channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'Continuously', hSpeed, vSpeed, zSpeed, timeout);
  }

  // ========== 5.3.1 Preset ==========

  async getPresets(): Promise<ParsedConfig> {
    return this.getConfig('PtzPreset');
  }

  async setPresetConfig(params: PresetParams, channel: number = 0, presetId: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key === 'Position' && Array.isArray(value)) {
        value.forEach((v, i) => parts.push(`PtzPreset[${channel}][${presetId}].Position[${i}]=${v}`));
      } else {
        parts.push(`PtzPreset[${channel}][${presetId}].${key}=${encodeURIComponent(String(value))}`);
      }
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.2 Tour ==========

  async getTours(): Promise<ParsedConfig> {
    return this.getConfig('PtzTour');
  }

  async setTourConfig(params: TourParams, channel: number = 0, tourId: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key === 'Presets' && Array.isArray(value)) {
        value.forEach((preset, i) => {
          parts.push(`PtzTour[${channel}][${tourId}].Presets[${i}][0]=${preset[0]}`);
          parts.push(`PtzTour[${channel}][${tourId}].Presets[${i}][1]=${preset[1]}`);
          parts.push(`PtzTour[${channel}][${tourId}].Presets[${i}][2]=${preset[2]}`);
        });
      } else {
        parts.push(`PtzTour[${channel}][${tourId}].${key}=${encodeURIComponent(String(value))}`);
      }
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.3 ScanTour ==========

  async getScanTours(): Promise<ParsedConfig> {
    return this.getConfig('PtzScanTour');
  }

  async setScanTourConfig(params: ScanTourParams, channel: number = 0, scanTourId: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`PtzScanTour[${channel}][${scanTourId}].${key}=${encodeURIComponent(String(value))}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.4 AutoScan ==========

  async getAutoScan(): Promise<ParsedConfig> {
    return this.getConfig('AutoScan');
  }

  async setAutoScan(params: AutoScanParams, channel: number = 0, scanId: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`AutoScan[${channel}][${scanId}].${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.5 AutoPattern ==========

  async getAutoPattern(): Promise<ParsedConfig> {
    return this.getConfig('AutoPattern');
  }

  async setAutoPattern(recordState: boolean, channel: number = 0, patternId: number = 0): Promise<string> {
    return this.setConfig(`AutoPattern[${channel}][${patternId}].RecordState=${recordState}`);
  }

  // ========== 5.3.6 AutoPan ==========

  async startAutoPan(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'AutoPanOn');
  }

  async stopAutoPan(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'AutoPanOff');
  }

  // ========== 5.3.7 IdleMotion ==========

  async getIdleMotion(): Promise<ParsedConfig> {
    return this.getConfig('IdleMotion');
  }

  async setIdleMotion(params: IdleMotionParams, channel: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`IdleMotion[${channel}].${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.8 PowerUp (Startup Action) ==========

  async getPowerUp(): Promise<ParsedConfig> {
    return this.getConfig('PowerUp');
  }

  async setPowerUp(params: PowerUpParams, channel: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`PowerUp[${channel}].${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.9 Scheduled Task ==========

  async getScheduledTask(): Promise<ParsedConfig> {
    return this.getConfig('PtzAutoMovement');
  }

  async setScheduledTask(params: ScheduledTaskParams, channel: number = 0, taskId: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key === 'AutoHomingTime') {
        parts.push(`PtzAutoMovement[${channel}][${taskId}].AutoHoming.Time=${value}`);
      } else {
        parts.push(`PtzAutoMovement[${channel}][${taskId}].${key}=${value}`);
      }
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 5.3.10 Limit Position ==========

  async setLimitPosition(channel: PTZChannel, type: 0 | 1 | 2 | 3 | 6 | 7 | 8): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/ptz.cgi?action=markLimit&channel=${channel}&type=${type}`);
    return (await this.request(url)).trim();
  }

  // ========== Auxiliary ==========

  async lightOn(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'LightOtherOn');
  }

  async lightOff(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'LightOtherOff');
  }

  async wiperOn(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'WiperOn');
  }

  async defrostOn(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'DefrostOn');
  }

  async defrostOff(channel: PTZChannel = 0): Promise<string> {
    return this.ptzControl('start', channel, 'DefrostOff');
  }

  // ========== BULK ==========

  async getAllConfigs(): Promise<Record<string, ParsedConfig>> {
    const configs = ['Ptz', 'PtzPreset', 'PtzTour', 'PtzScanTour', 'AutoScan', 'AutoPattern', 'IdleMotion', 'PowerUp', 'PtzAutoMovement'];
    const results: Record<string, ParsedConfig> = {};
    for (const name of configs) {
      try {
        results[name] = await this.getConfig(name);
      } catch (e: any) {
        results[name] = { error: e.message };
      }
    }
    // Also get PTZ status
    try {
      results['PTZStatus'] = await this.getPTZStatus();
    } catch (e: any) {
      results['PTZStatus'] = { error: e.message };
    }
    return results;
  }
}

export default PTZAPI;
