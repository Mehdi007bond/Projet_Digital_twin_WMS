"""
Digital Twin WMS - FastAPI Backend
Architecture 100% Docker avec PostgreSQL local (SANS Supabase)
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncpg
import os
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import uuid

# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════

DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "digital_twin")
DB_USER = os.getenv("POSTGRES_USER", "digital_twin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "digital_twin")

# ═══════════════════════════════════════════════════════════════════════════
# Models Pydantic
# ═══════════════════════════════════════════════════════════════════════════

class AGVUpdate(BaseModel):
    x_m: float
    y_m: float
    z_m: float
    rotation_rad: float
    status: str
    battery: float
    speed_mps: float

class StockItemUpdate(BaseModel):
    fill_level: int
    category: str

class WarehouseCreate(BaseModel):
    name: str
    width_m: float
    depth_m: float
    height_m: float

class ZoneCreate(BaseModel):
    warehouse_id: str
    name: str
    zone_type: str
    x_m: float
    z_m: float
    width_m: float
    depth_m: float
    color_hex: Optional[str] = None

class RackCreate(BaseModel):
    warehouse_id: str
    rack_code: str
    row_no: int
    bay_no: int
    x_m: float
    z_m: float

class LocationCreate(BaseModel):
    rack_id: str
    row_no: int
    bay_no: int
    level_no: int
    x_m: float
    y_m: float
    z_m: float

class StockItemCreate(BaseModel):
    location_id: str
    fill_level: int
    category: str

class MissionCreate(BaseModel):
    agv_id: Optional[str] = None
    status: str
    pickup_location_id: Optional[str] = None
    dropoff_location_id: Optional[str] = None

class OrderCreate(BaseModel):
    status: str
    priority: int = 0

# ═══════════════════════════════════════════════════════════════════════════
# Database Pool
# ═══════════════════════════════════════════════════════════════════════════

db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gère le cycle de vie de l'application"""
    global db_pool
    # Startup
    db_pool = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        min_size=5,
        max_size=20
    )
    print(f"✅ Connected to PostgreSQL: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    yield
    # Shutdown
    await db_pool.close()
    print("❌ Closed database connection")

# ═══════════════════════════════════════════════════════════════════════════
# FastAPI App
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Digital Twin WMS API",
    description="API REST pour le jumeau numérique d'entrepôt",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - Autoriser toutes les origines en développement
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════════════════════════════════
# WebSocket Manager
# ═══════════════════════════════════════════════════════════════════════════

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Health Check
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "Digital Twin WMS API",
        "version": "1.0.0",
        "database": "connected" if db_pool else "disconnected"
    }

@app.get("/health")
async def health_check():
    try:
        async with db_pool.acquire() as conn:
            result = await conn.fetchval("SELECT 1")
            return {"status": "healthy", "database": "ok"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")

# ═══════════════════════════════════════════════════════════════════════════
@app.get("/api/warehouses")
async def get_warehouses():
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM warehouses")
        return [dict(row) for row in rows]

@app.post("/api/warehouses")
async def create_warehouse(data: WarehouseCreate):
    """Créer un nouvel entrepôt"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO warehouses (name, width_m, depth_m, height_m)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            data.name,
            data.width_m,
            data.depth_m,
            data.height_m
        )
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Zones
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/zones")
async def get_zones():
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM zones")
        return [dict(row) for row in rows]

@app.post("/api/zones")
async def create_zone(data: ZoneCreate):
    """Créer une nouvelle zone"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO zones (warehouse_id, name, zone_type, x_m, z_m, width_m, depth_m, color_hex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            data.warehouse_id,
            data.name,
            data.zone_type,
            data.x_m,
            data.z_m,
            data.width_m,
            data.depth_m,
            data.color_hex
        )
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Racks
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/racks")
async def get_racks():
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM racks")
        return [dict(row) for row in rows]

