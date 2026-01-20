-- The Beyond: Database Schema
-- PostgreSQL 15+

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    subscription_status VARCHAR(50) DEFAULT 'free',
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- Pets
CREATE TABLE pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,

    hp INTEGER NOT NULL DEFAULT 100,
    hunger INTEGER NOT NULL DEFAULT 100,

    boldness FLOAT NOT NULL,
    sociability FLOAT NOT NULL,

    region_id VARCHAR(100) NOT NULL DEFAULT 'meadow_commons',

    is_alive BOOLEAN DEFAULT TRUE,
    days_alive INTEGER DEFAULT 0,

    appearance JSONB,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pets_alive ON pets(is_alive) WHERE is_alive = TRUE;
CREATE INDEX idx_pets_owner ON pets(owner_id);
CREATE INDEX idx_pets_region ON pets(region_id);

-- Friendships
CREATE TABLE friendships (
    pet_a_id UUID REFERENCES pets(id),
    pet_b_id UUID REFERENCES pets(id),
    formed_on_day INTEGER NOT NULL,
    region_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (pet_a_id, pet_b_id)
);

CREATE INDEX idx_friendships_a ON friendships(pet_a_id);
CREATE INDEX idx_friendships_b ON friendships(pet_b_id);

-- Journal Entries
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID REFERENCES pets(id),
    day INTEGER NOT NULL,
    region_id VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    is_significant BOOLEAN DEFAULT FALSE,
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_journal_pet ON journal_entries(pet_id);
CREATE INDEX idx_journal_pet_region ON journal_entries(pet_id, region_id);

-- Simulation State
CREATE TABLE simulation_state (
    key VARCHAR(100) PRIMARY KEY,
    value INTEGER NOT NULL
);

INSERT INTO simulation_state (key, value) VALUES ('current_tick', 0);
