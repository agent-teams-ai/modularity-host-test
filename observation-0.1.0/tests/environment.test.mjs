import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function child(args, cwd) {
  const { NODE_TEST_CONTEXT: _context, NODE_OPTIONS: _options, ...environment } = process.env;
  const result = spawnSync(process.execPath, args, { cwd, env: environment, encoding: "utf8", timeout: 30000 });
  assert.equal(result.error, undefined, result.error?.message); assert.equal(result.signal, null); return result;
}

test("O-09 an installed-archive fire-and-forget echo exits after one report", async t => {
  const directory = await mkdtemp(join(root, ".work/echo-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const original = await readFile(join(root, "third_party/process-probe.mjs"), "utf8");
  const subject = original.replaceAll('"../dist/index.js"', '"@get-modular/observation"')
    .replaceAll('"../dist/testing.js"', '"@get-modular/observation/testing"');
  assert.notEqual(subject, original); assert.ok(!subject.includes("../dist/"));
  const file = join(directory, "process-probe.mjs"); await writeFile(file, subject);
  const result = child([file, "echo-exit"], directory);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout.split("\n").filter(line => line === "REPORT observation.delivery.echo").length, 1);
});

test("O-10 the pinned CMS lint policy rejects non-test testing imports and accepts the test file", async t => {
  const directory = await mkdtemp(join(root, ".work/lint-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const cms = await readFile(join(root, "third_party/common-assembly.md"), "utf8");
  const snippets = [...cms.matchAll(/```json\n([\s\S]*?)```/gu)].map(match => match[1])
    .filter(text => text.includes("@get-modular/observation/testing") && text.includes("no-restricted-imports"));
  assert.equal(snippets.length, 1); JSON.parse(snippets[0]);
  await writeFile(join(directory, ".oxlintrc.json"), snippets[0]);
  for (const path of ["src/features/a/composition/a.module.ts", "src/features/a/adapters/outbound/x.ts", "src/features/a/composition/a.test.ts"]) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), 'import { delivered } from "@get-modular/observation/testing";\nvoid delivered;\n');
  }
  const result = child([join(root, "node_modules/oxlint/bin/oxlint"), "-c", ".oxlintrc.json", "--format", "json", "."], directory);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout); const diagnostics = report.diagnostics ?? report;
  assert.equal(diagnostics.length, 2, result.stdout);
  assert.ok(diagnostics.every(item => /no-restricted-imports/u.test(JSON.stringify(item))));
  assert.ok(diagnostics.every(item => !JSON.stringify(item).includes("a.test.ts")));
});
