-- ═══════════════════════════════════════════════════════════════════════════
-- Fix Foreign Keys - Add missing relations for tasks table
-- ═══════════════════════════════════════════════════════════════════════════

-- Vérifier les contraintes existantes
SELECT 
    constraint_name,
    table_name,
    column_name,
    foreign_table_name,
    foreign_column_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.table_constraints tc 
    ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'tasks'
ORDER BY constraint_name;

-- Ajouter les contraintes manquantes pour tasks

-- 1. Si agv_id n'a pas de contrainte, l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tasks_agv_id_fkey' 
        AND table_name = 'tasks'
    ) THEN
        ALTER TABLE tasks 
        ADD CONSTRAINT tasks_agv_id_fkey 
        FOREIGN KEY (agv_id) REFERENCES agvs(id) ON DELETE SET NULL;
        
        RAISE NOTICE '✅ tasks_agv_id_fkey créée';
    ELSE
        RAISE NOTICE '⏭️  tasks_agv_id_fkey existe déjà';
    END IF;
END $$;

-- 2. Ajouter FK pour pickup_location_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tasks_pickup_location_id_fkey' 
        AND table_name = 'tasks'
    ) THEN
        ALTER TABLE tasks 
        ADD CONSTRAINT tasks_pickup_location_id_fkey 
        FOREIGN KEY (pickup_location_id) REFERENCES locations(id) ON DELETE SET NULL;
        
        RAISE NOTICE '✅ tasks_pickup_location_id_fkey créée';
    ELSE
        RAISE NOTICE '⏭️  tasks_pickup_location_id_fkey existe déjà';
    END IF;
END $$;

-- 3. Ajouter FK pour dropoff_location_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tasks_dropoff_location_id_fkey' 
        AND table_name = 'tasks'
    ) THEN
        ALTER TABLE tasks 
        ADD CONSTRAINT tasks_dropoff_location_id_fkey 
        FOREIGN KEY (dropoff_location_id) REFERENCES locations(id) ON DELETE SET NULL;
        
        RAISE NOTICE '✅ tasks_dropoff_location_id_fkey créée';
    ELSE
        RAISE NOTICE '⏭️  tasks_dropoff_location_id_fkey existe déjà';
    END IF;
END $$;

-- Vérifier les contraintes après ajout
SELECT 
    tc.constraint_name,
    tc.table_name,
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
