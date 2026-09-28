import { mark } from './mark.mjs';
mark('paused:evaluate');
globalThis.__testImportStarted?.();
await globalThis.__testImportRelease;
export const create = () => { globalThis.__testCreateCalled?.(); };
