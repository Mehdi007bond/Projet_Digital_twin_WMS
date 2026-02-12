-- ═══════════════════════════════════════════════════════════════════════════
-- Add SKU columns to stock_items table
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Add columns
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS quality_tier TEXT;

-- Step 2: Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'stock_items'
ORDER BY ordinal_position;

-- Step 3: Update existing rows with SKU data based on category
UPDATE stock_items
SET 
    sku = CASE 
        WHEN category LIKE 'Front Light%Economique%' THEN 'FL-ECO'
        WHEN category LIKE 'Front Light%Medium%' THEN 'FL-MED'
        WHEN category LIKE 'Front Light%Luxe%' THEN 'FL-LUX'
        WHEN category LIKE 'Back Light%Economique%' THEN 'BL-ECO'
        WHEN category LIKE 'Back Light%Medium%' THEN 'BL-MED'
        WHEN category LIKE 'Back Light%Luxe%' THEN 'BL-LUX'
        WHEN category LIKE 'Motor Component%Economique%' THEN 'MC-ECO'
        WHEN category LIKE 'Motor Component%Medium%' THEN 'MC-MED'
        WHEN category LIKE 'Motor Component%Luxe%' THEN 'MC-LUX'
        ELSE 'UNKNOWN'
    END,
    product_name = CASE 
        WHEN category LIKE 'Front Light%' THEN 'Front Light'
        WHEN category LIKE 'Back Light%' THEN 'Back Light'
        WHEN category LIKE 'Motor Component%' THEN 'Motor Component'
        ELSE 'Unknown'
    END,
    quality_tier = CASE 
        WHEN category LIKE '%Economique%' THEN 'Economique'
        WHEN category LIKE '%Medium%' THEN 'Medium'
        WHEN category LIKE '%Luxe%' THEN 'Luxe'
        ELSE '-'
    END
WHERE sku IS NULL;

-- Step 4: Verify data
SELECT 
    sku,
    product_name,
    quality_tier,
    category,
    COUNT(*) as count
FROM stock_items
GROUP BY sku, product_name, quality_tier, category
ORDER BY sku, product_name, quality_tier
LIMIT 20;
