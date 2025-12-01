export interface CameraInfo {
    id: string;
    ip: string;
    username: string;
    password: string;
    port?: number;
}
export declare const cameras: Record<string, CameraInfo>;
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
//# sourceMappingURL=camera.d.ts.map