// ============ API CLASSES ============
export { CameraSetupAPI } from './CameraSetupAPI';
export { NetworkAPI } from './NetworkAPI';
export { PTZAPI } from './PTZAPI';
export { EventsAPI } from './EventsAPI';
export { SystemAPI } from './SystemAPI';
export { StorageAPI } from './StorageAPI';
export { LiveAPI } from './LiveAPI';

// ============ TYPES FROM CameraSetupAPI ============
export type {
  CameraClient,
  CameraConnection,
  Channel,
  ConfigProfile,
  ParsedConfig,
  // Camera Conditions
  VideoColorParams,
  DayNightParams,
  ExposureParams,
  WhiteBalanceParams,
  BacklightParams,
  ZoomParams,
  FocusParams,
  DefogParams,
  FusionParams,
  FlipParams,
  DenoiseParams,
  LightingParams,
  DewaveParams,
  // Encode Settings
  EncodeVideoParams,
  AudioEncodeParams,
  VideoWidgetParams,
  ROIParams,
  PIPParams,
} from './CameraSetupAPI';

// ============ TYPES FROM NetworkAPI ============
export type {
  NetworkParams,
  NetworkInterfaceParams,
  DVRIPParams,
  WebParams,
  RTSPParams,
  HttpsParams,
  StreamAuthorityParams,
  UPnPParams,
  UPnPMapParams,
  MulticastParams,
  QoSParams,
  BonjourParams,
  ONVIFParams,
} from './NetworkAPI';

// ============ TYPES FROM PTZAPI ============
export type {
  PTZChannel,
  PTZCode,
  PTZProtocolParams,
  PresetParams,
  TourParams,
  ScanTourParams,
  AutoScanParams,
  AutoPatternParams,
  IdleMotionParams,
  PowerUpParams,
  ScheduledTaskParams,
} from './PTZAPI';

// ============ TYPES FROM EventsAPI ============
export type {
  EventHandlerParams,
  MotionDetectParams,
  TamperDetectParams,
  SceneChangeParams,
  AudioDetectParams,
  StorageAlarmParams,
  NetworkAlarmParams,
  FireWarningParams,
} from './EventsAPI';

// ============ TYPES FROM SystemAPI ============
export type {
  LocalesParams,
  NTPParams,
} from './SystemAPI';

// ============ TYPES FROM StorageAPI ============
export type {
  RecordScheduleParams,
  SnapScheduleParams,
  StoragePointParams,
  FTPParams,
  NASParams,
  MediaGlobalParams,
  RecordParams,
} from './StorageAPI';

// ============ TYPES FROM LiveAPI ============
export type {
  TemperaturePoint,
  TemperatureResult,
} from './LiveAPI';

// ============ DEFAULT EXPORT ============
export { CameraSetupAPI as default } from './CameraSetupAPI';
