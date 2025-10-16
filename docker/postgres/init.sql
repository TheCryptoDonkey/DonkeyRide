











-- DonkeyRide PostgreSQL Database Schema
-- Initialization script for operator backend

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- For geospatial queries
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- =====================================================
-- Operators Table
-- =====================================================
CREATE TABLE IF NOT EXISTS operators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pubkey TEXT NOT NULL UNIQUE,
    lightning_address TEXT NOT NULL,
    fee_percent DECIMAL(5,4) NOT NULL DEFAULT 0.005,
    bond_amount BIGINT NOT NULL DEFAULT 1000000,
    bond_address TEXT,
    bond_tx_id TEXT,
    bond_status TEXT DEFAULT 'pending',  -- pending, confirmed, slashed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_operators_pubkey ON operators(pubkey);
CREATE INDEX idx_operators_bond_status ON operators(bond_status);

-- =====================================================
-- Rides Table
-- =====================================================
CREATE TABLE IF NOT EXISTS rides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id TEXT NOT NULL UNIQUE,  -- Nostr event d tag
    operator_pubkey TEXT NOT NULL REFERENCES operators(pubkey),
    rider_pubkey TEXT NOT NULL,
    driver_pubkey TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'requested',  -- requested, accepted, confirmed, started, completed, cancelled

    -- Location
    pickup_lat DOUBLE PRECISION NOT NULL,
    pickup_lon DOUBLE PRECISION NOT NULL,
    pickup_address TEXT,
    dropoff_lat DOUBLE PRECISION NOT NULL,
    dropoff_lon DOUBLE PRECISION NOT NULL,
    dropoff_address TEXT,
    pickup_location GEOGRAPHY(POINT, 4326),  -- PostGIS geography
    dropoff_location GEOGRAPHY(POINT, 4326),

    -- Pricing
    estimated_fare_sats BIGINT,
    final_fare_sats BIGINT,
    surge_multiplier DECIMAL(3,2) DEFAULT 1.0,

    -- Stakes
    rider_stake_sats BIGINT,
    driver_stake_sats BIGINT,
    rider_stake_invoice TEXT,
    driver_stake_invoice TEXT,
    rider_stake_status TEXT DEFAULT 'pending',  -- pending, locked, released, forfeited
    driver_stake_status TEXT DEFAULT 'pending',

    -- Timestamps
    requested_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- Metadata
    metadata JSONB,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rides_ride_id ON rides(ride_id);
CREATE INDEX idx_rides_rider_pubkey ON rides(rider_pubkey);
CREATE INDEX idx_rides_driver_pubkey ON rides(driver_pubkey);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_created_at ON rides(created_at DESC);
CREATE INDEX idx_rides_pickup_location ON rides USING GIST(pickup_location);
CREATE INDEX idx_rides_dropoff_location ON rides USING GIST(dropoff_location);

-- =====================================================
-- Payments Table
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id TEXT NOT NULL REFERENCES rides(ride_id),
    payment_type TEXT NOT NULL,  -- stake, fare, tip, refund

    -- Lightning
    invoice TEXT NOT NULL,
    payment_hash TEXT NOT NULL UNIQUE,
    preimage TEXT,
    amount_sats BIGINT NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, confirmed, failed, refunded

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    failed_at TIMESTAMP,

    -- Metadata
    metadata JSONB
);

CREATE INDEX idx_payments_ride_id ON payments(ride_id);
CREATE INDEX idx_payments_payment_hash ON payments(payment_hash);
CREATE INDEX idx_payments_status ON payments(status);

-- =====================================================
-- Reputation Table
-- =====================================================
CREATE TABLE IF NOT EXISTS reputation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pubkey TEXT NOT NULL UNIQUE,
    user_type TEXT NOT NULL,  -- rider, driver

    -- Aggregate Stats
    total_rides INTEGER DEFAULT 0,
    completed_rides INTEGER DEFAULT 0,
    cancelled_rides INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0.0,
    total_ratings INTEGER DEFAULT 0,

    -- Ratings breakdown (1-5 stars)
    rating_1_count INTEGER DEFAULT 0,
    rating_2_count INTEGER DEFAULT 0,
    rating_3_count INTEGER DEFAULT 0,
    rating_4_count INTEGER DEFAULT 0,
    rating_5_count INTEGER DEFAULT 0,

    -- Disputes
    disputes_filed INTEGER DEFAULT 0,
    disputes_resolved_favor INTEGER DEFAULT 0,
    disputes_resolved_against INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_ride_at TIMESTAMP,

    -- Metadata
    metadata JSONB
);

