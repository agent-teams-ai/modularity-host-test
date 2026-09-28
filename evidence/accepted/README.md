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

`4b38510-l2a-review-run.tar.gz` retains the accepted replay after PR review
for clean source commit `4b385100fc3ea8fe5c5db8994af9eeeaee1fb8b8`.
Both exact pairs again passed 62 tests, 23 admission cases and 24 focused
lifecycle cases on Node 24.18.0. The Consumer Module Standard pin now names
merged Get Modular `461bff0`, whose full bytes match the prior candidate pin;
the kernel archive still comes from `e0e2290`. The manifest SHA-256 is
`c0abafa0dc185edf280b1bd1bd01ee3f47a5464a477dee1dc4973371901b42d8`.
The archive SHA-256 is
`d2d32a1a27b2f2bac84b54e1cffd0db19b144f6bef11dd5b30f36a3c1ec60519`.

`4f6d88c-l2a-doc-run.tar.gz` retains the accepted replay after the standard
and kernel source provenance wording was separated, for clean source commit
`4f6d88c4e5b5de46739080b594c606561e6d2acf`. Both exact pairs again passed
frozen offline install, typecheck, 62 tests, 23 admission cases and 24 focused
lifecycle cases. Manifest SHA-256:
`6a925bb734f253fb010fd180273caf7126c3829d71c9decff0442fb3d1d0f383`.
Archive SHA-256:
`2113ea574bb1a10827cc40c669a9cfe921a862831403daa5288da5b0dd9b0fa2`.

`055c5e9-l2b1-run.tar.gz` retains the accepted bounded stream/retirement
checkpoint for clean source commit `055c5e9818f260ebfa4071dbb89f880d95826a18`.
Both exact pairs passed frozen offline install, typecheck, 73 tests, 23
admission cases and 35 focused lifecycle cases on Node 24.18.0. The manifest
SHA-256 is `b253d44b4f434ba7e8e6567df48517aa46962d0041a55a84a4350f75f48611cf`;
the archive SHA-256 is
`91103b9b60558e23ea884b77c46b8b8b6aee5316d4dc840a6c54c6cd2cc305a0`.
Iterator/result terminal, cross-generation cohort, bounded retirement inventory,
replacement and production qualification remain separate checkpoints.

`93fb18b-l2b1-fix-run.tar.gz` retains the accepted replay after fixing
premature physical close of a busy TEST stream for clean source commit
`93fb18b0d9df244b5eb6b37787408b6cbac52d4a` (tree
`9ef6a8df1ea1c01eb8139de319c0dd75e74624d1`). Both exact pairs passed
frozen offline install, typecheck, 75 tests, 23 admission cases and 37 focused
lifecycle cases on Node 24.18.0. The manifest SHA-256 is
`456832c952351e80d5807231e72778099056fb67d800fedd7fd75300905c85fd`;
the archive SHA-256 is
`db9b491482a6370a7d46a747b28b0f3dd0574e8cc3de33fad8be69ae45797ec4`.

`d8e684b-l2b1-main-run.tar.gz` retains the accepted replay after PR #4
merged, for clean source commit `d8e684bfe9aa2b0ce89dd2676bd9bff51fcdcc4f`
(tree `6212e4c4425d6677b890d0fe4785a012702d15b2`). Both exact pairs passed
frozen offline install, typecheck, 75 tests, 23 admission cases and 37 focused
lifecycle cases on Node 24.18.0. The manifest SHA-256 is
`ad0a803127e2bb043be822a68239317158ab7986dd748095f7c35210d2a907e8`;
the archive SHA-256 is
`70e93a33368c30ff129fb1fe034665c23dcda6716913e2919de5bab9567838e0`.

