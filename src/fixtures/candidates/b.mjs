import { mark } from './mark.mjs';
mark('b:evaluate');
export async function create(_dependencies, owner) {
  mark('b:factory');
  const register = owner.reserve();
  const resourceId = 'b-resource';
  const resourceIdentity = Symbol('b-resource');
  let disposed = false;
  const resource = {
    resourceIdentity,
    read() { return owner.read(() => { if (disposed) throw Error('resource-disposed'); return 'b-value'; }); },
    write(value) { owner.effect(value); if (disposed) throw Error('resource-disposed'); return `b:${value}`; },
    dispose() { if (disposed) throw Error('double-dispose'); disposed = true; mark('b:dispose'); },
  };
  register(resource);
  return { instance: { resourceId }, capabilities: {
    'test/resource/read': { resourceId, resourceIdentity, read: () => resource.read() },
    'test/resource/write': { resourceId, resourceIdentity, write: value => resource.write(value) },
  } };
}
