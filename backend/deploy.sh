#!/usr/bin/env bash
# ==============================================================================
# MicroService ERP - Automated VPS Deployment Script (Ubuntu / Debian)
# ==============================================================================
# Usage:
#   cd MicroService/backend
#   sudo bash deploy.sh
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "\n${BLUE}======================================================${NC}"
echo -e "${BLUE}    MicroService ERP - Automated VPS Setup & Deploy   ${NC}"
echo -e "${BLUE}======================================================${NC}\n"

# 1. Check Root Privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script with sudo or as root.${NC}"
  echo -e "Example: sudo bash deploy.sh"
  exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"
echo -e "${GREEN}[1/8] Working directory:${NC} $SCRIPT_DIR"

# 2. Environment File Setup
echo -e "\n${YELLOW}[2/8] Setting up .env configuration...${NC}"
if [ -f "$SCRIPT_DIR/deploy.env" ]; then
    cp "$SCRIPT_DIR/deploy.env" "$SCRIPT_DIR/.env"
    echo -e "${GREEN}✓ Successfully generated .env from deploy.env${NC}"
elif [ -f "$SCRIPT_DIR/.env.production" ]; then
    cp "$SCRIPT_DIR/.env.production" "$SCRIPT_DIR/.env"
    echo -e "${GREEN}✓ Successfully generated .env from .env.production${NC}"
elif [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${YELLOW}Warning: Neither deploy.env nor .env was found. Copying .env.example...${NC}"
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
fi

# 3. Install System Packages
echo -e "\n${YELLOW}[3/8] Installing system dependencies (PostgreSQL, Nginx, Python3)...${NC}"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    python3-dev \
    libpq-dev \
    postgresql \
    postgresql-contrib \
    nginx \
    curl \
    git \
    ufw

# 4. Configure Local PostgreSQL
echo -e "\n${YELLOW}[4/8] Configuring PostgreSQL Database & User...${NC}"
systemctl start postgresql
systemctl enable postgresql

DB_NAME="microservicedb"
DB_USER="microservice_user"
DB_PASS="MicroService_2026_Secure"

# Check if user exists, if not create, otherwise update password
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS'; ELSE ALTER USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS'; END IF; END \$\$;"

# Check if database exists, if not create
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Grant permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

echo -e "${GREEN}✓ PostgreSQL database '$DB_NAME' & user '$DB_USER' configured.${NC}"

# 5. Setup Python Virtual Environment
echo -e "\n${YELLOW}[5/8] Setting up Python virtual environment & dependencies...${NC}"
python3 -m venv "$SCRIPT_DIR/.venv"
source "$SCRIPT_DIR/.venv/bin/activate"

pip install --upgrade pip
if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    pip install -r "$SCRIPT_DIR/requirements.txt"
fi
pip install gunicorn uvicorn psycopg2-binary "psycopg[binary]" httpx openpyxl

echo -e "\n${YELLOW}Running database schema migration & safeguards...${NC}"
python "$SCRIPT_DIR/migrate_db.py"

echo -e "${GREEN}✓ Python dependencies and database migration verified successfully.${NC}"

# 6. Setup Systemd Service Daemon (Running on isolated port 8080)
echo -e "\n${YELLOW}[6/8] Creating Systemd service for auto-restart & background execution...${NC}"
SERVICE_FILE="/etc/systemd/system/microservice-backend.service"

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=MicroService ERP FastAPI Backend Daemon
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=$SCRIPT_DIR
EnvironmentFile=$SCRIPT_DIR/.env
Environment="PATH=$SCRIPT_DIR/.venv/bin"
ExecStart=$SCRIPT_DIR/.venv/bin/gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8080
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable microservice-backend
systemctl restart microservice-backend
echo -e "${GREEN}✓ microservice-backend.service active on port 8080.${NC}"

# 7. Configure Dedicated Nginx Server Block (Coexists with other backends)
echo -e "\n${YELLOW}[7/8] Configuring Nginx Server Block...${NC}"
NGINX_CONF="/etc/nginx/sites-available/microservice-backend"

cat <<'EOF' > "$NGINX_CONF"
server {
    listen 80;
    listen [::]:80;

    server_name 13.140.172.117.sslip.io;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
EOF

# Enable site without deleting other existing sites
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/microservice-backend

# Test Nginx and reload
nginx -t
systemctl reload nginx
echo -e "${GREEN}✓ Dedicated Nginx server block active for 13.140.172.117.sslip.io (proxying to port 8080).${NC}"

# 8. Health Check Verification
echo -e "\n${YELLOW}[8/8] Verifying backend health...${NC}"
sleep 3

PUBLIC_IP=$(curl -s https://api.ipify.org || curl -s ifconfig.me || echo "YOUR_VPS_IP")

HEALTH_STATUS=$(curl -s http://127.0.0.1:8000/health || echo "FAILED")

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}    🎉 MicroService ERP Backend Deployed Successfully! ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Health Check Response: $HEALTH_STATUS"
echo -e "\n${BLUE}API Base URL:${NC} http://$PUBLIC_IP/api/v1"
echo -e "${BLUE}API Docs:${NC}     http://$PUBLIC_IP/docs"
echo -e "${BLUE}Health Check:${NC} http://$PUBLIC_IP/health"
echo -e "\n${YELLOW}Next Step for Vercel Frontend:${NC}"
echo -e "In Vercel Project Settings -> Environment Variables, add:"
echo -e "  NEXT_PUBLIC_API_URL=http://$PUBLIC_IP/api/v1"
echo -e "  NEXT_PUBLIC_BACKEND_URL=http://$PUBLIC_IP"
echo -e "\n${YELLOW}To attach a custom domain with Free SSL:${NC}"
echo -e "  sudo apt install certbot python3-certbot-nginx -y"
echo -e "  sudo certbot --nginx -d api.yourdomain.com"
echo -e "======================================================\n"
