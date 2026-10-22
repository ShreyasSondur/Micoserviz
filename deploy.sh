#!/usr/bin/env bash
# ==============================================================================
# MicroService ERP - Root Deployment Dispatcher
# ==============================================================================
# Usage:
#   git pull
#   sudo bash deploy.sh
# ==============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ -f "$SCRIPT_DIR/backend/deploy.sh" ]; then
    echo "Running MicroService Backend deployment script from $SCRIPT_DIR/backend/deploy.sh..."
    bash "$SCRIPT_DIR/backend/deploy.sh"
else
    echo "Error: backend/deploy.sh not found in $SCRIPT_DIR"
    exit 1
fi
