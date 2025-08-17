const axios = require('axios');
const crypto = require('crypto');

const CAM_IP = '192.168.11.115';
const CAM_PORT = 8899;
const USERNAME = 'admin';
const PASSWORD = ''; 
const CONFIG_TOKEN = '000'; 

function createPasswordDigest(password) {
    const nonce = crypto.randomBytes(16);
    const created = new Date().toISOString();
    const sha1 = crypto.createHash('sha1');
    sha1.update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password)]));
    const digest = sha1.digest('base64');
    return {
        digest,
        nonce: nonce.toString('base64'),
        created
    };
}

function buildSoapXml({digest, nonce, created}) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Header>
    <wsse:Security s:mustUnderstand="1"
      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${USERNAME}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
        <wsse:Nonce>${nonce}</wsse:Nonce>
        <wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
  </s:Header>
  <s:Body>
    <trt:SetVideoEncoderConfiguration xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
      <trt:Configuration token="${CONFIG_TOKEN}">
        <tt:Name xmlns:tt="http://www.onvif.org/ver10/schema">VideoE_000</tt:Name>
        <tt:UseCount xmlns:tt="http://www.onvif.org/ver10/schema">1</tt:UseCount>
        <tt:Encoding xmlns:tt="http://www.onvif.org/ver10/schema">H264</tt:Encoding>
        <tt:Resolution xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:Width>1920</tt:Width>
          <tt:Height>1080</tt:Height>
        </tt:Resolution>
        <tt:Quality xmlns:tt="http://www.onvif.org/ver10/schema">5</tt:Quality>
        <tt:RateControl xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:FrameRateLimit>15</tt:FrameRateLimit>
          <tt:EncodingInterval>1</tt:EncodingInterval>
          <tt:BitrateLimit>5415</tt:BitrateLimit>
        </tt:RateControl>
        <tt:H264 xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:GovLength>2</tt:GovLength>
          <tt:H264Profile>High</tt:H264Profile>
        </tt:H264>
        <tt:Multicast xmlns:tt="http://www.onvif.org/ver10/schema">
          <tt:Address>
            <tt:Type>IPv4</tt:Type>
            <tt:IPv4Address>224.1.2.3</tt:IPv4Address>
          </tt:Address>
          <tt:Port>0</tt:Port>
          <tt:TTL>0</tt:TTL>
          <tt:AutoStart>false</tt:AutoStart>
        </tt:Multicast>
        <tt:SessionTimeout xmlns:tt="http://www.onvif.org/ver10/schema">PT10S</tt:SessionTimeout>
      </trt:Configuration>
      <trt:ForcePersistence>true</trt:ForcePersistence>
    </trt:SetVideoEncoderConfiguration>
  </s:Body>
</s:Envelope>`;
}

async function setVideoConfig() {
    const {digest, nonce, created} = createPasswordDigest(PASSWORD);
    const soapXml = buildSoapXml({digest, nonce, created});

    try {
        const response = await axios.post(
            `http://${CAM_IP}:${CAM_PORT}/onvif/Media`,
            soapXml,
            {
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver10/media/wsdl/SetVideoEncoderConfiguration"'
                },
                timeout: 5000
            }
        );
        console.log('Camera response:');
        console.log(response.data);
    } catch (err) {
        console.error('Failed to set video configuration:', err.message);
    }
}

setVideoConfig();
