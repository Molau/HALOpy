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
    
    -- Observer and object (EXACT Python field names with quotes for case-sensitivity)
    "KK" SMALLINT NOT NULL,                  -- Observer number (01-99)
    "O" SMALLINT NOT NULL,                   -- Object: 1=Sun, 2=Moon, 3=Planet, 4=Star, 5=Earthbound
    
    -- Date (JJ,MM,TT)
    "JJ" SMALLINT NOT NULL,                  -- Year (2-digit: 00-99)
    "MM" SMALLINT NOT NULL,                  -- Month (01-12)
    "TT" SMALLINT NOT NULL,                  -- Day (01-31)
    "g" SMALLINT NOT NULL DEFAULT 0,         -- Location: 0=primary, 1=other, 2=secondary
    
    -- Time (ZZZZ = ZS + ZM)
    "ZS" SMALLINT DEFAULT -1,                -- Hour (00-23, -1=not specified)
    "ZM" SMALLINT DEFAULT -1,                -- Minute (00-59, -1=not specified)
    
    -- Origin/Density (d)
    "d" SMALLINT DEFAULT -1,                 -- 0-7: cirrus type/origin, -1=not observed, -2=no cirrus (/)
    
    -- Duration and conditions (DD,N,C,c)
    "DD" SMALLINT DEFAULT -1,                -- Duration in 10-minute units (00-99, -1=not specified)
    "N" SMALLINT DEFAULT -1,                 -- Cloud cover (0-10, -1=not observed)
    "C" SMALLINT DEFAULT -1,                 -- UPPER cloud AFTER (0-10, -1=not observed)
    "c" SMALLINT DEFAULT -1,                 -- lower cloud AFTER (0-10, -1=not observed)
    
    -- Halo properties (EE,H,F,V)
    "EE" SMALLINT NOT NULL,                  -- Halo type (1-99)
    "H" SMALLINT DEFAULT -1,                 -- Brightness (-1 to 3, -1=not observed)
    "F" SMALLINT DEFAULT -1,                 -- Color (0-5, -1=not observed)
    "V" SMALLINT DEFAULT -1,                 -- Completeness (1-2, -1=not observed)
    
    -- Additional properties (f,zz,GG)
    "f" SMALLINT DEFAULT -1,                 -- Weather front (0-5, -1=not observed)
    "zz" SMALLINT DEFAULT -1,                -- Precipitation (0-15, -1=not observed)
    "GG" SMALLINT NOT NULL,                  -- Geographic region (1-39)
    
    -- Light pillar heights and text fields (lowercase, not part of HALO key)
    pillar VARCHAR(5) DEFAULT '',            -- Combined upper/lower light pillar (format: 8HH HH)
    sectors VARCHAR(15) DEFAULT '',          -- Sector notation (max 15 chars)
    remarks VARCHAR(60) DEFAULT '',          -- Observation remarks (max 60 chars)
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: observation key (KK,O,JJ,MM,TT,g,ZS,ZM,EE,GG)
    CONSTRAINT observations_unique_key UNIQUE ("KK", "O", "JJ", "MM", "TT", "g", "ZS", "ZM", "EE", "GG")
);

-- Indexes for observations (based on common query patterns)
CREATE INDEX idx_observations_kk ON observations("KK");
CREATE INDEX idx_observations_date ON observations("JJ", "MM", "TT");
CREATE INDEX idx_observations_kk_date ON observations("KK", "JJ", "MM");
CREATE INDEX idx_observations_halo_type ON observations("EE");
CREATE INDEX idx_observations_region ON observations("GG");
CREATE INDEX idx_observations_object ON observations("O");
CREATE INDEX idx_observations_composite_key ON observations("KK", "O", "JJ", "MM", "TT", "EE", "GG");

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
-- Solar Altitude Calculation Functions
-- ============================================================================
-- These functions calculate the sun's elevation above the horizon for a given
-- observation. They are identical to the Python calculate_solar_altitude() function
-- and are used for analysis queries (e.g., grouping by solar altitude).

