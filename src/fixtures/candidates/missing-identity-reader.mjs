import { mark } from './mark.mjs';
mark('missing-identity-reader:evaluate');
export async function create({ resource }) {
  mark('missing-identity-reader:factory');
  return { instance: {}, capabilities: { 'test/action': {
    resourceId: resource.resourceId, run: () => resource.read(),
  } } };
}
