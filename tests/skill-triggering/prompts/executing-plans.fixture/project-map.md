# Project Map
_Generated: 2024-01-15 09:00 | Staleness: timestamps_

## Directory Structure
src/ — HTTP API (node:http, no framework)
docs/plans/ — implementation plans

## Key Files
src/app.js — request handler; routes are matched inline
src/db.js — in-memory store shared by all modules

## Critical Constraints
- Node built-ins only; the deploy image has no npm registry access

## Hot Files
src/app.js
