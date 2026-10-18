// The archived writer rules, with the CLI replaced by a reusable test function.
export function staticRules(task, source) {
// Rough comment stripping is enough for these patterns; string literals in solutions are short.
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const rules = [
  { test: /@ts-(ignore|expect-error|nocheck)/.test(source), message: "uses a @ts- directive" },
  { test: /(eslint|oxlint)-disable/.test(source), message: "disables a lint rule" },
  { test: /(:|<|\bas)\s*any\b|\bany\[\]/.test(code), message: "uses any" },
  { test: /\bas\s+(?!const\b)[A-Za-z_{[(]/.test(code), message: "uses a type assertion (as)" },
];
const uses = (member) => new RegExp(`\\.${member}\\s*\\(`).test(code);
const required = {
  "a-logger": ["watch"],
  "b-catalog": ["load"],
  "c-pricing-context": ["watch", "readonly"],
  "d-greeter": ["read"],
  "e-async-factory": ["read", "watch"],
  "e-sessions": ["watch", "child"],
  "f-watch-and-load": ["watch", "load"],
  "g-hierarchy": ["watch", "readonly"],
  "h-requests": ["read", "watch"],
  "i-errors": ["watch", "readonly"],
}[task] ?? [];
const forbidden = { "d-greeter": ["watch", "load"] }[task] ?? [];
for (const member of required) rules.push({ test: !uses(member), message: `does not call .${member}(...)` });
for (const member of forbidden) rules.push({ test: uses(member), message: `calls .${member}(...), which this task must not use` });
const ownsStore = ["c-pricing-context", "g-hierarchy", "i-errors"];
if (ownsStore.includes(task)) rules.push({ test: !/\bcreateStore\s*[<(]/.test(code), message: "does not call createStore" });
// The first value goes through load as well; a second fetch outside the loader races with it.
const fetchers = { "b-catalog": "fetchModels", "f-watch-and-load": "fetchHolidays" };
const fetcher = fetchers[task];
if (fetcher !== undefined) {
  rules.push({ test: (code.match(new RegExp(`\\b${fetcher}\\s*\\(`, "g")) ?? []).length > 1, message: `calls ${fetcher} outside the loader` });
}
// A session's subscription lives in a scope that the session closes.
if (task === "e-sessions") rules.push({ test: !/\.control\.close\s*\(/.test(code), message: "does not close the session scope" });
return rules.filter((rule) => rule.test).map((rule) => rule.message);
}
