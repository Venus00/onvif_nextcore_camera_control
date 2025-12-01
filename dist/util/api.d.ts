import { type VideoEncoderConfig } from "./camera";
export declare function getVideoEncoderConfiguration(camId: string): Promise<{
    token: any;
    name: any;
    encoding: any;
    resolution: {
        width: any;
        height: any;
    };
    quality: any;
    rateControl: {
        frameRate: any;
        encodingInterval: any;
        bitrate: any;
    };
    h264: {
        govLength: any;
        profile: any;
    };
}>;
export declare function setVideoEncoderConfiguration(camId: string, config: VideoEncoderConfig): Promise<{
    message: string;
}>;
export declare function focusMove(camId: string, speed: number, token: string): Promise<any>;
export declare function focusStop(camId: string, token: string): Promise<any>;
//# sourceMappingURL=api.d.ts.map