# Storage

## Feature card

- Purpose: stores session values and provides their read cache.
- Parent: sessions
- Publishes: `test/sessions/store` r1 - session value writes and reads; `test/sessions/cache` r1 - cached reads
- Consumes: `test/sessions/journal` r1 from sessions; `test/sessions/session-id` r1 from sessions
- Modules: `test/sessions/store/memory` - in-memory value storage; `test/sessions/cache/default` - read cache over the store
- Sub-features: none
- Expected growth: replacement stores that pass the Store contract suite.
- Likely split seams: a durable store can replace the memory adapter without changing sessions.
- Split signals now: 2/12 modules, 0/20 use cases, depth 2/3, aggregates: stored values
