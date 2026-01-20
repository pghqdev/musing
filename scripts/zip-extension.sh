#!/bin/bash

# Zip extension for Chrome Web Store submission
# Usage: ./scripts/zip-extension.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_DIR/extension"
OUTPUT_DIR="$PROJECT_DIR/dist"

# Get version from manifest.json
VERSION=$(grep '"version"' "$EXTENSION_DIR/manifest.json" | sed 's/.*"version": "\([^"]*\)".*/\1/')

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Output filename
OUTPUT_FILE="$OUTPUT_DIR/musing-v${VERSION}.zip"

# Remove old zip if exists
rm -f "$OUTPUT_FILE"

# Create zip, excluding unnecessary files
cd "$EXTENSION_DIR"
zip -r "$OUTPUT_FILE" . \
  -x "*.DS_Store" \
  -x "*/.DS_Store" \
  -x "*.map" \
  -x "*.log" \
  -x ".git/*" \
  -x "node_modules/*" \
  -x "*.md"

echo ""
echo "Extension packaged successfully!"
echo "Output: $OUTPUT_FILE"
echo "Version: $VERSION"
echo ""

# Show zip contents and size
echo "Contents:"
unzip -l "$OUTPUT_FILE"
echo ""
echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
