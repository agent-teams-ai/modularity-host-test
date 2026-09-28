# Published 0.1.0 admission checkpoint

This is a synthetic TEST stand. It uses the published 0.1.0 Core and Assembly
archives pinned in `third_party/pins.json`. It says nothing about Agent Runtime,
Extension Foundation, OpenClaw, provider effects, or arbitrary hostile JavaScript.
The one-shot owner retains the provider-created disposable object after
`prepared.run` and disposes it once. Concurrent retirement and observers belong to checkpoint 3.

The trusted policy snapshots JSON-shaped request data before compilation. Core
compiles the full selected set. The Host checks exact selected loader cardinality
before it binds explicit typed Assembly factories. Candidate imports occur only
inside those lazy factories, with Host authority checked before and after the import. Each subprocess uses a TEST-local temporary root and
allowlisted environment. Candidate entrypoint and transitive evaluation, loader
invocation, factory entry and disposal have separate markers. The A and B outputs
and shared identity are literal test oracles, not derived from a profile.
The two facets also carry the same opaque symbol. The Host independently compares
the writer and reader action symbols from Assembly's public `created` outcome
against its retained resource identity. The candidate root's own comparison
requires real symbols. Missing identities on both actions and a distinct reader
identity are negative controls; copied string IDs still produce the expected
output, but fail the shared-resource oracle.

Published 0.1.0 Core interprets profile roots as module IDs while Assembly's
root-handle check compares those roots with implementation IDs. For this fixture,
the root's module ID and implementation ID are both `test/root/main`. This is a
bounded fixture choice; it is not a general adapter or a change to either package.

Run from this TEST checkout with its pinned Node 24.21.0 and cached pnpm 11.20.0:

```sh
COREPACK_HOME="$PWD/.corepack" COREPACK_ENABLE_NETWORK=0 corepack pnpm install --frozen-lockfile
COREPACK_HOME="$PWD/.corepack" COREPACK_ENABLE_NETWORK=0 corepack pnpm typecheck
COREPACK_HOME="$PWD/.corepack" COREPACK_ENABLE_NETWORK=0 corepack pnpm test
```

The subprocess tests cover successful A/B construction and disposal, invalid
last candidate, wrong target/owner/token/injection, duplicate/unknown selection,
missing/unknown/duplicate loader, wrong/missing Core binding, caller mutation and an A/B
loader swap control. A rejecting reader fixture proves a post-acquisition
construction failure still disposes the retained resource once. Preparation tests cover modified digest/order, missing/extra/
wrong handles and incomplete roots, and assert zero factory and loader
calls in each refusal. Policy-only tests retain the original parser
and snapshot checks. A green result establishes only these finite cases.

The policy audit additionally uses fresh-child trusted table variants for namespace
lookalikes, unknown subjects, ungranted provisions and ambiguous associations.
If a variant is wrongly admitted, its child enters the executable Core/Assembly
control path; the zero-marker assertion then fails.
For the disputed injection, a TEST-owned trusted variant authenticates provider A
as another subject with namespace and exact provision grants. The writer has a
receive grant for that subject; the reader lacks only its receive grant. The
request claims that authenticated owner. In the same fresh child, a hand-written
profile is compared with the Host's projection, and the public Core compiler
accepts its exact reader/read binding. The child then calls the actual Host
admission path with the disputed authorities; it returns `injection-grant` with
zero loader, candidate evaluation, factory, effect and acquisition markers.
The typecheck includes expected compiler errors for wrong token, capability,
slot and a constructor that does not return a Promise. Its valid async Action
product includes the required resource identity in every negative. A reverse-many control
confirms that order changes the result.

On the admission proof fix checkout at `a33ad98e419c40df115bfdbee34c47d2308fbdb4`,
direct `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, `node --test`
(38 passed), and `git diff --check` passed under Node 24.21.0. No install or
registry operation was run for this fix.

The worker sandbox could not write its pnpm store. The orchestrator reran
`pnpm install --frozen-lockfile --offline` on the same isolated TEST checkout
outside that sandbox on 2026-09-28; it passed, followed by the pinned typecheck
and all 37 tests. The later Host checkpoint remains pending.

## Inputs inspected in this checkout

The base commit is `1c3b934659775096ee5623838d588a1a71bfcc11`.
The unchanged lock SHA-256 is
`210ac0508e542e9db38b64e247748a61d67a578411552d7aa6abf72b0a4ed1fa`.
Archive SHA-256 values match `third_party/pins.json`: Core
`50803ea69e2fb4078013a897f858908b4d73d26296336ab155a6118809dfb8ba`
and Assembly
`e89207171e44afd5e813aa5e7a0db8abc999b42338559d38b44b4db71da228ab`.
The full CMS copy hashes to
`d5bb71e5a700014f9f0a09b17d1f33d24b30b66c49b273c9fb65584672c51e4f`.
Node is `v24.21.0`; the pinned compiler reports `7.0.2`. Public package
resolution from this checkout and Core resolution from installed Assembly both
reach the same local `@get-modular+core@file+third_party+archives+published-0.1`
virtual-store directory. The frozen-install result above is specific to this
TEST checkout and does not establish either the later Host checkpoint or 0.2.0.
