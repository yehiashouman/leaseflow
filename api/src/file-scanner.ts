import { createConnection } from 'node:net';
import { fileConfig } from './file-policy.js';

export type FileScanner = (bytes: Buffer) => Promise<'CLEAN' | 'REJECTED'>;
export const scanFile: FileScanner = (bytes) =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: fileConfig.CLAMAV_HOST, port: fileConfig.CLAMAV_PORT });
    const timeout = setTimeout(() => finish(new Error('Scanner timeout')), 20000);
    let response = '',
      settled = false;
    function finish(error?: Error, result?: 'CLEAN' | 'REJECTED') {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error);
      else resolve(result!);
    }
    socket.on('error', (error) => finish(error));
    socket.on('end', () => {
      if (!settled) finish(new Error('Scanner response incomplete'));
    });
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString('utf8');
      if (response.length > 4096) return finish(new Error('Scanner response exceeds limit'));
      if (!response.includes('\0')) return;
      const line = response.split('\0')[0]!;
      if (line === 'stream: OK') finish(undefined, 'CLEAN');
      else if (/^stream: .+ FOUND$/.test(line)) finish(undefined, 'REJECTED');
      else finish(new Error('Scanner did not accept the file'));
    });
    socket.on('connect', async () => {
      try {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536),
            size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          await new Promise<void>((done, fail) => {
            socket.write(Buffer.concat([size, chunk]), (error) => (error ? fail(error) : done()));
          });
        }
        socket.write(Buffer.alloc(4));
      } catch {
        finish(new Error('Scanner transfer failed'));
      }
    });
  });
