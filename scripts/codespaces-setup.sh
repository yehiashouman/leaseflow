#!/usr/bin/env bash
# GitHub Codespaces bootstrap for LeaseFlow. Runs automatically as the
# devcontainer postCreateCommand. Safe to re-run after stopping/restarting
# the Codespace: it never overwrites an existing .env file and simply
# (re)starts the stack via `make demo`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -n "${CODESPACE_NAME:-}" ]; then
  echo "Detected GitHub Codespace: ${CODESPACE_NAME}"
else
  echo "CODESPACE_NAME not set; running in a non-Codespaces environment."
fi

chmod +x scripts/demo.sh

bash scripts/demo.sh up
