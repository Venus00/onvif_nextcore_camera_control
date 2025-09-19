import { buildSecurityHeader } from "./wsse.js";
import { sendSoapRequest } from "./onvifClient.js";
import { cameras, type VideoEncoderConfig } from "./camera";
import { parseStringPromise } from "xml2js";

export async function getVideoEncoderConfiguration(camId: string) {
  const cam = cameras[camId];
  if (!cam) throw new Error("Camera not found");

  const securityHeader = buildSecurityHeader(cam.username, cam.password);

  const xml = `
  <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Header>${securityHeader}</s:Header>
    <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <GetVideoEncoderConfiguration xmlns="http://www.onvif.org/ver10/media/wsdl">
        <ConfigurationToken>000</ConfigurationToken>
      </GetVideoEncoderConfiguration>
    </s:Body>
  </s:Envelope>`;

  const responseXml = await sendSoapRequest(cam.ip, cam.port || 80, xml, "http://www.onvif.org/ver10/media/wsdl/GetVideoEncoderConfiguration");

  // Parse SOAP response
  const json = await parseStringPromise(responseXml || '', { explicitArray: false });

  try {
    const config =
      json["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["trt:GetVideoEncoderConfigurationResponse"]["trt:Configuration"];

    return {
      token: config.$.token,
      name: config["tt:Name"],
      encoding: config["tt:Encoding"],
      resolution: {
        width: config["tt:Resolution"]["tt:Width"],
        height: config["tt:Resolution"]["tt:Height"],
      },
      quality: config["tt:Quality"],
      rateControl: {
        frameRate: config["tt:RateControl"]["tt:FrameRateLimit"],
        encodingInterval: config["tt:RateControl"]["tt:EncodingInterval"],
        bitrate: config["tt:RateControl"]["tt:BitrateLimit"],
      },
      h264: {
        govLength: config["tt:H264"]["tt:GovLength"],
        profile: config["tt:H264"]["tt:H264Profile"],
      },
    };
  } catch (err: any) {
    throw new Error("Failed to parse response: " + err?.message);
  }
}

export async function setVideoEncoderConfiguration(camId: string, config: VideoEncoderConfig) {
  const cam = cameras[camId];
  if (!cam) throw new Error("Camera not found");
  console.log("settings configuration for video enconfing foir cam : ", camId, " : ", config)
  const securityHeader = buildSecurityHeader(cam.username, cam.password);

  const xml = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Header>${securityHeader}</s:Header>
  <s:Body>
    <trt:SetVideoEncoderConfiguration xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
      <trt:Configuration token="${config.token}">
        <tt:Name xmlns:tt="http://www.onvif.org/ver10/schema">${config.name}</tt:Name>
        <tt:UseCount xmlns:tt="http://www.onvif.org/ver10/schema">1</tt:UseCount>
        <tt:Encoding xmlns:tt="http://www.onvif.org/ver10/schema">${config.encoding}</tt:Encoding>
        <tt:Resolution xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:Width>${config.resolution.width}</tt:Width>
          <tt:Height>${config.resolution.height}</tt:Height>
        </tt:Resolution>
        <tt:Quality xmlns:tt="http://www.onvif.org/ver10/schema">${config.quality}</tt:Quality>
        <tt:RateControl xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:FrameRateLimit>${config.rateControl.frameRate}</tt:FrameRateLimit>
          <tt:EncodingInterval>${config.rateControl.encodingInterval}</tt:EncodingInterval>
          <tt:BitrateLimit>${config.rateControl.bitrate}</tt:BitrateLimit>
        </tt:RateControl>
        <tt:H264 xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:GovLength>${config.h264?.govLength}</tt:GovLength>
          <tt:H264Profile>${config.h264?.profile}</tt:H264Profile>
        </tt:H264>
      </trt:Configuration>
      <trt:ForcePersistence>true</trt:ForcePersistence>
    </trt:SetVideoEncoderConfiguration>
  </s:Body>
</s:Envelope>
`;

  try {
    console.log("to")

    const responseXml = await sendSoapRequest(cam.ip, cam.port || 80, xml, "http://www.onvif.org/ver10/media/wsdl/SetVideoEncoderConfiguration");
    console.log(responseXml)

    const json = await parseStringPromise(responseXml || '', { explicitArray: false });


    return {message:"camera has been succefully applied configuration"}
  } catch (err: any) {
    throw new Error("Failed to parse response: " + err?.message);
  }
}


export async function focusMove(camId: string, speed: number,token:string) {
  const cam = cameras[camId];
  if (!cam) throw new Error("Camera not found");

  const securityHeader = buildSecurityHeader(cam.username, cam.password);

  const xml = `
  <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Header>${securityHeader}</s:Header>
    <s:Body>
   
      <ptz:SetFocus xmlns:ptz="http://www.onvif.org/ver20/ptz/wsdl">
         <ptz:ProfileToken>PROFILE_TOKEN</ptz:ProfileToken>
         <ptz:Focus>
            <tt:FocusNear>
               <tt:Speed>5</tt:Speed> <!-- Adjust this based on how fast you want the focus to change -->
            </tt:FocusNear>
         </ptz:Focus>
      </ptz:SetFocus>
    </s:Body>
  </s:Envelope>`;

  const responseXml = await sendSoapRequest(
    cam.ip,
    cam.port || 80,
    xml,
    "http://www.onvif.org/ver20/imaging/wsdl/Move"
  );

  return responseXml;
}
export async function focusStop(camId: string,token:string) {
  const cam = cameras[camId];
  if (!cam) throw new Error("Camera not found");

  const securityHeader = buildSecurityHeader(cam.username, cam.password);

  const xml = `
  <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
    <s:Header>${securityHeader}</s:Header>
    <s:Body>
      <timg:Stop xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl">
        <timg:VideoSourceToken>${token}</timg:VideoSourceToken>
        <timg:Focus>true</timg:Focus>
      </timg:Stop>
    </s:Body>
  </s:Envelope>`;

  const responseXml = await sendSoapRequest(
    cam.ip,
    cam.port || 80,
    xml,
    "http://www.onvif.org/ver20/imaging/wsdl/Stop"
  );

  return responseXml;
}


