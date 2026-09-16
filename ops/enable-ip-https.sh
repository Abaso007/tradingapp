#!/usr/bin/env bash
set -euo pipefail
# Run as root after reviewing nginx-tradingapp.conf. The app must use same-origin
# API URLs and BIND_HOST=127.0.0.1. This does not restart the trading process.
ip="${1:?public IPv4 required}"
[[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
config_source="$(dirname "$0")/nginx-tradingapp.conf"
backup="/root/tradingapp-nginx-$(date -u +%Y%m%dT%H%M%SZ).conf"
cp /etc/nginx/sites-available/tradingapp "$backup"
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge
# Add challenge handling to the current HTTP server without changing app access.
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/tradingapp')
s = p.read_text()
if 'location /.well-known/acme-challenge/' not in s:
    s = s.replace('    location / {', '    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }\n\n    location / {', 1)
p.write_text(s)
PY
nginx -t
systemctl reload nginx
if ! test -x /snap/bin/certbot; then snap install certbot --classic; fi
/snap/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --preferred-profile shortlived --webroot --webroot-path /var/www/letsencrypt --ip-address "$ip"
sed "s/TRADINGAPP_IP/$ip/g" "$config_source" > /etc/nginx/sites-available/tradingapp
if ! nginx -t; then
  cp "$backup" /etc/nginx/sites-available/tradingapp
  exit 1
fi
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx <<'HOOK'
#!/bin/sh
nginx -t && systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
systemctl reload nginx
/snap/bin/certbot renew --dry-run
systemctl list-timers snap.certbot.renew.timer --no-pager
curl --fail --silent --show-error "https://$ip/api/ready"
