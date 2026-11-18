# Changelog

## 0.2.0

### Added

- **Per-action state**: `store.$async.<action>` exposes `loading`, `error`, `pendingCount`,
  `runCount`, `lastRunAt` and `lastSuccessAt` for every action.
- **`$pendingCount`** — total number of in-flight calls (re-entrant calls counted per call).
- **`$isActionPending(name)`** — quick check for a single action.
- **`$errorInfo`** — last error with `action`, `storeId`, `raw` value and timestamp.
- **`$clearError()`**, **`$resetAction(name)`** and **`$waitForIdle()`** helpers.
- **`$track(name, promiseOrFactory)`** to track async work that isn't a Pinia action.
- **Options**: `only`, `exclude`, `minLoadingTime` (anti-flicker), `normalizeError`, `onError`.
- **Per-store config**: `asyncState: { only, exclude }`.
- Support for **Pinia 3** (`peerDependencies: ^2.1.7 || ^3.0.0`).
- 20 new tests (25 total) covering per-action state, hooks, filters and utilities.

### Fixed

- `$pendingActions` no longer exposes the internal array; it is now a copy with one entry per action,
  so external mutation can't leave `$loading` stuck at `true`.
- `$resetAsyncState()` no longer leaves `$loading` inconsistent: calls started before the reset are
  ignored instead of decrementing counters that were already cleared.
- Duplicate in-flight calls of the same action show up once in `$pendingActions`.
- Errors are stored with `markRaw` so Vue no longer deep-proxies `Error` instances.

### Changed

- Package metadata: `repository`, `homepage`, `bugs`, `engines`, `sideEffects: false`,
  `exports["./package.json"]` and a `prepublishOnly` build/test guard.
- `exports.require.types` now points at `dist/index.d.cts`, so CJS consumers get correct types.
- `$loading`, `$error` and friends are returned from the plugin instead of being assigned with
  unsafe casts.

## 0.1.0

- Initial release: `$loading`, `$error`, `$pendingActions`, `$resetAsyncState()`.
