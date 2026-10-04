#!/usr/bin/env bash
# ==============================================================================
# MicroService ERP - Automated SSL & Security Hardening Script
# ==============================================================================
# Usage:
#   sudo bash setup_ssl.sh [your-domain.com] [your-email@example.com]
#   Example: sudo bash setup_ssl.sh api.microservice.com admin@microservice.com
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\n${BLUE}======================================================${NC}"
echo -e "${BLUE}   MicroService ERP - SSL & Security Hardening Setup  ${NC}"
echo -e "${BLUE}======================================================${NC}\n"

# 1. Check Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run with sudo or as root.${NC}"
  echo -e "Example: sudo bash setup_ssl.sh api.yourdomain.com admin@yourdomain.com"
  exit 1
fi

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ]; then
    read -p "Enter your domain or subdomain (e.g. api.yourdomain.com): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
    read -p "Enter your email for Let's Encrypt renewal notices: " EMAIL
fi

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo -e "${RED}[ERROR] Domain and email are required to generate SSL certificate.${NC}"
    exit 1
fi

# 2. Firewall (UFW) Security Setup
echo -e "\n${YELLOW}[1/4] Configuring Linux Firewall (UFW)...${NC}"
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable firewall non-interactively
ufw --force enable
echo -e "${GREEN}✓ Firewall enabled: Ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open.${NC}"
echo -e "${GREEN}✓ All other ports (including PostgreSQL 5432) strictly blocked from outside.${NC}"

# 3. Nginx Security Headers & Rate Limiting Configuration
echo -e "\n${YELLOW}[2/4] Applying Nginx Security Hardening & Headers...${NC}"
NGINX_CONF="/etc/nginx/sites-available/microservice-backend"

cat <<EOF > "$NGINX_CONF"
# Rate limiting zone (10 requests/sec with burst 20)
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=15r/s;

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 100M;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        limit_req zone=api_limit burst=30 nodelay;

        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/microservice-backend
nginx -t
systemctl reload nginx
echo -e "${GREEN}✓ Nginx configured for $DOMAIN with security headers.${NC}"

# 4. Install Certbot and Issue Free SSL Certificate
echo -e "\n${YELLOW}[3/4] Requesting Free Let's Encrypt SSL Certificate...${NC}"
apt-get install -y certbot python3-certbot-nginx

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo -e "${GREEN}✓ SSL Certificate successfully installed and configured for HTTPS!${NC}"

# 5. Enable Automated SSL Renewal
echo -e "\n${YELLOW}[4/4] Verifying automatic SSL certificate renewal...${NC}"
systemctl enable certbot.timer
systemctl start certbot.timer
certbot renew --dry-run

# 6. Update .env CORS with the new HTTPS domain
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if [ -f "$SCRIPT_DIR/.env" ]; then
    if ! grep -q "https://$DOMAIN" "$SCRIPT_DIR/.env"; then
        sed -i "s|BACKEND_CORS_ORIGINS=\"|BACKEND_CORS_ORIGINS=\"https://$DOMAIN,|g" "$SCRIPT_DIR/.env"
        systemctl restart microservice-backend
        echo -e "${GREEN}✓ Added https://$DOMAIN to backend CORS allowed origins.${NC}"
    fi
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}    🔒 SSL & Security Hardening Complete!           ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Your Secure API is live at: ${BLUE}https://$DOMAIN/api/v1${NC}"
echo -e "API Documentation:          ${BLUE}https://$DOMAIN/docs${NC}"
echo -e "Health Check:               ${BLUE}https://$DOMAIN/health${NC}"
echo -e "\n${YELLOW}Update your Vercel Environment Variables:${NC}"
echo -e "  NEXT_PUBLIC_API_URL=https://$DOMAIN/api/v1"
echo -e "  NEXT_PUBLIC_BACKEND_URL=https://$DOMAIN"
echo -e "======================================================\n"
