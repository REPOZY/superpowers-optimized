# Project Map
_Generated: 2026-09-30 10:00 | Git: __HEAD___

## Directory Structure
config/ — runtime settings
src/ — API client

## Key Files
config/app.json — timeouts, retries, base URL; read once at startup
src/client.js — fetch wrapper applying config

## Critical Constraints
- Production sits behind a load balancer with a 25 s idle timeout. A request timeout of 25000 ms or more lets the balancer drop the connection first and users get 502s (incident 2026-08-14). Keep timeoutMs at 24000 or below, and tell whoever asks for more why.

## Hot Files
config/app.json
