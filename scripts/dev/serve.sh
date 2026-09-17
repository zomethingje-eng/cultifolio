#!/bin/sh
# Rebuild and (re)start wrangler dev on :4173 for screenshots in the sandbox.
for p in $(ps aux | grep -E "wrangler dev --port 4173|workerd serve" | grep -v grep | awk '{print $2}'); do kill $p 2>/dev/null; done
rm -rf .wrangler/state/v3/cache; sleep 1
npm run build >/dev/null 2>&1 || { echo BUILD FAILED; exit 1; }
setsid nohup npx wrangler dev --port 4173 > /tmp/wr.log 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 1; curl -s -o /dev/null http://127.0.0.1:4173/ && break; done
echo served
