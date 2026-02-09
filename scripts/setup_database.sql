-- ============================================================================
-- HALO Database Setup Script for PostgreSQL
-- ============================================================================
-- This script creates the database and tables for HALO observation data
-- Compatible with existing CSV files: halobeo.csv (observers) and observations.csv
-- Run as PostgreSQL superuser or database owner
-- ============================================================================

-- Create database
CREATE DATABASE halodb;

-- Connect to the database
\c halodb

-- ============================================================================
-- Observers Table (halobeo.csv)
-- ============================================================================
-- Format: KK,VName,NName,seit,active,HbOrt,GH,GradH,MinH,RichtungH,BreiteH,RichtungbH,NbOrt,GN,GradN,MinN,RichtungN,BreiteN,RichtungbN
-- Multiple records per observer with validity dates (seit field)

DROP TABLE IF EXISTS observers CASCADE;

CREATE TABLE observers (
    -- Observer identification
    kk SMALLINT NOT NULL,                    -- Observer number (01-99)
    first_name VARCHAR(20) NOT NULL,         -- First name
    last_name VARCHAR(20) NOT NULL,          -- Last name
    
    -- Validity period (format: MM/YY, e.g., "01/19")
    since VARCHAR(5) NOT NULL,               -- Valid since date in MM/YY format
    
    -- Active status
    active SMALLINT NOT NULL DEFAULT 1,      -- 0=inactive, 1=active
    
    -- Primary observing site
    primary_site VARCHAR(50),                -- Primary site name
    primary_region SMALLINT,                 -- Region code for primary site (1-39)
    primary_lon_deg SMALLINT,                -- Longitude degrees (primary)
    primary_lon_min SMALLINT,                -- Longitude minutes (primary)
    primary_lon_dir CHAR(1),                 -- Longitude direction E/W (primary)
    primary_lat_deg SMALLINT,                -- Latitude degrees (primary)
    primary_lat_min SMALLINT,                -- Latitude minutes (primary)
    primary_lat_dir CHAR(1),                 -- Latitude direction N/S (primary)
    
    -- Secondary observing site
    secondary_site VARCHAR(50),              -- Secondary site name
    secondary_region SMALLINT,               -- Region code for secondary site (1-39)
    secondary_lon_deg SMALLINT,              -- Longitude degrees (secondary)
    secondary_lon_min SMALLINT,              -- Longitude minutes (secondary)
    secondary_lon_dir CHAR(1),               -- Longitude direction E/W (secondary)
    secondary_lat_deg SMALLINT,              -- Latitude degrees (secondary)
    secondary_lat_min SMALLINT,              -- Latitude minutes (secondary)
    secondary_lat_dir CHAR(1),               -- Latitude direction N/S (secondary)
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite key: observer + validity date
    PRIMARY KEY (kk, since)
);

-- Indexes for observers
CREATE INDEX idx_observers_kk ON observers(kk);
CREATE INDEX idx_observers_active ON observers(active);
CREATE INDEX idx_observers_since ON observers(kk, since);

-- ============================================================================
-- Observations Table (observations CSV files)
-- ============================================================================
-- Format: KK,O,JJ,MM,TT,g,ZS,ZM,d,DD,N,C,c,EE,H,F,V,f,zz,GG,8HHHH,sectors,remarks
-- HALO Key: KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH Sektoren Bemerkungen

DROP TABLE IF EXISTS observations CASCADE;

