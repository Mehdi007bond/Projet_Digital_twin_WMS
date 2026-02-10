# 📘 Digital Twin WMS - Database Schema Documentation

**Comprehensive developer guide for the Supabase PostgreSQL database**

---

## 1️⃣ Schema Overview & Purpose

### What This Database Does

The **Digital Twin WMS** database powers a **real-time 3D warehouse visualization system** that synchronizes physical warehouse operations with digital representations. It tracks:

- **Physical Infrastructure**: Warehouses, zones (storage/shipping/receiving), racks, and individual storage locations (bins)
- **Dynamic Assets**: Autonomous Guided Vehicles (AGVs) with real-time positioning, battery status, and task assignment
- **Inventory**: Stock items stored at specific locations with fill levels and categories
- **Operations**: Task queue (pickup/dropoff missions) for AGV fleet management

### Core Concepts

| Concept | Purpose | Example |
|---------|---------|---------|
| **Warehouse** | Top-level container | "Main Warehouse" (100m × 50m × 10m) |
| **Zone** | Logical area within warehouse | "Storage Zone A", "Shipping Dock" |
| **Rack** | Physical shelving unit | "RACK-A1", "RACK-B2" |
| **Location** | Individual bin/slot | "A1-01-01" (Rack A1, Row 1, Level 1) |
| **Stock Item** | Stored goods | Physical item at a location with fill level |
| **AGV** | Mobile robot | "AGV-001", current position & battery |
| **Task** | Work order | "Pick A1-01-01, Deliver to Zone-B" |

### Data Flow

```
Warehouse
  ├── Zone (Storage, Shipping, Receiving)
  ├── Rack (Physical shelving)
  │   └── Location (Individual bins)
  │       └── Stock Items (Goods stored)
  │
  ├── AGVs (Robots with position & battery)
  │   └── Tasks (Queue of work orders)
  │
└── Views (Computed KPIs for Dashboard)
    ├── v_kpi_stock (Fill rate, accuracy, rotation)
    └── v_kpi_agv (Utilization, missions/hour, battery)
```

---

## 2️⃣ Table-by-Table Detailed Specification

### 📦 `warehouses` 
Container for all warehouse operations

**Purpose**: Define the physical boundary and dimensions of the warehouse environment.

**Schema**:
```sql
CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    width_m NUMERIC NOT NULL,   -- Warehouse width in meters
    depth_m NUMERIC NOT NULL,   -- Warehouse depth in meters
    height_m NUMERIC NOT NULL,  -- Warehouse height in meters
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | Unique identifier | Primary Key, auto-generated |
| `name` | TEXT | Human-readable warehouse name | Required, e.g., "Main Warehouse" |
| `width_m` | NUMERIC | Width in meters | Required, numeric |
| `depth_m` | NUMERIC | Depth in meters | Required, numeric |
| `height_m` | NUMERIC | Height in meters | Required, numeric for 3D rendering |
| `created_at` | TIMESTAMPTZ | Record creation time | Automatic |
| `updated_at` | TIMESTAMPTZ | Last modification time | Automatic |

**Foreign Keys**: None (root table)

**Unique Constraints**: No uniqueness on `name` (could have multiple warehouses with same name)

**RLS Status**: ✅ Enabled
- Policy: `Allow public read warehouses` → Everyone can SELECT
- ⚠️ **Note**: Public read means no authentication check. For production, restrict to authenticated users or specific tenant.

**Indexing**: 
- Primary key index on `id` (automatic)
- Consider: `CREATE INDEX idx_warehouses_name ON warehouses(name)` for name-based lookups

**Realtime Ready**: ✅ Will be added to publication

---

### 🗺️ `zones`
Logical areas within a warehouse (Storage, Shipping, Returns, etc.)

**Purpose**: Segment warehouse into functional areas for organization and visualization.

**Schema**:
```sql
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,              -- "Storage Zone A", "Shipping Dock"
    zone_type TEXT NOT NULL,         -- "storage", "shipping", "receiving"
    x_m NUMERIC NOT NULL,            -- X position in warehouse (meters)
    z_m NUMERIC NOT NULL,            -- Z position in warehouse (meters)
    width_m NUMERIC NOT NULL,        -- Zone width
    depth_m NUMERIC NOT NULL,        -- Zone depth
    color_hex TEXT,                  -- Color for 3D visualization (e.g., "#4CAF50")
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | Unique zone identifier | PK |
| `warehouse_id` | UUID | Parent warehouse | FK → warehouses.id, CASCADE DELETE |
| `name` | TEXT | Zone name | Required |
| `zone_type` | TEXT | Functional type | Required, e.g., "storage", "shipping", "receiving" |
| `x_m`, `z_m` | NUMERIC | 2D position in warehouse | Required (Y is always ground level) |
| `width_m`, `depth_m` | NUMERIC | Zone dimensions | Required |
| `color_hex` | TEXT | 3D visualization color | Optional, format: "#RRGGBB" |

**Foreign Keys**:
- `warehouse_id` → `warehouses(id)` with `ON DELETE CASCADE`
  - Deleting a warehouse deletes all its zones (and cascades down to racks/locations)

**RLS Status**: ✅ Enabled
- Policy: `Allow public read zones` → Everyone can SELECT

**Indexing**:
- PK on `id`
- Consider: `CREATE INDEX idx_zones_warehouse_id ON zones(warehouse_id)` for filtering by warehouse

**Realtime Ready**: ✅ Included in publication

---

### 🏗️ `racks`
Physical shelving units within a warehouse

**Purpose**: Represent physical rack structures; provides hierarchical organization for bins.

