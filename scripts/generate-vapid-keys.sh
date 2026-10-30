#!/usr/bin/env bash
# Generates one VAPID key pair without installing Node.js on the VM.
# Store the public and private values only in /opt/portal/.env.
set -Eeuo pipefail

docker run --rm node:20-alpine sh -c 'npx --yes web-push generate-vapid-keys --json'
