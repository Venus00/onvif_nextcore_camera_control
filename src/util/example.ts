// example.ts

import { CameraSetupAPI, CameraClient } from './CameraSetupAPI';

const ip = '192.168.1.108';
const username = 'admin';
const password = '2899100*-+';

async function main() {
  const DigestFetch = (await import('digest-fetch')).default;
  const digestClient = new DigestFetch(username, password);

  const client: CameraClient = {
    async fetch(url: string) {
      const response = await digestClient.fetch(url);
      return {
        text: async () => await response.text(),
      };
    },
  };

  const camera = new CameraSetupAPI({ client, ip });

  try {
    console.log(`Connecting to camera at ${ip}...`);

    const colors = await camera.getVideoColor();
    console.log('Video Color:', colors);

    const exposure = await camera.getVideoExposure();
    console.log('Exposure:', exposure);

    console.log('\n✅ Success!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();