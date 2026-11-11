# Project Map
_Generated: 2026-09-30 10:00 | Git: __HEAD___

## Directory Structure
config/ — runtime settings
src/ — API client

## Key Files
config/app.json — timeouts, retries, base URL; read once at startup
src/client.js — fetch wrapper applying config

## Critical Constraints
- Every change to config/app.json needs a line under "## Unreleased" in CHANGELOG.md — the release script reads it to flag config changes for ops, and blocks the deploy when a config change has no entry

## Hot Files
config/app.json
