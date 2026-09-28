import { mark } from './mark.mjs';
mark('reader:evaluate');
export async function create({ resource }) {
  mark('reader:factory');
  return { instance: {}, capabilities: { 'test/action': {
    resourceId: resource.resourceId, resourceIdentity: resource.resourceIdentity, run: () => resource.read(),
  } } };
}
