# Counter

## Feature card

- Purpose: counts keyed events for its consumers.
- Parent: none
- Publishes: `test/counter/counter` r1 - keyed increment and current count
- Consumes: none
- Modules: `test/counter/counter/default` - per-run in-memory key counts
- Sub-features: none
- Expected growth: replacement counters and count queries for new keys.
- Likely split seams: a persistent count store can replace the per-run counter.
- Split signals now: 1/12 modules, 1/20 use cases, depth 1/3, aggregates: key counts
