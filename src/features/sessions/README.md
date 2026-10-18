# Sessions

## Feature card

- Purpose: owns session values, their read cache and the test session lifecycle.
- Parent: none
- Publishes: `test/sessions/session` r1 - the Host session root; `test/sessions/journal` r1 and `test/sessions/session-id` r1 - per-run Host inputs
- Consumes: `test/sessions/store` r1 from storage; `test/sessions/cache` r1 from storage
- Modules: `test/sessions/session/default` - stores and reads one session value
- Sub-features: storage - session values and their read cache
- Expected growth: more session lifecycle use cases and additional value adapters.
- Likely split seams: storage remains a tightly bound sub-feature; lifecycle policy stays Host-level.
- Split signals now: 1/12 modules, 1/20 use cases, depth 1/3, aggregates: session value
