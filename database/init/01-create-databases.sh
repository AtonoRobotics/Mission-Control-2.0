#!/bin/bash
# Create multiple PostgreSQL databases from POSTGRES_MULTIPLE_DATABASES env var.
# Used as a Docker entrypoint init script for postgres:16-alpine.
# Format: POSTGRES_MULTIPLE_DATABASES="db1,db2,db3"

set -e
set -u

if [ -z "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "POSTGRES_MULTIPLE_DATABASES is not set — skipping multi-db creation."
    exit 0
fi

IFS=',' read -ra DATABASES <<< "$POSTGRES_MULTIPLE_DATABASES"

for db in "${DATABASES[@]}"; do
    db=$(echo "$db" | xargs)  # trim whitespace
    echo "Creating database: $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
        SELECT 'CREATE DATABASE $db'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
        GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
    echo "Database '$db' created and privileges granted."
done
