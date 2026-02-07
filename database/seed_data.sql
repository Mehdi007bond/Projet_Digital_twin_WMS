-- Digital Twin WMS - Seed data

WITH w AS (
    INSERT INTO warehouses (name, width_m, depth_m, height_m)
    VALUES ('Main Warehouse', 50, 30, 10)
    RETURNING id
),
zone_data AS (
    SELECT
        w.id AS warehouse_id,
        v.name,
        v.zone_type,
        v.x_m,
        v.z_m,
        v.width_m,
        v.depth_m,
        v.color_hex
    FROM w
    CROSS JOIN (VALUES
        ('Reception', 'reception', 0, -10, 50, 8, '#90ee90'),
        ('Storage', 'storage', 0, 0, 50, 14, '#808080'),
        ('Expedition', 'expedition', 0, 10, 50, 8, '#87ceeb'),
        ('Charging', 'charging', -20, -10, 8, 8, '#ffcc00')
    ) AS v(name, zone_type, x_m, z_m, width_m, depth_m, color_hex)
)
INSERT INTO zones (warehouse_id, name, zone_type, x_m, z_m, width_m, depth_m, color_hex)
SELECT * FROM zone_data;

WITH w AS (
    SELECT id FROM warehouses ORDER BY created_at DESC LIMIT 1
),
params AS (
    SELECT
        w.id AS warehouse_id,
        r AS row_no,
        b AS bay_no,
        (b - 3) * 2.7 AS x_m,
        (r - 2) * 4.5 AS z_m,
        (chr(64 + r) || b::text) AS rack_code
    FROM w
    CROSS JOIN generate_series(1, 3) AS r
    CROSS JOIN generate_series(1, 5) AS b
)
INSERT INTO racks (warehouse_id, rack_code, row_no, bay_no, x_m, z_m)
SELECT warehouse_id, rack_code, row_no, bay_no, x_m, z_m
FROM params
ORDER BY row_no, bay_no;

WITH rack_list AS (
    SELECT id AS rack_id, row_no, bay_no, x_m, z_m
    FROM racks
    ORDER BY row_no, bay_no
),
levels AS (
    SELECT generate_series(1, 4) AS level_no
),
locs AS (
    SELECT
        r.rack_id,
        r.row_no,
        r.bay_no,
        l.level_no,
        r.x_m,
        (0.3 + (l.level_no - 1) * 2.0 + 0.15) AS y_m,
        r.z_m
    FROM rack_list r
    CROSS JOIN levels l
)
INSERT INTO locations (id, rack_id, row_no, bay_no, level_no, x_m, y_m, z_m)
SELECT
    ('R' || row_no || 'B' || bay_no || 'L' || level_no) AS id,
    rack_id, row_no, bay_no, level_no, x_m, y_m, z_m
FROM locs
ORDER BY row_no, bay_no, level_no;

WITH locs AS (
    SELECT * FROM locations
),
selected AS (
    SELECT *
    FROM locs
    ORDER BY random()
    LIMIT (SELECT CEIL(COUNT(*) * 0.7) FROM locs)
)
INSERT INTO stock_items (id, location_id, fill_level, category)
SELECT
    'STOCK_' || id AS id,
    id AS location_id,
    (40 + floor(random() * 61))::int AS fill_level,
    CASE
        WHEN random() < 0.2 THEN 'A'
        WHEN random() < 0.5 THEN 'B'
        ELSE 'C'
    END AS category
FROM selected;

UPDATE locations
SET occupied = true
WHERE id IN (SELECT location_id FROM stock_items);

INSERT INTO agvs (id, x_m, y_m, z_m, status, battery, speed_mps)
VALUES
    ('AGV-001', -20, 0.3, -10, 'charging', 25, 0),
    ('AGV-002', 3, 0.3, 0, 'idle', 85, 0),
    ('AGV-003', -3, 0.3, 8, 'idle', 70, 0);

INSERT INTO orders (status, priority)
VALUES ('created', 1);

INSERT INTO order_items (order_id, sku, quantity, source_location_id)
SELECT o.id, 'SKU-001', 5, 'R1B1L1'
FROM orders o
ORDER BY created_at DESC
LIMIT 1;

INSERT INTO missions (agv_id, status, pickup_location_id, dropoff_location_id)
VALUES ('AGV-002', 'assigned', 'R1B1L1', 'R3B5L1');
