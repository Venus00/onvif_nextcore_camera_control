"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSoapRequest = sendSoapRequest;
const axios_1 = __importDefault(require("axios"));
async function sendSoapRequest(ip, port, body, action) {
    const url = `http://${ip}:${port}/onvif/Media`;
    const response = await axios_1.default.post(url, body, {
        headers: {
            "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`
        },
        timeout: 5000
    });
    return response.data;
}
//# sourceMappingURL=onvifClient.js.map