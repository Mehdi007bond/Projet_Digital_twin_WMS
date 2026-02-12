-- ═══════════════════════════════════════════════════════════════════════════
-- REBUILD DATABASE TO MATCH 3D SIMULATION (racks.js)
-- Structure 3D: 3 rows × 5 bays × 4 levels = 60 locations
-- IDs format: R{row}B{bay}L{level} (ex: R1B1L1, R3B5L4)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- STEP 1: Clean existing data (order matters for FK)
-- ═══════════════════════════════════════════════════════

DELETE FROM stock_items;
DELETE FROM tasks;
DELETE FROM locations;
DELETE FROM racks;

-- ═══════════════════════════════════════════════════════
-- STEP 2: Create 15 racks (3 rows × 5 bays)
-- Matches racks.js: row 0→2 mapped to row_no 1→3, bay 0→4 mapped to bay_no 1→5
-- ═══════════════════════════════════════════════════════

WITH wh AS (SELECT id FROM warehouses LIMIT 1)
INSERT INTO racks (warehouse_id, rack_code, row_no, bay_no, x_m, z_m)
SELECT
    wh.id,
    'R' || r || '-B' || b as rack_code,
    r as row_no,
    b as bay_no,
    -- X position: matches racks.js bayX = (bay - floor(5/2)) * 2.7
    ((b - 3) * 2.7)::numeric as x_m,
    -- Z position: matches racks.js rowZ = (row - 1) * (1.0 + 3.5)
    ((r - 2) * 4.5)::numeric as z_m
FROM wh,
     generate_series(1, 3) r,   -- 3 allées (1, 2, 3)
     generate_series(1, 5) b;   -- 5 racks par allée (1, 2, 3, 4, 5)

-- ═══════════════════════════════════════════════════════
-- STEP 3: Create 60 locations (15 racks × 4 levels)
-- ID format: R{row}B{bay}L{level} → same as racks.js
-- ═══════════════════════════════════════════════════════

INSERT INTO locations (id, rack_id, row_no, bay_no, level_no, x_m, y_m, z_m, occupied)
SELECT
    'R' || rack.row_no || 'B' || rack.bay_no || 'L' || lvl as id,
    rack.id as rack_id,
    rack.row_no,
    rack.bay_no,
    lvl as level_no,
    rack.x_m,
    (0.3 + ((lvl - 1) * 2.0))::numeric as y_m,  -- matches racks.js: firstLevelHeight + level * levelHeight
    rack.z_m,
    true as occupied  -- Will be filled with stock
FROM racks rack,
     generate_series(1, 4) lvl  -- 4 levels (1, 2, 3, 4)
WHERE rack.warehouse_id = (SELECT id FROM warehouses LIMIT 1);

-- ═══════════════════════════════════════════════════════
-- STEP 4: Create stock items - 9 product variants cycling
-- Every location gets a product
-- ═══════════════════════════════════════════════════════

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS quality_tier TEXT;

WITH numbered_locations AS (
    SELECT
        l.id,
        l.rack_id,
        l.row_no,
        l.bay_no,
        l.level_no,
        row_number() OVER (ORDER BY l.row_no, l.bay_no, l.level_no) as rn
    FROM locations l
),
product_variants AS (
    SELECT * FROM (VALUES
        ('Front Light', 'Economique', 'FL-ECO'),
        ('Front Light', 'Medium', 'FL-MED'),
        ('Front Light', 'Luxe', 'FL-LUX'),
        ('Back Light', 'Economique', 'BL-ECO'),
        ('Back Light', 'Medium', 'BL-MED'),
        ('Back Light', 'Luxe', 'BL-LUX'),
        ('Motor Component', 'Economique', 'MC-ECO'),
        ('Motor Component', 'Medium', 'MC-MED'),
        ('Motor Component', 'Luxe', 'MC-LUX')
    ) AS v(product_name, quality_tier, sku)
)
INSERT INTO stock_items (location_id, fill_level, category, sku, product_name, quality_tier)
SELECT
    loc.id as location_id,
    10 + floor(random() * 91)::int as fill_level,
    pv.product_name || ' / ' || pv.quality_tier || ' / Aisle-' || loc.row_no || ' Rack-' || loc.bay_no as category,
    pv.sku,
    pv.product_name,
    pv.quality_tier
FROM numbered_locations loc
CROSS JOIN LATERAL (
    SELECT product_name, quality_tier, sku
    FROM product_variants
    OFFSET ((loc.rn - 1) % 9)
    LIMIT 1
) pv;

-- ═══════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════

-- Check racks: should be 15 (3×5)
SELECT 'Racks' as table_name, count(*) as total FROM racks;

-- Check locations: should be 60 (3×5×4)
SELECT 'Locations' as table_name, count(*) as total FROM locations;

-- Check stock items: should be 60
SELECT 'Stock Items' as table_name, count(*) as total FROM stock_items;

-- Show location IDs match 3D format
SELECT id, row_no, bay_no, level_no FROM locations ORDER BY row_no, bay_no, level_no LIMIT 12;

-- Show stock distribution
SELECT sku, product_name, quality_tier, count(*) as qty
FROM stock_items
GROUP BY sku, product_name, quality_tier
ORDER BY sku;
