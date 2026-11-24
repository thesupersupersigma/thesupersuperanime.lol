#!/bin/sh
# Runs once, on an empty Postgres volume: the site's database is POSTGRES_DB; this adds RECONSUMET.TS's.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c 'CREATE DATABASE reconsumet'
