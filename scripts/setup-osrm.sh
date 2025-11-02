#!/bin/bash

# OSRM Setup Script for DonkeyRide
# Downloads and processes OpenStreetMap data for local routing

set -e

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DonkeyRide OSRM Setup${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check dependencies
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}❌ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v osmium &> /dev/null; then
    echo -e "${YELLOW}⚠️  osmium-tool not found. Installing via Homebrew...${NC}"
    brew install osmium-tool
fi

echo -e "${GREEN}✅ Dependencies ready${NC}\n"

# Configuration
REGION=${1:-"central-london"}
DATA_DIR="./data"

case $REGION in
    "central-london")
        echo -e "${BLUE}Setting up Central London (30MB)${NC}"
        SOURCE_FILE="great-britain-latest.osm.pbf"
        SOURCE_URL="https://download.geofabrik.de/europe/great-britain-latest.osm.pbf"
        OUTPUT_FILE="central-london.osm.pbf"
        # Bounding box: West London to East London
        BBOX="-0.2,51.45,0.0,51.55"
        ;;
    "greater-london")
        echo -e "${BLUE}Setting up Greater London (100MB)${NC}"
        SOURCE_FILE="great-britain-latest.osm.pbf"
        SOURCE_URL="https://download.geofabrik.de/europe/great-britain-latest.osm.pbf"
        OUTPUT_FILE="greater-london.osm.pbf"
        # Bounding box: Greater London
        BBOX="-0.5,51.28,0.3,51.7"
        ;;
    *)
        echo -e "${YELLOW}Unknown region: $REGION${NC}"
        echo "Usage: $0 [central-london|greater-london]"
        exit 1
        ;;
esac

mkdir -p "$DATA_DIR"

# Step 1: Download source data if needed
if [ ! -f "$DATA_DIR/$SOURCE_FILE" ]; then
    echo -e "${YELLOW}📥 Downloading $SOURCE_FILE (this may take a while)...${NC}"
    curl -L "$SOURCE_URL" -o "$DATA_DIR/$SOURCE_FILE"
    echo -e "${GREEN}✅ Downloaded${NC}\n"
else
    echo -e "${GREEN}✅ Source file already exists: $SOURCE_FILE${NC}\n"
fi

# Step 2: Extract region
echo -e "${YELLOW}🗺️  Extracting $REGION from source...${NC}"
osmium extract -b "$BBOX" "$DATA_DIR/$SOURCE_FILE" -o "$DATA_DIR/$OUTPUT_FILE" --overwrite
echo -e "${GREEN}✅ Extracted $(du -h "$DATA_DIR/$OUTPUT_FILE" | cut -f1)${NC}\n"

# Step 3: Process with OSRM
echo -e "${YELLOW}⚙️  Processing with OSRM (3 steps)...${NC}\n"

echo -e "${BLUE}Step 1/3: Extract${NC}"
docker run -t -v "${PWD}/$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend \
    osrm-extract -p /opt/car.lua "/data/$OUTPUT_FILE"

echo -e "\n${BLUE}Step 2/3: Partition${NC}"
docker run -t -v "${PWD}/$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend \
    osrm-partition "/data/${OUTPUT_FILE%.osm.pbf}.osrm"

echo -e "\n${BLUE}Step 3/3: Customize${NC}"
docker run -t -v "${PWD}/$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend \
    osrm-customize "/data/${OUTPUT_FILE%.osm.pbf}.osrm"

echo -e "\n${GREEN}✅ OSRM data processed successfully!${NC}\n"

# Step 4: Show stats
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Setup Complete${NC}"
echo -e "${BLUE}========================================${NC}\n"
echo -e "Map data: ${GREEN}$OUTPUT_FILE${NC}"
echo -e "Size: ${GREEN}$(du -h "$DATA_DIR/$OUTPUT_FILE" | cut -f1)${NC}"
echo -e "Processed files: ${GREEN}$(ls -1 "$DATA_DIR"/*.osrm* | wc -l | tr -d ' ') files${NC}\n"

echo -e "${YELLOW}To start OSRM server:${NC}"
echo -e "  docker compose up -d osrm-backend"
echo -e "\n${YELLOW}Or manually:${NC}"
echo -e "  docker run -d -p 5001:5000 -v \"\${PWD}/$DATA_DIR:/data\" \\"
echo -e "    ghcr.io/project-osrm/osrm-backend \\"
echo -e "    osrm-routed --algorithm mld /data/${OUTPUT_FILE%.osm.pbf}.osrm\n"

echo -e "${GREEN}Done!${NC}\n"
