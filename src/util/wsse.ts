import * as crypto from "crypto";

export function createPasswordDigest(password: string) {
  const nonce = crypto.randomBytes(16);
  const created = new Date().toISOString();
  const sha1 = crypto.createHash("sha1");

  sha1.update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password)]));
  const digest = sha1.digest("base64");

  return {
    digest,
    nonce: nonce.toString("base64"),
    created
  };
}

export function buildSecurityHeader(username: string, password: string) {
  const { digest, nonce, created } = createPasswordDigest(password);

  return `
    <Security s:mustUnderstand="1"
        xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <UsernameToken>
        <Username>${username}</Username>
        <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password>
        <Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce}</Nonce>
        <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created>
      </UsernameToken>
    </Security>
  `;
}
