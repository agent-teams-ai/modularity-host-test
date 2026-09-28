# Retained TEST evidence

`2f098f0-run.tar.gz` contains the accepted `pnpm evidence` result and 212 hashed
command logs for source commit `2f098f07531113aff397c41aab4fca09a6ed9899`.
The runner passed on Node 24.21.0 with a frozen offline install and typecheck
for both exact package pairs. Its manifest SHA-256 is
`d59f658eb6abf1efd7a9ce320c8433bc7450bb12ee9bb4688c448451f37366fe`.
The archive SHA-256 is
`68108b991fb50f358e1a5537438d0bc7e8d65d3719a244e72fe7756f770fc229`.

`815f475-mutants.tar.gz` contains four deliberate mutant diffs, focused failure
logs and `summary.json` for Host commit
`815f47518003ac889cf3778b93c095ef879cd9ed`. Its SHA-256 is
`af6f4fb6fcf371b3c94f73209bf2e10f7a979511111b18500a451444d563b057`.
Each mutant failed for the signal recorded in the summary, and its disposable
TEST checkout was restored clean.

`1fb563c-l2a-run.tar.gz` retains the accepted private lifecycle-kernel L2a
replay for clean TEST Host commit `1fb563cd5ce436c2d945d836779508e703223f4b`.
Both the published 0.1 and candidate 0.2 package pairs passed frozen offline
installation, typecheck, 62/62 tests, 23 admission cases, and 24 focused
lifecycle cases on Node 24.18.0. The kernel tarball came from clean Get Modular
commit `e0e2290cfcbf8d8300beaa57aee9c8337429d67d` and remains private.
The manifest SHA-256 is
`1b6492baa57d33fd002c95b615c92d4558aa4857d1da2bc1921d17f128269c10`.
The archive SHA-256 is
`9b1857d30a1d76e13fbe522dfb1dfd46ed7c5f6adb3a9243e5111b2f36d9c85b`.
It covers only one-shot Host lifecycle; stream, replacement, recovery, and
production qualification remain separate checkpoints.

Inspect the accepted manifest without extracting the archive:

```sh
tar -xOzf evidence/accepted/2f098f0-run.tar.gz \
  evidence/runs/2026-09-28T14-24-12-184Z-2068615/evidence.json | shasum -a 256
```

These archives preserve evidence for the exact TEST subjects. They do not
qualify a production consumer, arbitrary JavaScript security or Node 26.
