import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { fileConfig } from '../src/file-policy.js';
import { scanFile } from '../src/file-scanner.js';
const oldHost = fileConfig.CLAMAV_HOST,
  oldPort = fileConfig.CLAMAV_PORT;
afterEach(() => {
  fileConfig.CLAMAV_HOST = oldHost;
  fileConfig.CLAMAV_PORT = oldPort;
});
async function withScanner(response: string, action: (received: Buffer[]) => Promise<void>) {
  const received: Buffer[] = [];
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0),
      header = false;
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (!header) {
        if (pending.length < 10) return;
        expect(pending.subarray(0, 10).toString()).toBe('zINSTREAM\0');
        pending = pending.subarray(10);
        header = true;
      }
      while (pending.length >= 4) {
        const size = pending.readUInt32BE(0);
        if (pending.length < size + 4) return;
        if (!size) {
          socket.end(response);
          return;
        }
        received.push(Buffer.from(pending.subarray(4, size + 4)));
        pending = pending.subarray(size + 4);
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  fileConfig.CLAMAV_HOST = '127.0.0.1';
  fileConfig.CLAMAV_PORT = (server.address() as { port: number }).port;
  try {
    await action(received);
  } finally {
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
  }
}
describe('real ClamAV TCP framing and fail-closed responses', () => {
  it('frames the whole stream into bounded chunks and requires an exact clean response', async () => {
    await withScanner('stream: OK\0', async (received) => {
      const bytes = Buffer.alloc(150000, 7);
      expect(await scanFile(bytes)).toBe('CLEAN');
      expect(Buffer.concat(received)).toEqual(bytes);
      expect(Math.max(...received.map((chunk) => chunk.length))).toBeLessThanOrEqual(65536);
    });
  });
  it('classifies an explicit virus result as rejected', async () => {
    await withScanner('stream: Eicar-Signature FOUND\0', async () => {
      expect(await scanFile(Buffer.from('test'))).toBe('REJECTED');
    });
  });
  it.each(['stream: scanner ERROR\0', 'stream: OK\n', 'malformed\0'])(
    'rejects malformed or incomplete scanner response %s',
    async (response) => {
      await withScanner(response, async () => {
        await expect(scanFile(Buffer.from('test'))).rejects.toThrow();
      });
    },
  );
});
