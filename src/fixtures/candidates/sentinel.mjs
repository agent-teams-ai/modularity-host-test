import { mark } from './mark.mjs';
mark('sentinel:evaluate');
export async function create() {
  mark('sentinel:factory');
  return { instance: {}, capabilities: {} };
}
