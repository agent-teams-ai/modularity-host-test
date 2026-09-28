import { mark } from './mark.mjs';
mark('distinct-identity-reader:evaluate');
export async function create({ resource }) {
  mark('distinct-identity-reader:factory');
  return { instance: {}, capabilities: { 'test/action': {
    resourceId: resource.resourceId, resourceIdentity: Symbol('impostor'), run: () => resource.read(),
  } } };
}
