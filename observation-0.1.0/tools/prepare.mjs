import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { root, sha256, verifyPins } from "./pins.mjs";
const source = process.argv[2];
assert.ok(source, "Pass the prepared release source checkout; only the pinned commit is read.");
const pins = await verifyPins();
function git(args) {
  const result = spawnSync("git", ["-C", resolve(source), ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); return result.stdout;
}
const cms = git(["show", `${pins.sourceCommit}:docs/architecture/common-assembly.md`]);
assert.equal(sha256(cms), pins.cmsSha256);
await writeFile(join(root, "third_party/common-assembly.md"), cms);
const paths = git(["ls-tree", "-r", "--name-only", pins.sourceCommit, "packages/observation/tests/writer-tasks",
  "packages/observation/tests/support/static-rules.mjs", "packages/observation/tests/support/compilers.mjs",
  "packages/observation/tests/process-probe.mjs"]).trim().split("\n");
assert.ok(paths.length > 50, "The pinned release must include all writer inputs.");
const hashes = {};
for (const path of paths) {
  const relative = path.replace("packages/observation/tests/", "");
  const body = git(["show", `${pins.sourceCommit}:${path}`]);
  const target = join(root, "third_party", relative);
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, body);
  hashes[relative] = sha256(body);
}
await writeFile(join(root, "third_party/writer-inputs.json"), JSON.stringify({ sourceCommit: pins.sourceCommit, files: hashes }, null, 2) + "\n");
await mkdir(join(root, "src/reference"), { recursive: true });
for (const task of ["a-logger", "b-catalog"]) {
  for (const [from, to] of [[`solutions/reference/${task}.ts.txt`, `${task}.ts`], [`tasks/${task}.types.ts.txt`, `${task}.types.ts`]]) {
    await writeFile(join(root, "src/reference", to), await readFile(join(root, "third_party/writer-tasks", from)));
  }
}
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
manifest.dependencies = Object.fromEntries(pins.packages.map(item => [item.name, `file:third_party/${item.file}`]));
await writeFile(join(root, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - .\n\noverrides:\n" +
  pins.packages.map(item => `  '${item.name}': file:third_party/${item.file}`).join("\n") + "\n");
console.log(`Prepared exact source ${pins.sourceCommit}; install this directory with pnpm install --offline --ignore-scripts, retaining the lockfile.`);
