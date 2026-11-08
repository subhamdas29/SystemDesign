# Contributing to Life of a Request

Thank you for contributing to Life of a Request! This guide outlines development practices, architectural integrity constraints, and testing protocols.

---

## Non-Negotiable Architectural Rules

1. **Pure Engine Isolation (`/src/engine`)**:
   - Zero React, DOM, or browser imports in `/src/engine`.
   - Never import real-time APIs (`Date.now()`, `performance.now()`, `requestAnimationFrame`, `setTimeout`, `setInterval`).
   - Never import non-deterministic randomness (`Math.random()`); always use the provided seeded PRNG (`createRng`).
   - Zero real network APIs (`fetch`, `WebSocket`, `XMLHttpRequest`).
   - Tested automatically by `tests/discreteEngine.test.ts`.

2. **Bit-for-Bit Determinism**:
   - The same seed + architecture graph + traffic profile MUST produce identical snapshots, counters, and event hashes regardless of host hardware speed or execution platform.

3. **Strict Conservation Laws**:
   - Every request created must be strictly accounted for across all states:
     `Created = In-Flight + Succeeded + Failed + Rejected + TimedOut + Blocked`.

---

## Development Workflow

```bash
# Start development server
npm run dev

# Run full test suite
npm test

# Run performance benchmarks
npm run bench

# Check resource SVGs
npm run check:resources

# Typecheck and production bundle build
npm run build
```

---

## Adding New Primitives or Scenarios

1. **New Component Type**:
   - Define type and schema in `src/types/components.ts` and `src/types/schemas.ts`.
   - Add slot placement and connection rules in `src/builder/rules/slotRules.ts`.
   - Implement behavior model in `src/engine/components/`.
   - Add SVG icon in `resources/` and map in `src/design/resourceRegistry.ts`.
   - Write comprehensive unit tests in `tests/`.

2. **New Failure Scenario**:
   - Add failure type to `src/scenarios/failures/types.ts` and catalog in `src/scenarios/failures/catalog.ts`.
   - Support both discrete event injection and aggregate capacity impact.
