/**
 * Events API - Section 6
 * Motion Detection, Tamper, Scene Change, Audio Detection, SD Card, Network, Fire Warning
 */

import { CameraClient, CameraConnection, ParsedConfig } from './CameraSetupAPI';

// ============ TYPES ============

export type Channel = 0 | 1;

export interface EventHandlerParams {
  Enable?: boolean;
  RecordEnable?: boolean;
  RecordLatch?: number;
  RecordChannels?: number[];
  AlarmOutEnable?: boolean;
  AlarmOutLatch?: number;
  AlarmOutChannels?: number[];
  SnapshotEnable?: boolean;
  SnapshotChannels?: number[];
  MailEnable?: boolean;
  PtzLinkEnable?: boolean;
  PtzLink?: [string, number, number]; // [type, id, delay]
  VoiceEnable?: boolean;
  FlashEnable?: boolean;
  FlashLatch?: number;
  Dejitter?: number;
}

export interface MotionDetectParams extends EventHandlerParams {
  Sensitive?: number;
  Threshold?: number;
  Window?: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface TamperDetectParams extends EventHandlerParams {}

export interface SceneChangeParams extends EventHandlerParams {}

export interface AudioDetectParams extends EventHandlerParams {
  AnomalyDetect?: boolean;
  MutationDetect?: boolean;
  AnomalySensitive?: number;
  MutationThreshold?: number;
}

export interface StorageAlarmParams {
  Enable?: boolean;
  LowerLimit?: number;
  AlarmOutEnable?: boolean;
  AlarmOutLatch?: number;
  MailEnable?: boolean;
}

export interface NetworkAlarmParams {
  Enable?: boolean;
  RecordEnable?: boolean;
  RecordLatch?: number;
  RecordChannels?: number[];
  AlarmOutEnable?: boolean;
  AlarmOutLatch?: number;
  AlarmOutChannels?: number[];
}

export interface FireWarningParams extends EventHandlerParams {
  TempThreshold?: number;
  DetectRegions?: number[];
}

// ============ EVENTS API CLASS ============

export class EventsAPI {
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

  private formatEventHandler(prefix: string, params: EventHandlerParams): string[] {
    const parts: string[] = [];

    if (params.Enable !== undefined) parts.push(`${prefix}.Enable=${params.Enable}`);
    if (params.RecordEnable !== undefined) parts.push(`${prefix}.EventHandler.RecordEnable=${params.RecordEnable}`);
    if (params.RecordLatch !== undefined) parts.push(`${prefix}.EventHandler.RecordLatch=${params.RecordLatch}`);
    if (params.AlarmOutEnable !== undefined) parts.push(`${prefix}.EventHandler.AlarmOutEnable=${params.AlarmOutEnable}`);
    if (params.AlarmOutLatch !== undefined) parts.push(`${prefix}.EventHandler.AlarmOutLatch=${params.AlarmOutLatch}`);
    if (params.SnapshotEnable !== undefined) parts.push(`${prefix}.EventHandler.SnapshotEnable=${params.SnapshotEnable}`);
    if (params.MailEnable !== undefined) parts.push(`${prefix}.EventHandler.MailEnable=${params.MailEnable}`);
    if (params.PtzLinkEnable !== undefined) parts.push(`${prefix}.EventHandler.PtzLinkEnable=${params.PtzLinkEnable}`);
    if (params.VoiceEnable !== undefined) parts.push(`${prefix}.EventHandler.VoiceEnable=${params.VoiceEnable}`);
    if (params.FlashEnable !== undefined) parts.push(`${prefix}.EventHandler.FlashEnable=${params.FlashEnable}`);
    if (params.FlashLatch !== undefined) parts.push(`${prefix}.EventHandler.FlashLatch=${params.FlashLatch}`);
    if (params.Dejitter !== undefined) parts.push(`${prefix}.EventHandler.Dejitter=${params.Dejitter}`);

    if (params.RecordChannels) {
      params.RecordChannels.forEach((ch, i) => {
        parts.push(`${prefix}.EventHandler.RecordChannels[${i}]=${ch}`);
      });
    }
    if (params.AlarmOutChannels) {
      params.AlarmOutChannels.forEach((ch, i) => {
        parts.push(`${prefix}.EventHandler.AlarmOutChannels[${i}]=${ch}`);
      });
    }
    if (params.SnapshotChannels) {
      params.SnapshotChannels.forEach((ch, i) => {
        parts.push(`${prefix}.EventHandler.SnapshotChannels[${i}]=${ch}`);
      });
    }
    if (params.PtzLink) {
      parts.push(`${prefix}.EventHandler.PtzLink[0][0]=${params.PtzLink[0]}`);
      parts.push(`${prefix}.EventHandler.PtzLink[0][1]=${params.PtzLink[1]}`);
      parts.push(`${prefix}.EventHandler.PtzLink[0][2]=${params.PtzLink[2]}`);
    }

    return parts;
  }

