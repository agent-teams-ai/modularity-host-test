import { mark } from './mark.mjs';
mark('root:evaluate');
export async function create({ actions }) {
  mark('root:factory');
  return { instance: {
    run: () => actions.map(action => action.run()),
    identities: () => actions.map(action => action.resourceId),
    sharedResource: () => typeof actions[0].resourceIdentity === 'symbol' &&
      typeof actions[1].resourceIdentity === 'symbol' && actions[0].resourceIdentity === actions[1].resourceIdentity,
  }, capabilities: {} };
}
