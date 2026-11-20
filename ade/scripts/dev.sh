#!/usr/bin/env bash
set -euo pipefail
ADE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ADE_ROOT"
ADE_NODE_VERSION="$(cat .nvmrc)"
if [[ "$(node --version)" != "v$ADE_NODE_VERSION" ]]; then
	echo "Select Node $ADE_NODE_VERSION from .nvmrc before starting A.D.E." >&2
	exit 1
fi
export ADE_NODE_EXECUTABLE="${ADE_NODE_EXECUTABLE:-$(node -p 'process.execPath')}"
export VSCODE_PORTABLE="$ADE_ROOT/.build/ade-portable"
mkdir -p "$VSCODE_PORTABLE"
exec ./scripts/code.sh --user-data-dir="$ADE_ROOT/.build/ade-profile" --extensions-dir="$ADE_ROOT/.build/ade-extensions" --shared-data-dir="$ADE_ROOT/.build/ade-shared" "$@"
