#!/usr/bin/env bash
# Extracts constant game data from reference/reSL into packages/sim/src/data:
#   1. dump_tables.cpp (linked only with src/game/resources/*.cpp) -> JSON + hash
#   2. gen.mjs -> tables.ts (logic) and glyphs.ts (bitmaps)
#   3. dot7.mjs -> PNG images of the original .7 pictures (render assets)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SRC="$ROOT/reference/reSL/src"
OUT="$ROOT/.build/extract"
mkdir -p "$OUT"
"${CXX:-clang++}" -std=c++20 -O1 -I"$SRC" "$ROOT/tools/extract/dump_tables.cpp" "$SRC"/game/resources/*.cpp -o "$OUT/dump_tables"
"$OUT/dump_tables" > "$OUT/tables.json" 2> "$OUT/tables.hash"
cat "$OUT/tables.hash"
node "$ROOT/tools/extract/gen.mjs" "$OUT/tables.json" "$OUT/tables.hash"
node "$ROOT/tools/extract/dot7.mjs"
