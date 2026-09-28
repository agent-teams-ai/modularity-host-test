import { mark } from './mark.mjs';
mark('missing-identity-writer:evaluate');
export async function create({ resource }) {
  mark('missing-identity-writer:factory');
  return { instance: {}, capabilities: { 'test/action': {
    resourceId: resource.resourceId, run: () => resource.write('write'),
  } } };
}
