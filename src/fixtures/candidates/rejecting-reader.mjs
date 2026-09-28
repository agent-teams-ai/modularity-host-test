import { mark } from './mark.mjs';
mark('rejecting-reader:evaluate');
export async function create() {
  mark('rejecting-reader:factory');
  throw new Error('reader-rejected');
}
