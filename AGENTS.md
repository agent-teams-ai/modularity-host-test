# TEST project instructions

This repository exists only for the bounded Get Modular Host test stand in
`docs/implementation-plan.md`. Read the full plan before implementation.

Train 0.5.0 adoption follows `docs/train-050-01.md`; read it before that work.

- Never run agent commands, launch/provisioning, terminal runtime, task
  assignment or smoke-flow tests on real user projects. All executable test
  fixtures must stay inside this explicit TEST repository or a fresh disposable
  TEST checkout.
- Keep Get Modular Core responsible for graph compilation, Assembly responsible
  for preparation/construction, and this TestHost responsible for policy,
  executable loading, effect authority and cleanup authority (modules register cleanup
  through `@get-modular/resources`; the Host decides when and how long).
- Use only public package exports. Install exactly the Get Modular archives pinned in
  `third_party/pins.json`; retired package subjects stay in `evidence/accepted/` and
  Git history and are not reinstalled beside the current set.
- A synthetic green result cannot be described as Agent Runtime, Extension
  Foundation or OpenClaw product conformance.
- Tests must observe meaningful behavior and name the regression they catch.
  Keep import, effect, owner and cleanup observations independent of the code
  under test. No broad test duplication or production hooks solely for tests.
- Do not read credentials or connect to provider accounts. Do not run executable
  code from real projects as candidate fixtures.
- Other workers may edit this repository. Own only assigned files, preserve
  unrelated edits, and return an exact patch/bundle plus checks. Commits require
  both author and committer `iliya <iliyazelenkog@gmail.com>` and conventional
  commit messages. Check `git var GIT_AUTHOR_IDENT` and
  `git var GIT_COMMITTER_IDENT` before committing; do not use `--no-verify`.

## Get Modular modules

When you add or change a feature, a Get Modular module or a composition root, read the module authoring
guide (https://github.com/agent-teams-ai/get-modular/blob/99816e452630715558306db2370baa2af49575e6/docs/guides/module-authoring.md)
and the Consumer Module Standard it links. Features are independent bricks: they connect only through
contracts, each one is tested alone with its contract owners' fakes, and the root assembles feature groups.
Always:

1. Lay out each feature as `features/<feature>/{contracts, domain, application/{use-cases, ports},
   adapters/{inbound, outbound}, composition}` and create only the directories that hold real files.
   Where the mapping below admits it, a feature may hold sub-features in its own
   `features/<sub-feature>/`, each with the same layout, to any depth: nest a tightly bound part so it
   moves with its parent as one folder, and keep independent parts as siblings. A sub-feature is
   private: code outside its parent reaches it only through contracts the parent republishes.
2. A use case is `application/use-cases/<verb-noun>.ts` exporting one function `(deps, input) => result`,
   where `deps` is a narrow record of port types from `application/ports/`. `application/` and `domain/`
   never import `contracts/`, not even their own; the module file maps between them. Pure rules go in
   `domain/`; DB, SDK and HTTP code goes in `adapters/`. Only `composition/` and tests import
   `@get-modular/*`.
3. A module is flat files in its feature's `composition/`: `<module>.declaration.ts` imports only
   `declareModule`, the cardinality helpers and contract descriptors, and holds only the declaration;
   `<module>.module.ts` holds only the `implement<FeatureMap>()(...)` wiring that builds the port from use
   cases and adapters. Stay within the lint size limits.
4. Implement ports as factory functions that return objects of arrow functions. Use a class only for a
   stateful adapter or a test fake: arrow-function fields, never prototype methods on a port, and
   `static async create` for async setup. `smoke` and `isolate` fail on prototype methods.
5. Port types belong to the contract owner (`contracts/`, or `application/ports/` for ports only its own
   use cases need) and use function-typed properties (`readonly run: (x: X) => Y`), never method
   signatures or a type inferred from an implementation such as `ReturnType<...>`. Descriptors live in
   `composition/<feature>.contracts.ts`. Change a contract in place: raise its `revision` and update every
   provider, consumer, fake and suite in the same change.
6. Add a module with one line in `composition/<feature>.group.ts`, one member per line, sorted; a
   parent's group also lists its sub-features' groups. A root's `modules` lists top-level feature groups,
   Host-level groups and the root's own Host-level entries, nothing else; a root imports a feature's module only to
   name it in `roots`; never build a list conditionally, a variant
   is a separate root with its own `profileId`. Use another feature only through its contracts (a slot),
   and only a feature you can see: your direct sub-features, your ancestors, and the siblings of you and of your
   ancestors. Never import its modules, groups, use cases or adapters, never reach into its sub-features,
   and never create a dependency cycle between features (using an ancestor's contracts does not count).
7. Every capability a module or input provides is one line in its feature's oracle part
   (`<feature>.wiring.ts` in the feature's test directory, whose path mirrors the feature's path).
   `optional`, `many` and several-provider slots
   get an explicit row in the root's `bindings` and in the oracle. Write the oracle from the decision;
   never copy `describeWiring` or test output into it. Each module gets an `isolate` test, and a contract
   with two implementations gets its owner's contract suite.
8. A new feature starts with the feature card in its `README.md`. Before you add a module, read the card
   and the growth report: at about 12 modules, 20 use cases, two aggregates with independent invariants
   or lifecycles, or parts that change for different reasons, first split the feature with one of the
   guide's two recipes: extract a sub-feature for a tightly bound part, or split into sibling features
   for independent parts. Past three levels of nesting the report warns; prefer siblings there.
9. Never use decorators, runtime discovery or dynamic imports of modules in production code, `any` or
   casts in wiring, registries or service bags as inputs, or closures over per-instance data or a scope.
   Upgrade Get Modular with its codemod on a clean tree
   (`pnpm --dir <get-modular checkout> codemod <from>-<to> . --write`), then typecheck and run the smoke
   and oracle tests.

In this repository features live in `src/features/<feature>/` and sub-features in
`src/features/<feature>/features/<sub-feature>/` at any depth; the Host and the roots live in
`src/composition/`. Feature tests, fakes (`testing.ts`) and oracle parts go in `tests/features/` at the path
that mirrors the feature (`tests/features/<feature>/features/<sub-feature>/` for a sub-feature), root tests
in `tests/module/`. This repository claims no Feature Module Standard conformance; `pnpm lint` and
`pnpm layout` gate these rules, sub-feature visibility and cycles included, and `pnpm layout` prints the
growth report.
FMS nested rules: review-only until the follow-up PR (QN8).
