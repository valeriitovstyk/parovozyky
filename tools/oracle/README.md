# Oracle

Native build of reSL (C++20) used as the reference implementation for the TS port.

```
pnpm oracle:build     # .build/oracle/resl-oracle (+ resources in .build/oracle/files)
pnpm oracle:golden    # tests/golden/{scenarios,traces}; --only <regex>, --check
```

- No SDL: `P0` replaces `src/system/driver/sdl` with a headless driver (VGA memory is kept, so
  `RESL_SCREENSHOT_EVERY` can dump PPM screenshots), `File` uses stdio.
- `P1` virtual clock (µs) instead of `steady_clock`/`sleep_for`: blocking waits jump the clock.
- `P2` Turbo C `rand()/srand()` (F1), seed from `RESL_SEED`.
- `P3` 16-bit unsigned time difference in `taskMoveAndRedrawTrains` (F2).
- `P4` input script (`RESL_SCRIPT`), delivered in `VGAEmulation::flush()` like SDL events.
- `P5` trace hooks: task ids, state hash after every task resumption, status messages, sounds.
- `P6` deterministic file search (sorted names, fixed date).
- `P7` undefined-behaviour guards (U1) and the zero-extended entrance path (U2).
- `P8` stable sort.
- `P9` the year passing 2000 stops with UB instead of hanging (U3).

Patches are applied with `git apply` to a fresh copy of `reference/reSL/src` in `.build/oracle/tree`.
Pinned scenarios (`tools/oracle/pinned/*.json`, e.g. sessions found by `pnpm fuzz`) become golden scenarios too.

Trace format and the canonical state: `docs/trace-format.md`. Deviations from reSL: `docs/fidelity.md`.
