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

      perSystem = { self', pkgs, config, lib, ... }: {

        # =======================================================
        # Development services (replaces docker-compose for dev)
        # =======================================================
        process-compose."services" = { config, ... }: {
          imports = [
            inputs.services-flake.processComposeModules.default
          ];

          # ---------------------------------------------------
          # PostgreSQL 15 with PostGIS
          # ---------------------------------------------------
          services.postgres."pg1" = {
            enable = true;
            package = pkgs.postgresql_15;
            port = 5432;
            listen_addresses = "127.0.0.1";
            extensions = extensions: [
              extensions.postgis
              extensions.pg_trgm
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
          # strfry (Nostr relay)
          # ---------------------------------------------------
          settings.processes.strfry = {
            command = let
              strfryConf = pkgs.writeText "strfry.conf" (builtins.readFile ./docker/strfry/strfry.conf);
            in pkgs.writeShellApplication {
              name = "run-strfry";
              runtimeInputs = [ pkgs.strfry ];
              text = ''
                mkdir -p .nix-data/strfry
                cd .nix-data/strfry
                exec strfry --config=${strfryConf} relay
              '';
            };
            readiness_probe = {
              http_get = {
                host = "127.0.0.1";
                port = 7777;
                path = "/";
              };
              initial_delay_seconds = 3;
              period_seconds = 10;
              failure_threshold = 3;
            };
          };

          # ---------------------------------------------------
          # Mock Lightning node (development only)
          # ---------------------------------------------------
          settings.processes.mock-lightning = {
            command = pkgs.writeShellApplication {
              name = "run-mock-lightning";
              runtimeInputs = [ pkgs.nodejs_18 ];
              text = ''
                cd ${toString ./.}/docker/mock-lightning
                if [ ! -d node_modules ]; then
                  npm install --no-save express cors
                fi
                export NETWORK=regtest
                export INITIAL_BALANCE=10000000
                exec node server.js
              '';
            };
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
          # OSRM backend (optional — needs pre-processed map data)
          # ---------------------------------------------------
          settings.processes.osrm = {
            command = pkgs.writeShellApplication {
              name = "run-osrm";
              runtimeInputs = [ pkgs.osrm-backend ];
              text = ''
                OSRM_FILE="${toString ./.}/data/central-london.osrm"
                if [ ! -f "$OSRM_FILE" ]; then
                  echo "OSRM data not found at $OSRM_FILE — skipping OSRM backend."
                  echo "See docker/osrm/README.md for map data setup instructions."
                  # Keep process alive so process-compose doesn't restart it
                  exec sleep infinity
                fi
                exec osrm-routed --algorithm mld "$OSRM_FILE" --max-table-size 10000 --port 5000
              '';
            };
            readiness_probe = {
              http_get = {
                host = "127.0.0.1";
                port = 5000;
                path = "/health";
              };
              initial_delay_seconds = 5;
              period_seconds = 30;
              failure_threshold = 3;
            };
            # OSRM is optional — don't block other services
            availability.restart = "on_failure";
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
            # Node.js
            nodejs_18
            nodePackages.nodemon

            # Database clients (useful for debugging)
            postgresql_15
            redis

            # Utilities
            jq
            curl
            websocat

            # Make the services command available
            self'.packages.services
          ];

          shellHook = ''
            echo ""
            echo "🫏 DonkeyRide Development Shell"
            echo "================================"
            echo ""
            echo "Available commands:"
            echo "  nix run .#services   Start all services (postgres, redis, strfry, mock-lightning, osrm)"
            echo "  npm start            Start the operator server"
            echo "  npm run dev          Start with nodemon (auto-reload)"
            echo "  npm test             Run test suite"
            echo ""
            echo "Service URLs (after starting services):"
            echo "  PostgreSQL:    postgresql://donkey:devpassword123@127.0.0.1:5432/donkeyride"
            echo "  Redis:         redis://127.0.0.1:6379"
            echo "  Nostr relay:   ws://127.0.0.1:7777"
            echo "  Mock Lightning: http://127.0.0.1:8080"
            echo "  OSRM:          http://127.0.0.1:5000 (if map data available)"
            echo ""

            # Set environment variables for local development
            export DATABASE_URL="postgresql://donkey:devpassword123@127.0.0.1:5432/donkeyride"
            export REDIS_URL="redis://127.0.0.1:6379"
            export NOSTR_RELAY="ws://127.0.0.1:7777"
            export OSRM_SERVER="http://127.0.0.1:5000"
            export PAYMENT_PROVIDER="demo"
            export NODE_ENV="development"
            export PORT=3000
            export WS_PORT=3001
            export ENABLE_NIP98_AUTH="false"
            export ENABLE_RATE_LIMITING="false"

            # Source .env if it exists (overrides above defaults)
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