`5f78cf5-l2b1-current-pin-run.tar.gz` retains the accepted replay after
advancing the reviewed Consumer Module Standard source pin to merged Get
Modular `24d6557`, whose standard bytes are unchanged. Its clean TEST source
commit is `5f78cf5e403da7348f46e84b1fd1ca5510a97ec2` (tree
`67e1bb1cf629c43a559bc1c8e53fb5b20212ef78`). Both exact pairs passed
frozen offline install, typecheck, 75 tests, 23 admission cases and 37 focused
lifecycle cases on Node 24.18.0. The manifest SHA-256 is
`c35073d9a10ff5bad2448bb948059b7fc9ab07c6f5859fc6b7bfa5be6d6fd7d5`;
the archive SHA-256 is
`13d7d79de378a9214e1b8d2c5f6330e66a8c07da59712066bdeb9e1c38b27783`.

`0dea754-l2b1-review-run.tar.gz` retains the accepted replay after review
fixes for invalid self-observer deadlines and multiple failed stream closes.
Its clean TEST source commit is `0dea754c371d39adfa5d3f1c892ff66293ef3c75`
(tree `4fd79e65d557451267a19cffe370d5965a4bf17b`). Both exact pairs passed
frozen offline install, typecheck, 76 tests, 23 admission cases and 38 focused
lifecycle cases on Node 24.18.0. The manifest SHA-256 is
`28d84d03d62847dddd3df0ccd8ed8fc386ecc8ec2d2f75b520daa5d5c1a7c92a`;
the archive SHA-256 is
`984323aea8c9bf000659ba095dfe0cf8a4e2f866555ee9a6e3db57f1d5765210`.

These L2b1 archives exclude macOS AppleDouble sidecars and extended attributes.
Their manifest bytes are unchanged. On macOS, create retained archives with
`COPYFILE_DISABLE=1 tar --no-xattrs` to keep the payload portable.

`bab6d15-h04-final-run.tar.gz` retains the accepted H04 terminal stream replay
for clean TEST source commit `bab6d15888fb82ede02ef86ae8dbacd0883b94d2`
(tree `72024ae6bf747b41a74dcb43eb5b3e05a1e4c2a9`). Both exact package pairs
passed frozen offline install, typecheck, 96 tests, 23 admission cases and 58
focused lifecycle cases on Node 24.18.0. Nested ordinary and terminal consumer
obligations remain owned until raw settlement. The primitive result type and
marker cleanup match the tested runtime/evidence path. The manifest SHA-256 is
`c2a9342d2df643060d2f243b5d52268f0a8c968d4eef48cc140ffbf4bc2f5308`;
the archive SHA-256 is
`814b5720a43a6c9ad7e2a81f656fb55633fc3cd4120b4d64dbfae9cf2fdc60e1`.
This archive has no AppleDouble entries or PAX metadata.


Inspect the accepted manifest without extracting the archive:

```sh
tar -xOzf evidence/accepted/2f098f0-run.tar.gz \
  evidence/runs/2026-09-28T14-24-12-184Z-2068615/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/1fb563c-l2a-run.tar.gz \
  evidence/runs/2026-09-28T20-47-55-114Z-73422/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/4b38510-l2a-review-run.tar.gz \
  evidence/runs/2026-09-28T21-14-17-859Z-11213/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/4f6d88c-l2a-doc-run.tar.gz \
  evidence/runs/2026-09-28T21-24-05-672Z-24282/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/055c5e9-l2b1-run.tar.gz \
  evidence/runs/2026-09-28T21-18-22-392Z-17184/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/93fb18b-l2b1-fix-run.tar.gz \
  evidence/runs/2026-09-28T21-37-06-056Z-42049/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/d8e684b-l2b1-main-run.tar.gz \
  evidence/runs/2026-09-28T21-49-06-395Z-60030/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/5f78cf5-l2b1-current-pin-run.tar.gz \
  evidence/runs/2026-09-28T21-54-12-486Z-67954/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/0dea754-l2b1-review-run.tar.gz \
  evidence/runs/2026-09-28T22-05-43-826Z-82924/evidence.json | shasum -a 256

tar -xOzf evidence/accepted/bab6d15-h04-final-run.tar.gz \
  evidence/runs/2026-09-28T22-38-26-266Z-28277/evidence.json | shasum -a 256

```

These archives preserve evidence for the exact TEST subjects. They do not
qualify a production consumer, arbitrary JavaScript security or Node 26.
