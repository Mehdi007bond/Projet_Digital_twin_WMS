-- Fonction pour simuler le mouvement d'un AGV (à exécuter dans SQL Editor Supabase)
-- Active cette fonction, puis elle mettra à jour AGV-002 toutes les 2 secondes

CREATE OR REPLACE FUNCTION simulate_agv_movement()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    new_x numeric;
    new_z numeric;
    angle numeric;
BEGIN
    -- Calcule une nouvelle position en cercle
    angle := (EXTRACT(EPOCH FROM now()) * 0.5) * (3.14159 / 180);
    new_x := 5 * cos(angle);
    new_z := 5 * sin(angle);
    
    -- Met à jour AGV-002
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

-- Pour tester manuellement, exécute cette ligne plusieurs fois :
SELECT simulate_agv_movement();
