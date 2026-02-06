{
  description = "DonkeyRide — Decentralised service coordination protocol (Nostr + Lightning)";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    systems.url = "github:nix-systems/default";
    process-compose-flake.url = "github:Platonic-Systems/process-compose-flake";
    services-flake.url = "github:juspay/services-flake";
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import inputs.systems;

      imports = [
        inputs.process-compose-flake.flakeModule
      ];

      perSystem = { self', pkgs, config, lib, ... }: let
        node = pkgs.nodejs_22;
      in {

        # =======================================================
        # Development services (replaces docker-compose for dev)
        # =======================================================
        process-compose."services" = { config, ... }: {
          imports = [
            inputs.services-flake.processComposeModules.default
          ];

          # ---------------------------------------------------
          # PostgreSQL 16 with PostGIS
          # ---------------------------------------------------
          services.postgres."pg1" = {
            enable = true;
            package = pkgs.postgresql_16;
            port = 5432;
            listen_addresses = "127.0.0.1";
            extensions = extensions: [
              extensions.postgis
            ];
            initdbArgs = [
              "--locale=en_US.UTF-8"
              "--encoding=UTF8"
            ];
            initialDatabases = [
              {
                name = "donkeyride";
                schemas = [ ./docker/postgres/init.sql ];
              }
            ];
            initialScript.before = ''
              CREATE USER donkey WITH PASSWORD 'devpassword123' CREATEDB;
              GRANT ALL PRIVILEGES ON DATABASE donkeyride TO donkey;
            '';
            initialScript.after = ''
              GRANT ALL ON SCHEMA public TO donkey;
              GRANT ALL ON ALL TABLES IN SCHEMA public TO donkey;
              GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO donkey;
              GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO donkey;
              ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO donkey;
              ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO donkey;
            '';
          };

          # ---------------------------------------------------
          # Redis 7
          # ---------------------------------------------------
          services.redis."r1" = {
            enable = true;
            port = 6379;
            bind = "127.0.0.1";
            extraConfig = ''
              appendonly yes
              maxmemory 256mb
              maxmemory-policy allkeys-lru
            '';
          };

          # ---------------------------------------------------
          # Nostr relay (lightweight Node.js dev relay)
          # ---------------------------------------------------
          settings.processes.nostr-relay = {
            command = "NODE_PATH=node_modules ${node}/bin/node scripts/dev-relay.js";
            readiness_probe = {
              http_get = {
                host = "127.0.0.1";
                port = 7777;
                path = "/";
              };
              initial_delay_seconds = 2;
              period_seconds = 10;
              failure_threshold = 3;
            };
          };

          # ---------------------------------------------------
          # Mock Lightning node (development only)
          # ---------------------------------------------------
          settings.processes.mock-lightning = {
            command = "NODE_PATH=node_modules PORT=8080 NETWORK=regtest INITIAL_BALANCE=10000000 ${node}/bin/node docker/mock-lightning/server.js";
            readiness_probe = {
              http_get = {
                host = "127.0.0.1";
                port = 8080;
                path = "/health";
              };
              initial_delay_seconds = 3;
              period_seconds = 10;
              failure_threshold = 3;
            };
          };

          # ---------------------------------------------------
          # OSRM (optional — skipped if no map data present)
          # ---------------------------------------------------
          settings.processes.osrm = {
            command = "echo 'OSRM: no native package for macOS. Use docker compose up osrm or OpenRouteService API.' && sleep 999999";
            availability.restart = "no";
          };
        };

        # =======================================================
        # Development shell
        # =======================================================
        devShells.default = pkgs.mkShell {
          inputsFrom = [
            config.process-compose."services".services.outputs.devShell
          ];

          packages = with pkgs; [
            node
            nodePackages.nodemon
            postgresql_16
            redis
            jq
            curl
            websocat
            self'.packages.services
          ];

          shellHook = ''
            echo ""
            echo "DonkeyRide Development Shell"
            echo "================================"
            echo ""
            echo "Available commands:"
            echo "  nix run .#services   Start all services (postgres, redis, nostr-relay, mock-lightning)"
            echo "  npm start            Start the operator server"
            echo "  npm run dev          Start with nodemon (auto-reload)"
            echo "  npm test             Run test suite"
            echo ""
            echo "Service URLs (after starting services):"
            echo "  PostgreSQL:     postgresql://donkey:devpassword123@127.0.0.1:5432/donkeyride"
            echo "  Redis:          redis://127.0.0.1:6379"
            echo "  Nostr relay:    ws://127.0.0.1:7777"
            echo "  Mock Lightning: http://127.0.0.1:8080"
            echo ""

            export DATABASE_URL="postgresql://donkey:devpassword123@127.0.0.1:5432/donkeyride"
            export REDIS_URL="redis://127.0.0.1:6379"
            export NOSTR_RELAY="ws://127.0.0.1:7777"
            export PAYMENT_PROVIDER="demo"
            export NODE_ENV="development"
            export PORT=3000
            export WS_PORT=3001
            export ENABLE_NIP98_AUTH="false"
            export ENABLE_RATE_LIMITING="false"

            if [ -f .env ]; then
              echo "Loading .env file..."
              set -a
              source .env
              set +a
            fi
          '';
        };
      };
    };
}
