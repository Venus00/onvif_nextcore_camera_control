/**
 * Network API - Section 4
 * TCP/IP, Connections, RTSP, HTTPS, UPnP, Multicast, QoS, ONVIF
 */

import { CameraClient, CameraConnection, ParsedConfig } from './CameraSetupAPI';

// ============ TYPES ============

export interface NetworkParams {
  Domain?: string;
  Hostname?: string;
}

export interface NetworkInterfaceParams {
  DefaultGateway?: string;
  DhcpEnable?: boolean;
  IPAddress?: string;
  SubnetMask?: string;
  MTU?: number;
  DnsServers?: string[];
}

export interface DVRIPParams {
  MaxConnections?: number;
  TCPPort?: number;
  UDPPort?: number;
  SSLPort?: number;
}

export interface WebParams {
  Enable?: boolean;
  Port?: number;
}

export interface RTSPParams {
  Enable?: boolean;
  Port?: number;
}

export interface HttpsParams {
  Enable?: boolean;
  Port?: number;
}

export interface StreamAuthorityParams {
  HttpLoginCheck?: 'Basic' | 'None' | 'Digest';
  OnvifLoginCheck?: 'Basic' | 'None' | 'Digest';
  RtspLoginCheck?: 'Basic' | 'None' | 'Digest';
}

export interface UPnPParams {
  Enable?: boolean;
  Mode?: 'Auto' | 'Manual';
}

export interface UPnPMapParams {
  Enable?: boolean;
  InnerPort?: number;
  OuterPort?: number;
  Protocol?: 'TCP' | 'UDP';
  ServiceName?: string;
  ServiceType?: 'WebService' | 'PrivService' | 'RTSPService';
}

export interface MulticastParams {
  Enable?: boolean;
  MulticastAddr?: string;
  Port?: number;
  TTL?: number;
}

export interface QoSParams {
  Enable?: boolean;
  DSCP?: number;
}

export interface BonjourParams {
  Enable?: boolean;
  ServiceName?: string;
}

export interface ONVIFParams {
  Enable?: boolean;
}

// ============ NETWORK API CLASS ============

export class NetworkAPI {
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

  // ========== 4.1.1 TCP/IP ==========

  async getNetwork(): Promise<ParsedConfig> {
    return this.getConfig('Network');
  }

  async setNetwork(params: NetworkParams): Promise<string> {
    const parts: string[] = [];
    if (params.Domain) parts.push(`Network.Domain=${encodeURIComponent(params.Domain)}`);
    if (params.Hostname) parts.push(`Network.Hostname=${encodeURIComponent(params.Hostname)}`);
    return this.setConfig(parts.join('&'));
  }

  async setNetworkInterface(params: NetworkInterfaceParams, iface: string = 'eth0'): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key === 'DnsServers' && Array.isArray(value)) {
        value.forEach((dns, i) => parts.push(`Network.${iface}.DnsServers[${i}]=${dns}`));
      } else {
        parts.push(`Network.${iface}.${key}=${encodeURIComponent(String(value))}`);
      }
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.2 Connection (DVRIP) ==========

  async getDVRIP(): Promise<ParsedConfig> {
    return this.getConfig('DVRIP');
  }

  async setDVRIP(params: DVRIPParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`DVRIP.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.3 Web Connection ==========

  async getWeb(): Promise<ParsedConfig> {
    return this.getConfig('Web');
  }

  async setWeb(params: WebParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`Web.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.4 RTSP Connection ==========

  async getRTSP(): Promise<ParsedConfig> {
    return this.getConfig('RTSP');
  }

  async setRTSP(params: RTSPParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`RTSP.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.5 HTTPS Connection ==========

  async getHttps(): Promise<ParsedConfig> {
    return this.getConfig('Https');
  }

  async setHttps(params: HttpsParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`Https.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.6 RTSP Authority ==========

  async getStreamAuthority(): Promise<ParsedConfig> {
    return this.getConfig('StreamAuthority');
  }

  async setStreamAuthority(params: StreamAuthorityParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`StreamAuthority.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.7 UPnP ==========

  async getUPnP(): Promise<ParsedConfig> {
    return this.getConfig('UPnP');
  }

  async setUPnP(params: UPnPParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`UPnP.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  async setUPnPMap(params: UPnPMapParams, index: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`UPnP.MapTable[${index}].${key}=${encodeURIComponent(String(value))}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.1.8 Multicast ==========

  async getMulticast(): Promise<ParsedConfig> {
    return this.getConfig('Multicast');
  }

  async setMulticast(params: MulticastParams, streamFormat: number = 0): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`Multicast.RTP[${streamFormat}].${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.2.1 QoS ==========

  async getQoS(): Promise<ParsedConfig> {
    return this.getConfig('QoS');
  }

  async setQoS(params: QoSParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`QoS.${key}=${value}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.2.2 Bonjour ==========

  async getBonjour(): Promise<ParsedConfig> {
    return this.getConfig('Bonjour');
  }

  async setBonjour(params: BonjourParams): Promise<string> {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parts.push(`Bonjour.${key}=${encodeURIComponent(String(value))}`);
    }
    return this.setConfig(parts.join('&'));
  }

  // ========== 4.3.1 ONVIF ==========

  async getONVIF(): Promise<ParsedConfig> {
    return this.getConfig('ONVIF');
  }

  async setONVIF(enable: boolean): Promise<string> {
    return this.setConfig(`ONVIF.Enable=${enable}`);
  }

  // ========== BULK ==========

  async getAllConfigs(): Promise<Record<string, ParsedConfig>> {
    const configs = ['Network', 'DVRIP', 'Web', 'RTSP', 'Https', 'StreamAuthority', 'UPnP', 'Multicast', 'QoS', 'Bonjour', 'ONVIF'];
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

export default NetworkAPI;
