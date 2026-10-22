#!/bin/sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo=$(CDPATH= cd -- "$here/.." && pwd)
out="$here/fixtures"
bin="$here/tools/fixture-gen/fixture-gen"

swiftc -O \
    "$repo/native-app/Sources/RELightCore/Project.swift" \
    "$here/tools/fixture-gen/main.swift" \
    -o "$bin"

"$bin" "$repo/native-app" "$out"
rm -f "$bin"

echo "fixtures: $out"
