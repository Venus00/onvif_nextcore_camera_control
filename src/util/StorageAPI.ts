/**
 * Storage API - Section 8
 * Record Schedule, Snapshot Schedule, Storage Type, Memory Card, FTP, NAS, Record Control
 */

import { CameraClient, CameraConnection, ParsedConfig } from './CameraSetupAPI';

// ============ TYPES ============

export type Channel = 0 | 1;

export interface RecordScheduleParams {
  TimeSection?: string[][]; // [day][period] = "mask HH:MM:SS-HH:MM:SS"
}

export interface SnapScheduleParams {
  TimeSection?: string[][];
}

export interface StoragePointParams {
  TimingRecord?: { Local?: boolean; FTP?: boolean; Remote?: boolean };
  VideoDetectRecord?: { Local?: boolean; FTP?: boolean; Remote?: boolean };
  AlarmRecord?: { Local?: boolean; FTP?: boolean; Remote?: boolean };
  TimingSnapShot?: { Local?: boolean; FTP?: boolean; Remote?: boolean };
  VideoDetectSnapShot?: { Local?: boolean; FTP?: boolean; Remote?: boolean };
  AlarmSnapShot?: { Local?: boolean; FTP?: boolean; Remote?: boolean };
}

export interface FTPParams {
  Enable?: boolean;
  Address?: string;
  Port?: number;
  UserName?: string;
  Password?: string;
  Directory?: string;
}

export interface NASParams {
  Enable?: boolean;
  Address?: string;
  Port?: number;
  Directory?: string;
  Protocol?: 'NFS' | 'FTP';
  UserName?: string;
  Password?: string;
}

export interface MediaGlobalParams {
  PacketLength?: number; // Video length in minutes
  OverWrite?: boolean;
}

export interface RecordParams {
  PreRecord?: number; // seconds
  Format?: 'dav' | 'mp4';
}

// ============ STORAGE API CLASS ============

export class StorageAPI {
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

  // ========== 8.1.1 Record Schedule ==========

  async getRecordSchedule(): Promise<ParsedConfig> {
    return this.getConfig('Record');
  }

async setRecordSchedule(body: any): Promise<string> {
  // Convert body object to query string parameters
  const params = Object.entries(body)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  
  // Add action=setConfig at the beginning
  const queryString = `action=setConfig&${params}`;
  console.log("Setting Record Schedule with query string:", queryString);
  return this.setConfig(queryString);
}

  async getRecordMode(): Promise<ParsedConfig> {
    return this.getConfig('RecordMode');
  }

  async setRecordMode(mode: number, channel: Channel = 0): Promise<string> {
    // 0=Auto, 1=Manual, 2=Off
    return this.setConfig(`RecordMode[${channel}].Mode=${mode}`);
  }

  // ========== 8.1.2 Snapshot Schedule ==========

  async getSnapSchedule(): Promise<ParsedConfig> {
    return this.getConfig('Snap');
  }

  async setSnapSchedule(timeSection: string, channel: Channel = 0, day: number = 0, period: number = 0): Promise<string> {
    return this.setConfig(`Snap[${channel}].TimeSection[${day}][${period}]=${encodeURIComponent(timeSection)}`);
  }

  // ========== 8.2.1 Storage Type ==========

  async getStoragePoint(): Promise<ParsedConfig> {
    return this.getConfig('RecordStoragePoint');
  }

  async setStoragePoint(params: StoragePointParams, channel: Channel = 0): Promise<string> {
    const parts: string[] = [];

    for (const [category, settings] of Object.entries(params)) {
      if (settings && typeof settings === 'object') {
        for (const [location, enabled] of Object.entries(settings)) {
          parts.push(`RecordStoragePoint[${channel}].${category}.${location}=${enabled}`);
        }
      }
    }

    return this.setConfig(parts.join('&'));
  }

  // ========== 8.2.2 Memory Card ==========

  async getStorageDeviceInfo(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo');
    return await this.request(url);
  }

  async formatStorage(name: string = '/dev/mmcblk0p1'): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/storageDevice.cgi?action=format&name=${encodeURIComponent(name)}`);
    return (await this.request(url)).trim();
  }

  // ========== 8.2.3 FTP ==========

  async getFTP(): Promise<ParsedConfig> {
    return this.getConfig('NAS'); // FTP is stored in NAS[0]
  }

  async setFTP(params: FTPParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`NAS[0].${key}=${encodeURIComponent(String(value))}`);
    }
    // FTP specific
    parts.push('NAS[0].Protocol=FTP');
    return this.setConfig(parts.join('&'));
  }

  // ========== 8.2.4 NAS ==========

  async getNAS(): Promise<ParsedConfig> {
    return this.getConfig('NAS'); // NAS is stored in NAS[2]
  }

  async setNAS(params: NASParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`NAS[2].${key}=${encodeURIComponent(String(value))}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 8.2.5 Record Control ==========

  async getMediaGlobal(): Promise<ParsedConfig> {
    return this.getConfig('MediaGlobal');
  }

  async setMediaGlobal(params: MediaGlobalParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`MediaGlobal.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  async getRecord(): Promise<ParsedConfig> {
    return this.getConfig('Record');
  }

  async setRecordParams(params: RecordParams, channel: Channel = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`Record[${channel}].${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 10 File Search & Download ==========

  async createFileFind(): Promise<string> {
    const url = this.buildUrl('/cgi-bin/mediaFileFind.cgi?action=factory.create');
    return (await this.request(url)).trim();
  }

  async startFileFind(
    objectId: number,
    channel: number,
    startTime: string,
    endTime: string,
    type: 'dav' | 'jpg' = 'dav'
  ): Promise<string> {
    const url = this.buildUrl(
      `/cgi-bin/mediaFileFind.cgi?action=findFile&object=${objectId}&condition.Channel=${channel}` +
      `&condition.StartTime=${encodeURIComponent(startTime)}&condition.EndTime=${encodeURIComponent(endTime)}` +
      `&condition.Types[0]=${type}`
    );
    return (await this.request(url)).trim();
  }

  async findNextFile(objectId: number, count: number = 100): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/mediaFileFind.cgi?action=findNextFile&object=${objectId}&count=${count}`);
    return await this.request(url);
  }

  async closeFileFind(objectId: number): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/mediaFileFind.cgi?action=close&object=${objectId}`);
    return (await this.request(url)).trim();
  }

  async destroyFileFind(objectId: number): Promise<string> {
    const url = this.buildUrl(`/cgi-bin/mediaFileFind.cgi?action=destroy&object=${objectId}`);
    return (await this.request(url)).trim();
  }

  getDownloadUrl(filePath: string): string {
    return this.buildUrl(`/cgi-bin/RPC_Loadfile${filePath}`);
  }

  // ========== BULK ==========

  async getAllConfigs(): Promise<Record<string, ParsedConfig>> {
    const configs = ['Record', 'RecordMode', 'Snap', 'RecordStoragePoint', 'NAS', 'MediaGlobal'];
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

export default StorageAPI;
