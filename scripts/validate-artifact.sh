#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

npm run typecheck
npm run lint
npm test
for script in scripts/check-*.mjs; do
  node "$script"
done
npx --no-install wrangler deploy --dry-run
