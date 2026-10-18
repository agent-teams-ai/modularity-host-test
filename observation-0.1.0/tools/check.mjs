import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import os from "node:os";
import { root, sha256, verifyPins } from "./pins.mjs";
const require = createRequire(join(root, "package.json"));
const [node24, node26] = process.argv.slice(2);
assert.ok(node24 && node26, "Pass exact Node 24.21.0 and 26.11.1 executable paths.");
const evidence = join(root, "evidence/current");
await rm(evidence, { recursive: true, force: true }); await mkdir(evidence, { recursive: true });
await mkdir(join(root, ".work"), { recursive: true });
const pins = await verifyPins();
const { materializeHarness } = await import("./public-stats.mjs");
const stages = [];
function run(name, executable, args) {
  const { NODE_OPTIONS: _options, NODE_TEST_CONTEXT: _context, ...environment } = process.env;
  const result = spawnSync(executable, args, { cwd: root, env: environment, encoding: "utf8", timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  stages.push({ name, executable, args, status: result.status, signal: result.signal });
  return { result, output, async accept() {
    await writeFile(join(evidence, `${name}.log`), output);
    assert.equal(result.error, undefined, `${name}: ${result.error?.message}`); assert.equal(result.signal, null, name);
    assert.equal(result.status, 0, `${name}\n${output}`);
    console.log(`${name}: passed`); return output;
  } };
}
for (const [binary, expected] of [[node24, "v24.21.0"], [node26, "v26.11.1"]]) {
  const check = run(`version-${expected}`, binary, ["--version"]); assert.equal((await check.accept()).trim(), expected);
}
const versions = [];
for (const name of ["typescript", "typescript-minimum"]) {
  const path = require.resolve(`${name}/package.json`); const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.equal(manifest.version, "7.0.2"); assert.equal(manifest.name, "typescript");
  if (!versions.some(item => item.version === manifest.version)) versions.push({ version: manifest.version, compiler: join(dirname(path), "bin/tsc") });
}
const roots = {};
for (const item of pins.packages) {
  const entry = await realpath(require.resolve(item.name));
  assert.ok(!relative(join(root, "node_modules"), entry).startsWith(".."), `${item.name} resolved outside this consumer`);
  let directory = dirname(entry); let manifest;
  for (;;) {
    try { manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")); if (manifest.name === item.name) break; } catch {}
    const parent = dirname(directory); assert.notEqual(parent, directory, `${item.name}: package manifest missing`); directory = parent;
  }
  assert.equal(manifest.version, item.version);
  const archive = join(root, "third_party", item.file);
  const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const content = {};
  for (const path of listing.stdout.trim().split("\n").filter(path => !path.endsWith("/"))) {
    assert.ok(path.startsWith("package/") && !path.split("/").includes(".."), path);
    const packed = spawnSync("tar", ["-xOzf", archive, path], { maxBuffer: 16 * 1024 * 1024 });
    assert.equal(packed.status, 0, String(packed.stderr));
    const local = path.slice("package/".length); const digest = sha256(packed.stdout);
    assert.equal(sha256(await readFile(join(directory, local))), digest, `${item.name}/${local}: differs from pinned archive`);
    content[local] = digest;
  }
  roots[item.name] = { version: manifest.version, entry, content };
  const peerRequire = createRequire(join(directory, "package.json"));
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (pins.packages.some(peer => peer.name === name)) assert.equal(await realpath(peerRequire.resolve(name)), await realpath(require.resolve(name)), `${item.name}: duplicate ${name}`);
  }
}
const copied = JSON.parse(await readFile(join(root, "third_party/writer-inputs.json"), "utf8"));
assert.equal(copied.sourceCommit, pins.sourceCommit);
for (const [path, expected] of Object.entries(copied.files)) assert.equal(sha256(await readFile(join(root, "third_party", path))), expected, path);
assert.equal(sha256(await readFile(join(root, "third_party/common-assembly.md"))), pins.cmsSha256);
const originalHarness = join(root, "third_party/writer-tasks/harness.mjs.txt");
const adaptedHarness = join(root, ".work/public-harness.mjs");
await writeFile(adaptedHarness, materializeHarness(await readFile(originalHarness, "utf8")));
const adapterDiff = spawnSync("diff", ["-u", "--label", "pinned/harness.mjs", "--label", "materialized/harness.mjs",
  originalHarness, adaptedHarness], { encoding: "utf8" });
assert.equal(adapterDiff.status, 1, adapterDiff.stderr);
await writeFile(join(evidence, "writer-harness.patch"), adapterDiff.stdout);
for (const task of ["a-logger", "b-catalog"]) for (const [from, to] of [
  [`solutions/reference/${task}.ts.txt`, `${task}.ts`], [`tasks/${task}.types.ts.txt`, `${task}.types.ts`],
]) assert.equal(sha256(await readFile(join(root, "src/reference", to))),
  sha256(await readFile(join(root, "third_party/writer-tasks", from))), `${task}: reference bytes changed`);
for (const compiler of versions) for (const [module, resolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]]) {
  await run(`types-${compiler.version}-${resolution}`, node26, [compiler.compiler, "-p", "tsconfig.json", "--module", module, "--moduleResolution", resolution, "--skipLibCheck", "false"]).accept();
}
await rm(join(root, "out"), { recursive: true, force: true });
await run("emit", node26, [versions[0].compiler, "-p", "tsconfig.runtime.json"]).accept();
await copyFile(join(root, "third_party/writer-tasks/fakes/a-logger.types.js.txt"), join(root, "out/src/reference/a-logger.types.js"));
await copyFile(join(root, "tests/reference-catalog.mjs"), join(root, "out/src/reference/b-catalog.types.js"));
for (const [binary, label] of [[node24, "node24"], [node26, "node26"]]) {
  await run(`runtime-${label}`, binary, ["--test", "out/tests/connected.test.js", "tests/public-stats.test.mjs", "tests/environment.test.mjs"]).accept();
  await run(`writers-${label}`, binary, ["--test", "tests/writer-gate.test.mjs"]).accept();
}
// One unchanged-root smoke, separate from the compiler/resolver and two-runtime behavior rows.
await run("smoke", node26, ["--test", "out/tests/smoke.test.js"]).accept();
const sourceFiles = {};
async function record(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await record(path); else sourceFiles[path] = sha256(await readFile(join(root, path)));
  }
}
for (const directory of ["src", "tests", "tools"]) await record(directory);
for (const path of ["package.json", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.runtime.json", "third_party/writer-inputs.json"])
  sourceFiles[path] = sha256(await readFile(join(root, path)));
const checkout = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }); assert.equal(checkout.status, 0);
const report = { format: 1, status: "passed", subject: pins, installed: roots, compilerVersions: versions.map(item => item.version),
  fixture: { commit: checkout.stdout.trim(), sourceFiles },
  environment: { platform: process.platform, arch: process.arch, release: os.release() },
  lockSha256: sha256(await readFile(join(root, "pnpm-lock.yaml"))), stages,
  claims: { runtime: "O-01 through O-10 passed on the named archives and runtime rows; one smoke", packed: "exact pinned archive installation",
    source: "only the pinned CMS testing-import lint predicate; no full source-architecture claim", measurement: "not-selected" } };
await writeFile(join(evidence, "result.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Exact-archive observation TEST completed.");
