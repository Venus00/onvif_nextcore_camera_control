declare module "node-onvif" {
    export class OnvifDevice {
      constructor(options: { xaddr: string; user?: string; pass?: string });
      init(): Promise<void>;
      getCurrentProfiles(): any[];
      getServices(): Promise<any>;
      getInformation(): Promise<any>;
      getSnapshot(): Promise<Buffer>;
      ptzMove(params: {
        profileToken: string;
        speed: { x?: number; y?: number; z?: number };
        timeout?: number;
      }): Promise<any>;
      ptzStop(params: { profileToken: string; panTilt?: boolean; zoom?: boolean }): Promise<any>;
      ptzAbsoluteMove(params: {
        profileToken: string;
        position: { x?: number; y?: number; z?: number };
        speed?: { x?: number; y?: number; z?: number };
      }): Promise<any>;
      ptzRelativeMove(params: {
        profileToken: string;
        translation: { x?: number; y?: number; z?: number };
        speed?: { x?: number; y?: number; z?: number };
      }): Promise<any>;
      getStatus(params: { profileToken: string }): Promise<any>;
    }
  
    export namespace OnvifManager {
      function startDiscovery(timeout?: number): Promise<any[]>;
      const OnvifDevice: typeof OnvifDevice;
    }
  
    export = OnvifManager;
  }