import { mark } from './mark.mjs';
mark('a:evaluate');
export async function create(_dependencies, owner) {
  mark('a:factory');
  const resourceId = 'a-resource';
  const resourceIdentity = Symbol('a-resource');
  let disposed = false;
  const resource = {
    resourceIdentity,
    read() { if (disposed) throw Error('resource-disposed'); return 'a-value'; },
    write(value) { if (disposed) throw Error('resource-disposed'); owner.effect(value); return `a:${value}`; },
    dispose() { if (disposed) throw Error('double-dispose'); disposed = true; mark('a:dispose'); },
  };
  owner.acquire(resource);
  return { instance: { resourceId }, capabilities: {
    'test/resource/read': { resourceId, resourceIdentity, read: () => resource.read() },
    'test/resource/write': { resourceId, resourceIdentity, write: value => resource.write(value) },
  } };
}
