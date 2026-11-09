#!/usr/bin/env bash
# ==============================================================================
# MicroService ERP - Root Deployment Dispatcher
# ==============================================================================
# Usage:
#   bash deploy.sh
# ==============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# 1. Safely pull latest changes from git
if [ -d "$SCRIPT_DIR/.git" ]; then
    echo "======================================================"
    echo "  Pulling latest changes from Git repository...      "
    echo "======================================================"
    git pull origin main || git pull || echo "Note: Proceeding with existing code."
fi

# 2. Check privileges and auto-elevate if not root
if [ "$EUID" -ne 0 ]; then
    echo "Elevating privileges with sudo to run deployment..."
    exec sudo bash "$0" "$@"
fi

# 3. Dispatch to backend deployment script
if [ -f "$SCRIPT_DIR/backend/deploy.sh" ]; then
    echo "Running MicroService Backend deployment script..."
    bash "$SCRIPT_DIR/backend/deploy.sh"
else
    echo "Error: backend/deploy.sh not found in $SCRIPT_DIR"
    exit 1
fi
