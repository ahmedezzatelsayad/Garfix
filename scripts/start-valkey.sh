#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# start-valkey.sh — Start Valkey server for local development
# ──────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./scripts/start-valkey.sh           # Start with Docker (recommended)
#   ./scripts/start-valkey.sh --native  # Try native installation
#   ./scripts/start-valkey.sh --stop    # Stop Valkey container
# ──────────────────────────────────────────────────────────────────────────────

set -e

CONTAINER_NAME="garfix-valkey"
IMAGE="valkey/valkey:8.1"
PORT="${VALKEY_PORT:-6379}"
PASSWORD="${VALKEY_PASSWORD:-garfix_dev_2024}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
log_error()   { echo -e "${RED}[✗]${NC} $1"; }

# ─── Check if Docker is available ──────────────────────────────────────────
check_docker() {
    if command -v docker &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# ─── Start Valkey with Docker ──────────────────────────────────────────────
start_docker() {
    log_info "Checking for existing Valkey container..."
    
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        log_success "Valkey is already running!"
        show_status
        exit 0
    fi
    
    # Check if container exists but stopped
    if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
        log_info "Starting existing Valkey container..."
        docker start $CONTAINER_NAME
        log_success "Valkey started!"
        show_status
        exit 0
    fi
    
    log_info "Pulling Valkey image ($IMAGE)..."
    docker pull $IMAGE
    
    log_info "Starting new Valkey container..."
    docker run -d \
        --name $CONTAINER_NAME \
        -p $PORT:6379 \
        --restart unless-stopped \
        -e VALKEY_PASSWORD=$PASSWORD \
        $IMAGE \
        valkey-server \
        --requirepass $PASSWORD \
        --maxmemory 256mb \
        --maxmemory-policy allkeys-lru \
        --appendonly yes \
        --appendfsync everysec
    
    # Wait for healthy
    log_info "Waiting for Valkey to be ready..."
    sleep 2
    
    if docker exec $CONTAINER_NAME valkey-cli -a $PASSWORD ping > /dev/null 2>&1; then
        log_success "Valkey is running and healthy!"
        show_status
    else
        log_error "Valkey started but health check failed"
        exit 1
    fi
}

# ─── Try native installation ──────────────────────────────────────────────
start_native() {
    if command -v valkey-server &> /dev/null; then
        log_info "Starting native Valkey server..."
        valkey-server --port $PORT --requirepass $PASSWORD --daemonize yes
        log_success "Native Valkey started on port $PORT"
    elif command -v redis-server &> /dev/null; then
        log_warn "Valkey not found, using Redis as fallback..."
        redis-server --port $PORT --requirepass $PASSWORD --daemonize yes
        log_success "Redis started on port $PORT (Valkey-compatible mode)"
    else
        log_error "Neither Valkey nor Redis is installed!"
        echo ""
        echo "Install options:"
        echo "  1. Docker (recommended): ./scripts/start-valkey.sh"
        echo "  2. Install Valkey: https://valkey.io/docs/installation/"
        echo "  3. Install Redis: apt-get install redis-server"
        exit 1
    fi
}

# ─── Stop Valkey ───────────────────────────────────────────────────────────
stop_valkey() {
    if check_docker; then
        if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
            log_info "Stopping Valkey container..."
            docker stop $CONTAINER_NAME
            log_success "Valkey stopped"
        else
            log_warn "Valkey is not running"
        fi
    else
        if pgrep -x valkey-server > /dev/null || pgrep -x redis-server > /dev/null; then
            pkill -x valkey-server 2>/dev/null || pkill -x redis-server
            log_success "Valkey/Redis process stopped"
        fi
    fi
}

# ─── Show status ──────────────────────────────────────────────────────────
show_status() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Valkey Status                            ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Container:  $CONTAINER_NAME"
    echo "║  Port:       $PORT"
    echo "║  Password:   $PASSWORD"
    echo "║  URL:        valkey://:$PASSWORD@localhost:$PORT"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    if check_docker && docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        log_info "Test connection:"
        docker exec $CONTAINER_NAME valkey-cli -a $PASSWORD ping
        echo ""
        log_info "Server info:"
        docker exec $CONTAINER_NAME valkey-cli -a $PASSWORD INFO server | head -10
    fi
}

# ─── Main ─────────────────────────────────────────────────────────────────
case "${1:-start}" in
    start|--docker)
        if check_docker; then
            start_docker
        else
            log_error "Docker not found. Install Docker or use --native flag"
            exit 1
        fi
        ;;
    --native)
        start_native
        ;;
    stop|--stop)
        stop_valkey
        ;;
    status|--status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|--docker|--native|stop|status}"
        exit 1
        ;;
esac
