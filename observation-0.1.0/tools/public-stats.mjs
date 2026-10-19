import { liveSubscriptions } from "@get-modular/observation/testing";
/** These two fixed task records are declared by the original writer task contracts. All owner keys come from its own initial record. */
export const derivedKeys = Object.freeze({
  "c-pricing-context": Object.freeze(["currency", "vatRate"]),
  "g-hierarchy": Object.freeze(["currency", "vatRate", "discountPercent"]),
});
export function publicStats(store, keys) {
  const facet = typeof store.readonly === "function" ? store.readonly() : store;
  const values = Object.freeze({
    get live() { return liveSubscriptions(facet); },
    get commits() {
      if (!Array.isArray(keys) || keys.length === 0) throw new Error("writer.stats.unknown-record");
      return store.read(keys).revision;
    },
  });
  return new Proxy(values, { get(target, key) {
    if (!Object.hasOwn(target, key)) throw new Error(`writer.stats.unknown-field:${String(key)}`);
    return Reflect.get(target, key);
  } });
}
export function materializeHarness(original) {
  const replace = (before, after) => {
    if (original.split(before).length !== 2) throw new Error("writer.harness.anchor-changed");
    original = original.replace(before, after);
  };
  replace('import { storeStats as stats } from "../node_modules/@get-modular/observation/dist/features/store/registry.js";',
    'import { publicStats, derivedKeys } from "../public-stats.mjs";');
  replace('  const host = createScope({ name: "host" });',
    '  const host = createScope({ name: "host" });\n  const ownedKeys = new WeakMap();\n  const stats = store => publicStats(store, ownedKeys.get(store) ?? derivedKeys[name]);');
  replace('    createStore: (initial, storeName = "settings") =>\n      createStore(initial, { name: storeName, resources: host.resources, reportError: (report) => { hostErrors.push(report); } }),',
    '    createStore: (initial, storeName = "settings") => {\n      const store = createStore(initial, { name: storeName, resources: host.resources, reportError: (report) => { hostErrors.push(report); } });\n      ownedKeys.set(store, Object.keys(initial));\n      return store;\n    },');
  return original;
}
