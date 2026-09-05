-- ==============================================================================
-- PostgreSQL initialization script
-- Runs automatically on first container start (DB is empty)
-- ==============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Trigram index for ILIKE searches
