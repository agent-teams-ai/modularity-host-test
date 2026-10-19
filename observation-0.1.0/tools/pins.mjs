import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export async function verifyPins() {
  const pins = JSON.parse(await readFile(join(root, "third_party/pins.json"), "utf8"));
  assert.deepEqual(Object.keys(pins).sort(), ["cmsSha256", "format", "packages", "sourceCommit"]);
  assert.equal(pins.format, 1); assert.match(pins.sourceCommit, /^[a-f0-9]{40}$/u); assert.match(pins.cmsSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(pins.packages.map(item => item.name).sort(),
    ["assembly", "conformance", "core", "observation", "resources"].map(name => `@get-modular/${name}`).sort());
  for (const item of pins.packages) {
    assert.deepEqual(Object.keys(item).sort(), ["file", "name", "sha256", "version"]);
    assert.match(item.file, /^archives\/[a-z0-9.-]+\.tgz$/u); assert.match(item.version, /^0\.\d+\.\d+$/u);
    assert.match(item.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(sha256(await readFile(join(root, "third_party", item.file))), item.sha256, item.name);
  }
  return pins;
}
