/**
 * System API - Section 9 + Section 11 (Misc)
 * General, Date/Time, Maintenance, Reboot, Device Info
 */

import { CameraClient, CameraConnection, ParsedConfig } from './CameraSetupAPI';

// ============ TYPES ============

export interface LocalesParams {
  DateFormat?: 'YYMMDD' | 'MMDDYY' | 'DDMMYY';
  TimeFormat?: '12' | '24';
  Language?: string;
}

export interface NTPParams {
  Enable?: boolean;
  Address?: string;
  Port?: number;
  UpdatePeriod?: number;
  TimeZone?: number;
}

// ============ SYSTEM API CLASS ============

export class SystemAPI {
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

  // ========== 9.1.1 General - Device Info ==========

  async getHardwareVersion(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=getHardwareVersion');
    return (await this.request(url)).trim();
  }

  async getSoftwareVersion(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=getSoftwareVersion');
    return (await this.request(url)).trim();
  }

  async getMachineName(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=getMachineName');
    return (await this.request(url)).trim();
  }

  async getSerialNumber(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=getSerialNo');
    return (await this.request(url)).trim();
  }

  async getDeviceType(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=getDeviceType');
    return (await this.request(url)).trim();
  }

  async getDeviceInfo(): Promise<Record<string, string>> {
    const [hw, sw, name, sn] = await Promise.all([
      this.getHardwareVersion(),
      this.getSoftwareVersion(),
      this.getMachineName(),
      this.getSerialNumber(),
    ]);

    return {
      hardwareVersion: hw.split('=')[1] || hw,
      softwareVersion: sw.split('=')[1] || sw,
      machineName: name.split('=')[1] || name,
      serialNumber: sn.split('=')[1] || sn,
    };
  }

  // ========== 9.1.1 Video Standard ==========

  async getVideoStandard(): Promise<ParsedConfig> {
    return this.getConfig('VideoStandard');
  }

  async setVideoStandard(standard: 'PAL' | 'NTSC'): Promise<string> {
    return this.setConfig(`VideoStandard=${standard}`);
  }

  // ========== 9.1.2 Date & Time ==========

  async getCurrentTime(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/global.cgi?action=getCurrentTime');
    const result = await this.request(url);
    const match = result.match(/result=(.+)/);
    return match ? match[1].trim() : result.trim();
  }

  async setCurrentTime(time: string): Promise<string> {
    // Format: yyyy-MM-dd HH:mm:ss
    const url = this.buildUrl(`/cgi-bin/global.cgi?action=setCurrentTime&time=${encodeURIComponent(time)}`);
    return (await this.request(url)).trim();
  }

  async getLocales(): Promise<ParsedConfig> {
    return this.getConfig('Locales');
  }

  async setLocales(params: LocalesParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`Locales.${key}=${encodeURIComponent(value)}`);
    }
    return this.setConfig(parts.join('&'));
  }

  async getNTP(): Promise<ParsedConfig> {
    return this.getConfig('NTP');
  }

  async setNTP(params: NTPParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`NTP.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 9.2 Maintenance ==========

  async reboot(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=reboot');
    return (await this.request(url)).trim();
  }

  async factoryReset(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/magicBox.cgi?action=factoryDefault');
    return (await this.request(url)).trim();
  }

  async unlockAuth(): Promise<string> {
    return this.setConfig('General.LockLoginEnable=false');
  }

  // ========== 11.1 Channel Count ==========

  async getChannelCount(): Promise<number> {
    const url = this.buildUrl('/cgi-bin/devVideoInput.cgi?action=getCollect');
    const result = await this.request(url);
    const match = result.match(/result=(\d+)/);
    return match ? parseInt(match[1]) : 1;
  }

  // ========== 11.4 Laser Ranging ==========

  async getLaserDistance(channel: number = 1): Promise<number> {
    const url = this.buildUrl(`/cgi-bin/laserDistMeasure.cgi?action=getDistance&channel=${channel}`);
    const result = await this.request(url);
    const match = result.match(/distance=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  // ========== 11.5 & 11.6 Alarm Input ==========

  async getAlarmInputCount(): Promise<number> {
    const url = this.buildUrl('/cgi-bin/alarm.cgi?action=getInSlots');
    const result = await this.request(url);
    const match = result.match(/result=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async getAlarmInputState(): Promise<number> {
    const url = this.buildUrl('/cgi-bin/alarm.cgi?action=getInState');
    const result = await this.request(url);
    const match = result.match(/result=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  // ========== General Config ==========

  async getGeneral(): Promise<ParsedConfig> {
    return this.getConfig('General');
  }

  // ========== BULK ==========

  async getAllConfigs(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    try {
      results['DeviceInfo'] = await this.getDeviceInfo();
    } catch (e: any) {
      results['DeviceInfo'] = { error: e.message };
    }

    try {
      results['CurrentTime'] = await this.getCurrentTime();
    } catch (e: any) {
      results['CurrentTime'] = { error: e.message };
    }

    try {
      results['ChannelCount'] = await this.getChannelCount();
    } catch (e: any) {
      results['ChannelCount'] = { error: e.message };
    }

    const configs = ['VideoStandard', 'Locales', 'NTP', 'General'];
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

export default SystemAPI;
