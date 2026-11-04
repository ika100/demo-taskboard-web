#!/usr/bin/env bash
# Run the image like Kubernetes (read-only root, tmpfs /tmp) and probe it. Host port: SMOKE_PORT (default 3100).
set -u
PORT="${SMOKE_PORT:-3100}"
NAME="demo-taskboard-web-smoke"
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --read-only --tmpfs /tmp -e API_URL=http://127.0.0.1:9 -p "$PORT:3000" demo-taskboard-web:scan >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
rc=0
for p in /api/health /api/ready /; do
  code=000
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$p")
    [ "$code" = 200 ] && break
    sleep 1
  done
  echo "$p -> $code"
  [ "$code" = 200 ] || rc=1
done
[ $rc = 0 ] || docker logs "$NAME" 2>&1 | tail -20
exit $rc
