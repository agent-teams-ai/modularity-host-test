import { fixture, deferred } from './fixture.mjs';

const release = deferred();
let created = 0;
globalThis.__testImportStarted = () => process.send({ type: 'import-started' });
globalThis.__testImportRelease = release.promise;
globalThis.__testCreateCalled = () => { created++; };

try {
  const x = await fixture(undefined, { providerPath: '../../src/fixtures/candidates/import-paused.mjs' });
  const construction = x.start();
  process.on('message', async message => {
    if (message === 'seal') {
      const close = x.host.close();
      process.send({ type: 'sealed', state: x.host.status().state });
      process.once('message', async next => {
        if (next !== 'release') throw Error('unexpected-message');
        release.resolve();
        const result = await construction;
        const terminal = await close;
        process.send({ type: 'result', raw: result.raw?.status, created, terminal: terminal.status,
          resource: x.host.status().hasResource });
      });
    }
  });
} catch (error) {
  process.send({ type: 'error', message: String(error) });
}