  // ========== 6.1 Motion Detection ==========

  async getMotionDetect(): Promise<ParsedConfig> {
    return this.getConfig('MotionDetect');
  }

  async setMotionDetect(params: MotionDetectParams, channel: Channel = 0, windowIndex: number = 0): Promise<string> {
    const prefix = `MotionDetect[${channel}]`;
    const parts = this.formatEventHandler(prefix, params);

    if (params.Sensitive !== undefined) {
      parts.push(`${prefix}.MotionDetectWindow[${windowIndex}].Sensitive=${params.Sensitive}`);
    }
    if (params.Threshold !== undefined) {
      parts.push(`${prefix}.MotionDetectWindow[${windowIndex}].Threshold=${params.Threshold}`);
    }
    if (params.Window) {
      params.Window.forEach((v, i) => {
        parts.push(`${prefix}.MotionDetectWindow[${windowIndex}].Window[${i}]=${v}`);
      });
    }

    return this.setConfig(parts.join('&'));
  }

  // ========== 6.2 Tamper Detection (Blind Detect) ==========

  async getTamperDetect(): Promise<ParsedConfig> {
    return this.getConfig('BlindDetect');
  }

  async setTamperDetect(params: TamperDetectParams, channel: Channel = 0): Promise<string> {
    const prefix = `BlindDetect[${channel}]`;
    const parts = this.formatEventHandler(prefix, params);
    return this.setConfig(parts.join('&'));
  }

  // ========== 6.3 Scene Changing (Moved Detect) ==========

  async getSceneChange(): Promise<ParsedConfig> {
    return this.getConfig('MovedDetect');
  }

  async setSceneChange(params: SceneChangeParams, channel: Channel = 0): Promise<string> {
    const prefix = `MovedDetect[${channel}]`;
    const parts = this.formatEventHandler(prefix, params);
    return this.setConfig(parts.join('&'));
  }

  // ========== 6.4 Audio Detection ==========

  async getAudioDetect(): Promise<ParsedConfig> {
    return this.getConfig('AudioDetect');
  }

  async setAudioDetect(params: AudioDetectParams, channel: Channel = 0): Promise<string> {
    const prefix = `AudioDetect[${channel}]`;
    const parts = this.formatEventHandler(prefix, params);

    if (params.AnomalyDetect !== undefined) parts.push(`${prefix}.AnomalyDetect=${params.AnomalyDetect}`);
    if (params.MutationDetect !== undefined) parts.push(`${prefix}.MutationDetect=${params.MutationDetect}`);
    if (params.AnomalySensitive !== undefined) parts.push(`${prefix}.AnomalySensitive=${params.AnomalySensitive}`);
    if (params.MutationThreshold !== undefined) parts.push(`${prefix}.MutationThreold=${params.MutationThreshold}`);

    return this.setConfig(parts.join('&'));
  }

  // ========== 6.5 SD Card Abnormality ==========