CREATE INDEX idx_reputation_pubkey ON reputation(pubkey);
CREATE INDEX idx_reputation_user_type ON reputation(user_type);
CREATE INDEX idx_reputation_average_rating ON reputation(average_rating DESC);

-- =====================================================
-- Ratings Table (Individual)
-- =====================================================
CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id TEXT NOT NULL REFERENCES rides(ride_id),
    rater_pubkey TEXT NOT NULL,
    rated_pubkey TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    categories JSONB,  -- {cleanliness: 5, communication: 4, ...}

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(ride_id, rater_pubkey, rated_pubkey)
);

CREATE INDEX idx_ratings_ride_id ON ratings(ride_id);
CREATE INDEX idx_ratings_rated_pubkey ON ratings(rated_pubkey);
CREATE INDEX idx_ratings_rating ON ratings(rating DESC);

-- =====================================================
-- Disputes Table
-- =====================================================
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id TEXT NOT NULL UNIQUE,  -- Nostr event d tag
    ride_id TEXT NOT NULL REFERENCES rides(ride_id),

    -- Parties
    complainant_pubkey TEXT NOT NULL,
    accused_pubkey TEXT NOT NULL,
    arbiter_pubkey TEXT,

    -- Dispute details
    reason TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence JSONB,  -- URLs to photos, GPS traces, etc.

    -- Status
    status TEXT NOT NULL DEFAULT 'filed',  -- filed, assigned, under_review, resolved
    resolution TEXT,
    resolution_reason TEXT,

    -- Amounts
    disputed_amount_sats BIGINT,
    awarded_to_complainant_sats BIGINT,
    awarded_to_accused_sats BIGINT,

    -- Timestamps
    filed_at TIMESTAMP DEFAULT NOW(),
    assigned_at TIMESTAMP,
    resolved_at TIMESTAMP,

    -- Metadata
    metadata JSONB,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_disputes_dispute_id ON disputes(dispute_id);
CREATE INDEX idx_disputes_ride_id ON disputes(ride_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_complainant ON disputes(complainant_pubkey);
CREATE INDEX idx_disputes_accused ON disputes(accused_pubkey);
CREATE INDEX idx_disputes_arbiter ON disputes(arbiter_pubkey);

-- =====================================================
-- Location Updates Table (Real-Time Tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS location_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id TEXT NOT NULL REFERENCES rides(ride_id),
    pubkey TEXT NOT NULL,  -- driver or rider

    -- Location
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    accuracy DECIMAL(6,2),
    altitude DECIMAL(8,2),
    heading INTEGER,  -- 0-359 degrees
    speed DECIMAL(6,2),  -- m/s

    -- ETA
    eta_seconds INTEGER,
    distance_remaining_meters INTEGER,

    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Metadata
    metadata JSONB
);

CREATE INDEX idx_location_updates_ride_id ON location_updates(ride_id);
CREATE INDEX idx_location_updates_timestamp ON location_updates(timestamp DESC);
CREATE INDEX idx_location_updates_location ON location_updates USING GIST(location);

-- Partition location_updates by month for performance
-- (Optional: Enable if storing high volume of location data)
-- CREATE TABLE location_updates_YYYY_MM PARTITION OF location_updates
--   FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');

-- =====================================================
-- Events Log Table (Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS events_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,  -- ride_request, ride_accept, payment, etc.
    ride_id TEXT,
    pubkey TEXT,

    -- Event data
    event_data JSONB NOT NULL,

    -- Nostr event details (if applicable)
    nostr_event_id TEXT,
    nostr_event_kind INTEGER,

    timestamp TIMESTAMP DEFAULT NOW(),

    -- Metadata
    metadata JSONB
);

CREATE INDEX idx_events_log_event_type ON events_log(event_type);
CREATE INDEX idx_events_log_ride_id ON events_log(ride_id);
CREATE INDEX idx_events_log_pubkey ON events_log(pubkey);
CREATE INDEX idx_events_log_timestamp ON events_log(timestamp DESC);

-- =====================================================
-- Views
-- =====================================================

-- Active rides view
CREATE OR REPLACE VIEW active_rides AS
SELECT
    r.*,
    o.lightning_address as operator_lightning,
    o.fee_percent
FROM rides r
JOIN operators o ON r.operator_pubkey = o.pubkey
WHERE r.status IN ('requested', 'accepted', 'confirmed', 'started')
ORDER BY r.created_at DESC;

-- Operator stats view
CREATE OR REPLACE VIEW operator_stats AS
SELECT
    o.pubkey,
    o.lightning_address,
    o.fee_percent,
    COUNT(DISTINCT r.id) as total_rides,
    COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) as completed_rides,
    COUNT(DISTINCT CASE WHEN r.status IN ('requested', 'accepted', 'confirmed', 'started') THEN r.id END) as active_rides,
    SUM(CASE WHEN r.status = 'completed' THEN r.final_fare_sats ELSE 0 END) as total_revenue_sats,
    SUM(CASE WHEN r.status = 'completed' THEN r.final_fare_sats * o.fee_percent ELSE 0 END) as total_fees_earned_sats,
    o.created_at as operator_since,
    o.last_seen
