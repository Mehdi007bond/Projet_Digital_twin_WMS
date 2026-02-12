-- ═══════════════════════════════════════════════════════════════════════════
-- Database Health Check - Digital Twin WMS
-- Vérifie l'intégrité et la cohérence de la base de données
-- ═══════════════════════════════════════════════════════════════════════════

\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'DIGITAL TWIN WMS - HEALTH CHECK'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo ''

-- ═══════════════════════════════════════════════════════
-- 1. Vérifier les tables existantes
-- ═══════════════════════════════════════════════════════

\echo '1️⃣  Tables existantes:'
\echo ''

SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('warehouses', 'zones', 'racks', 'locations', 'stock_items', 'agvs', 'tasks')
ORDER BY tablename;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 2. Vérifier le schéma de stock_items
-- ═══════════════════════════════════════════════════════

\echo '2️⃣  Colonnes de stock_items:'
\echo ''

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'stock_items'
ORDER BY ordinal_position;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 3. Compter les enregistrements
-- ═══════════════════════════════════════════════════════

\echo '3️⃣  Nombre denregistrements par table:'
\echo ''

SELECT 'warehouses' as table_name, COUNT(*) as count FROM warehouses
UNION ALL
SELECT 'zones', COUNT(*) FROM zones
UNION ALL
SELECT 'racks', COUNT(*) FROM racks
UNION ALL
SELECT 'locations', COUNT(*) FROM locations
UNION ALL
SELECT 'stock_items', COUNT(*) FROM stock_items
UNION ALL
SELECT 'agvs', COUNT(*) FROM agvs
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
ORDER BY table_name;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 4. Vérifier les SKU
-- ═══════════════════════════════════════════════════════

\echo '4️⃣  Distribution des SKU:'
\echo ''

SELECT 
    sku,
    product_name,
    quality_tier,
    COUNT(*) as count,
    ROUND(AVG(fill_level), 2) as avg_fill_level
FROM stock_items
GROUP BY sku, product_name, quality_tier
ORDER BY sku;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 5. Vérifier les SKU manquants ou invalides
-- ═══════════════════════════════════════════════════════

\echo '5️⃣  Vérification des SKU invalides:'
\echo ''

SELECT 
    COUNT(*) as items_without_sku,
    COUNT(*) FILTER (WHERE sku IS NULL) as null_sku,
    COUNT(*) FILTER (WHERE sku = '-') as dash_sku,
    COUNT(*) FILTER (WHERE product_name IS NULL) as null_product,
    COUNT(*) FILTER (WHERE quality_tier IS NULL) as null_quality
FROM stock_items;

\echo ''
\echo '⚠️  Si items_without_sku > 0, exécuter: new_stock_items.sql'
\echo ''

-- ═══════════════════════════════════════════════════════
-- 6. Vérifier les AGVs
-- ═══════════════════════════════════════════════════════

\echo '6️⃣  AGVs dans le système:'
\echo ''

SELECT 
    id,
    name,
    status,
    battery,
    ROUND(x_m::numeric, 2) as x,
    ROUND(z_m::numeric, 2) as z
FROM agvs
ORDER BY id;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 7. Vérifier la configuration Realtime
-- ═══════════════════════════════════════════════════════

\echo '7️⃣  Tables Realtime activées:'
\echo ''

SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

\echo ''
\echo '✅ Les tables suivantes DOIVENT apparaître: agvs, stock_items, tasks'
\echo ''

-- ═══════════════════════════════════════════════════════
-- 8. Intégrité référentielle
-- ═══════════════════════════════════════════════════════

\echo '8️⃣  Intégrité référentielle:'
\echo ''

-- Locations sans rack
SELECT 
    'Locations sans rack' as issue,
    COUNT(*) as count
FROM locations l
LEFT JOIN racks r ON l.rack_id = r.id
WHERE r.id IS NULL

UNION ALL

-- Stock items sans location
SELECT 
    'Stock items sans location',
    COUNT(*)
FROM stock_items s
LEFT JOIN locations l ON s.location_id = l.id
WHERE l.id IS NULL

UNION ALL

-- Racks sans warehouse
SELECT 
    'Racks sans warehouse',
    COUNT(*)
FROM racks r
LEFT JOIN warehouses w ON r.warehouse_id = w.id
WHERE w.id IS NULL;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 9. Statistiques de remplissage
-- ═══════════════════════════════════════════════════════

\echo '9️⃣  Statistiques de remplissage:'
\echo ''

SELECT 
    CASE 
        WHEN fill_level = 0 THEN '🔴 Vide (0%)'
        WHEN fill_level < 25 THEN '🟠 Faible (<25%)'
        WHEN fill_level < 75 THEN '🟡 Moyen (25-75%)'
        WHEN fill_level < 90 THEN '🟢 Bon (75-90%)'
        ELSE '🔵 Plein (>90%)'
    END as status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM stock_items
GROUP BY 
    CASE 
        WHEN fill_level = 0 THEN '🔴 Vide (0%)'
        WHEN fill_level < 25 THEN '🟠 Faible (<25%)'
        WHEN fill_level < 75 THEN '🟡 Moyen (25-75%)'
        WHEN fill_level < 90 THEN '🟢 Bon (75-90%)'
        ELSE '🔵 Plein (>90%)'
    END
ORDER BY 
    CASE 
        WHEN fill_level = 0 THEN 1
        WHEN fill_level < 25 THEN 2
        WHEN fill_level < 75 THEN 3
        WHEN fill_level < 90 THEN 4
        ELSE 5
    END;

\echo ''

-- ═══════════════════════════════════════════════════════
-- 10. Résumé final
-- ═══════════════════════════════════════════════════════

\echo '🎯 Résumé Global:'
\echo ''

SELECT 
    (SELECT COUNT(*) FROM stock_items) as total_items,
    (SELECT COUNT(*) FROM stock_items WHERE sku IS NOT NULL AND sku != '-') as items_with_sku,
    (SELECT COUNT(DISTINCT sku) FROM stock_items WHERE sku IS NOT NULL AND sku != '-') as unique_skus,
    (SELECT ROUND(AVG(fill_level), 2) FROM stock_items) as avg_fill_level,
    (SELECT COUNT(*) FROM agvs) as total_agvs,
    (SELECT COUNT(*) FROM tasks) as total_tasks;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '✅ Health check terminé!'
\echo '═══════════════════════════════════════════════════════════════════════════'
