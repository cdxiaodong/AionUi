#!/bin/bash
set -euo pipefail

# Only run in Claude Code remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Installing dependencies for remote session..."

# CI=true skips rebuilding Electron native modules (not needed in web environment)
CI=true npm install

echo "Dependencies installed successfully."