**Schema**:
```sql
CREATE TABLE racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    rack_code TEXT NOT NULL,         -- Human identifier, e.g., "RACK-A1"
    row_no INT NOT NULL,             -- Row number (for spatial organization)
    bay_no INT NOT NULL,             -- Bay/column number
    x_m NUMERIC NOT NULL,            -- X position (meters)
    z_m NUMERIC NOT NULL,            -- Z position (meters)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(warehouse_id, rack_code), -- No duplicate rack codes per warehouse
    UNIQUE(warehouse_id, row_no, bay_no) -- No duplicate spatial positions
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | Unique rack ID | PK |
| `warehouse_id` | UUID | Parent warehouse | FK → warehouses.id, CASCADE |
| `rack_code` | TEXT | Human-readable code | Required, e.g., "RACK-A1", "RACK-B3" |
| `row_no` | INT | Row position | Required |
| `bay_no` | INT | Column/bay position | Required |
| `x_m`, `z_m` | NUMERIC | 3D position | Required |

**Unique Constraints**:
- `(warehouse_id, rack_code)` → Each warehouse's rack codes are unique
- `(warehouse_id, row_no, bay_no)` → No two racks at same position in a warehouse

**RLS Status**: ✅ Enabled
- Policy: `Allow public read racks`

**Indexing**:
- PK on `id`
- Implicit: Unique constraints create indexes
- Consider: `CREATE INDEX idx_racks_warehouse_row_bay ON racks(warehouse_id, row_no, bay_no)`

**Realtime Ready**: ✅ Included

---

### 📍 `locations`
Individual bins/slots where items are stored

**Purpose**: Represent the smallest addressable storage unit (e.g., a bin on a rack shelf).

**Schema**:
```sql
CREATE TABLE locations (
    id TEXT PRIMARY KEY,             -- e.g., "A1-01-01" (rack-row-level-bin)
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    row_no INT NOT NULL,
    bay_no INT NOT NULL,
    level_no INT NOT NULL,          -- Shelf/level (1 = ground, 2 = shelf 2, etc.)
    x_m NUMERIC NOT NULL,
    y_m NUMERIC NOT NULL,           -- Height on rack (meters)
    z_m NUMERIC NOT NULL,
    occupied BOOLEAN DEFAULT false, -- Soft occupancy flag (not strict)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | TEXT | Natural primary key | e.g., "A1-01-01", formatted as "RackCode-Row-Level" |
| `rack_id` | UUID | Parent rack | FK → racks.id, CASCADE |
| `row_no`, `bay_no`, `level_no` | INT | Hierarchical position | Required |
| `x_m`, `y_m`, `z_m` | NUMERIC | 3D coordinates | Required for rendering |
| `occupied` | BOOLEAN | Occupancy indicator | Optional tracking (not enforced) |

**Natural Key**: `id` is text (not auto-generated), e.g., "A1-01-01"
- Advantage: Human-readable, predictable IDs
- Disadvantage: Requires careful formatting on insert

**RLS Status**: ✅ Enabled
- Policy: `Allow public read locations`

**Indexing**:
- PK on `id`
- Consider: `CREATE INDEX idx_locations_rack_id ON locations(rack_id)`

**Realtime Ready**: ✅ Included

---

### 📦 `stock_items`
Goods stored at locations

**Purpose**: Represent physical inventory with fill level and category tracking.

**Schema**:
```sql
CREATE TABLE stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    fill_level INT NOT NULL DEFAULT 0,   -- 0-100 percentage
    category TEXT NOT NULL DEFAULT 'general', -- Type of goods
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | Unique item ID | PK |
| `location_id` | TEXT | Where item is stored | FK → locations.id, CASCADE |
| `fill_level` | INT | Occupancy % (0-100) | Not enforced, but 0-100 recommended |
| `category` | TEXT | Item type | e.g., "Electronics", "Furniture" |

**Foreign Keys**:
- `location_id` → `locations(id)` with CASCADE
  - If location is deleted, all stock at that location is deleted

**RLS Status**: ✅ Enabled
- Policies:
  - `Allow public read stock_items` → SELECT all
  - `Allow public insert stock_items` → INSERT new items
  - `Allow public update stock_items` → UPDATE existing items
- ⚠️ **Production Issue**: Public write access should be restricted to authenticated users or API keys

**Indexing**:
- PK on `id`
- 🔴 **Critical**: `CREATE INDEX idx_stock_items_location_id ON stock_items(location_id)` for inventory lookups
- Consider: `CREATE INDEX idx_stock_items_category ON stock_items(category)` for category filtering

**Realtime Ready**: ✅ **YES** - Added to `supabase_realtime` publication
- This table's changes will broadcast to subscribed clients in real-time

---

### 🤖 `agvs`
Autonomous Guided Vehicles (mobile robots)

**Purpose**: Track robot position, battery status, and assignment.

**Schema**:
```sql
CREATE TABLE agvs (
    id TEXT PRIMARY KEY,                    -- e.g., "agv-001", "agv-002"
    name TEXT NOT NULL,                     -- Display name
    x_m NUMERIC NOT NULL DEFAULT 0,         -- Current X position (meters)
    y_m NUMERIC NOT NULL DEFAULT 0,         -- Current Y position (ground = 0.5)
    z_m NUMERIC NOT NULL DEFAULT 0,         -- Current Z position (meters)
    rotation_rad NUMERIC NOT NULL DEFAULT 0,-- Heading angle (radians, 0-2π)
    status TEXT NOT NULL DEFAULT 'idle',    -- "idle", "moving", "collecting", "delivering", "charging"
    battery NUMERIC NOT NULL DEFAULT 100,   -- Battery % (0-100)
    speed_mps NUMERIC NOT NULL DEFAULT 0,   -- Speed (meters/second)
    current_task_id TEXT,                   -- Assigned task, if any
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | TEXT | Unique AGV ID | PK, natural key, e.g., "agv-001" |
| `name` | TEXT | Display name | Required, e.g., "AGV-001" |
| `x_m`, `y_m`, `z_m` | NUMERIC | 3D position | Updated frequently for real-time movement |
| `rotation_rad` | NUMERIC | Heading angle | Radians (0 = East, π/2 = North, etc.) |
| `status` | TEXT | Current state | Enum-like: "idle", "moving", "collecting", "delivering", "charging" |
| `battery` | NUMERIC | Battery level | 0-100, used for charging decisions |
| `speed_mps` | NUMERIC | Velocity | Meters/second, for animation |
| `current_task_id` | TEXT | Active task | FK reference (not enforced as constraint) |

**Natural Key**: `id` is TEXT (not UUID)
- Allows friendly IDs like "agv-001"
- More readable in logs and UI

**RLS Status**: ✅ Enabled
- Policies:
  - `Allow public read agvs` → SELECT
  - `Allow public insert agvs` → INSERT
  - `Allow public update agvs` → UPDATE
- ⚠️ **Issue**: Should restrict writes to authenticated backend service

**Indexing**:
- PK on `id`
- Consider: `CREATE INDEX idx_agvs_status ON agvs(status)` for filtering (e.g., "find all idle AGVs")
- Consider: `CREATE INDEX idx_agvs_battery ON agvs(battery)` for charging decisions

**Realtime Ready**: ✅ **YES** - Added to `supabase_realtime` publication
- Highest update frequency expected for this table
- Every movement update fires a realtime event

**⚠️ Performance Note**: With multiple AGVs updating positions frequently (e.g., 10 Hz), this table sees high write volume. Ensure database can handle it.

---

### 📋 `tasks`
Work queue for AGV missions

**Purpose**: Represent pickup/dropoff orders and task lifecycle.

**Schema**:
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,                       -- e.g., "task-1001"
    agv_id TEXT REFERENCES agvs(id),          -- Assigned AGV (nullable = unassigned)
    task_type TEXT NOT NULL,                  -- "inbound", "outbound", "relocate", "charging"
    status TEXT NOT NULL DEFAULT 'pending',   -- "pending", "assigned", "in_progress", "completed", "failed"
    priority INT NOT NULL DEFAULT 1,          -- 0=low, 1=normal, 2=high, 3=urgent
    pickup_location_id TEXT,                  -- Source location
    dropoff_location_id TEXT,                 -- Destination location
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,                   -- When task execution began
    completed_at TIMESTAMPTZ,                 -- When task finished
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | TEXT | Unique task ID | PK, e.g., "task-1001" |
| `agv_id` | TEXT | Assigned AGV | FK → agvs.id (nullable = unassigned) |
| `task_type` | TEXT | Task category | e.g., "inbound", "outbound", "relocate" |
| `status` | TEXT | Lifecycle stage | Enum-like: "pending", "assigned", "in_progress", "completed", "failed" |
| `priority` | INT | Execution priority | 0=low, 1=normal, 2=high, 3=urgent |
| `pickup_location_id` | TEXT | Source | Optional, may be receiving dock |
| `dropoff_location_id` | TEXT | Destination | Optional, may be shipping dock |
| `created_at` | TIMESTAMPTZ | Task creation | Automatic |
| `started_at` | TIMESTAMPTZ | Execution start | Set when status → "in_progress" |
| `completed_at` | TIMESTAMPTZ | Execution end | Set when status → "completed" or "failed" |

**Foreign Keys**:
- `agv_id` → `agvs(id)` (nullable, no CASCADE)
  - If AGV is deleted, task becomes unassigned (orphaned)

**RLS Status**: ✅ Enabled
- Policies:
  - `Allow public read tasks` → SELECT
  - `Allow public insert tasks` → INSERT
  - `Allow public update tasks` → UPDATE

**Indexing**:
- PK on `id`
- Consider: `CREATE INDEX idx_tasks_agv_id ON tasks(agv_id)` for "get AGV's current task"
- Consider: `CREATE INDEX idx_tasks_status ON tasks(status)` for "find pending tasks"
- Consider: `CREATE INDEX idx_tasks_priority ON tasks(priority DESC)` for priority dispatch

**Realtime Ready**: ✅ **YES** - Added to `supabase_realtime` publication

---

## 3️⃣ Views: KPI Computation & Realtime

Views compute derived analytics. They are **read-only** but can be published to Realtime.

### 📊 `v_kpi_stock`
Computes warehouse inventory statistics

**Purpose**: Provide dashboard metrics without expensive computation on each query.

**Schema**:
```sql
CREATE OR REPLACE VIEW v_kpi_stock AS
SELECT
    COUNT(DISTINCT si.id) as total_items,
    COUNT(DISTINCT CASE WHEN si.fill_level > 0 THEN si.id END) as filled_items,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN si.fill_level > 0 THEN si.id END) 
          / NULLIF(COUNT(DISTINCT si.id), 0), 2) as fill_rate_percent,
    ROUND(AVG(si.fill_level), 2) as avg_fill_level,
    COUNT(DISTINCT si.category) as unique_categories,
    99.2 as accuracy_percent,        -- Hardcoded placeholder
    12.5 as inventory_rotation       -- Hardcoded placeholder
FROM stock_items si;
```

| Column | Meaning | Computation |
|--------|---------|-------------|
| `total_items` | Total storage locations with stock | COUNT(DISTINCT stock_items.id) |
| `filled_items` | Locations with fill_level > 0 | Filtered count |
| `fill_rate_percent` | % of locations with goods | filled_items / total_items × 100 |
| `avg_fill_level` | Average occupancy % | AVG(fill_level) across all items |
| `unique_categories` | Number of product types | COUNT(DISTINCT category) |
| `accuracy_percent` | Inventory accuracy (placeholder) | Hardcoded 99.2 (TODO: compute from audit data) |
| `inventory_rotation` | Stock turnover rate (placeholder) | Hardcoded 12.5 (TODO: compute from historical tasks) |

**⚠️ Known Issues**:
- `accuracy_percent` and `inventory_rotation` are hardcoded
  - Need historical task/audit tables to compute correctly
  - Placeholder for future enhancement

**Realtime Ready**: ✅ **YES** - Added to `supabase_realtime` publication
- Changes to `stock_items` will trigger view updates
- Clients subscribing to `v_kpi_stock` will receive updates

**Performance**:
- View scans entire `stock_items` table
- OK for <100K items, but consider materialized view if slow
- No indexes on the view itself (can't index views)

---

### 📊 `v_kpi_agv`
Computes fleet utilization and performance metrics

**Schema**:
```sql
CREATE OR REPLACE VIEW v_kpi_agv AS
SELECT
    COUNT(DISTINCT a.id) as total_agvs,
    COUNT(DISTINCT CASE WHEN a.status = 'idle' THEN a.id END) as idle_agvs,
    COUNT(DISTINCT CASE WHEN a.status = 'moving' THEN a.id END) as moving_agvs,
    COUNT(DISTINCT CASE WHEN a.status = 'charging' THEN a.id END) as charging_agvs,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.status IN ('moving', 'collecting', 'delivering') THEN a.id END) 
          / NULLIF(COUNT(DISTINCT a.id), 0), 2) as utilization_percent,
    ROUND(AVG(a.battery), 2) as avg_battery,
    24 as missions_per_hour
FROM agvs a;
```

| Column | Meaning | Computation |
|--------|---------|-------------|
| `total_agvs` | Fleet size | COUNT(DISTINCT agvs.id) |
| `idle_agvs` | AGVs available | Status = "idle" |
| `moving_agvs` | AGVs in transit | Status = "moving" |
| `charging_agvs` | AGVs charging | Status = "charging" |
| `utilization_percent` | Fleet in use | (moving + collecting + delivering) / total × 100 |
| `avg_battery` | Average charge level | AVG(battery) |
| `missions_per_hour` | Throughput (placeholder) | Hardcoded 24 (TODO: compute from tasks.completed_at) |

**⚠️ Known Issues**:
- `missions_per_hour` is hardcoded; should compute from tasks completed in last hour

**Realtime Ready**: ✅ **YES** - Added to `supabase_realtime` publication

---

## 4️⃣ Row-Level Security (RLS) & Authentication

### Current RLS Setup

**Status**: ✅ RLS **ENABLED** on all tables

**Policies Applied**:

| Table | Policy | Effect | Notes |
|-------|--------|--------|-------|
| **warehouses** | Allow public read | SELECT all | No authentication required |
| **zones** | Allow public read | SELECT all | — |
| **racks** | Allow public read | SELECT all | — |
| **locations** | Allow public read | SELECT all | — |
| **stock_items** | Allow public read + insert + update | SELECT, INSERT, UPDATE all | ⚠️ SECURITY ISSUE |
| **agvs** | Allow public read + insert + update | SELECT, INSERT, UPDATE all | ⚠️ SECURITY ISSUE |
| **tasks** | Allow public read + insert + update | SELECT, INSERT, UPDATE all | ⚠️ SECURITY ISSUE |

### ⚠️ Security Issues in Current Setup

1. **Public Write Access**: `stock_items`, `agvs`, `tasks` allow **unauthenticated INSERT/UPDATE**
   - Any visitor to your frontend can modify data
   - **For demo/dev**: OK
   - **For production**: Must restrict to authenticated users or service keys

2. **No Tenant Isolation**: No multi-tenant filtering
   - All users see all data
   - If supporting multiple warehouses/organizations, need `CREATE POLICY ... USING (auth.uid() = creator_id)`

3. **No Row-Level Filtering**: Policies don't filter rows based on user
   - All rows visible to all authenticated users

### 🔒 Production RLS Policy Examples

**Restrict writes to authenticated users**:
```sql
-- Replace: Allow public insert stock_items
CREATE POLICY "Allow authenticated insert stock_items" ON stock_items
    FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

-- Replace: Allow public update stock_items
CREATE POLICY "Allow authenticated update stock_items" ON stock_items
    FOR UPDATE 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
```

**Restrict to specific warehouse (multi-tenant)**:
```sql
-- Add column to stock_items:
ALTER TABLE stock_items ADD COLUMN warehouse_id UUID;

-- Policy with warehouse filter:
CREATE POLICY "Users see own warehouse stock" ON stock_items
    FOR SELECT
    USING (warehouse_id IN (
        SELECT warehouse_id FROM user_warehouses 
        WHERE user_id = auth.uid()
    ));
```

### Auth Context in Supabase

- `auth.uid()` → Current user's ID (NULL if not authenticated)
- `auth.role()` → 'authenticated' or 'anon'
- `auth.jwt()` → Full JWT token (can extract custom claims)

---

## 5️⃣ Realtime/Publication Configuration

### Which Tables/Views Are Published

Realtime publication: `supabase_realtime`

**Added Tables/Views**:
- ✅ `stock_items` → Inventory changes broadcast
- ✅ `agvs` → Position/battery changes broadcast
- ✅ `tasks` → Task status changes broadcast
- ✅ `v_kpi_stock` → KPI updates broadcast
- ✅ `v_kpi_agv` → Fleet stats updates broadcast

**NOT Published** (silent):
- ❌ `warehouses` (rarely changes)
- ❌ `zones` (rarely changes)
- ❌ `racks` (rarely changes)
- ❌ `locations` (rarely changes)

### Realtime Event Flow

**Example: AGV Moves**

1. Backend updates `agvs` table:
   ```sql
   UPDATE agvs SET x_m = 25.5, z_m = 30.1, updated_at = now() WHERE id = 'agv-001';
   ```

2. PostgreSQL WAL (Write-Ahead Log) captures change

3. Realtime server detects `UPDATE` on `agvs`

4. Event published to channel `public:agvs`

5. Connected clients receive:
   ```javascript
   {
       type: 'UPDATE',
       schema: 'public',
       table: 'agvs',
       new: { id: 'agv-001', x_m: 25.5, z_m: 30.1, ... },
       old: { id: 'agv-001', x_m: 25.0, z_m: 30.0, ... }
   }
   ```

6. Frontend animates AGV to new position in real-time

### RLS + Realtime Interaction

**RLS applies to Realtime**: Users only receive events for rows they can SELECT
- If user has `Allow public read agvs`, they see all AGV updates
- If restricted by warehouse ID, they only see updates for their warehouse's AGVs

**⚠️ Gotcha**: If RLS denies access, Realtime won't subscribe → Silent failure
- Test with `supabaseClient.channel('public:agvs').on(...).subscribe()` in browser console
- Check `console.error()` for subscription rejections

---

## 6️⃣ Sample Data & Testing

### Sample Data Inserted

**Warehouse**:
```sql
INSERT INTO warehouses (name, width_m, depth_m, height_m)
VALUES ('Main Warehouse', 100, 50, 10);
```

**AGVs** (3 sample robots):
```sql
INSERT INTO agvs (id, name, status, battery)
VALUES 
    ('agv-001', 'AGV-001', 'idle', 85),
    ('agv-002', 'AGV-002', 'moving', 62),
    ('agv-003', 'AGV-003', 'charging', 45);
```

### How Sample Data Helps Testing

| Data | Test Scenario |
|------|---|
| 3 diverse AGVs (idle, moving, charging) | Test status filtering, KPI calculations |
| Varying battery levels (85%, 62%, 45%) | Test charging alerts, utilization logic |
| Mock warehouse dimensions | Test 3D rendering in frontend |

### Testing Realtime Locally

**Step 1: Subscribe to changes in browser console**
```javascript
const channel = window.supabaseClient
    .channel('public:agvs')
    .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'agvs' },
        msg => console.log('Realtime event:', msg)
    )
    .subscribe();
```

**Step 2: Modify data in another tab or via SQL**
```sql
UPDATE agvs SET x_m = 30, z_m = 40 WHERE id = 'agv-001';
```

**Step 3: Observe event in console**
```
Realtime event: {
    type: 'UPDATE',
    table: 'agvs',
    new: { id: 'agv-001', x_m: 30, z_m: 40, ... }
}
```

---

## 7️⃣ Potential Pitfalls & Gotchas

### 🔴 Critical Issues

1. **Views Cannot Be Updated**
   - `v_kpi_stock` and `v_kpi_agv` are read-only
   - Cannot DELETE or UPDATE directly
   - Solution: Delete/update underlying tables (stock_items, agvs)

2. **Realtime Loses SLA on Cascade Deletes**
   - Deleting a warehouse cascades to zones → racks → locations → stock_items
   - Realtime events fire for **each row deleted individually**
   - Frontend will receive numerous DELETE events
   - Solution: Batch deletes; notify frontend of bulk operation separately

3. **`locations.occupied` Is Not Enforced**
   - Can have `occupied = true` but no stock_items reference
   - Can have `occupied = false` but stock_items exist
   - Solution: Use trigger or application logic to keep in sync

4. **AGV `current_task_id` Not Enforced**
   - No foreign key constraint
   - Dangling references possible if task deleted
   - Solution: Use application logic + triggers

### 🟡 Medium Issues

5. **Hardcoded KPI Metrics**
   - `accuracy_percent = 99.2` and `missions_per_hour = 24` are hardcoded
   - Not accurate representations
   - Solution: Add audit/completed_tasks tables, recompute view

6. **No Timestamp Zones**
   - All timestamps are `without timezone` (or UTC)
   - Comparing times across regions requires client-side conversion
   - Solution: Store `created_at`, `updated_at` in `timestamptz` (already done ✅)

7. **Locations Use TEXT PK**
   - Natural key "A1-01-01" is human-friendly but error-prone
   - Easy to insert duplicate IDs with formatting differences
   - Solution: Validate format; consider enforcing pattern

8. **No Soft Delete**
   - Deleting a warehouse actually deletes data (CASCADE)
   - Cannot recover deleted data
   - Solution: Add `deleted_at` column; filter WHERE deleted_at IS NULL in views

### 🟢 Minor Issues

9. **Stock Fill Level Not Constrained**
   - Can insert `fill_level = 150` (should be 0-100)
   - Solution: Add CHECK constraint: `CHECK (fill_level >= 0 AND fill_level <= 100)`

10. **Status Enums Are TEXT**
    - No enum type; typos not caught (e.g., "mov ing" instead of "moving")
    - Solution: Create PostgreSQL ENUM type:
      ```sql
      CREATE TYPE agv_status AS ENUM ('idle', 'moving', 'collecting', 'delivering', 'charging');
      ALTER TABLE agvs ALTER COLUMN status TYPE agv_status;
      ```

---

## 8️⃣ Suggested API Endpoints & SQL Queries

### Common Backend Queries

#### 📖 Read Operations

**Get all warehouses**:
```sql
SELECT * FROM warehouses LIMIT 100;
```

**Get warehouse with all zones and racks**:
```sql
SELECT w.*, z.*, r.*
FROM warehouses w
LEFT JOIN zones z ON z.warehouse_id = w.id
LEFT JOIN racks r ON r.warehouse_id = w.id
WHERE w.id = $1;
```

**Get all AGVs with current status**:
```sql
SELECT 
    id, name, x_m, z_m, status, battery, speed_mps, current_task_id
FROM agvs
ORDER BY status, battery DESC;
```

**Get idle AGVs (ready for tasking)**:
```sql
SELECT * FROM agvs WHERE status = 'idle' ORDER BY battery DESC;
```

**Get all tasks for an AGV**:
```sql
SELECT * FROM tasks WHERE agv_id = $1 ORDER BY created_at DESC;
```

**Get pending tasks (not yet assigned)**:
```sql
SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC;
```

**Get stock items at a location**:
```sql
SELECT si.* FROM stock_items si
WHERE si.location_id = $1;
```

**Get stock items by category**:
```sql
SELECT * FROM stock_items WHERE category = $1 LIMIT 100;
```

**Get all locations in a rack**:
```sql
SELECT * FROM locations WHERE rack_id = $1 ORDER BY level_no DESC;
```

**Get warehouse KPI snapshot**:
```sql
SELECT * FROM v_kpi_stock;
```

**Get AGV fleet KPI snapshot**:
```sql
SELECT * FROM v_kpi_agv;
```

#### ✍️ Write Operations

**Create a new stock item**:
```sql
INSERT INTO stock_items (location_id, fill_level, category)
VALUES ($1, $2, $3)
RETURNING *;
```

**Update AGV position (high frequency)**:
```sql
UPDATE agvs 
SET x_m = $2, z_m = $3, rotation_rad = $4, speed_mps = $5, updated_at = now()
WHERE id = $1
RETURNING *;
```

**Assign a task to an AGV**:
```sql
UPDATE tasks
SET agv_id = $2, status = 'assigned', updated_at = now()
WHERE id = $1;

UPDATE agvs
SET current_task_id = $1
WHERE id = $2;
```

**Start task execution**:
```sql
UPDATE tasks
SET status = 'in_progress', started_at = now(), updated_at = now()
WHERE id = $1;

UPDATE agvs
SET status = 'moving'
WHERE id = $2;
```

**Complete a task**:
```sql
UPDATE tasks
SET status = 'completed', completed_at = now(), updated_at = now()
WHERE id = $1;

UPDATE agvs
SET status = 'idle', current_task_id = NULL
WHERE id = $2;
```

#### 🔗 Complex JOINs

**Get stock item details with location and rack info**:
```sql
SELECT 
    si.id as item_id,
    si.fill_level,
    si.category,
    l.id as location_id,
    l.level_no,
    r.rack_code,
    r.row_no,
    r.bay_no,
    w.name as warehouse_name
FROM stock_items si
JOIN locations l ON l.id = si.location_id
JOIN racks r ON r.id = l.rack_id
JOIN warehouses w ON w.id = r.warehouse_id
WHERE w.id = $1
ORDER BY r.rack_code, l.level_no;
```

**Get AGV with assigned task details**:
```sql
SELECT 
    a.id as agv_id,
    a.name,
    a.status,
    a.battery,
    a.x_m, a.z_m,
    t.id as task_id,
    t.task_type,
    t.status as task_status,
    t.pickup_location_id,
    t.dropoff_location_id
FROM agvs a
LEFT JOIN tasks t ON t.id = a.current_task_id
WHERE a.id = $1;
```

**Get fill rate by category**:
```sql
SELECT 
    category,
    COUNT(*) as total_items,
    ROUND(AVG(fill_level), 2) as avg_fill_level,
    COUNT(CASE WHEN fill_level > 0 THEN 1 END) as filled_count,
    ROUND(100.0 * COUNT(CASE WHEN fill_level > 0 THEN 1 END) / COUNT(*), 2) as fill_percent
FROM stock_items
GROUP BY category
ORDER BY fill_percent DESC;
```

### Suggested API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/warehouses` | GET | List all warehouses |
| `GET /api/warehouses/{id}` | GET | Get single warehouse geometry + zones |
| `GET /api/agvs` | GET | List all AGVs with current position |
| `GET /api/agvs/{id}` | GET | Get AGV details + assigned task |
| `PATCH /api/agvs/{id}` | PATCH | Update AGV position (realtime streaming) |
| `GET /api/tasks` | GET | List all tasks |
| `POST /api/tasks` | POST | Create new task |
| `PATCH /api/tasks/{id}` | PATCH | Update task status |
| `GET /api/stock` | GET | List stock items (paginated) |
| `POST /api/stock` | POST | Add stock item |
| `PATCH /api/stock/{id}` | PATCH | Update fill level |
| `GET /api/kpi/stock` | GET | Warehouse KPI snapshot |
| `GET /api/kpi/agv` | GET | Fleet KPI snapshot |

---

## 🔐 Security & RLS Best Practices

### Current State: ⚠️ **Demo/Dev Only**

Policies allow public writes. Sufficient for **development and internal demo**.

### Production Checklist

#### 1. **Restrict Authentication**

Replace all `FOR INSERT/UPDATE WITH CHECK (true)` with:
```sql
DROP POLICY "Allow public insert stock_items" ON stock_items;
DROP POLICY "Allow public update stock_items" ON stock_items;

CREATE POLICY "Authenticated users insert" ON stock_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users update" ON stock_items
    FOR UPDATE USING (auth.role() = 'authenticated');
```

Do the same for `agvs` and `tasks`.

#### 2. **Add Multi-Tenancy Support**

```sql
-- Add warehouse ownership column
ALTER TABLE warehouses ADD COLUMN owner_id UUID REFERENCES auth.users(id);

-- Create user_warehouses mapping
CREATE TABLE user_warehouses (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'operator', -- "owner", "manager", "operator"
    PRIMARY KEY (user_id, warehouse_id)
);

-- Add RLS to user_warehouses
ALTER TABLE user_warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own warehouse access" ON user_warehouses
    FOR SELECT USING (user_id = auth.uid());

-- Filter stock_items by user's warehouses
CREATE POLICY "Users see stock in their warehouses" ON stock_items
    FOR SELECT
    USING (location_id IN (
        SELECT l.id FROM locations l
        JOIN racks r ON r.id = l.rack_id
        JOIN warehouses w ON w.id = r.warehouse_id
        JOIN user_warehouses uw ON uw.warehouse_id = w.id
        WHERE uw.user_id = auth.uid()
    ));
```

#### 3. **Audit Trail**

```sql
-- Create audit table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add trigger to log changes
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, user_id)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attach to stock_items
CREATE TRIGGER audit_stock_items AFTER INSERT OR UPDATE OR DELETE ON stock_items
FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

#### 4. **API Key Segregation**

In Supabase Dashboard:
1. Create separate API keys:
   - **Public/Anon Key**: Limited SELECT (read-only)
   - **Service Key**: Full CRUD (backend use only, server-side)
   - **User Key**: Personal JWT (authenticated users)

2. Frontend uses **Public Key** + auth
3. Backend uses **Service Key** (private, never in frontend code)

---

## 9️⃣ Performance Recommendations

### Indexing Strategy

**Priority 1 (Add immediately)**:
```sql
-- Frequent filtering by warehouse
CREATE INDEX idx_zones_warehouse_id ON zones(warehouse_id);
CREATE INDEX idx_racks_warehouse_id ON racks(warehouse_id);
CREATE INDEX idx_locations_rack_id ON locations(rack_id);
CREATE INDEX idx_stock_items_location_id ON stock_items(location_id);
CREATE INDEX idx_tasks_agv_id ON tasks(agv_id);

-- Frequent filtering by status
CREATE INDEX idx_agvs_status ON agvs(status);
CREATE INDEX idx_tasks_status ON tasks(status);
```

**Priority 2 (Add if slow queries detected)**:
```sql
-- Filtering by category
CREATE INDEX idx_stock_items_category ON stock_items(category);

-- Filtering by priority
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);

-- Battery-based filtering
CREATE INDEX idx_agvs_battery ON agvs(battery);

-- Time-based filtering  
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
```

### Query Optimization

**Problem**: Joined queries scanning large tables

**Solution: Denormalize cautiously**

Instead of:
```sql
SELECT w.name, z.name, COUNT(si.id)
FROM warehouses w
JOIN zones z ON z.warehouse_id = w.id
JOIN racks r ON r.warehouse_id = w.id
JOIN locations l ON l.rack_id = r.id
JOIN stock_items si ON si.location_id = l.id
GROUP BY w.id, z.id; -- 5-table join!
```

Cache with a materialized view:
```sql
CREATE MATERIALIZED VIEW zone_stock_counts AS
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    z.id as zone_id,
    z.name as zone_name,
    COUNT(DISTINCT si.id) as item_count,
    ROUND(AVG(si.fill_level), 2) as avg_fill
FROM warehouses w
JOIN zones z ON z.warehouse_id = w.id
LEFT JOIN racks r ON r.warehouse_id = w.id AND r.zone_id = z.id -- (add zone_id to racks)
LEFT JOIN locations l ON l.rack_id = r.id
LEFT JOIN stock_items si ON si.location_id = l.id
GROUP BY w.id, z.id;

CREATE INDEX ON zone_stock_counts(warehouse_id);

-- Refresh periodically:
REFRESH MATERIALIZED VIEW zone_stock_counts;
```

### Realtime Burst Handling

**Problem**: 10 AGVs updating position at 10 Hz = 100 writes/second

**Solution**:
1. **Batch updates**: Group 10-20 position updates into single query
2. **Throttle frontend subscriptions**: Debounce realtime updates to 1-2 Hz for display
3. **Use separate table for position history**: Archive old positions to separate table post-processing

```javascript
// Frontend: Throttle realtime updates
const debouncedRender = debounce(() => renderAGVs(), 100); // Max 10 Hz render

channel.on('postgres_changes', { ... }, (msg) => {
    updateAGVPositionInMemory(msg.new);
    debouncedRender();
});
```

---

## 🔟 Onboarding Checklist

New developers should complete:

- [ ] **1. Clone repo & review schema**
  ```bash
  psql $DATABASE_URL < database/supabase-schema.sql
  ```

- [ ] **2. Load sample data**
  ```bash
  psql $DATABASE_URL < database/seed_data.sql
  ```

- [ ] **3. Verify schema objects**
  ```sql
  \dt -- List tables
  \dv -- List views
  \dx -- List extensions
  ```

- [ ] **4. Test basic SELECT queries**
  ```sql
  SELECT * FROM warehouses;
  SELECT * FROM agvs;
  SELECT * FROM v_kpi_stock;
  ```

- [ ] **5. Test Realtime subscription (browser)**
  ```javascript
  const ch = supabaseClient.channel('public:agvs')
      .on('postgres_changes', { ... }, msg => console.log(msg))
      .subscribe();
  // Should see 'Subscribed' in console
  ```

- [ ] **6. Test RLS (verify data access)**
  ```javascript
  // Unauthenticated
  const { data } = await supabaseClient.from('agvs').select();
  console.log(data); // Should see sample data

  // Authenticated
  const { data: auth } = await supabaseClient.auth.signUp({ ... });
  // Try queries again
  ```

- [ ] **7. Review production RLS policies** (see Security section)

- [ ] **8. Load performance profiling queries**
  ```sql
  EXPLAIN ANALYZE SELECT * FROM stock_items 
      WHERE location_id IN (SELECT id FROM locations WHERE rack_id = $1);
  ```

- [ ] **9. Document any custom modifications**
  - Which policies changed?
  - Which indexes added?
  - Which views modified?

- [ ] **10. Set up CI/CD for schema migrations**
  - Use Supabase migrations folder: `supabase/migrations/`
  - Git-track all schema changes

---

## 1️⃣1️⃣ Schema Improvements & Additional Views/Functions

### Suggested Improvements

#### ❌ Problem 1: Missing AGV Utilization Trend
**Current KPI**: `missions_per_hour` is hardcoded

**Solution**: Track completed tasks
```sql
CREATE TABLE task_completion_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL,
    agv_id TEXT,
    completed_at TIMESTAMPTZ NOT NULL,
    duration_seconds INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE VIEW v_agv_missions_per_hour AS
SELECT 
    CURRENT_DATE::date + (hour_num || ' hours')::interval as hour,
    COUNT(DISTINCT task_id) as completed_tasks,
    COUNT(DISTINCT agv_id) as agvs_active
FROM (
    SELECT 
        EXTRACT(HOUR FROM completed_at)::int as hour_num,
        task_id,
        agv_id
    FROM task_completion_log
    WHERE completed_at > now() - interval '24 hours'
) hourly
GROUP BY hour_num;
```

#### ❌ Problem 2: No Constraint on Fill Level
**Current**: Can insert `fill_level = 999`

**Solution**: Add CHECK constraint
```sql
ALTER TABLE stock_items 
ADD CONSTRAINT chk_fill_level_range 
CHECK (fill_level >= 0 AND fill_level <= 100);
```

#### ❌ Problem 3: Status Enums Are TEXT
**Current**: Typos not caught (`"mov ing"` accepted)

**Solution**: Create ENUM type
```sql
CREATE TYPE agv_status AS ENUM ('idle', 'moving', 'collecting', 'delivering', 'charging');
ALTER TABLE agvs ALTER COLUMN status TYPE agv_status USING status::agv_status;

CREATE TYPE task_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'failed');
ALTER TABLE tasks ALTER COLUMN status TYPE task_status USING status::task_status;
```

#### ❌ Problem 4: No Archive/Soft Delete
**Current**: Deleting warehouse loses data

**Solution**: Add soft delete
```sql
ALTER TABLE warehouses ADD COLUMN deleted_at TIMESTAMPTZ;

-- Update view to filter deleted
CREATE OR REPLACE VIEW v_active_warehouses AS
SELECT * FROM warehouses WHERE deleted_at IS NULL;

-- Delete becomes archive
CREATE OR REPLACE FUNCTION delete_warehouse(w_id UUID) AS $$
BEGIN
    UPDATE warehouses SET deleted_at = now() WHERE id = w_id;
END;
$$ LANGUAGE plpgsql;
```

#### ❌ Problem 5: AGV Battery Alerts
**Current**: No low-battery warning

**Solution**: Add trigger
```sql
CREATE FUNCTION check_agv_battery() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.battery < 20 THEN
        -- Insert alert or publish realtime notification
        INSERT INTO alerts (agv_id, message) 
        VALUES (NEW.id, 'Low battery: ' || NEW.battery || '%');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agv_battery_alert AFTER UPDATE ON agvs
FOR EACH ROW
WHEN (NEW.battery < 20 AND (OLD.battery IS NULL OR NEW.battery < OLD.battery))
EXECUTE FUNCTION check_agv_battery();
```

### Additional Helpful Views

#### View: Free/Occupied Locations
```sql
CREATE VIEW v_location_occupancy AS
SELECT 
    l.id,
    l.rack_id,
    r.rack_code,
    l.level_no,
    CASE WHEN COUNT(si.id) > 0 THEN 'occupied' ELSE 'free' END as status,
    COUNT(si.id) as item_count,
    COALESCE(AVG(si.fill_level), 0) as avg_fill
FROM locations l
JOIN racks r ON r.id = l.rack_id
LEFT JOIN stock_items si ON si.location_id = l.id
GROUP BY l.id, r.id;
```

#### View: AGV Workload Distribution
```sql
CREATE VIEW v_agv_workload AS
SELECT 
    a.id,
    a.name,
    a.status,
    COUNT(CASE WHEN t.status IN ('pending', 'assigned', 'in_progress') THEN 1 END) as queued_tasks,
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_today,
    COALESCE(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) as avg_task_duration_sec
FROM agvs a
LEFT JOIN tasks t ON t.agv_id = a.id 
    AND DATE(t.completed_at) = CURRENT_DATE
GROUP BY a.id;
```

#### Function: Assign Nearest AGV to Task
```sql
CREATE OR REPLACE FUNCTION assign_nearest_agv(task_id TEXT, pickup_x NUMERIC, pickup_z NUMERIC)
RETURNS TEXT AS $$
DECLARE
    agv_id TEXT;
BEGIN
    SELECT a.id INTO agv_id
    FROM agvs a
    WHERE a.status = 'idle'
    ORDER BY sqrt(power(a.x_m - pickup_x, 2) + power(a.z_m - pickup_z, 2))
    LIMIT 1;
    
    UPDATE tasks SET agv_id = agv_id, status = 'assigned' WHERE id = task_id;
    UPDATE agvs SET current_task_id = task_id WHERE id = agv_id;
    
    RETURN agv_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 1️⃣2️⃣ Ready-to-Run SQL Examples

### SELECT Examples

**Sample data from each table**:
```sql
SELECT * FROM warehouses LIMIT 10;
SELECT * FROM zones LIMIT 10;
SELECT * FROM racks LIMIT 10;
SELECT * FROM locations LIMIT 10;
SELECT * FROM stock_items LIMIT 10;
SELECT * FROM agvs LIMIT 10;
SELECT * FROM tasks LIMIT 10;
SELECT * FROM v_kpi_stock;
SELECT * FROM v_kpi_agv;
```

### Complex JOIN: Stock Item Full Details
```sql
SELECT 
    si.id as item_id,
    si.fill_level,
    si.category,
    l.id as location_id,
    l.level_no,
    r.rack_code,
    r.row_no as rack_row,
    r.bay_no as rack_bay,
    z.name as zone,
    w.name as warehouse
FROM stock_items si
INNER JOIN locations l ON si.location_id = l.id
INNER JOIN racks r ON l.rack_id = r.id
INNER JOIN warehouses w ON r.warehouse_id = w.id
LEFT JOIN zones z ON z.warehouse_id = w.id
WHERE w.name = 'Main Warehouse'
ORDER BY r.rack_code, l.level_no DESC
LIMIT 100;
```

### KPI Query Without View
```sql
SELECT
    COUNT(DISTINCT si.id) as total_items,
    COUNT(DISTINCT CASE WHEN si.fill_level > 0 THEN si.id END) as filled_items,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN si.fill_level > 0 THEN si.id END) 
          / NULLIF(COUNT(DISTINCT si.id), 0), 2) as fill_rate_percent,
    ROUND(AVG(si.fill_level), 2) as avg_fill_level,
    COUNT(DISTINCT si.category) as categories,
    (SELECT COUNT(*) FROM agvs WHERE status IN ('moving', 'collecting', 'delivering')) as active_agvs,
    (SELECT COUNT(*) FROM tasks WHERE status = 'pending') as pending_tasks
FROM stock_items si;
```

### Insert: New Location + Stock Item (Transaction)
```sql
BEGIN;

-- Ensure location exists
INSERT INTO locations (id, rack_id, row_no, bay_no, level_no, x_m, y_m, z_m)
SELECT 'A1-02-03', id, 2, 0, 3, 15, 2.5, 15
FROM racks WHERE rack_code = 'RACK-A1'
ON CONFLICT DO NOTHING;

-- Add stock item to location
INSERT INTO stock_items (location_id, fill_level, category)
VALUES ('A1-02-03', 75, 'Electronics')
RETURNING *;

COMMIT;
```

### Update: Assign Task to AGV
```sql
-- Atomically assign task and update AGV
BEGIN;

UPDATE tasks
SET agv_id = 'agv-001', status = 'assigned', updated_at = now()
WHERE id = 'task-1001' AND status = 'pending';

UPDATE agvs
SET current_task_id = 'task-1001', status = 'moving'
WHERE id = 'agv-001';

COMMIT;
```

### Safe Column Rename (View Impact)
If you need to rename `fill_level` → `occupancy_level`:

```sql
-- Step 1: Add new column
ALTER TABLE stock_items ADD COLUMN occupancy_level INT;

-- Step 2: Copy data
UPDATE stock_items SET occupancy_level = fill_level;

-- Step 3: Update views
CREATE OR REPLACE VIEW v_kpi_stock AS
SELECT
    COUNT(DISTINCT si.id) as total_items,
    COUNT(DISTINCT CASE WHEN si.occupancy_level > 0 THEN si.id END) as filled_items,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN si.occupancy_level > 0 THEN si.id END) 
          / NULLIF(COUNT(DISTINCT si.id), 0), 2) as fill_rate_percent,
    ROUND(AVG(si.occupancy_level), 2) as avg_occupancy,
    ...
FROM stock_items si;

-- Step 4: Update application code to use `occupancy_level`
-- Step 5: Drop old column
ALTER TABLE stock_items DROP COLUMN fill_level CASCADE;

-- Step 6: Rename new column
ALTER TABLE stock_items RENAME occupancy_level TO fill_level;
```

---

## 1️⃣3️⃣ SQL/DDL Statement Explanations

### Extensions
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```
**Meaning**: Install PostgreSQL extension for UUID generation
- **Impact**: Enables `gen_random_uuid()` function used for auto-generating ID values
- **When needed**: Not strictly required if using `gen_random_uuid()` (built-in); but explicitly declares dependency
- **Best practice**: List at top of schema SQL for clarity

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```
**Meaning**: Install cryptography functions extension
- **Impact**: Enables `gen_random_uuid()` function (alternative to uuid-ossp)
- **Note**: Supabase includes this by default
- **Usage**: Rarely needed unless using hashing (e.g., `crypt()`)

### Table Creation
```sql
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ...
);
```
**Meaning**: Create table only if it doesn't exist
- **Impact**: Idempotent (safe to run multiple times without error)
- **`UUID PRIMARY KEY`**: Auto-generate 128-bit unique IDs
- **`DEFAULT gen_random_uuid()`**: Automatically assign UUID on INSERT
- **Gotcha**: Changing PK type requires recreating entire table → breaking change for FK references

### Row-Level Security
```sql
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
```
**Meaning**: Enforce RLS on this table
- **Impact**: No rows accessible unless explicitly allowed by a policy
- **Default behavior after RLS enabled**: Nobody can read/write (even table owner!)
- **⚠️ Critical**: Must define at least one policy for each operation (SELECT, INSERT, UPDATE, DELETE)

```sql
CREATE POLICY "Allow public read warehouses" ON warehouses FOR SELECT USING (true);
```
**Meaning**: Allow all SELECT (read) operations without auth check
- **`FOR SELECT`**: This policy controls SELECT operations
- **`USING (true)`**: Condition always true → no filtering
- **Realtime impact**: Users on public channel see all rows

```sql
CREATE POLICY "Allow authenticated insert stock_items" ON stock_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```
**Meaning**: Allow INSERT only if user is authenticated
- **`WITH CHECK`**: New row must satisfy this condition to insert
- **`auth.role() = 'authenticated'`**: JWT indicates authenticated user (not anon)
- **Prevents**: Unauthenticated (public) inserts

### Realtime Publication
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE stock_items;
```
**Meaning**: Subscribe changes to this table to Realtime
- **Impact**: INSERT, UPDATE, DELETE on `stock_items` broadcast to clients
- **Publishing flow**:
  1. PostgreSQL WAL captures change
  2. Realtime server detects change
  3. Matches table against `supabase_realtime` publication
  4. Changes sent to subscribed clients
- **Limit**: Views cannot be added with `ALTER PUBLICATION`; must use `SELECT` from published table instead
- **⚠️ Performance**: High-frequency writes (AGV positions) 100+ writes/sec will broadcast 100+ events/sec

### View Creation
```sql
CREATE OR REPLACE VIEW v_kpi_stock AS
SELECT ... FROM stock_items;
```
**Meaning**: Create reusable computed result
- **`OR REPLACE`**: Replace view if exists (safe to run multiple times)
- **Impact**: View is **read-only** (cannot UPDATE/DELETE directly; must modify underlying table)
- **Realtime with views**: Frontend can subscribe to view changes via Realtime despite views being read-only
- **Gotcha**: Renaming view columns breaks client code expecting old names

---

## Summary: Deliverables Checklist

You now have:

✅ **Schema Overview** → Purpose, concepts, data flow
✅ **Table Details** → 7 tables, keys, constraints, RLS, indexing
✅ **Views** → 2 KPI views, realtime considerations
✅ **RLS & Auth** → Current setup (demo), production hardening
✅ **Realtime Config** → Which tables published, event flow, RLS interaction
✅ **Sample Data** → Testing scenarios
✅ **Gotchas** → 10 issues, severity levels, solutions
✅ **API Endpoints** → Suggested endpoints, common queries
✅ **Security Best Practices** → Production checklist, multi-tenancy, audit trail
✅ **Performance** → Indexing strategy, query optimization, realtime tuning
✅ **Onboarding** → 10-step checklist for new developers
✅ **Schema Improvements** → 5 recommended enhancements + additional views/functions
✅ **Ready-to-Run SQL** → SELECT, JOIN, KPI, INSERT, UPDATE, rename examples
✅ **SQL Explanation** → Plain language for extensions, tables, RLS, views, publication

---

**Next Steps**:
1. Share this doc with your backend team
2. Review production RLS policies (Section 🔐)
3. Add recommended indexes (Section 9️⃣)
4. Implement schema improvements (Section 1️⃣1️⃣)
5. Test Realtime subscription flow locally (Section 6️⃣)
