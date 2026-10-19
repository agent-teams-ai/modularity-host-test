import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { parseDiagnostics, resolutions, supportedCompilers, writeProject } from "../third_party/support/compilers.mjs";
import { materializeHarness } from "../tools/public-stats.mjs";
import { staticRules } from "../third_party/support/static-rules.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(packageRoot, "third_party/writer-tasks");
const WRITER_BUDGET_MS = 240_000;
type Gate = "rules" | "compile" | "behaviour";
type WriterSet = { readonly dir: string } & (
  { readonly expect: "pass"; readonly tasks: readonly string[] } |
  { readonly expect: "fail"; readonly gates: Readonly<Record<string, readonly Gate[] | null>> }
);
interface CompilerDiagnostic {
  readonly file: string | undefined;
  readonly line: number;
  readonly column?: number;
  readonly code: string | undefined;
  readonly message: string | undefined;
}
interface WriterRow {
  readonly set: WriterSet;
  readonly task: string;
  readonly directory: string;
  readonly rules: readonly string[];
  readonly errors: (CompilerDiagnostic & { readonly compiler: string; readonly resolution: string })[];
  runtimeDirectory?: string;
}

function childBudget(deadline: number, maximum: number): number {
  const remaining = Math.floor(deadline - performance.now());
  assert.ok(remaining > 0, "writer aggregate deadline exhausted before launching another child");
  return Math.min(maximum, remaining);
}

