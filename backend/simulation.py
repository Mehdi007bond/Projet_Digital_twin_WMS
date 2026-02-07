import asyncio
import math
import time
import os
import json
from datetime import datetime
try:
    import requests
except ImportError:
    import urllib.request
    import urllib.parse
    requests = None

# Config Supabase (même que frontend)
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://kzmukwchzkakldninibv.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_secret_FedgNdBrPrnZbxDpNXOHtw_9JrMiCqY")

# Helper REST API
def supabase_request(method, table, data=None, filters=None, select='*', single=False, limit=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    
    params = {}
    if select:
        params['select'] = select
    if filters:
        for key, value in filters.items():
            params[key] = f'eq.{value}'
    if limit:
        params['limit'] = str(limit)
    
    if requests:
        if method == 'GET':
            resp = requests.get(url, headers=headers, params=params)
        elif method == 'POST':
            resp = requests.post(url, headers=headers, json=data)
        elif method == 'PATCH':
            resp = requests.patch(url, headers=headers, params=params, json=data)
        result = resp.json() if resp.status_code == 200 else []
    else:
        # urllib fallback
        query = urllib.parse.urlencode(params)
        full_url = f"{url}?{query}" if query else url
        req = urllib.request.Request(full_url, headers=headers)
        if data:
            req.data = json.dumps(data).encode()
            req.method = method
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
    
    return result[0] if single and result else result

# Simulation
SIMULATION_SPEED = 1.0  # 1.0 = temps réel
UPDATE_RATE = 0.1  # Update toutes les 100ms

class AGVSimulator:
    def __init__(self, agv_data):
        self.id = agv_data['id']
        self.x = agv_data['x_m']
        self.y = agv_data['y_m']
        self.z = agv_data['z_m']
        self.rotation = agv_data['rotation_rad']
        self.status = agv_data['status']
        self.battery = agv_data['battery']
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
                # Arrivé
                self.x = self.target_x
                self.z = self.target_z
                self.target_x = None
                self.target_z = None
                
                if self.status == 'moving_to_pick':
                    self.status = 'loading'
                elif self.status == 'moving_to_drop':
                    self.status = 'unloading'
            else:
                # Se déplace
                self.rotation = math.atan2(dz, dx)
                move_dist = self.speed * dt
                ratio = move_dist / dist
                self.x += dx * ratio
                self.z += dz * ratio
                self.battery = max(0, self.battery - dt * 0.5)
                
        # Loading/unloading (géré dans la boucle principale)
        if self.status in ['loading', 'unloading']:
            self.loading_timer += dt
            if self.loading_timer >= 1.5:
                self.loading_timer = 0
                if self.status == 'loading' and self.mission:
                    # Va au drop
                    self.status = 'moving_to_drop'
                    drop_loc = supabase_request('GET', 'locations', filters={'id': self.mission['dropoff_location_id']}, single=True)
                    if drop_loc:
                        self.target_x = drop_loc['x_m']
                        self.target_z = drop_loc['z_m']
                elif self.status == 'unloading':
                    self.status = 'idle'
                    self.mission = None
                
    async def save_to_db(self):
        """Enregistre dans Supabase"""
        supabase_request('PATCH', 'agvs', 
            data={
                'x_m': round(self.x, 2),
                'y_m': self.y,
                'z_m': round(self.z, 2),
                'rotation_rad': round(self.rotation, 3),
                'status': self.status,
                'battery': round(self.battery, 1),
                'speed_mps': self.speed if self.target_x else 0,
                'updated_at': datetime.utcnow().isoformat()
            },
            filters={'id': self.id}
        )

class WMSSimulation:
    def __init__(self):
        self.agvs = []
        self.running = True
        
    async def init(self):
        """Charge l'état initial"""
        agv_data = supabase_request('GET', 'agvs')
        self.agvs = [AGVSimulator(agv) for agv in agv_data]
        print(f"✅ {len(self.agvs)} AGVs chargés")
        
    async def assign_mission(self):
        """Assigne une mission à un AGV disponible"""
        import random
        idle_agv = next((agv for agv in self.agvs if agv.status == 'idle' and agv.battery > 30), None)
        if not idle_agv:
            return
            
        # Trouve un stock à déplacer
        stock = supabase_request('GET', 'stock_items', limit=1)
        if not stock:
            return
            
        stock_item = stock[0]
        pickup_loc = supabase_request('GET', 'locations', filters={'id': stock_item['location_id']}, single=True)
        drop_loc = supabase_request('GET', 'locations', filters={'occupied': 'false'}, limit=1, single=True)
        
        if not pickup_loc or not drop_loc:
            return
            
        # Crée mission
        mission = supabase_request('POST', 'missions', data={
            'agv_id': idle_agv.id,
            'status': 'assigned',
            'pickup_location_id': pickup_loc['id'],
            'dropoff_location_id': drop_loc['id']
        })
        
        if mission:
            idle_agv.mission = mission if isinstance(mission, dict) else mission[0]
            idle_agv.status = 'moving_to_pick'
            idle_agv.target_x = pickup_loc['x_m']
            idle_agv.target_z = pickup_loc['z_m']
            
            print(f"📦 Mission assignée: {idle_agv.id} -> {pickup_loc['id']}")
        
    async def update_stock(self):
        """Change le stock aléatoirement"""
        import random
        if random.random() < 0.05:  # 5% chance par cycle
            stock = supabase_request('GET', 'stock_items')
            if stock:
                item = stock[int(random.random() * len(stock))]
                new_fill = int(40 + random.random() * 61)
                supabase_request('PATCH', 'stock_items',
                    data={
                        'fill_level': new_fill,
                        'updated_at': datetime.utcnow().isoformat()
                    },
                    filters={'id': item['id']}
                )
                
    async def run(self):
        """Boucle principale"""
        await self.init()
        last_mission = time.time()
        
        print("🚀 Simulation démarrée (Ctrl+C pour arrêter)")
        
        while self.running:
            start = time.time()
            dt = UPDATE_RATE * SIMULATION_SPEED
            
            # Update AGVs
            for agv in self.agvs:
                agv.update(dt)
                await agv.save_to_db()
                
            # Créer mission toutes les 10s
            if time.time() - last_mission > 10:
                await self.assign_mission()
                last_mission = time.time()
                
            # Update stock
            await self.update_stock()
            
            # Attendre
            elapsed = time.time() - start
            await asyncio.sleep(max(0, UPDATE_RATE - elapsed))

if __name__ == "__main__":
    sim = WMSSimulation()
    try:
        asyncio.run(sim.run())
    except KeyboardInterrupt:
        print("\n⏹️  Simulation arrêtée")