@app.post("/api/racks")
async def create_rack(data: RackCreate):
    """Créer un nouveau rack"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO racks (warehouse_id, rack_code, row_no, bay_no, x_m, z_m)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            data.warehouse_id,
            data.rack_code,
            data.row_no,
            data.bay_no,
            data.x_m,
            data.z_m
        )
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Locations
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/locations")
async def get_locations(select: Optional[str] = "*"):
    async with db_pool.acquire() as conn:
        if select == "*":
            rows = await conn.fetch("SELECT * FROM locations ORDER BY id")
        else:
            # Support basique du select (améliorer si besoin)
            rows = await conn.fetch(f"SELECT {select} FROM locations ORDER BY id")
        return [dict(row) for row in rows]

@app.post("/api/locations")
async def create_location(data: LocationCreate):
    """Créer une nouvelle location"""
    async with db_pool.acquire() as conn:
        location_id = f"{data.bay_no}-{data.row_no}-{data.level_no}"
        result = await conn.fetchrow(
            """
            INSERT INTO locations (id, rack_id, row_no, bay_no, level_no, x_m, y_m, z_m, occupied)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
            RETURNING *
            """,
            location_id,
            data.rack_id,
            data.row_no,
            data.bay_no,
            data.level_no,
            data.x_m,
            data.y_m,
            data.z_m
        )
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Stock Items
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/stock_items")
async def get_stock_items(select: Optional[str] = "*"):
    async with db_pool.acquire() as conn:
        if select == "*":
            rows = await conn.fetch("SELECT * FROM stock_items ORDER BY id")
        else:
            rows = await conn.fetch(f"SELECT {select} FROM stock_items ORDER BY id")
        return [dict(row) for row in rows]

@app.post("/api/stock_items")
async def create_stock_item(data: StockItemCreate):
    """Créer un nouvel article de stock"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO stock_items (id, location_id, fill_level, category, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING *
            """,
            f"SKU-{uuid.uuid4().hex[:8]}",
            data.location_id,
            data.fill_level,
            data.category
        )
        
        await manager.broadcast({
            "type": "stock_update",
            "data": dict(result)
        })
        
        return dict(result)

@app.patch("/api/stock_items/{item_id}")
async def update_stock_item(item_id: str, data: StockItemUpdate):
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            UPDATE stock_items 
            SET fill_level = $1, category = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING *
            """,
            data.fill_level,
            data.category,
            item_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="Stock item not found")
        
        await manager.broadcast({
            "type": "stock_update",
            "data": dict(result)
        })
        
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - AGVs
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/agvs")
async def get_agvs():
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM agvs ORDER BY id")
        return [dict(row) for row in rows]

@app.post("/api/agvs")
async def create_agv(data: Dict[str, Any]):
    """Créer un nouvel AGV"""
    async with db_pool.acquire() as conn:
        agv_id = data.get("id", f"AGV-{uuid.uuid4().hex[:8]}")
        result = await conn.fetchrow(
            """
            INSERT INTO agvs (id, x_m, y_m, z_m, rotation_rad, status, battery, speed_mps)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            agv_id,
            data.get("x_m", 0),
            data.get("y_m", 0),
            data.get("z_m", 0),
            data.get("rotation_rad", 0),
            data.get("status", "idle"),
            data.get("battery", 100),
            data.get("speed_mps", 0)
        )
        return dict(result)

@app.patch("/api/agvs/{agv_id}")
async def update_agv(agv_id: str, data: AGVUpdate):
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            UPDATE agvs 
            SET x_m = $1, y_m = $2, z_m = $3, rotation_rad = $4, 
                status = $5, battery = $6, speed_mps = $7, updated_at = NOW()
            WHERE id = $8
            RETURNING *
            """,
            data.x_m, data.y_m, data.z_m, data.rotation_rad,
            data.status, data.battery, data.speed_mps,
            agv_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="AGV not found")
        
        # Broadcast update via WebSocket
        await manager.broadcast({
            "type": "agv_update",
            "data": dict(result)
        })
        
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Missions
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/missions")
async def get_missions(status: Optional[str] = None):
    async with db_pool.acquire() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT * FROM missions WHERE status = $1 ORDER BY created_at DESC",
                status
            )
        else:
            rows = await conn.fetch("SELECT * FROM missions ORDER BY created_at DESC LIMIT 100")
        return [dict(row) for row in rows]

