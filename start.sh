#!/bin/bash

# DonkeyRide Docker Infrastructure Startup Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DonkeyRide Infrastructure Startup${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
    echo -e "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found. Please install Docker Compose first.${NC}"
    echo -e "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose found${NC}\n"

# Check .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env file with your configuration before continuing${NC}"
    echo -e "   Minimum required:"
    echo -e "   - OPERATOR_PUBKEY (your Nostr pubkey)"
    echo -e "   - OPERATOR_NSEC (your Nostr private key)"
    echo -e "   - OPERATOR_LIGHTNING (your Lightning address)"
    echo -e "\n${YELLOW}After editing .env, run: ./start.sh${NC}\n"
    exit 0
fi

echo -e "${GREEN}✅ .env file found${NC}\n"

# Parse arguments
DEV_MODE=false
REBUILD=false
LOGS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            DEV_MODE=true
            shift
            ;;
        --rebuild)
            REBUILD=true
            shift
            ;;
        --logs)
            LOGS=true
            shift
            ;;
        --help)
            echo "Usage: ./start.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev       Start with development tools (Adminer, Redis UI, Mock Lightning)"
            echo "  --rebuild   Rebuild Docker images before starting"
            echo "  --logs      Show logs after starting"
            echo "  --help      Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./start.sh              # Start production services"
            echo "  ./start.sh --dev        # Start with dev tools"
            echo "  ./start.sh --dev --logs # Start dev mode and show logs"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Run './start.sh --help' for usage"
            exit 1
            ;;
    esac
done

# Rebuild if requested
if [ "$REBUILD" = true ]; then
    echo -e "${YELLOW}🔨 Rebuilding Docker images...${NC}"
    docker compose build
    echo -e "${GREEN}✅ Build complete${NC}\n"
fi

# Start services
if [ "$DEV_MODE" = true ]; then
    echo -e "${YELLOW}🚀 Starting DonkeyRide in DEVELOPMENT mode...${NC}"
    echo -e "   Services:"
    echo -e "   - Nostr Relay (strfry)"
    echo -e "   - PostgreSQL"
    echo -e "   - Redis"
    echo -e "   - Operator Backend"
    echo -e "   - Mock Lightning Node"
    echo -e "   - Adminer (DB UI)"
    echo -e "   - Redis Commander\n"

    docker compose --profile dev up -d
else
    echo -e "${YELLOW}🚀 Starting DonkeyRide in PRODUCTION mode...${NC}"
    echo -e "   Services:"
    echo -e "   - Nostr Relay (strfry)"
    echo -e "   - PostgreSQL"
    echo -e "   - Redis"
    echo -e "   - Operator Backend"
    echo -e "   - OSRM (if map data prepared)\n"

    docker compose up -d
fi

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 5

# Check service health
echo ""
docker compose ps

# Print access info
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ DonkeyRide Infrastructure Started${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${BLUE}Access Points:${NC}"
echo -e "  Operator API:  ${GREEN}http://localhost:3000${NC}"
echo -e "  WebSocket:     ${GREEN}ws://localhost:3001${NC}"
echo -e "  Nostr Relay:   ${GREEN}ws://localhost:7777${NC}"

if [ "$DEV_MODE" = true ]; then
    echo -e "\n${BLUE}Development Tools:${NC}"
    echo -e "  Mock Lightning: ${GREEN}http://localhost:8080${NC}"
    echo -e "  Adminer (DB):   ${GREEN}http://localhost:8081${NC}"
    echo -e "  Redis UI:       ${GREEN}http://localhost:8082${NC}"
fi

echo ""
echo -e "${BLUE}Quick Tests:${NC}"
echo -e "  Health check:    ${YELLOW}curl http://localhost:3000/health${NC}"
echo -e "  Operator info:   ${YELLOW}curl http://localhost:3000/info${NC}"

echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  View logs:       ${YELLOW}docker compose logs -f${NC}"
echo -e "  Stop services:   ${YELLOW}docker compose down${NC}"
echo -e "  Restart service: ${YELLOW}docker compose restart operator${NC}"

echo ""
echo -e "${BLUE}Documentation:${NC}"
echo -e "  Docker setup:    ${YELLOW}DOCKER-SETUP.md${NC}"
echo -e "  Quick start:     ${YELLOW}guides/QUICK-START.md${NC}"
echo -e "  OSRM setup:      ${YELLOW}docker/osrm/README.md${NC}"

echo -e "\n${GREEN}========================================${NC}\n"

# Show logs if requested
if [ "$LOGS" = true ]; then
    echo -e "${YELLOW}📋 Showing logs (Ctrl+C to exit)...${NC}\n"
    docker compose logs -f
fi
