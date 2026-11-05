#!/usr/bin/env bash
# Creates or renews the private-network TLS certificate used by ACROTIX Portal.
# The CA private key remains under nginx/ssl and is never exposed by Nginx.
set -Eeuo pipefail

PORTAL_ROOT="${PORTAL_ROOT:-/opt/portal}"
PORTAL_DOMAIN="${PORTAL_DOMAIN:-portal.acx.by}"
PORTAL_IP="${PORTAL_IP:-10.10.10.107}"
SSL_DIR="$PORTAL_ROOT/nginx/ssl"
CA_KEY="$SSL_DIR/acx-internal-ca.key"
CA_CERT="$SSL_DIR/acx-internal-ca.crt"

[[ "${EUID}" -eq 0 ]] || { echo "Запустите от root." >&2; exit 1; }
install -d -m 700 "$SSL_DIR"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
  openssl genrsa -out "$CA_KEY" 4096
  chmod 600 "$CA_KEY"
  openssl req -x509 -new -sha256 -days 3650 -key "$CA_KEY" -out "$CA_CERT" \
    -subj "/C=BY/O=ACROTIX/CN=ACROTIX Internal CA"
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
openssl genrsa -out "$WORK_DIR/server.key" 2048
openssl req -new -key "$WORK_DIR/server.key" -out "$WORK_DIR/server.csr" \
  -subj "/C=BY/O=ACROTIX/CN=$PORTAL_DOMAIN"
printf '%s\n' \
  "subjectAltName=DNS:$PORTAL_DOMAIN,IP:$PORTAL_IP" \
  'basicConstraints=CA:FALSE' \
  'keyUsage=digitalSignature,keyEncipherment' \
  'extendedKeyUsage=serverAuth' > "$WORK_DIR/server.ext"
openssl x509 -req -in "$WORK_DIR/server.csr" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$WORK_DIR/server.crt" -days 825 -sha256 -extfile "$WORK_DIR/server.ext"

BACKUP_DIR="$SSL_DIR/backup-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$BACKUP_DIR"
[[ ! -f "$SSL_DIR/server.crt" ]] || cp -a "$SSL_DIR/server.crt" "$BACKUP_DIR/"
[[ ! -f "$SSL_DIR/server.key" ]] || cp -a "$SSL_DIR/server.key" "$BACKUP_DIR/"
install -m 600 "$WORK_DIR/server.key" "$SSL_DIR/server.key"
install -m 644 "$WORK_DIR/server.crt" "$SSL_DIR/server.crt"

docker exec app_nginx nginx -t
docker exec app_nginx nginx -s reload
echo "CA certificate: $CA_CERT"
echo "Previous certificate backup: $BACKUP_DIR"
