-- ═══════════════════════════════════════════════════════════════════════════
-- EXÉCUTER CETTE REQUÊTE DANS SUPABASE SQL EDITOR
-- Ajoute les Foreign Keys manquantes pour tasks.pickup_location_id et tasks.dropoff_location_id
-- ═══════════════════════════════════════════════════════════════════════════

-- Ajouter FK pour pickup_location_id → locations(id)
ALTER TABLE tasks 
ADD CONSTRAINT tasks_pickup_location_id_fkey 
FOREIGN KEY (pickup_location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Ajouter FK pour dropoff_location_id → locations(id)
ALTER TABLE tasks 
ADD CONSTRAINT tasks_dropoff_location_id_fkey 
FOREIGN KEY (dropoff_location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Vérifier que les contraintes ont été ajoutées
SELECT 
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'tasks'
ORDER BY tc.constraint_name;
