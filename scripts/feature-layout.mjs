#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { checkModuleLayout } from '@get-modular/conformance';

const root = resolve(process.argv[2] ?? 'src');
const allFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else allFiles.push(path);
  }
}
walk(root);
const files = allFiles.filter(path => /\.[cm]?tsx?$/u.test(path));
const recordFor = path => `src/${relative(root, path).replaceAll('\\', '/')}`;
const records = files.map(recordFor).sort();
const physical = new Map(files.map(path => [recordFor(path), path]));

function unresolved(specifier) {
  return `unresolved/${specifier.split('/').filter(part => part !== '.' && part !== '..').join('/')}`;
}
function targetFor(from, specifier) {
  if (specifier.startsWith('node:')) return undefined;
  if (!specifier.startsWith('.')) return specifier;
  const base = resolve(dirname(physical.get(from)), specifier);
  const candidates = [base, base.replace(/\.js$/u, '.ts'), base.replace(/\.mjs$/u, '.mts'), base.replace(/\.cjs$/u, '.cts')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && candidate.startsWith(`${root}/`)) return recordFor(candidate);
  }
  return unresolved(specifier);
}
function importEdges(from, source) {
  const edges = [];
  const statement = /\b(?:import|export)\s+(type\s+)?(?:([^;]*?)\s+from\s+)?['"]([^'"]+)['"]/gu;
  for (const match of source.matchAll(statement)) {
    const target = targetFor(from, match[3]);
    if (target === undefined) continue;
    const clause = match[2] ?? '';
    const names = clause.match(/\{([^}]*)\}/u)?.[1]?.split(',').map(name => name.trim()).filter(Boolean) ?? [];
    const allNamedType = names.length > 0 && names.every(name => name.startsWith('type '));
    edges.push({ from, to: target, mode: match[1] || allNamedType ? 'type' : 'value' });
  }
  return edges;
}
function exportsFor(source) {
  const exports = [];
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gu))
    exports.push({ name: match[1], kind: 'function' });
  for (const match of source.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gu))
    exports.push({ name: match[1], kind: 'value' });
  return exports;
}
const imports = [];
const useCaseExports = {};
for (const path of files) {
  const record = recordFor(path);
  const source = readFileSync(path, 'utf8');
  imports.push(...importEdges(record, source));
  if (record.includes('/application/use-cases/')) useCaseExports[record] = exportsFor(source);
}
const groupViolations = [];
for (const path of files) {
  const record = recordFor(path);
  if (!/\.group\.[cm]?tsx?$/u.test(record)) continue;
  const source = readFileSync(path, 'utf8');
  const members = source.match(/group\s*\(\s*['"][^'"]+['"]\s*,\s*\[([\s\S]*?)\]/u)?.[1]?.split(',')
    .map(member => member.trim()).filter(Boolean) ?? [];
  const importedModules = imports.filter(edge => edge.from === record && /\.module\.[cm]?tsx?$/u.test(edge.to));
  for (const edge of importedModules) {
    const name = edge.to.slice(edge.to.lastIndexOf('/') + 1).replace(/\.module\.[cm]?tsx?$/u, 'Module');
    if (!members.includes(name)) groupViolations.push({ code: 'group-member', path: record, relatedPath: edge.to, message: `group member ${name} is imported but missing from its member list` });
  }
}
const cardViolations = [];
for (const path of allFiles) {
  const record = recordFor(path);
  if (record.endsWith('/README.md') && record.includes('/features/') && !readFileSync(path, 'utf8').includes('## Feature card'))
    cardViolations.push({ code: 'feature-card', path: record, message: 'a feature README.md must contain "## Feature card"' });
}
try {
  const report = checkModuleLayout({ files: records, imports, useCaseExports });
  const violations = [...report.violations, ...groupViolations, ...cardViolations];
  if (violations.length > 0) {
    for (const violation of violations) console.error(`${violation.code} ${violation.path}: ${violation.message}`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ featureCount: report.featureCount, moduleCount: report.moduleCount, modulesPerFeature: report.modulesPerFeature }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
