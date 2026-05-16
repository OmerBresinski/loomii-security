-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
