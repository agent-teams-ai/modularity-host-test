import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function filesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

function importsOf(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  return [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
}

test('LEGO: sessions tests never import counter implementation files', () => {
  const violations: string[] = [];
  for (const file of filesBelow(join(repository, 'tests/features/sessions'))) {
    for (const specifier of importsOf(file)) {
      const target = relative(repository, resolve(dirname(file), specifier));
      const counterImplementation = target.startsWith('src/features/counter/')
        || (target.startsWith('tests/features/counter/') && target !== 'tests/features/counter/testing.ts');
      if (counterImplementation) {
        violations.push(`${relative(repository, file)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('LEGO: storage tests never import sessions internals', () => {
  const violations: string[] = [];
  for (const file of filesBelow(join(repository, 'tests/features/sessions/features/storage'))) {
    for (const specifier of importsOf(file)) {
      const target = relative(repository, resolve(dirname(file), specifier));
      const parentPublic = 'src/features/sessions/composition/sessions.contracts.ts';
      const ownSource = target.startsWith('src/features/sessions/features/storage/');
      const ownTests = target.startsWith('tests/features/sessions/features/storage/');
      if (!ownSource && !ownTests && target !== parentPublic) violations.push(`${relative(repository, file)} -> ${specifier}`);
    }
  }
  assert.deepEqual(violations, []);
});
