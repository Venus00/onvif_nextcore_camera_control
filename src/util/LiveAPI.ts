/**
 * Live API - Section 2
 * RTSP Streaming, Snapshot, Temperature Measurement, Focus Region, Manual Tracking
 */

import { CameraClient, CameraConnection, ParsedConfig } from './CameraSetupAPI';

// ============ TYPES ============

export type Channel = 0 | 1 | 2; // 0,1=visible, 2=thermal

export interface TemperaturePoint {
  channel: number;
  x: number; // 0-8191
  y: number; // 0-8191
}

export interface TemperatureResult {
  average: number;
  unit: 'Centigrade' | 'Fahrenheit';
  type: string;
}

// ============ LIVE API CLASS ============

export class LiveAPI {
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

  // ========== 2.1 RTSP Stream URLs ==========

  /**
   * Get RTSP stream URL
   * @param channel - 1=visible, 2=thermal
   * @param subtype - 0=main, 1=sub1, 2=sub2
   * @param username - Camera username
   * @param password - Camera password
   */
  getRTSPUrl(
    channel: 1 | 2 = 1,
    subtype: 0 | 1 | 2 = 0,
    username: string = 'admin',
    password: string = 'admin',
    port: number = 554
  ): string {
    return `rtsp://${username}:${password}@${this.ip}:${port}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
  }

  /**
   * Get playback RTSP URL
   */
  getPlaybackUrl(
    channel: 1 | 2,
    startTime: string, // Format: yyyy_MM_dd_HH_mm_ss
    endTime: string,
    subtype: 0 | 1 = 0,
    username: string = 'admin',
    password: string = 'admin',
    port: number = 554
  ): string {
    return `rtsp://${username}:${password}@${this.ip}:${port}/cam/playback?channel=${channel}&subtype=${subtype}&starttime=${startTime}&endtime=${endTime}`;
  }

  // ========== 2.2 Temperature Measurement ==========

  /**
   * Get temperature at a random point (thermal channel)
   */
  async getPointTemperature(x: number, y: number, channel: number = 2): Promise<TemperatureResult> {
    const url = this.buildUrl(
      `/cgi-bin/RadiometryManager.cgi?action=getRandomPointTemper&channel=${channel}&coordinate[0]=${x}&coordinate[1]=${y}`
    );
    const response = await this.request(url);
    const parsed = this.parseResponse(response);

    return {
      average: parseFloat(parsed['pointTempInfo.TemperAver'] || '0'),
      unit: (parsed['pointTempInfo.TemperatureUnit'] as 'Centigrade' | 'Fahrenheit') || 'Centigrade',
      type: parsed['pointTempInfo.Type'] || 'Spot',
    };
  }

  // ========== 2.3 Snapshot ==========

  /**
   * Get snapshot URL
   * @param channel - 0,1=visible, 2=thermal
   */
  getSnapshotUrl(channel: Channel = 1): string {
    return this.buildUrl(`/cgi-bin/snapshot.cgi?channel=${channel}`);
  }

  /**
   * Get snapshot as buffer/blob (requires implementation in client)
   */
  async getSnapshot(channel: Channel = 1): Promise<Response> {
    const url = this.getSnapshotUrl(channel);
    return await this.client.fetch(url);
  }

  // ========== 2.4 Focus Region ==========

  /**
   * Set focus region in video
   * @param x - Horizontal coordinate (-8191 to 8191)
   * @param y - Vertical coordinate (-8191 to 8191)
   * @param zoom - Zoom factor
   */
  async setFocusRegion(
    x: number,
    y: number,
    zoom: number,
    channel: Channel = 0
  ): Promise<string> {
    const url = this.buildUrl(
      `/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=Position&arg1=${x}&arg2=${y}&arg3=${zoom}`
    );
    return (await this.request(url)).trim();
  }

  // ========== 2.5 Alarm Output Status ==========

  async getAlarmOutputStatus(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/alarm.cgi?action=getOutState');
    return await this.request(url);
  }

  async setAlarmOutput(channel: number, state: boolean): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/alarm.cgi?action=setOutState&channel=${channel}&state=${state ? 1 : 0}`);
    return (await this.request(url)).trim();
  }

  // ========== 2.6 Manual Tracking ==========

  async startManualTracking(channel: Channel = 0): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=ManualTrackOn`);
    return (await this.request(url)).trim();
  }

  async stopManualTracking(channel: Channel = 0): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/ptz.cgi?action=start&channel=${channel}&code=ManualTrackOff`);
    return (await this.request(url)).trim();
  }

  // ========== 7.1 Thermal Imaging Global Config ==========

  async getThermalConfig(): Promise<ParsedConfig> {
    const url = this.buildUrl('/cgi-bin/configManager.cgi?action=getConfig&name=HeatImagingThermometry');
    return this.parseResponse(await this.request(url));
  }

  async setThermalEnabled(enable: boolean): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/configManager.cgi?action=setConfig&HeatImagingThermometry.TemperEnable=${enable}`);
    return (await this.request(url)).trim();
  }

  async setTemperatureUnit(unit: 'Centigrade' | 'Fahrenheit'): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/configManager.cgi?action=setConfig&HeatImagingThermometry.TemperatureUnit=${unit}`);
    return (await this.request(url)).trim();
  }

  // ========== Temperature Alarm Config ==========

  async getTemperatureAlarm(): Promise<ParsedConfig> {
    const url = this.buildUrl('/cgi-bin/configManager.cgi?action=getConfig&name=HeatImagingTemper');
    return this.parseResponse(await this.request(url));
  }

  // ========== Utility ==========

  isSuccess(response: string): boolean {
    return response.toUpperCase() === 'OK';
  }
}

export default LiveAPI;
