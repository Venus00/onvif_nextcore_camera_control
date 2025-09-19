export interface CameraInfo {
    id: string;
    ip: string;
    username: string;
    password: string;
    port?: number;
}

export const cameras: Record<string, CameraInfo> = {
   cam2: {
        id: "cam1",
        ip: "192.168.1.108",
        port: 8899,

        username: "admin",
        password: "2899100*-+"
    },
  cam1: {
    id: "cam2",
    ip: "192.168.1.109",
    port: 8899,
    username: "admin",
    password: "2899100*-+"
},  
   
    
};


export interface VideoEncoderConfig {
    token: string; 
    name: string;
    encoding: "H264" | "JPEG" | "MPEG4"; 
    resolution: {
      width: number;
      height: number;
    };
    quality: number;
    rateControl: {
      frameRate: number;
      encodingInterval: number;
      bitrate: number;
    };
    h264?: {
      govLength: number;
      profile: "Baseline" | "Main" | "High"; 
    };
  }