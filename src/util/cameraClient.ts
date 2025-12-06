// ============ CAMERA CONFIGURATION ============

import CameraSetupAPI, { CameraClient } from './CameraSetupAPI';
import EventsAPI from './EventsAPI';
import LiveAPI from './LiveAPI';
import NetworkAPI from './NetworkAPI';
import PTZAPI from './PTZAPI';
import StorageAPI from './StorageAPI';
import SystemAPI from './SystemAPI';


interface CameraInfo {
  ip: string;
  username: string;
  password: string;
}

const cameras: Record<string, CameraInfo> = {
  cam1: { ip: '192.168.1.108', username: 'admin', password: '2899100*-+' },
  cam2: { ip: '192.168.1.109', username: 'admin', password: '2899100*-+' },
};

// ============ CACHED API INSTANCES ============

export interface CameraAPIs {
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

  const DigestFetch = (await import('digest-fetch')).default;
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

export { getAPIs };