-- ═══════════════════════════════════════════════════════════════════════════
-- Digital Twin WMS - Supabase Schema (PostgreSQL)
-- ✅ Compatible avec Supabase Realtime
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- Warehouses
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    width_m NUMERIC NOT NULL,
    depth_m NUMERIC NOT NULL,
    height_m NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- Zones
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    zone_type TEXT NOT NULL,
    x_m NUMERIC NOT NULL,
    z_m NUMERIC NOT NULL,
    width_m NUMERIC NOT NULL,
    depth_m NUMERIC NOT NULL,
    color_hex TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- Racks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    rack_code TEXT NOT NULL,
    row_no INT NOT NULL,
    bay_no INT NOT NULL,
    x_m NUMERIC NOT NULL,
    z_m NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(warehouse_id, rack_code),
    UNIQUE(warehouse_id, row_no, bay_no)
);

ALTER TABLE racks ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- Locations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    row_no INT NOT NULL,
    bay_no INT NOT NULL,
    level_no INT NOT NULL,
    x_m NUMERIC NOT NULL,
    y_m NUMERIC NOT NULL,
    z_m NUMERIC NOT NULL,
    occupied BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stock Items
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    fill_level INT NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'general',
    sku TEXT,
    product_name TEXT,
    quality_tier TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

-- ✅ Enable Realtime for Stock Items
ALTER PUBLICATION supabase_realtime ADD TABLE stock_items;

-- ═══════════════════════════════════════════════════════════════════════════
-- AGVs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agvs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    x_m NUMERIC NOT NULL DEFAULT 0,
    y_m NUMERIC NOT NULL DEFAULT 0,
    z_m NUMERIC NOT NULL DEFAULT 0,
    rotation_rad NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'idle',
    battery NUMERIC NOT NULL DEFAULT 100,
    speed_mps NUMERIC NOT NULL DEFAULT 0,
    current_task_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agvs ENABLE ROW LEVEL SECURITY;

-- ✅ Enable Realtime for AGVs
ALTER PUBLICATION supabase_realtime ADD TABLE agvs;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tasks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    agv_id TEXT REFERENCES agvs(id) ON DELETE SET NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 1,
    pickup_location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
    dropoff_location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ✅ Enable Realtime for Tasks
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- ═══════════════════════════════════════════════════════════════════════════
-- Views for KPI Data
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_kpi_stock AS
SELECT
    COUNT(DISTINCT si.id) as total_items,
    COUNT(DISTINCT CASE WHEN si.fill_level > 0 THEN si.id END) as filled_items,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN si.fill_level > 0 THEN si.id END) / NULLIF(COUNT(DISTINCT si.id), 0), 2) as fill_rate_percent,
    ROUND(AVG(si.fill_level), 2) as avg_fill_level,
    COUNT(DISTINCT si.category) as unique_categories,
    99.2 as accuracy_percent,
    12.5 as inventory_rotation
FROM stock_items si;

-- ✅ Note: Views receive realtime updates through underlying tables (stock_items is published)

CREATE OR REPLACE VIEW v_kpi_agv AS
SELECT
    COUNT(DISTINCT a.id) as total_agvs,
    COUNT(DISTINCT CASE WHEN a.status = 'idle' THEN a.id END) as idle_agvs,
    COUNT(DISTINCT CASE WHEN a.status = 'moving' THEN a.id END) as moving_agvs,
    COUNT(DISTINCT CASE WHEN a.status = 'charging' THEN a.id END) as charging_agvs,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.status IN ('moving', 'collecting', 'delivering') THEN a.id END) / NULLIF(COUNT(DISTINCT a.id), 0), 2) as utilization_percent,
    ROUND(AVG(a.battery), 2) as avg_battery,
    24 as missions_per_hour
FROM agvs a;

-- ✅ Note: Views receive realtime updates through underlying tables (agvs is published)

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Policies (Allow public read for demo)
-- ═══════════════════════════════════════════════════════════════════════════

-- Warehouses: Allow public select
CREATE POLICY "Allow public read warehouses" ON warehouses
    FOR SELECT USING (true);

-- Zones: Allow public select
CREATE POLICY "Allow public read zones" ON zones
    FOR SELECT USING (true);

-- Racks: Allow public select
CREATE POLICY "Allow public read racks" ON racks
    FOR SELECT USING (true);

-- Locations: Allow public select
CREATE POLICY "Allow public read locations" ON locations
    FOR SELECT USING (true);

-- Stock Items: Allow public read and insert (for real-time updates)
CREATE POLICY "Allow public read stock_items" ON stock_items
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert stock_items" ON stock_items
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update stock_items" ON stock_items
    FOR UPDATE USING (true);

-- AGVs: Allow public read and update (for real-time position updates)
CREATE POLICY "Allow public read agvs" ON agvs
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert agvs" ON agvs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update agvs" ON agvs
    FOR UPDATE USING (true);

-- Tasks: Allow public select, insert, update
CREATE POLICY "Allow public read tasks" ON tasks
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert tasks" ON tasks
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update tasks" ON tasks
    FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- Sample Data (optional)
-- ═══════════════════════════════════════════════════════════════════════════

-- Sample Warehouse
INSERT INTO warehouses (name, width_m, depth_m, height_m)
VALUES ('Main Warehouse', 100, 50, 10)
ON CONFLICT DO NOTHING;

-- Sample AGVs
INSERT INTO agvs (id, name, status, battery)
VALUES 
    ('agv-001', 'AGV-001', 'idle', 85),
    ('agv-002', 'AGV-002', 'moving', 62),
    ('agv-003', 'AGV-003', 'charging', 45)
ON CONFLICT DO NOTHING;
