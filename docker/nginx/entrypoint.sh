#!/bin/sh
set -eu

CERT_DIR=/etc/nginx/certs
CERT="$CERT_DIR/localhost.crt"
KEY="$CERT_DIR/localhost.key"

mkdir -p "$CERT_DIR"

# Generate a self-signed certificate on first start and keep it in the named
# volume, so the browser only has to be convinced once rather than every build.
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "[proxy] generating a self-signed certificate for localhost..."
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=localhost/O=Powerselect Werkplanner (local dev)" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  echo "[proxy] done. Your browser will warn once until you trust it."
fi

exec "$@"
