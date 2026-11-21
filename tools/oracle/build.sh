#!/usr/bin/env bash
# Builds the reSL "oracle": a copy of reference/reSL with tools/oracle/patches
# applied, compiled headless (no SDL) with clang++ -std=c++20.
# Output: .build/oracle/resl-oracle and .build/oracle/files (game resources).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BUILD="$ROOT/.build/oracle"
REF="$ROOT/reference/reSL"

if [ ! -f "$REF/src/main.cpp" ]; then
  echo "reference/reSL is missing: run 'git submodule update --init'" >&2
  exit 1
fi

mkdir -p "$BUILD"
# fresh copy of the reference sources
if [ -d "$BUILD/tree" ]; then
  find "$BUILD/tree" -mindepth 1 -delete
fi
mkdir -p "$BUILD/tree"
cp -R "$REF/src" "$BUILD/tree/src"

for p in "$ROOT"/tools/oracle/patches/P*.patch; do
  echo "applying $(basename "$p")"
  (cd "$BUILD/tree" && GIT_CEILING_DIRECTORIES="$BUILD" git apply --whitespace=nowarn "$p")
done

"$ROOT/tools/oracle/compile.sh" "$BUILD/tree/src" "$BUILD" ${ORACLE_CXXFLAGS:-}

# game resources (the oracle runs with cwd = a copy of this directory)
mkdir -p "$BUILD/files"
for f in play.7 GAMEOVER.7 captions.7 poster.7 RULES.TXT; do
  cp "$REF/resources/$f" "$BUILD/files/"
done
cp "$REF"/resources/demo_? "$BUILD/files/"
echo "oracle resources in $BUILD/files"
