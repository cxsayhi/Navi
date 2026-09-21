#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
backend_log="$repo_root/artifacts/performance/backend.log"
mkdir -p "$(dirname "$backend_log")"

cleanup() {
  if [[ -n "${backend_pid:-}" ]]; then
    kill "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

(
  cd "$repo_root/backend"
  exec ./mvnw -q test-compile spring-boot:run \
    -DskipTests \
    -Dspring-boot.run.profiles=e2e \
    -Dspring-boot.run.useTestClasspath=true \
    -Dspring-boot.run.additional-classpath-elements=target/test-classes \
    "-Dspring-boot.run.arguments=--server.port=8083 --spring.main.sources=com.wanderline.navigation.E2eGoogleRoutesConfiguration"
) >"$backend_log" 2>&1 &
backend_pid=$!

deadline=$((SECONDS + 120))
until curl -fsS http://127.0.0.1:8083/actuator/health >/dev/null 2>&1; do
  if ! kill -0 "$backend_pid" 2>/dev/null || (( SECONDS >= deadline )); then
    cat "$backend_log"
    exit 1
  fi
  sleep 1
done

cd "$repo_root"
node scripts/performance-smoke.mjs