CREATE TABLE observations (
    -- Observation ID (auto-generated)
    id SERIAL PRIMARY KEY,
    
    -- Observer and object
    kk SMALLINT NOT NULL,                    -- Observer number (01-99)
    o SMALLINT NOT NULL,                     -- Object: 1=Sun, 2=Moon, 3=Planet, 4=Star, 5=Earthbound
    
    -- Date (JJ,MM,TT)
    jj SMALLINT NOT NULL,                    -- Year (2-digit: 00-99)
    mm SMALLINT NOT NULL,                    -- Month (01-12)
    tt SMALLINT NOT NULL,                    -- Day (01-31)
    g SMALLINT NOT NULL DEFAULT 0,           -- Location: 0=primary, 1=other, 2=secondary
    
    -- Time (ZZZZ = ZS + ZM)
    zs SMALLINT DEFAULT -1,                  -- Hour (00-23, -1=not specified)
    zm SMALLINT DEFAULT -1,                  -- Minute (00-59, -1=not specified)
    
    -- Origin/Density (d)
    d SMALLINT DEFAULT -1,                   -- 0-7: cirrus type/origin, -1=not observed, -2=no cirrus (/)
    
    -- Duration and conditions (DD,N,C,c)
    dd SMALLINT DEFAULT -1,                  -- Duration in 10-minute units (00-99, -1=not specified)
    n SMALLINT DEFAULT -1,                   -- Cloud cover (0-10, -1=not observed)
    c SMALLINT DEFAULT -1,                   -- Cirrus type (0-10, -1=not observed)
    cc SMALLINT DEFAULT -1,                  -- Low clouds after (0-10, -1=not observed)
    
    -- Halo properties (EE,H,F,V)
    ee SMALLINT NOT NULL,                    -- Halo type (1-99)
    h SMALLINT DEFAULT -1,                   -- Brightness (-1 to 3, -1=not observed)
    f SMALLINT DEFAULT -1,                   -- Color (0-5, -1=not observed)
    v SMALLINT DEFAULT -1,                   -- Completeness (1-2, -1=not observed)
    
    -- Additional properties (f,zz,GG)
    ff SMALLINT DEFAULT -1,                  -- Weather front (0-5, -1=not observed)
    zz SMALLINT DEFAULT -1,                  -- Precipitation (0-15, -1=not observed)
    gg SMALLINT NOT NULL,                    -- Geographic region (1-39)
    
    -- Light pillar heights (8HHHH field - stored as-is from CSV, e.g., "815//", "1////")
    pillar VARCHAR(5) DEFAULT '',            -- Combined upper/lower light pillar (format: 8HH HH)
    
    -- Sectors and remarks
    sectors VARCHAR(15) DEFAULT '',          -- Sector notation (max 15 chars)
    remarks VARCHAR(60) DEFAULT '',          -- Observation remarks (max 60 chars)
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: observation key (KK,O,JJ,MM,TT,g,ZS,ZM,EE,GG) - includes location and time
    CONSTRAINT observations_unique_key UNIQUE (kk, o, jj, mm, tt, g, zs, zm, ee, gg)
);

-- Indexes for observations (based on common query patterns)
CREATE INDEX idx_observations_kk ON observations(kk);
CREATE INDEX idx_observations_date ON observations(jj, mm, tt);
CREATE INDEX idx_observations_kk_date ON observations(kk, jj, mm);
CREATE INDEX idx_observations_halo_type ON observations(ee);
CREATE INDEX idx_observations_region ON observations(gg);
CREATE INDEX idx_observations_object ON observations(o);
CREATE INDEX idx_observations_composite_key ON observations(kk, o, jj, mm, tt, ee, gg);

-- Foreign key constraint (optional - can be enabled if referential integrity needed)
-- ALTER TABLE observations ADD CONSTRAINT fk_observations_observer 
--     FOREIGN KEY (kk) REFERENCES observers(kk) ON DELETE RESTRICT;

-- ============================================================================
-- Trigger for updating updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_observers_updated_at BEFORE UPDATE ON observers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_observations_updated_at BEFORE UPDATE ON observations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Grant permissions (adjust as needed for your user)
-- ============================================================================
-- Example: GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO halo_user;
-- Example: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO halo_user;

-- ============================================================================
-- CSV Import Commands
-- ============================================================================
-- After creating the tables, import CSV data using these commands:

-- Import observers (halobeo.csv):
-- \COPY observers(kk,first_name,last_name,since,active,primary_site,primary_region,primary_lon_deg,primary_lon_min,primary_lon_dir,primary_lat_deg,primary_lat_min,primary_lat_dir,secondary_site,secondary_region,secondary_lon_deg,secondary_lon_min,secondary_lon_dir,secondary_lat_deg,secondary_lat_min,secondary_lat_dir) FROM '/home/ubuntu/halopy/halobeo.csv' WITH (FORMAT csv, DELIMITER ',', NULL '');

-- Import observations (adjust field mapping based on your CSV structure):
-- \COPY observations(kk,o,jj,mm,tt,g,zs,zm,d,dd,n,c,cc,ee,h,f,v,ff,zz,gg,pillar,sectors,remarks) FROM '/home/ubuntu/halopy/observations.csv' WITH (FORMAT csv, DELIMITER ',', NULL '');

-- Note: For fields containing empty strings or special values:
-- - Use sed/awk to convert empty fields to NULL in CSV before import
-- - Or use a custom import script with proper NULL handling

-- ============================================================================
-- Database Statistics and Maintenance
-- ============================================================================

-- Analyze tables after import for query optimization
-- ANALYZE observers;
-- ANALYZE observations;

-- Vacuum tables to reclaim space
-- VACUUM ANALYZE observers;
-- VACUUM ANALYZE observations;

-- ============================================================================
-- End of setup script
-- ============================================================================
