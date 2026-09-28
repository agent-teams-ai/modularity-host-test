import { mark } from './mark.mjs';
mark('root:evaluate');
export async function create({ actions }, owner) {
  mark('root:factory');
  return { instance: {
    run: () => { owner.assertReady(); return actions.map(action => action.run()); },
    identities: () => { owner.assertReady(); return actions.map(action => action.resourceId); },
    sharedResource: () => { owner.assertReady(); return typeof actions[0].resourceIdentity === 'symbol' &&
      typeof actions[1].resourceIdentity === 'symbol' && actions[0].resourceIdentity === actions[1].resourceIdentity; },
  }, capabilities: {} };
}