@app.post("/api/missions")
async def create_mission(data: MissionCreate):
    """Créer une nouvelle mission"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO missions (agv_id, status, pickup_location_id, dropoff_location_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            data.agv_id,
            data.status,
            data.pickup_location_id,
            data.dropoff_location_id
        )
        
        await manager.broadcast({
            "type": "mission_created",
            "data": dict(result)
        })
        
        return dict(result)

@app.patch("/api/missions/{mission_id}")
async def update_mission(mission_id: str, status: str):
    """Mettre à jour le statut d'une mission"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            "UPDATE missions SET status = $1 WHERE id = $2 RETURNING *",
            status, mission_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="Mission not found")
        
        await manager.broadcast({
            "type": "mission_updated",
            "data": dict(result)
        })
        
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Orders
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/orders")
async def get_orders(status: Optional[str] = None):
    async with db_pool.acquire() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC",
                status
            )
        else:
            rows = await conn.fetch("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100")
        return [dict(row) for row in rows]

@app.post("/api/orders")
async def create_order(data: OrderCreate):
    """Créer une nouvelle commande"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO orders (status, priority)
            VALUES ($1, $2)
            RETURNING *
            """,
            data.status,
            data.priority
        )
        return dict(result)

@app.patch("/api/orders/{order_id}")
async def update_order(order_id: str, status: str):
    """Mettre à jour le statut d'une commande"""
    async with db_pool.acquire() as conn:
        result = await conn.fetchrow(
            "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
            status, order_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="Order not found")
        return dict(result)

# ═══════════════════════════════════════════════════════════════════════════
# WebSocket - Real-time updates
# ═══════════════════════════════════════════════════════════════════════════

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    print(f"✅ WebSocket client connected (total: {len(manager.active_connections)})")
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Echo back or handle specific commands
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"❌ WebSocket client disconnected (total: {len(manager.active_connections)})")

# ═══════════════════════════════════════════════════════════════════════════
# Routes - Batch Operations
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/batch/stock_items")
async def batch_update_stock_items(items: List[Dict[str, Any]]):
    """Mettre à jour plusieurs articles de stock en une seule requête"""
    async with db_pool.acquire() as conn:
        updated = []
        for item in items:
            result = await conn.fetchrow(
                """
                UPDATE stock_items 
                SET fill_level = $1, category = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *
                """,
                item.get("fill_level"),
                item.get("category"),
                item.get("id")
            )
            if result:
                updated.append(dict(result))
        
        # Broadcast all updates
        await manager.broadcast({
            "type": "batch_stock_update",
            "data": updated
        })
        
        return {"updated": len(updated), "items": updated}

@app.post("/api/batch/agvs")
async def batch_update_agvs(agvs: List[Dict[str, Any]]):
    """Mettre à jour plusieurs AGVs en une seule requête"""
    async with db_pool.acquire() as conn:
        updated = []
        for agv in agvs:
            result = await conn.fetchrow(
                """
                UPDATE agvs 
                SET x_m = $1, y_m = $2, z_m = $3, rotation_rad = $4,
                    status = $5, battery = $6, speed_mps = $7, updated_at = NOW()
                WHERE id = $8
                RETURNING *
                """,
                agv.get("x_m"), agv.get("y_m"), agv.get("z_m"), agv.get("rotation_rad"),
                agv.get("status"), agv.get("battery"), agv.get("speed_mps"),
                agv.get("id")
            )
            if result:
                updated.append(dict(result))
        
        # Broadcast all updates
        await manager.broadcast({
            "type": "batch_agv_update",
            "data": updated
        })
        
        return {"updated": len(updated), "items": updated}
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"❌ WebSocket client disconnected (total: {len(manager.active_connections)})")

# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
