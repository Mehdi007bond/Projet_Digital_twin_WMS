-- ═══════════════════════════════════════════════════════════════════════════
-- Digital Twin WMS - Comprehensive Seed Data (CORRECTED)
-- Creates: Zones, Racks, Locations, Stock Items, Tasks
-- ═══════════════════════════════════════════════════════════════════════════

-- INSERT ZONES
WITH wh AS (SELECT id FROM warehouses WHERE name = 'Main Warehouse' LIMIT 1)
INSERT INTO zones (warehouse_id, name, zone_type, x_m, z_m, width_m, depth_m, color_hex)
SELECT w.id, name, zone_type, x_m, z_m, width_m, depth_m, color 
FROM wh as w,
(VALUES
    ('Storage Zone A', 'storage', 0::numeric, 0::numeric, 50::numeric, 30::numeric, '#4CAF50'),
    ('Storage Zone B', 'storage', 50::numeric, 0::numeric, 50::numeric, 30::numeric, '#66BB6A'),
    ('Shipping Dock', 'shipping', 0::numeric, 30::numeric, 50::numeric, 10::numeric, '#2196F3'),
    ('Receiving Dock', 'receiving', 50::numeric, 30::numeric, 50::numeric, 10::numeric, '#FF9800')
) AS zones(name, zone_type, x_m, z_m, width_m, depth_m, color);

-- INSERT RACKS (16 racks distributed across warehouse)
WITH wh AS (SELECT id FROM warehouses WHERE name = 'Main Warehouse' LIMIT 1)
INSERT INTO racks (warehouse_id, rack_code, row_no, bay_no, x_m, z_m)
SELECT wh.id, rack_code, row_no, bay_no, x_m, z_m
FROM wh,
LATERAL (
    SELECT 
        'RACK-' || chr(65 + r) || b::text as rack_code,
        r as row_no,
        b as bay_no,
        5 + (r * 12)::numeric as x_m,
        2 + (b * 8)::numeric as z_m
    FROM generate_series(0, 3) r, generate_series(0, 3) b
) racks;

-- INSERT LOCATIONS (320 locations: 16 racks × 4 levels × 5 slots)
WITH rack_list AS (
    SELECT id, rack_code, row_no, bay_no, x_m, z_m 
    FROM racks 
    WHERE warehouse_id = (SELECT id FROM warehouses WHERE name = 'Main Warehouse')
)
INSERT INTO locations (id, rack_id, row_no, bay_no, level_no, x_m, y_m, z_m, occupied)
SELECT
    rack.rack_code || '-' || lpad((level * 10 + slot)::text, 2, '0'),
    rack.id,
    rack.row_no,
    rack.bay_no,
    level,
    rack.x_m + (slot::numeric * 0.6),
    (0.5 + (level::numeric * 1.5)),
    rack.z_m,
    (random() > 0.4)::boolean
FROM rack_list rack,
LATERAL generate_series(1, 4) level,
LATERAL generate_series(1, 5) slot;

-- INSERT STOCK ITEMS (random items in occupied locations)
WITH occupied_locs AS (
    SELECT id FROM locations WHERE occupied = true
)
INSERT INTO stock_items (location_id, fill_level, category)
SELECT
    loc.id,
    (25 + (random() * 75))::int,
    CASE (random() * 4)::int
        WHEN 0 THEN 'Electronics'
        WHEN 1 THEN 'Furniture'
        WHEN 2 THEN 'Tools'
        WHEN 3 THEN 'Textiles'
        ELSE 'Industrial'
    END
FROM occupied_locs loc;

-- INSERT TASKS (20 tasks with various statuses)
WITH loc_sample AS (
    SELECT id FROM locations ORDER BY RANDOM() LIMIT 20
),
loc_list AS (
    SELECT ARRAY_AGG(id) as all_locs FROM loc_sample
)
INSERT INTO tasks (id, agv_id, task_type, status, priority, pickup_location_id, dropoff_location_id)
SELECT
    'task-' || lpad(seq::text, 4, '0'),
    CASE (seq % 3) WHEN 0 THEN 'agv-001' WHEN 1 THEN 'agv-002' ELSE 'agv-003' END,
    CASE (seq % 3) WHEN 0 THEN 'inbound' WHEN 1 THEN 'outbound' ELSE 'relocate' END,
    CASE (seq % 4) WHEN 0 THEN 'pending' WHEN 1 THEN 'assigned' WHEN 2 THEN 'in_progress' ELSE 'completed' END,
    (seq % 3),
    (all_locs[((seq - 1) % array_length(all_locs, 1)) + 1]),
    (all_locs[(((seq - 1 + 5) % array_length(all_locs, 1)) + 1)])
FROM generate_series(1, 20) seq, loc_list;

-- UPDATE AGV POSITIONS
UPDATE agvs SET x_m = 20, z_m = 10, rotation_rad = 0, speed_mps = 0 WHERE id = 'agv-001';
UPDATE agvs SET x_m = 50, z_m = 20, rotation_rad = 1.57, speed_mps = 0.5 WHERE id = 'agv-002';
UPDATE agvs SET x_m = 80, z_m = 5, rotation_rad = 3.14, speed_mps = 0 WHERE id = 'agv-003';

-- VERIFICATION: Show data counts
SELECT 
    'Warehouses' as entity, COUNT(*) as count FROM warehouses
UNION ALL SELECT 'Zones', COUNT(*) FROM zones
UNION ALL SELECT 'Racks', COUNT(*) FROM racks
UNION ALL SELECT 'Locations', COUNT(*) FROM locations
UNION ALL SELECT 'Stock Items', COUNT(*) FROM stock_items
UNION ALL SELECT 'AGVs', COUNT(*) FROM agvs
UNION ALL SELECT 'Tasks', COUNT(*) FROM tasks
ORDER BY entity;
