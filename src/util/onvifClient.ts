import axios from "axios";

export async function sendSoapRequest(ip: string, port: number, body: string, action: string) {
  const url = `http://${ip}:${port}/onvif/Media`;

  const response = await axios.post(url, body, {
    headers: {
      "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`
    },
    timeout: 5000
  });

  return response.data;
}