-- Digital Twin WMS - Supabase/PostgreSQL schema
-- Designed from frontend warehouse/rack/AGV structures

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS warehouses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    width_m numeric NOT NULL,
    depth_m numeric NOT NULL,
    height_m numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name text NOT NULL,
    zone_type text NOT NULL,
    x_m numeric NOT NULL,
    z_m numeric NOT NULL,
    width_m numeric NOT NULL,
    depth_m numeric NOT NULL,
    color_hex text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS racks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    rack_code text NOT NULL,
    row_no int NOT NULL,
    bay_no int NOT NULL,
    x_m numeric NOT NULL,
    z_m numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (warehouse_id, rack_code),
    UNIQUE (warehouse_id, row_no, bay_no)
);

CREATE TABLE IF NOT EXISTS locations (
    id text PRIMARY KEY,
    rack_id uuid NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    row_no int NOT NULL,
    bay_no int NOT NULL,
    level_no int NOT NULL,
    x_m numeric NOT NULL,
    y_m numeric NOT NULL,
    z_m numeric NOT NULL,
    occupied boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rack_id, level_no)
);

CREATE TABLE IF NOT EXISTS stock_items (
    id text PRIMARY KEY,
    location_id text NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    fill_level int NOT NULL CHECK (fill_level BETWEEN 0 AND 100),
    category char(1) NOT NULL CHECK (category IN ('A','B','C')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agvs (
    id text PRIMARY KEY,
    x_m numeric NOT NULL,
    y_m numeric NOT NULL,
    z_m numeric NOT NULL,
    rotation_rad numeric NOT NULL DEFAULT 0,
    status text NOT NULL,
    battery numeric NOT NULL CHECK (battery BETWEEN 0 AND 100),
    speed_mps numeric NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS missions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agv_id text REFERENCES agvs(id) ON DELETE SET NULL,
    status text NOT NULL,
    pickup_location_id text REFERENCES locations(id) ON DELETE SET NULL,
    dropoff_location_id text REFERENCES locations(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status text NOT NULL,
    priority int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku text NOT NULL,
    quantity int NOT NULL CHECK (quantity > 0),
    source_location_id text REFERENCES locations(id) ON DELETE SET NULL,
    destination_zone_id uuid REFERENCES zones(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_rack ON locations(rack_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_location ON stock_items(location_id);
CREATE INDEX IF NOT EXISTS idx_agv_status ON agvs(status);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

-- KPIs / pipeline views
CREATE OR REPLACE VIEW v_kpi_stock AS
SELECT
    (SELECT COUNT(*) FROM locations) AS total_locations,
    (SELECT COUNT(*) FROM stock_items) AS filled_locations,
    ROUND(
        CASE WHEN (SELECT COUNT(*) FROM locations) = 0 THEN 0
             ELSE (SELECT COUNT(*) FROM stock_items)::numeric / (SELECT COUNT(*) FROM locations) * 100
        END,
        2
    ) AS fill_rate_percent;

CREATE OR REPLACE VIEW v_kpi_agv AS
SELECT
    COUNT(*) AS total_agvs,
    COUNT(*) FILTER (WHERE status = 'idle') AS idle_agvs,
    COUNT(*) FILTER (WHERE status = 'moving_to_pick' OR status = 'moving_to_drop') AS moving_agvs,
    COUNT(*) FILTER (WHERE status = 'charging') AS charging_agvs,
    ROUND(AVG(battery)::numeric, 2) AS avg_battery
FROM agvs;