FROM operators o
LEFT JOIN rides r ON o.pubkey = r.operator_pubkey
GROUP BY o.pubkey, o.lightning_address, o.fee_percent, o.created_at, o.last_seen;

-- =====================================================
-- Functions
-- =====================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reputation_updated_at BEFORE UPDATE ON reputation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update reputation when rating is added
CREATE OR REPLACE FUNCTION update_reputation_on_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- Update reputation stats
    INSERT INTO reputation (pubkey, user_type, total_ratings, average_rating, rating_1_count, rating_2_count, rating_3_count, rating_4_count, rating_5_count)
    VALUES (
        NEW.rated_pubkey,
        'unknown',  -- Will be updated by application logic
        1,
        NEW.rating,
        CASE WHEN NEW.rating = 1 THEN 1 ELSE 0 END,
        CASE WHEN NEW.rating = 2 THEN 1 ELSE 0 END,
        CASE WHEN NEW.rating = 3 THEN 1 ELSE 0 END,
        CASE WHEN NEW.rating = 4 THEN 1 ELSE 0 END,
        CASE WHEN NEW.rating = 5 THEN 1 ELSE 0 END
    )
    ON CONFLICT (pubkey) DO UPDATE SET
        total_ratings = reputation.total_ratings + 1,
        average_rating = (reputation.average_rating * reputation.total_ratings + NEW.rating) / (reputation.total_ratings + 1),
        rating_1_count = reputation.rating_1_count + CASE WHEN NEW.rating = 1 THEN 1 ELSE 0 END,
        rating_2_count = reputation.rating_2_count + CASE WHEN NEW.rating = 2 THEN 1 ELSE 0 END,
        rating_3_count = reputation.rating_3_count + CASE WHEN NEW.rating = 3 THEN 1 ELSE 0 END,
        rating_4_count = reputation.rating_4_count + CASE WHEN NEW.rating = 4 THEN 1 ELSE 0 END,
        rating_5_count = reputation.rating_5_count + CASE WHEN NEW.rating = 5 THEN 1 ELSE 0 END,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reputation_on_rating_trigger
    AFTER INSERT ON ratings
    FOR EACH ROW EXECUTE FUNCTION update_reputation_on_rating();

-- =====================================================
-- Seed Data (Development Only)
-- =====================================================

-- Insert test operator (only in development)
-- INSERT INTO operators (pubkey, lightning_address, fee_percent, bond_amount, bond_status)
-- VALUES ('npub1test...', 'test@getalby.com', 0.005, 1000000, 'confirmed')
-- ON CONFLICT DO NOTHING;

-- =====================================================
-- Grants
-- =====================================================

-- Grant permissions to application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO donkey;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO donkey;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO donkey;

-- =====================================================
-- Analytics & Maintenance
-- =====================================================

-- Vacuum and analyze tables regularly (handled by pg_cron or external scheduler)
-- VACUUM ANALYZE rides;
-- VACUUM ANALYZE payments;
-- VACUUM ANALYZE location_updates;

-- =====================================================
-- Completion
-- =====================================================

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'DonkeyRide database schema initialized successfully';
    RAISE NOTICE 'Tables created: operators, rides, payments, reputation, ratings, disputes, location_updates, events_log';
    RAISE NOTICE 'Views created: active_rides, operator_stats';
    RAISE NOTICE 'Triggers created: updated_at, reputation_on_rating';
END $$;