  // 6.5.1 No SD Card
  async getNoSDCardAlarm(): Promise<ParsedConfig> {
    return this.getConfig('StorageNotExist');
  }

  async setNoSDCardAlarm(params: StorageAlarmParams): Promise<string> {
    const parts: string[] = [];
    if (params.Enable !== undefined) parts.push(`StorageNotExist.Enable=${params.Enable}`);
    if (params.AlarmOutEnable !== undefined) parts.push(`StorageNotExist.EventHandler.AlarmOutEnable=${params.AlarmOutEnable}`);
    if (params.AlarmOutLatch !== undefined) parts.push(`StorageNotExist.EventHandler.AlarmOutLatch=${params.AlarmOutLatch}`);
    if (params.MailEnable !== undefined) parts.push(`StorageNotExist.EventHandler.MailEnable=${params.MailEnable}`);
    return this.setConfig(parts.join('&'));
  }

  // 6.5.3 SD Card Error
  async getSDCardError(): Promise<ParsedConfig> {
    return this.getConfig('StorageFailure');
  }

  async setSDCardError(params: StorageAlarmParams): Promise<string> {
    const parts: string[] = [];
    if (params.Enable !== undefined) parts.push(`StorageFailure.Enable=${params.Enable}`);
    if (params.AlarmOutEnable !== undefined) parts.push(`StorageFailure.EventHandler.AlarmOutEnable=${params.AlarmOutEnable}`);
    if (params.AlarmOutLatch !== undefined) parts.push(`StorageFailure.EventHandler.AlarmOutLatch=${params.AlarmOutLatch}`);
    if (params.MailEnable !== undefined) parts.push(`StorageFailure.EventHandler.MailEnable=${params.MailEnable}`);
    return this.setConfig(parts.join('&'));
  }

  // 6.5.5 SD Card Low Space
  async getSDCardLowSpace(): Promise<ParsedConfig> {
    return this.getConfig('StorageLowSpace');
  }

  async setSDCardLowSpace(params: StorageAlarmParams): Promise<string> {
    const parts: string[] = [];
    if (params.Enable !== undefined) parts.push(`StorageLowSpace.Enable=${params.Enable}`);
    if (params.LowerLimit !== undefined) parts.push(`StorageLowSpace.LowerLimit=${params.LowerLimit}`);
    if (params.AlarmOutEnable !== undefined) parts.push(`StorageLowSpace.EventHandler.AlarmOutEnable=${params.AlarmOutEnable}`);
    if (params.AlarmOutLatch !== undefined) parts.push(`StorageLowSpace.EventHandler.AlarmOutLatch=${params.AlarmOutLatch}`);
    if (params.MailEnable !== undefined) parts.push(`StorageLowSpace.EventHandler.MailEnable=${params.MailEnable}`);
    return this.setConfig(parts.join('&'));
  }

  // ========== 6.6 Network Alarms ==========

  // 6.6.1 Network Disconnect
  async getNetworkDisconnect(): Promise<ParsedConfig> {
    return this.getConfig('NetAbort');
  }

  async setNetworkDisconnect(params: NetworkAlarmParams): Promise<string> {
    const parts: string[] = [];
    if (params.Enable !== undefined) parts.push(`NetAbort.Enable=${params.Enable}`);
    if (params.RecordEnable !== undefined) parts.push(`NetAbort.EventHandler.RecordEnable=${params.RecordEnable}`);
    if (params.RecordLatch !== undefined) parts.push(`NetAbort.EventHandler.RecordLatch=${params.RecordLatch}`);
    if (params.AlarmOutEnable !== undefined) parts.push(`NetAbort.EventHandler.AlarmOutEnable=${params.AlarmOutEnable}`);
    if (params.AlarmOutLatch !== undefined) parts.push(`NetAbort.EventHandler.AlarmOutLatch=${params.AlarmOutLatch}`);
    if (params.RecordChannels) {
      params.RecordChannels.forEach((ch, i) => parts.push(`NetAbort.EventHandler.RecordChannels[${i}]=${ch}`));
    }
    if (params.AlarmOutChannels) {
      params.AlarmOutChannels.forEach((ch, i) => parts.push(`NetAbort.EventHandler.AlarmOutChannels[${i}]=${ch}`));
    }
    return this.setConfig(parts.join('&'));
  }

