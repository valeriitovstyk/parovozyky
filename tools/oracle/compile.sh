#!/usr/bin/env bash
# Compiles a (patched) reSL source tree into the headless oracle binary.
# usage: compile.sh <src-dir> <out-dir> [extra clang flags...]
set -euo pipefail
SRC=$(cd "$1" && pwd)
OUT=$2
shift 2
mkdir -p "$OUT/obj"
OUT=$(cd "$OUT" && pwd)
CXX=${CXX:-clang++}
FLAGS=(-std=c++20 -O2 -g -fno-exceptions -fno-rtti -Wall -Wextra -Wno-unused-parameter -I"$SRC" "$@")
JOBS=$(sysctl -n hw.ncpu 2>/dev/null || nproc)
cd "$SRC"
find . -name '*.cpp' -not -path './game/resources/scripts/*' -not -path './game/resources/utility/*' | sort > "$OUT/sources.txt"
: > "$OUT/errors.txt"
export CXX OUT
printf '%s\0' "${FLAGS[@]}" > "$OUT/flags.bin"
compile_one() {
  local f=$1
  local o="$OUT/obj/$(echo "${f#./}" | tr '/' '_' | sed 's/\.cpp$/.o/')"
  local flags=()
  while IFS= read -r -d '' x; do flags+=("$x"); done < "$OUT/flags.bin"
  if ! "$CXX" "${flags[@]}" -c "$f" -o "$o" 2> "$o.log"; then
    echo "FAIL $f"; cat "$o.log" >> "$OUT/errors.txt"; return 1
  fi
}
export -f compile_one
if ! tr '\n' '\0' < "$OUT/sources.txt" | xargs -0 -n1 -P"$JOBS" bash -c 'compile_one "$0"'; then
  head -80 "$OUT/errors.txt" >&2
  exit 1
fi
"$CXX" "${FLAGS[@]}" "$OUT"/obj/*.o -o "$OUT/resl-oracle"
echo "built $OUT/resl-oracle"
