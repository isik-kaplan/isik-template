# Thin wrapper around the stock image so this service has its own build context to extend (init
# scripts, extra extensions) without editing docker-compose.yml's image reference. No
# shared_preload_libraries override: the image already loads pg_search there, and naming it alone
# drops pg_cron, which ParadeDB's own first-boot script needs.
FROM paradedb/paradedb:0.24.3-pg18