  // 6.6.3 IP Conflict
  async getIPConflict(): Promise<ParsedConfig> {
    return this.getConfig('IPConflict');
  }

  async setIPConflict(params: NetworkAlarmParams): Promise<string> {
    const parts: string[] = [];
    if (params.Enable !== undefined) parts.push(`IPConflict.Enable=${params.Enable}`);
    if (params.RecordEnable !== undefined) parts.push(`IPConflict.EventHandler.RecordEnable=${params.RecordEnable}`);
    if (params.RecordLatch !== undefined) parts.push(`IPConflict.EventHandler.RecordLatch=${params.RecordLatch}`);
    if (params.AlarmOutEnable !== undefined) parts.push(`IPConflict.EventHandler.AlarmOutEnable=${params.AlarmOutEnable}`);
    if (params.AlarmOutLatch !== undefined) parts.push(`IPConflict.EventHandler.AlarmOutLatch=${params.AlarmOutLatch}`);
    return this.setConfig(parts.join('&'));
  }

  // ========== 6.7 Unauthorized Access ==========

  async getLoginFailure(): Promise<ParsedConfig> {
    return this.getConfig('LoginFailureAlarm');
  }

  async setLoginFailure(enable: boolean): Promise<string> {
    return this.setConfig(`LoginFailureAlarm.Enable=${enable}`);
  }

  async getMaxLoginAttempts(): Promise<ParsedConfig> {
    return this.getConfig('General');
  }

  async setMaxLoginAttempts(attempts: number): Promise<string> {
    return this.setConfig(`General.MaxLoginError=${attempts}`);
  }

  // ========== 6.8 Fire Warning (Thermal) ==========

  async getFireWarning(): Promise<ParsedConfig> {
    return this.getConfig('FireWarning');
  }

  async setFireWarning(params: FireWarningParams, channel: Channel = 1, config: number = 1): Promise<string> {
    const prefix = `FireWarning[${channel}][${config}]`;
    const parts = this.formatEventHandler(prefix, params);

    if (params.TempThreshold !== undefined) {
      parts.push(`${prefix}.DetectWindow[0].TempThreshold=${params.TempThreshold}`);
    }
    if (params.DetectRegions) {
      params.DetectRegions.forEach((v, i) => {
        parts.push(`${prefix}.DetectWindow[0].Regions[${i}]=${v}`);
      });
    }

    return this.setConfig(parts.join('&'));
  }

  // ========== 11.2 Alarm Event Subscription ==========

  /**
   * Subscribe to alarm events (returns event stream URL)
   * Use EventSource or SSE to connect
   */
  getAlarmEventUrl(
    codes: string[] = ['All'],
    keepalive: number = 20,
    detail: boolean = true
  ): string {
    const codesStr = codes.join('|');
    return this.buildUrl(
      `/cgi-bin/eventManager.cgi?action=attach&codes=[${codesStr}]&keepalive=${keepalive}&detail=${detail ? 1 : 0}`
    );
  }

  // ========== BULK ==========

  async getAllConfigs(): Promise<Record<string, ParsedConfig>> {
    const configs = [
      'MotionDetect', 'BlindDetect', 'MovedDetect', 'AudioDetect',
      'StorageNotExist', 'StorageFailure', 'StorageLowSpace',
      'NetAbort', 'IPConflict', 'LoginFailureAlarm', 'FireWarning'
    ];
    const results: Record<string, ParsedConfig> = {};
    for (const name of configs) {
      try {
        results[name] = await this.getConfig(name);
      } catch (e: any) {
        results[name] = { error: e.message };
      }
    }
    return results;
  }
}

export default EventsAPI;
