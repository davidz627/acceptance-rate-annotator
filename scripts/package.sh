#!/usr/bin/env bash
# Builds dist/acceptance-rate-annotator-<version>.zip for upload to the Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
mkdir -p dist
OUT="dist/acceptance-rate-annotator-$VERSION.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json src icons data/colleges.js -x '*.DS_Store'
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT"
