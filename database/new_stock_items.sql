-- ═══════════════════════════════════════════════════════════════════════════
-- Digital Twin WMS - New Stock Items (9 Product Variants)
-- Format: Product Name / Category / Aisle-X Rack-Y
-- SKU Format: FL-ECO, BL-MED, MC-LUX
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- STEP 0: Add columns if they don't exist
-- ═══════════════════════════════════════════════════════

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS quality_tier TEXT;

-- ═══════════════════════════════════════════════════════
-- STEP 1: Delete all existing stock items
-- ═══════════════════════════════════════════════════════

DELETE FROM stock_items;

-- ═══════════════════════════════════════════════════════
-- STEP 2: Create new stock items with named products
-- ═══════════════════════════════════════════════════════

-- Product types:
-- 1. Front Light / Economique / Aisle-X Rack-Y
-- 2. Front Light / Medium / Aisle-X Rack-Y
-- 3. Front Light / Luxe / Aisle-X Rack-Y
-- 4. Back Light / Economique / Aisle-X Rack-Y
-- 5. Back Light / Medium / Aisle-X Rack-Y
-- 6. Back Light / Luxe / Aisle-X Rack-Y
-- 7. Motor Component / Economique / Aisle-X Rack-Y
-- 8. Motor Component / Medium / Aisle-X Rack-Y
-- 9. Motor Component / Luxe / Aisle-X Rack-Y

WITH all_locations AS (
    SELECT 
        l.id,
        l.rack_id,
        r.row_no,
        r.bay_no,
        row_number() OVER (ORDER BY l.id) as rn
    FROM locations l
    JOIN racks r ON l.rack_id = r.id
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
    l.id,
    10 + floor(random() * 91)::int as fill_level,  -- Random 10-100
    pv.product_name || ' / ' || pv.quality_tier || ' / Aisle-' || l.row_no || ' Rack-' || l.bay_no as category,
    pv.sku,
    pv.product_name,
    pv.quality_tier
FROM all_locations l
CROSS JOIN LATERAL (
    SELECT product_name, quality_tier, sku
    FROM product_variants
    OFFSET ((l.rn - 1) % 9)
    LIMIT 1
) pv;

-- ═══════════════════════════════════════════════════════
-- VERIFICATION: Show sample products
-- ═══════════════════════════════════════════════════════

SELECT 
    sku,
    product_name,
    quality_tier,
    category as full_description,
    fill_level,
    location_id
FROM stock_items
ORDER BY sku, location_id
LIMIT 20;

-- Count by SKU
SELECT 
    sku,
    product_name,
    quality_tier,
    COUNT(*) as count,
    ROUND(AVG(fill_level), 2) as avg_fill_level
FROM stock_items
GROUP BY sku, product_name, quality_tier
ORDER BY sku;

-- Total count
SELECT COUNT(*) as total_stock_items FROM stock_items;
