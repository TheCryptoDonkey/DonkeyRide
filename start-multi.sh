#!/bin/bash

# ==========================================
# DonkeyRide Multi-Operator Startup Script
# ==========================================
#
# Starts 3 operators demonstrating federated model:
# - FastRides (0.3% fee)
# - CityRides (0.5% fee)
# - PremiumRides (1.0% fee)
#
# Usage:
#   ./start-multi.sh              # Production mode
#   ./start-multi.sh --dev        # Development mode (with admin UIs)
#   ./start-multi.sh --rebuild    # Rebuild containers
#   ./start-multi.sh --logs       # Show logs after starting
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Banner
echo ""
echo "========================================="
echo "  DonkeyRide Multi-Operator Setup"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    echo "   Please start Docker Desktop and try again."
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
    echo "   Creating from .env.example..."
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
    echo "   Please edit .env and set your configuration"
fi

# Parse arguments
COMPOSE_FILE="docker-compose-multi.yml"
PROFILE_FLAG=""
REBUILD_FLAG=""
LOGS_FLAG=""

for arg in "$@"
do
    case $arg in
        --dev)
            PROFILE_FLAG="--profile dev"
            echo -e "${BLUE}ℹ️  Development mode enabled${NC}"
            ;;
        --rebuild)
            REBUILD_FLAG="--build"
            echo -e "${BLUE}ℹ️  Will rebuild containers${NC}"
            ;;
        --logs)
            LOGS_FLAG="true"
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev       Include development tools (Adminer, Redis Commander)"
            echo "  --rebuild   Rebuild Docker containers"
            echo "  --logs      Show logs after starting"
            echo "  --help      Show this help message"
            echo ""
            exit 0
            ;;
    esac
done

# Start services
echo ""
echo "🚀 Starting DonkeyRide infrastructure..."
echo ""

docker-compose -f $COMPOSE_FILE $PROFILE_FLAG up -d $REBUILD_FLAG

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

# Function to check service health
check_health() {
    local service=$1
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f $COMPOSE_FILE ps $service | grep -q "healthy\|running"; then
            echo -e "${GREEN}✅ $service is ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done

    echo -e "${RED}❌ $service failed to start${NC}"
    return 1
}

# Check each service
check_health "postgres"
check_health "redis"
check_health "nostr-relay"
check_health "operator-a"
check_health "operator-b"
check_health "operator-c"

echo ""
echo -e "${GREEN}✅ All services are healthy!${NC}"
echo ""

# Display operator info
echo "========================================="
echo "  Operator Information"
echo "========================================="
echo ""
echo -e "${GREEN}FastRides (0.3% fee)${NC}"
echo "  API:       http://localhost:3000"
echo "  WebSocket: ws://localhost:3001"
echo "  Info:      curl http://localhost:3000/info"
echo ""
echo -e "${BLUE}CityRides (0.5% fee)${NC}"
echo "  API:       http://localhost:3100"
echo "  WebSocket: ws://localhost:3101"
echo "  Info:      curl http://localhost:3100/info"
echo ""
echo -e "${YELLOW}PremiumRides (1.0% fee)${NC}"
echo "  API:       http://localhost:3200"
echo "  WebSocket: ws://localhost:3201"
echo "  Info:      curl http://localhost:3200/info"
echo ""

# Display shared infrastructure
echo "========================================="
echo "  Shared Infrastructure"
echo "========================================="
echo ""
echo "Nostr Relay:  ws://localhost:7777"
echo "PostgreSQL:   localhost:5432"
echo "Redis:        localhost:6379"
echo ""

# Display dev tools if enabled
if [ ! -z "$PROFILE_FLAG" ]; then
    echo "========================================="
    echo "  Development Tools"
    echo "========================================="
    echo ""
    echo "Adminer (DB):     http://localhost:8081"
    echo "Redis Commander:  http://localhost:8082"
    echo "Mock Lightning:   http://localhost:8080"
    echo ""
fi

# Display next steps
echo "========================================="
echo "  Next Steps"
echo "========================================="
echo ""
echo "1. Generate test users (if not done yet):"
echo "   ${BLUE}node scripts/setup-test-environment.js${NC}"
echo ""
echo "2. Simulate drivers (multi-operator):"
echo "   ${BLUE}node scripts/simulate-drivers-multi.js${NC}"
echo ""
echo "3. View demo:"
echo "   ${BLUE}open http://localhost:3000/demo.html${NC}"
echo ""
echo "4. Test API (all operators):"
echo "   ${BLUE}curl http://localhost:3000/api/drivers/available${NC}"
echo ""
echo "========================================="
echo "  Key Features"
echo "========================================="
echo ""
echo "✅ 3 operators running simultaneously"
echo "✅ All publish to same Nostr relay"
echo "✅ Riders see ALL drivers (not just one operator)"
echo "✅ Automatic routing to driver's operator"
echo "✅ Competition on price & quality, not lock-in"
echo ""

# Show logs if requested
if [ ! -z "$LOGS_FLAG" ]; then
    echo "========================================="
    echo "  Container Logs"
    echo "========================================="
    echo ""
    docker-compose -f $COMPOSE_FILE logs -f
fi

# Display stop command
echo ""
echo "To stop all services:"
echo "  ${RED}docker-compose -f docker-compose-multi.yml down${NC}"
echo ""
echo "To view logs:"
echo "  ${BLUE}docker-compose -f docker-compose-multi.yml logs -f${NC}"
echo ""
