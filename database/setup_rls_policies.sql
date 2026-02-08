-- 🔒 Supabase RLS (Row Level Security) Configuration
-- Ce script active les politiques de sécurité pour permettre la lecture publique

-- ==========================================
-- 1. ACTIVER RLS SUR TOUTES LES TABLES
-- ==========================================

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. SUPPRIMER LES ANCIENNES POLICIES SI EXISTANTES
-- ==========================================

DROP POLICY IF EXISTS "Allow public read warehouses" ON warehouses;
DROP POLICY IF EXISTS "Allow public read zones" ON zones;
DROP POLICY IF EXISTS "Allow public read racks" ON racks;
DROP POLICY IF EXISTS "Allow public read locations" ON locations;
DROP POLICY IF EXISTS "Allow public read stock_items" ON stock_items;
DROP POLICY IF EXISTS "Allow public read agvs" ON agvs;
DROP POLICY IF EXISTS "Allow public read missions" ON missions;
DROP POLICY IF EXISTS "Allow public read orders" ON orders;
DROP POLICY IF EXISTS "Allow public read order_items" ON order_items;

DROP POLICY IF EXISTS "Allow public write stock_items" ON stock_items;
DROP POLICY IF EXISTS "Allow public write agvs" ON agvs;
DROP POLICY IF EXISTS "Allow public write missions" ON missions;
DROP POLICY IF EXISTS "Allow public write locations" ON locations;

-- ==========================================
-- 3. CRÉER LES POLICIES DE LECTURE PUBLIQUE
-- ==========================================

-- Tables en lecture seule pour le frontend
CREATE POLICY "Allow public read warehouses" ON warehouses
FOR SELECT USING (true);

CREATE POLICY "Allow public read zones" ON zones
FOR SELECT USING (true);

CREATE POLICY "Allow public read racks" ON racks
FOR SELECT USING (true);

CREATE POLICY "Allow public read locations" ON locations
FOR SELECT USING (true);

CREATE POLICY "Allow public read stock_items" ON stock_items
FOR SELECT USING (true);

CREATE POLICY "Allow public read agvs" ON agvs
FOR SELECT USING (true);

CREATE POLICY "Allow public read missions" ON missions
FOR SELECT USING (true);

CREATE POLICY "Allow public read orders" ON orders
FOR SELECT USING (true);

CREATE POLICY "Allow public read order_items" ON order_items
FOR SELECT USING (true);

-- ==========================================
-- 4. CRÉER LES POLICIES D'ÉCRITURE (pour simulation)
-- ==========================================

-- Permettre à la simulation de mettre à jour les AGVs
CREATE POLICY "Allow public write agvs" ON agvs
FOR ALL USING (true)
WITH CHECK (true);

-- Permettre à la simulation de mettre à jour les missions
CREATE POLICY "Allow public write missions" ON missions
FOR ALL USING (true)
WITH CHECK (true);

-- Permettre à la simulation de mettre à jour le stock
CREATE POLICY "Allow public write stock_items" ON stock_items
FOR ALL USING (true)
WITH CHECK (true);

-- Permettre à la simulation de mettre à jour les locations
CREATE POLICY "Allow public write locations" ON locations
FOR ALL USING (true)
WITH CHECK (true);

-- ==========================================
-- 5. VÉRIFICATION
-- ==========================================

-- Vérifier que RLS est activé
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'warehouses', 'zones', 'racks', 'locations', 
    'stock_items', 'agvs', 'missions', 'orders', 'order_items'
)
ORDER BY tablename;

-- Vérifier les policies créées
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ==========================================
-- 6. ACTIVER REALTIME SUR LES TABLES (OPTIONNEL)
-- ==========================================

-- Note : Cette fonctionnalité nécessite Supabase ou une configuration PublicSub
-- Pour PostgreSQL vanilla, les WebSockets sont gérés par l'application backend
-- Les tables supportées pour realtime sont :
-- ✅ agvs
-- ✅ stock_items
-- ✅ missions
-- ✅ locations

-- Les politiques créées ci-dessus permettent déjà l'accès public

-- ==========================================
-- 7. TEST DE CONNEXION
-- ==========================================

-- Vérifier que les données sont accessibles
SELECT COUNT(*) as total_locations FROM locations;
SELECT COUNT(*) as total_stock_items FROM stock_items;
SELECT COUNT(*) as total_agvs FROM agvs;
SELECT COUNT(*) as total_missions FROM missions;

-- Vérifier quelques données d'exemple
SELECT 
    l.id,
    l.row_no,
    l.bay_no,
    l.level_no,
    l.occupied,
    s.category,
    s.fill_level
FROM locations l
LEFT JOIN stock_items s ON l.id = s.location_id
LIMIT 5;