/** Keep the pinned helper's compiler flags and diagnostics, with the owned deadline at the child boundary. */
function compileWriter(compiler: { readonly path: string }, directory: string, deadline: number) {
  const result = spawnSync(process.execPath, [compiler.path, "-p", "tsconfig.json", "--pretty", "false"], {
    cwd: directory, encoding: "utf8", timeout: childBudget(deadline, 120_000),
    killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, `compiler process failed: ${result.error?.message}`);
  assert.equal(result.signal, null, `compiler process terminated: ${result.signal}`);
  assert.ok(performance.now() < deadline, "writer aggregate deadline exhausted during compilation");
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const diagnostics = parseDiagnostics(output, directory);
  assert.ok(result.status === 0 || diagnostics.length > 0, `compiler failure without diagnostics: ${output}`);
  return { status: result.status, diagnostics, output };
}

async function prepare(temporary: string, sets: readonly WriterSet[]): Promise<WriterRow[]> {
  await symlink(join(packageRoot, "node_modules"), join(temporary, "node_modules"), "junction");
  await writeFile(join(temporary, "package.json"), '{"type":"module"}\n');
  const rows: WriterRow[] = [];
  for (const set of sets) {
    const directory = join(temporary, set.dir);
    await mkdir(directory);
    await writeFile(join(directory, "harness.mjs"), materializeHarness(await readFile(join(fixtures, "harness.mjs.txt"), "utf8")));
    for (const task of set.expect === "pass" ? set.tasks : Object.keys(set.gates)) {
      for (const suffix of ["types.ts", "accept.ts"]) {
        await copyFile(join(fixtures, "tasks", `${task}.${suffix}.txt`), join(directory, `${task}.${suffix}`));
      }
      await copyFile(join(fixtures, "fakes", `${task}.types.js.txt`), join(directory, `${task}.types.js`));
      await copyFile(join(fixtures, "scenarios", `${task}.scenario.mjs.txt`), join(directory, `${task}.scenario.mjs`));
      const source = await readFile(join(fixtures, "solutions", set.dir, `${task}.ts.txt`), "utf8");
      await writeFile(join(directory, `${task}.ts`), source);
      rows.push({ set, task, directory, rules: staticRules(task, source), errors: [] });
    }
  }
  return rows;
}

function rowForDiagnostic(rows: readonly WriterRow[], diagnostic: CompilerDiagnostic): WriterRow | undefined {
  const path = diagnostic.file;
  if (path === undefined) {return undefined;}
  return rows.find(row => {
    const file = relative(row.directory, path).replaceAll("\\", "/");
    return [`${row.task}.ts`, `${row.task}.types.ts`, `${row.task}.accept.ts`].includes(file);
  });
}

async function checkCompilation(temporary: string, rows: readonly WriterRow[], context: TestContext, deadline: number): Promise<void> {
  const files = rows.flatMap(row => ["ts", "types.ts", "accept.ts"].map(suffix =>
    relative(temporary, join(row.directory, `${row.task}.${suffix}`))));
  for (const compiler of await supportedCompilers()) {
    for (const resolution of resolutions) {
      await writeProject(temporary, files, resolution);
      const result = compileWriter(compiler, temporary, deadline);
      for (const diagnostic of result.diagnostics) {
        const row = rowForDiagnostic(rows, diagnostic);
        assert.ok(row, `unattributable writer diagnostic: ${result.output}`);
        row.errors.push({ compiler: compiler.version, resolution, ...diagnostic });
      }
      context.diagnostic(`writer compile TypeScript ${compiler.version} ${resolution}: ${result.diagnostics.length} attributed diagnostics`);
    }
  }
}

async function emitRuntime(temporary: string, rows: readonly WriterRow[], deadline: number): Promise<void> {
  const compiler = (await supportedCompilers())[0];
  assert.ok(compiler !== undefined, "the emission phase requires its pinned compiler");
  const files = rows.flatMap(row => ["ts", "types.ts"].map(suffix => relative(temporary, join(row.directory, `${row.task}.${suffix}`))));
  await writeProject(temporary, files, "NodeNext", { noEmit: false, noCheck: true, outDir: ".emitted" });
  assert.equal(compileWriter(compiler, temporary, deadline).status, 0, "TypeScript 7 emission failed after the independent diagnostic gate");
  await copyFile(join(packageRoot, "tools/public-stats.mjs"), join(temporary, ".emitted/public-stats.mjs"));
  for (const row of rows) {
    const directory = join(temporary, ".emitted", row.set.dir);
    await copyFile(join(row.directory, "harness.mjs"), join(directory, "harness.mjs"));
    await copyFile(join(row.directory, `${row.task}.types.js`), join(directory, `${row.task}.types.js`));
    const original = await readFile(join(row.directory, `${row.task}.scenario.mjs`), "utf8");
    const from = `"./${row.task}.ts"`;
    assert.equal(original.split(from).length, 2, `${row.task}: exact runtime import anchor`);
    await writeFile(join(directory, `${row.task}.scenario.mjs`), original.replace(from, `"./${row.task}.js"`));
    row.runtimeDirectory = directory;
  }
}

function behavior(row: Pick<WriterRow, "task" | "runtimeDirectory">, deadline: number): { readonly failed: boolean; readonly output: string } {
  assert.ok(row.runtimeDirectory !== undefined, "a writer scenario requires its emitted runtime directory");
  const result = spawnSync(process.execPath, ["--expose-gc", `${row.task}.scenario.mjs`], {
    cwd: row.runtimeDirectory, encoding: "utf8", timeout: childBudget(deadline, 30_000), killSignal: "SIGKILL",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.equal(result.error, undefined, `writer scenario process failed: ${result.error?.message ?? output}`);
  assert.equal(result.signal, null, `writer scenario was terminated: ${output}`);
  assert.ok(performance.now() < deadline, "writer aggregate deadline exhausted during a scenario");
  // A crash is a broken run, never a passing negative-control observation.
  assert.ok(result.status === 0 || /behaviour failure/u.test(output), `writer scenario crashed: ${output}`);
  return { failed: result.status !== 0, output };
}

void test("O-08 T29 T75 T103 T108 exact archived writer references pass and every negative fails its exact gates", { timeout: WRITER_BUDGET_MS }, async context => {
  const deadline = performance.now() + WRITER_BUDGET_MS;
  const temporary = await mkdtemp(join(tmpdir(), "observation-writers-"));
  try {
    const { sets } = JSON.parse(await readFile(join(fixtures, "manifest.json"), "utf8")) as { readonly sets: readonly WriterSet[] };
    assert.equal(sets.length, 10);
    const rows = await prepare(temporary, sets);
    assert.equal(rows.length, 33);
    await checkCompilation(temporary, rows, context, deadline);
    await emitRuntime(temporary, rows, deadline);
    const failures = [];
    for (const row of rows) {
      const gates: Gate[] = [];
      if (row.rules.length > 0) gates.push("rules");
      if (row.errors.length > 0) gates.push("compile");
      let observed: ReturnType<typeof behavior> | undefined;
      if (row.errors.length === 0) {
        observed = behavior(row, deadline);
        if (observed.failed) gates.push("behaviour");
      }
      context.diagnostic(`${row.set.dir}/${row.task}: ${gates.length === 0 ? "PASS" : `FAIL (${gates.join(", ")})`}`);
      const expected = row.set.expect === "pass" ? [] : row.set.gates[row.task];
      assert.ok(expected !== undefined, "every archived writer row needs its exact gate oracle");
      if (expected === null ? gates.length === 0 : JSON.stringify(gates) !== JSON.stringify(expected)) {
        failures.push({ set: row.set.dir, task: row.task, expected, actual: gates, rules: row.rules,
          errors: row.errors, behavior: observed?.output });
      }
    }
    assert.ok(performance.now() < deadline, "writer aggregate deadline exhausted");
    assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

void test("writer child deadlines reject blocked scenarios and compilers instead of qualifying negatives", { timeout: 10_000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "observation-external-writer-deadline-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const blocked = 'process.on("SIGTERM", () => undefined);\nconsole.error("behaviour failure; blocked.ts(1,1): error TS9999: fixture");\nsetInterval(() => undefined, 1_000);\n';
  await writeFile(join(temporary, "blocked.scenario.mjs"), blocked);
  assert.throws(() => behavior({ task: "blocked", runtimeDirectory: temporary }, performance.now() + 1_000), /ETIMEDOUT/u);
  assert.throws(() => compileWriter({ path: join(temporary, "blocked.scenario.mjs") }, temporary,
    performance.now() + 1_000), /ETIMEDOUT/u);
});

void test("writer child launch failures and exhausted aggregate deadlines are never negative evidence", async t => {
  const temporary = await mkdtemp(join(tmpdir(), "observation-external-writer-refusal-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const missing = join(temporary, "missing");
  assert.throws(() => behavior({ task: "unused", runtimeDirectory: missing }, performance.now() + 30_000), /ENOENT/u);
  assert.throws(() => compileWriter({ path: "unused" }, missing, performance.now() + 1_000), /ENOENT/u);
  assert.throws(() => behavior({ task: "unused", runtimeDirectory: missing }, performance.now() - 1), /aggregate deadline exhausted/u);
});
