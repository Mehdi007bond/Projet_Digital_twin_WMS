"""
Digital Twin WMS - AGV Simulation avec PostgreSQL
Remplace la version Supabase par une connexion directe PostgreSQL
"""

import asyncio
import asyncpg
import math
import time
import os
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Configuration PostgreSQL
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "digital_twin")
DB_USER = os.getenv("POSTGRES_USER", "digital_twin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "digital_twin")

# Paramètres de simulation
SIMULATION_SPEED = 1.0  # 1.0 = temps réel
UPDATE_RATE = 0.1  # Update toutes les 100ms

# ═══════════════════════════════════════════════════════════════════════════
# Database Connection Pool
# ═══════════════════════════════════════════════════════════════════════════

db_pool = None

async def init_db_pool():
    """Initialize database connection pool"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(
            host=DB_HOST,
            port=int(DB_PORT),
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            min_size=2,
            max_size=10
        )
        print(f"✅ Connected to PostgreSQL: {DB_HOST}:{DB_PORT}/{DB_NAME}")
        return True
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return False

async def close_db_pool():
    """Close database connection pool"""
    global db_pool
    if db_pool:
        await db_pool.close()
        print("Database connection pool closed")

# ═══════════════════════════════════════════════════════════════════════════
# Database Helper Functions
# ═══════════════════════════════════════════════════════════════════════════

async def fetch_agvs():
    """Récupère tous les AGVs de la base"""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM agvs ORDER BY id")
        return [dict(row) for row in rows]

async def update_agv(agv_id, data):
    """Met à jour un AGV"""
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE agvs 
            SET x_m = $1, y_m = $2, z_m = $3, rotation_rad = $4,
                status = $5, battery = $6, speed_mps = $7, updated_at = NOW()
            WHERE id = $8
            """,
            data['x_m'], data['y_m'], data['z_m'], data['rotation_rad'],
            data['status'], data['battery'], data['speed_mps'], agv_id
        )

async def fetch_missions(status=None):
    """Récupère les missions"""
    async with db_pool.acquire() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT * FROM missions WHERE status = $1 ORDER BY created_at",
                status
            )
        else:
            rows = await conn.fetch("SELECT * FROM missions ORDER BY created_at LIMIT 100")
        return [dict(row) for row in rows]

async def update_mission_status(mission_id, status):
    """Met à jour le statut d'une mission"""
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE missions SET status = $1 WHERE id = $2",
            status, mission_id
        )

# ═══════════════════════════════════════════════════════════════════════════
# AGV Simulator
# ═══════════════════════════════════════════════════════════════════════════

class AGVSimulator:
    def __init__(self, agv_data):
        self.id = agv_data['id']
        self.x = float(agv_data['x_m'])
        self.y = float(agv_data['y_m'])
        self.z = float(agv_data['z_m'])
        self.rotation = float(agv_data['rotation_rad'])
        self.status = agv_data['status']
        self.battery = float(agv_data['battery'])
        self.speed = 2.0  # m/s
        self.target_x = None
        self.target_z = None
        self.mission = None
        self.loading_timer = 0
        
    def update(self, dt):
        """Met à jour la position AGV"""
        if self.status == 'charging':
            self.battery = min(100, self.battery + dt * 10)
            if self.battery >= 80:
                self.status = 'idle'
            return
            
        if self.status == 'idle':
            # Décharge lente
            self.battery = max(0, self.battery - dt * 0.1)
            if self.battery < 20:
                self.status = 'charging'
                self.target_x = -20
                self.target_z = -10
            return
            
        # Mouvement vers target
        if self.target_x is not None and self.target_z is not None:
            dx = self.target_x - self.x
            dz = self.target_z - self.z
            dist = math.sqrt(dx*dx + dz*dz)
            
            if dist < 0.2:
                # Arrivé à destination
                self.x = self.target_x
                self.z = self.target_z
                
                if self.status == 'moving_to_pickup':
                    self.status = 'loading'
                    self.loading_timer = 3.0
                elif self.status == 'moving_to_dropoff':
                    self.status = 'unloading'
                    self.loading_timer = 3.0
                else:
                    self.status = 'idle'
                    self.target_x = None
                    self.target_z = None
            else:
                # Mouvement
                move_dist = min(self.speed * dt, dist)
                self.x += (dx / dist) * move_dist
                self.z += (dz / dist) * move_dist
                
                # Rotation vers la cible
                self.rotation = math.atan2(dx, dz)
                
                # Consommation batterie
                self.battery = max(0, self.battery - dt * 0.5)
                
        # Gestion loading/unloading
        if self.status in ['loading', 'unloading']:
            self.loading_timer -= dt
            if self.loading_timer <= 0:
                self.status = 'idle'
                self.target_x = None
                self.target_z = None
    
    async def save_to_db(self):
        """Sauvegarde l'état de l'AGV dans la base"""
        await update_agv(self.id, {
            'x_m': self.x,
            'y_m': self.y,
            'z_m': self.z,
            'rotation_rad': self.rotation,
            'status': self.status,
            'battery': self.battery,
            'speed_mps': self.speed if self.status in ['moving_to_pickup', 'moving_to_dropoff'] else 0
        })

# ═══════════════════════════════════════════════════════════════════════════
# Main Simulation Loop
# ═══════════════════════════════════════════════════════════════════════════

async def simulation_loop():
    """Boucle principale de simulation"""
    print("🚀 Starting AGV simulation...")
    
    # Initialiser la connexion DB
    if not await init_db_pool():
        return
    
    # Charger les AGVs
    agv_data = await fetch_agvs()
    if not agv_data:
        print("⚠️ No AGVs found in database. Creating default AGVs...")
        # Créer des AGVs par défaut si nécessaire
        async with db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO agvs (id, x_m, y_m, z_m, rotation_rad, status, battery, speed_mps)
                VALUES 
                    ('AGV-001', 0, 0, 0, 0, 'idle', 100, 0),
                    ('AGV-002', 10, 0, 10, 0, 'idle', 100, 0),
                    ('AGV-003', -10, 0, -10, 0, 'idle', 100, 0)
                ON CONFLICT (id) DO NOTHING
            """)
        agv_data = await fetch_agvs()
    
    agvs = [AGVSimulator(agv) for agv in agv_data]
    print(f"✅ Loaded {len(agvs)} AGVs")
    
    last_time = time.time()
    update_counter = 0
    
    try:
        while True:
            current_time = time.time()
            dt = (current_time - last_time) * SIMULATION_SPEED
            last_time = current_time
            
            # Update tous les AGVs
            for agv in agvs:
                agv.update(dt)
            
            # Sauvegarder en base toutes les 10 itérations (~1 seconde)
            update_counter += 1
            if update_counter >= 10:
                for agv in agvs:
                    await agv.save_to_db()
                update_counter = 0
                print(f"📊 AGVs updated - Status: {[(agv.id, agv.status, f'{agv.battery:.1f}%') for agv in agvs]}")
            
            # Attendre avant la prochaine itération
            await asyncio.sleep(UPDATE_RATE)
            
    except KeyboardInterrupt:
        print("\n⚠️ Simulation stopped by user")
    except Exception as e:
        print(f"❌ Simulation error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        await close_db_pool()
        print("✅ Simulation ended")

# ═══════════════════════════════════════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 70)
    print("🏭 Digital Twin WMS - AGV Simulation")
    print("=" * 70)
    asyncio.run(simulation_loop())
