// Test-owned terminating query adapter for the unchanged b-catalog reference in the connected root and smoke.
export async function fetchModels(region, { signal }) {
  signal.throwIfAborted();
  return Object.freeze([Object.freeze({ id: `${region}-1`, label: region })]);
}