-- Helper function: Calculate altitude at a specific time
CREATE OR REPLACE FUNCTION calc_altitude_at_time(
    p_zeit NUMERIC,
    p_jahr INTEGER,
    p_month INTEGER,
    p_day INTEGER,
    p_longitude NUMERIC,
    p_latitude NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
    v_zeit NUMERIC;
    v_n NUMERIC;
    v_t NUMERIC;
    v_m NUMERIC;
    v_l NUMERIC;
    v_al NUMERIC;
    v_de NUMERIC;
    v_jd NUMERIC;
    v_t2 NUMERIC;
    v_st0 NUMERIC;
    v_st NUMERIC;
    v_sw NUMERIC;
    v_altitude_rad NUMERIC;
BEGIN
    -- Normalize time to 0-24 hours
    v_zeit := p_zeit - FLOOR(p_zeit / 24.0) * 24.0;
    
    -- Calculate day of year
    v_n := FLOOR(275.0 / 9.0 * p_month) - 
           FLOOR((p_month + 9.0) / 12.0) * 
           (1 + FLOOR((p_jahr - 4.0 * FLOOR(p_jahr / 4.0) + 2.0) / 3.0)) + 
           p_day - 30;
    
    v_t := v_n + (v_zeit - p_longitude / 15.0) / 24.0;
    v_m := 0.985600 * v_t - 3.289;
    v_l := v_m + 1.916 * SIN(RADIANS(v_m)) + 0.020 * SIN(RADIANS(2 * v_m)) + 282.634;
    v_l := v_l - FLOOR(v_l / 360.0) * 360.0;  -- Modulo 360
    
    v_al := DEGREES(ATAN(0.91746 * SIN(RADIANS(v_l)) / COS(RADIANS(v_l))));
    IF v_l > 90 AND v_l < 270 THEN
        v_al := v_al + 180;
    END IF;
    
    v_de := DEGREES(ASIN(0.39782 * SIN(RADIANS(v_l))));
    
    -- Julian date calculation
    IF p_month > 2 THEN
        v_jd := FLOOR(30.6001 * (p_month + 1)) + FLOOR(365.25 * p_jahr);
    ELSE
        v_jd := FLOOR(30.6001 * (p_month + 13)) + FLOOR(365.25 * (p_jahr - 1));
    END IF;
    v_jd := v_jd + 1720994.5 + 2 - FLOOR(p_jahr / 100.0) + FLOOR(p_jahr / 400.0) + p_day + v_zeit / 24.0;
    
    v_t2 := (v_jd - 2451545.0) / 36525.0;
    v_st0 := 6.697375 + 2400.051337 * v_t2 + 0.0000359 * v_t2 * v_t2;
    v_st := v_st0 + p_longitude / 15.0 + 1.002737909 * (v_zeit - 1);
    v_sw := (15.0 * v_st - v_al) - FLOOR((15.0 * v_st - v_al) / 360.0) * 360.0;  -- Modulo 360
    
    v_altitude_rad := ASIN(
        SIN(RADIANS(p_latitude)) * SIN(RADIANS(v_de)) +
        COS(RADIANS(v_sw)) * COS(RADIANS(v_de)) * COS(RADIANS(p_latitude))
    );
    
    RETURN DEGREES(v_altitude_rad);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Main function: Calculate solar altitude for an observation
-- Parameters match PostgreSQL's type inference for literals (INTEGER for numbers, VARCHAR for strings)
-- Parameters:
--   p_jj: Year (2-digit: 00-99, where <50 = 20xx, >=50 = 19xx)
--   p_mm: Month (1-12)
--   p_tt: Day (1-31)
--   p_zs: Hour (0-23)
--   p_zm: Minute (0-59)
--   p_dd: Duration in 10-minute units (e.g., 6 = 60 minutes)
--   p_lon_deg: Longitude degrees (0-180)
--   p_lon_min: Longitude minutes (0-59)
--   p_lon_dir: Longitude direction ('O' for East, 'W' for West)
--   p_lat_deg: Latitude degrees (0-90)
--   p_lat_min: Latitude minutes (0-59)
--   p_lat_dir: Latitude direction ('N' for North, 'S' for South)
--   p_altitude_type: Calculation method ('mean', 'min', or 'max')
-- Returns:
--   Solar altitude in degrees (integer), rounded
CREATE OR REPLACE FUNCTION calculate_solar_altitude(
    p_jj INTEGER,
    p_mm INTEGER,
    p_tt INTEGER,
    p_zs INTEGER,
    p_zm INTEGER,
    p_dd INTEGER,
    p_lon_deg INTEGER,
    p_lon_min INTEGER,
    p_lon_dir VARCHAR,
    p_lat_deg INTEGER,
    p_lat_min INTEGER,
    p_lat_dir VARCHAR,
    p_altitude_type VARCHAR DEFAULT 'mean'
)
RETURNS INTEGER AS $$
DECLARE
    v_jahr INTEGER;
    v_longitude NUMERIC;
    v_latitude NUMERIC;
    v_duration_minutes INTEGER;
    v_time_start NUMERIC;
    v_time_mid NUMERIC;
    v_time_end NUMERIC;
    v_altitude_start NUMERIC;
    v_altitude_mid NUMERIC;
    v_altitude_end NUMERIC;
    v_altitude_deg NUMERIC;
BEGIN
    -- Convert 2-digit year to 4-digit year
    -- Year < 50 = 20xx, Year >= 50 = 19xx
    IF p_jj < 50 THEN
        v_jahr := 2000 + p_jj;
    ELSE
        v_jahr := 1900 + p_jj;
    END IF;
    
    -- Convert longitude to decimal degrees
    v_longitude := p_lon_deg + p_lon_min / 60.0;
    IF p_lon_dir = 'W' THEN
        v_longitude := -v_longitude;
    END IF;
    
    -- Convert latitude to decimal degrees
    v_latitude := p_lat_deg + p_lat_min / 60.0;
    IF p_lat_dir = 'S' THEN
        v_latitude := -v_latitude;
    END IF;
    
    -- Convert duration from 10-minute units to minutes
    v_duration_minutes := COALESCE(p_dd, 0) * 10;
    
    -- Calculate time start
    v_time_start := p_zs + p_zm / 60.0;
    
    -- Calculate altitude based on type
    IF p_altitude_type = 'mean' THEN
        -- Mean altitude: calculate at mid-point of observation
        v_time_mid := v_time_start + v_duration_minutes / 120.0;
        v_altitude_deg := calc_altitude_at_time(v_time_mid, v_jahr, p_mm, p_tt, v_longitude, v_latitude);
    ELSE
        -- Min or Max: calculate at start and end, then take min/max
        v_altitude_start := calc_altitude_at_time(v_time_start, v_jahr, p_mm, p_tt, v_longitude, v_latitude);
        v_time_end := v_time_start + v_duration_minutes / 60.0;
        v_altitude_end := calc_altitude_at_time(v_time_end, v_jahr, p_mm, p_tt, v_longitude, v_latitude);
        
        IF p_altitude_type = 'min' THEN
            v_altitude_deg := LEAST(v_altitude_start, v_altitude_end);
        ELSE  -- 'max'
            v_altitude_deg := GREATEST(v_altitude_start, v_altitude_end);
        END IF;
    END IF;
    
    RETURN ROUND(v_altitude_deg);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example usage:
-- SELECT calculate_solar_altitude(88, 1, 15, 12, 30, 6, 11, 34, 'O', 48, 8, 'N', 'mean');
-- This calculates the mean solar altitude for an observation on 1988-01-15 at 12:30 CET
-- for 60 minutes duration at location 11°34'E, 48°8'N

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

-- Import observations - CSV columns map 1:1 to DB columns (exact names)
-- CSV: KK,O,JJ,MM,TT,g,ZS,ZM,d,DD,N,C,c,EE,H,F,V,f,zz,GG,8HHHH,sectors,remarks
-- DB:  "KK","O","JJ","MM","TT","g","ZS","ZM","d","DD","N","C","c","EE","H","F","V","f","zz","GG",pillar,sectors,remarks
-- NO MAPPING NEEDED - Python names == DB names!
\COPY observations("KK","O","JJ","MM","TT","g","ZS","ZM","d","DD","N","C","c","EE","H","F","V","f","zz","GG",pillar,sectors,remarks) FROM '/home/ubuntu/halopy/data/1986-2025.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '');

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
