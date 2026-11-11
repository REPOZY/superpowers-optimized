# Known Issues

## test.js fails: Cannot find module './generated/schema.js'
Cause: generated/ is build output and gitignored; fresh clones and clean checkouts do not have it.
Fix: run `node scripts/gen.js`, then `node test.js`. Never hand-write generated/schema.js, never commit it, never remove generated/ from .gitignore.
