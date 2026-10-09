# TEST project instructions

This repository exists only for the bounded Get Modular Host test stand in
`docs/implementation-plan.md`. Read the full plan before implementation.

Train 0.3.0 adoption follows `docs/train-030-plan.md`; read it before that work.

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
