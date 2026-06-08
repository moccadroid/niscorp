-- Vex dev database initialization
-- Runs automatically on first Docker container boot via entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
