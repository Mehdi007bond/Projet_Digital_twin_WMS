-- Test Realtime complet : AGV + Stock
-- À exécuter dans SQL Editor Supabase

-- 1. Fonction pour simuler le mouvement d'un AGV
CREATE OR REPLACE FUNCTION simulate_agv_movement()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    new_x numeric;
    new_z numeric;
    angle numeric;
BEGIN
    angle := (EXTRACT(EPOCH FROM now()) * 0.5) * (3.14159 / 180);
    new_x := 5 * cos(angle);
    new_z := 5 * sin(angle);
    
    UPDATE agvs 
    SET 
        x_m = new_x,
        z_m = new_z,
        rotation_rad = angle + (3.14159 / 2),
        status = 'moving_to_pick',
        speed_mps = 1.5,
        updated_at = now()
    WHERE id = 'AGV-002';
END;
$$;

-- 2. Fonction pour simuler les changements de stock
CREATE OR REPLACE FUNCTION simulate_stock_changes()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    random_stock record;
    new_fill_level int;
BEGIN
    -- Sélectionne un stock aléatoire
    SELECT * INTO random_stock
    FROM stock_items
    ORDER BY random()
    LIMIT 1;
    
    IF random_stock IS NOT NULL THEN
        -- Change le niveau de remplissage
        new_fill_level := 40 + floor(random() * 61)::int;
        
        UPDATE stock_items
        SET 
            fill_level = new_fill_level,
            updated_at = now()
        WHERE id = random_stock.id;
        
        RAISE NOTICE 'Updated stock % to fill level %', random_stock.id, new_fill_level;
    END IF;
END;
$$;

-- 3. Fonction pour simuler une nouvelle mission
CREATE OR REPLACE FUNCTION simulate_new_mission()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    random_agv text;
    random_pickup text;
    random_drop text;
BEGIN
    -- Sélectionne un AGV aléatoire
    SELECT id INTO random_agv FROM agvs WHERE status = 'idle' ORDER BY random() LIMIT 1;
    
    -- Sélectionne des locations aléatoires
    SELECT id INTO random_pickup FROM locations WHERE occupied = true ORDER BY random() LIMIT 1;
    SELECT id INTO random_drop FROM locations WHERE occupied = false ORDER BY random() LIMIT 1;
    
    IF random_agv IS NOT NULL AND random_pickup IS NOT NULL AND random_drop IS NOT NULL THEN
        INSERT INTO missions (agv_id, status, pickup_location_id, dropoff_location_id)
        VALUES (random_agv, 'assigned', random_pickup, random_drop);
        
        RAISE NOTICE 'Created mission for AGV %', random_agv;
    END IF;
END;
$$;

-- 4. Test manuel - exécute ces lignes plusieurs fois
SELECT simulate_agv_movement();
SELECT simulate_stock_changes();
SELECT simulate_new_mission();

-- 5. OU active la simulation auto (toutes les 2 secondes)
-- ⚠️ À arrêter manuellement après test
DO $$
DECLARE
    i int := 0;
BEGIN
    WHILE i < 10 LOOP
        PERFORM simulate_agv_movement();
        PERFORM simulate_stock_changes();
        PERFORM pg_sleep(2);
        i := i + 1;
    END LOOP;
END $$;
