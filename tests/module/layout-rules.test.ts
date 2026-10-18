import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const layoutScript = join(repository, 'scripts/feature-layout.mjs');
const oxlintBin = join(repository, 'node_modules/.bin/oxlint');

function tempTree(): string {
  return mkdtempSync(join(tmpdir(), 'feature-layout-'));
}
function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function copyConfig(root: string): void {
  copyFileSync(join(repository, '.oxlintrc.json'), join(root, '.oxlintrc.json'));
}
function copyShipped(root: string): void {
  cpSync(join(repository, 'src'), join(root, 'src'), { recursive: true });
}
function runLayout(root: string) {
  return spawnSync(process.execPath, [layoutScript, join(root, 'src')], { cwd: repository, encoding: 'utf8' });
}
function runOxlint(root: string) {
  return spawnSync(oxlintBin, ['-c', join(root, '.oxlintrc.json'), '.'], { cwd: root, encoding: 'utf8' });
}
function assertLayoutFailure(root: string, code: string): void {
  const result = runLayout(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, new RegExp(code));
}
function nestedFeature(root: string, importer: string): void {
  write(root, 'src/features/parent/features/child/composition/child.contracts.ts', 'export const Child = {};\n');
  write(root, 'src/features/parent/features/child/composition/child.declaration.ts',
    "import { declareModule } from '@get-modular/assembly';\nimport { Child } from './child.contracts.ts';\nexport const childDeclaration = declareModule({ moduleId: 'x/child', implementationId: 'x/child/default', owner: { authority: 'x', path: ['parent', 'child'] }, provides: [Child], slots: [] });\n");
  write(root, 'src/features/parent/features/child/composition/child.module.ts',
    "import { childDeclaration } from './child.declaration.ts';\nexport const childModule = { declaration: childDeclaration };\n");
  write(root, 'src/features/parent/features/child/composition/child.group.ts',
    "import { childModule } from './child.module.ts';\nexport const childGroup = { name: 'child', members: [childModule] };\n");
  const specifier = importer.endsWith('other.group.ts') ? './child.group.ts' : '../features/parent/features/child/composition/child.group.ts';
  write(root, importer, `import { childGroup } from '${specifier}';\nexport const imported = childGroup;\n`);
}

test('layout: removing one group line fails a copy of the shipped tree', () => {
  const root = tempTree();
  try {
    copyShipped(root);
    const group = join(root, 'src/features/counter/composition/counter.group.ts');
    writeFileSync(group, readFileSync(group, 'utf8').replace('  counterModule,\n', ''));
    assertLayoutFailure(root, 'group-member');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a module missing from its group fails', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/composition/demo.contracts.ts', 'export const Demo = {};\n');
    write(root, 'src/features/demo/composition/demo.declaration.ts', "import { declareModule } from '@get-modular/assembly';\nimport { Demo } from './demo.contracts.ts';\nexport const demoDeclaration = declareModule({ moduleId: 'x/demo', implementationId: 'x/demo/default', owner: { authority: 'x', path: ['demo'] }, provides: [Demo], slots: [] });\n");
    write(root, 'src/features/demo/composition/demo.module.ts', "import { demoDeclaration } from './demo.declaration.ts';\nexport const demoModule = { declaration: demoDeclaration };\n");
    assertLayoutFailure(root, 'orphan-module');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a declaration no module imports fails', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/composition/demo.declaration.ts', "import { declareModule } from '@get-modular/assembly';\nexport const demoDeclaration = declareModule({ moduleId: 'x/demo', implementationId: 'x/demo/default', owner: { authority: 'x', path: ['demo'] }, provides: [], slots: [] });\n");
    assertLayoutFailure(root, 'orphan-declaration');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a sub-feature group outside its parent fails', () => {
  const root = tempTree();
  try {
    nestedFeature(root, 'src/features/parent/features/child/composition/other.group.ts');
    assertLayoutFailure(root, 'child-group-outside-parent');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a root importing a sub-feature group fails', () => {
  const root = tempTree();
  try {
    nestedFeature(root, 'src/composition/root.root.ts');
    assertLayoutFailure(root, 'root-imports-sub-feature-group');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a subdirectory in composition fails', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/composition/nested/extra.ts', 'export const extra = 1;\n');
    assertLayoutFailure(root, 'nested-composition');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a contracts file in adapters fails through a declaration import', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/adapters/outbound/evil.contracts.ts', 'export const Evil = {};\n');
    write(root, 'src/features/demo/composition/demo.declaration.ts', "import { declareModule } from '@get-modular/assembly';\nimport { Evil } from '../adapters/outbound/evil.contracts.ts';\nexport const demoDeclaration = declareModule({ moduleId: 'x/demo', implementationId: 'x/demo/default', owner: { authority: 'x', path: ['demo'] }, provides: [Evil], slots: [] });\n");
    assertLayoutFailure(root, 'descriptor-path');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a use-case file exporting two functions fails', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/application/use-cases/two.ts', 'export function one(): number { return 1; }\nexport function two(): number { return 2; }\n');
    assertLayoutFailure(root, 'use-case-export');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a source file directly in application fails', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/application/bad.ts', 'export const bad = 1;\n');
    assertLayoutFailure(root, 'application-file');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: a feature README without a card fails', () => {
  const root = tempTree();
  try {
    write(root, 'src/features/demo/README.md', '# Demo\n');
    assertLayoutFailure(root, 'feature-card');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('layout: the shipped tree passes', () => {
  const root = tempTree();
  try {
    copyShipped(root);
    const result = runLayout(root);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('lint: an oversized module fails', () => {
  const root = tempTree();
  try {
    copyConfig(root);
    const body = Array.from({ length: 81 }, (_, index) => `const value${index} = ${index};`).join('\n');
    write(root, 'src/features/demo/composition/demo.module.ts', `${body}\n`);
    assert.notEqual(runOxlint(root).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('lint: a declaration importing a module file fails', () => {
  const root = tempTree();
  try {
    copyConfig(root);
    write(root, 'src/features/demo/composition/demo.module.ts', "import { demoDeclaration } from './demo.declaration.ts';\nexport const demoModule = { declaration: demoDeclaration };\n");
    write(root, 'src/features/demo/composition/demo.declaration.ts', "import { declareModule } from '@get-modular/assembly';\nimport { demoModule } from './demo.module.ts';\nexport const demoDeclaration = declareModule({ moduleId: 'x/demo', implementationId: 'x/demo/default', owner: { authority: 'x', path: ['demo'] }, provides: [], slots: [] });\n");
    assert.notEqual(runOxlint(root).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
