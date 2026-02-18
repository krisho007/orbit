#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Deploying API + Web..."
fly deploy "${repo_root}" -c "${repo_root}/apps/api/fly.toml"

echo "Done."
