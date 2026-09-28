import { mark } from './mark.mjs';
mark('writer:evaluate');
export async function create({ resource }) {
  mark('writer:factory');
  return { instance: {}, capabilities: { 'test/action': {
    resourceId: resource.resourceId, resourceIdentity: resource.resourceIdentity, run: () => resource.write('write'),
  } } };
}
