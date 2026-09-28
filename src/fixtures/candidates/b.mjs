import { mark } from './mark.mjs';
mark('b:evaluate');
export async function create(_dependencies, owner) {
  mark('b:factory');
  const resourceId = 'b-resource';
  const resourceIdentity = Symbol('b-resource');
  let disposed = false;
  const resource = {
    resourceIdentity,
    read() { if (disposed) throw Error('resource-disposed'); return 'b-value'; },
    write(value) { if (disposed) throw Error('resource-disposed'); owner.effect(value); return `b:${value}`; },
    dispose() { if (disposed) throw Error('double-dispose'); disposed = true; mark('b:dispose'); },
  };
  owner.acquire(resource);
  return { instance: { resourceId }, capabilities: {
    'test/resource/read': { resourceId, resourceIdentity, read: () => resource.read() },
    'test/resource/write': { resourceId, resourceIdentity, write: value => resource.write(value) },
  } };
}
