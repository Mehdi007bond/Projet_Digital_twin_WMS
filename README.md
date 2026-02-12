# 🏭 Digital Twin WMS - Warehouse Management System

[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

A comprehensive digital twin solution for warehouse management featuring real-time 3D visualization, AGV fleet management, stock tracking, and advanced analytics.

---

## 📋 Table of Contents

- [About](#about)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Pages & Features](#pages--features)
- [Stock Management](#stock-management)
- [AGV Fleet System](#agv-fleet-system)
- [Database Schema](#database-schema)
- [KPIs & Metrics](#kpis--metrics)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 About

The **Digital Twin WMS** is a modern, serverless warehouse management system that provides real-time visibility into warehouse operations through an interactive 3D interface. Built for INSA engineering students, this project demonstrates cutting-edge web technologies applied to industrial logistics.

### Why Digital Twin?

A digital twin creates a virtual replica of physical warehouse operations, enabling:
- **Real-time Monitoring**: Visualize AGV movements, stock levels, and operations as they happen
- **Predictive Analytics**: Analyze patterns and optimize warehouse efficiency
- **Training & Simulation**: Safe environment for testing scenarios without physical risks
- **Data-Driven Decisions**: Comprehensive KPIs and metrics at your fingertips

---

## ✨ Key Features

### 🎨 3D Visualization
- Interactive Three.js-powered 3D warehouse model
- Real-time AGV position tracking and path visualization
- Dynamic rack and stock visualization with color-coded status
- Smooth camera controls and multiple viewing angles

### 🤖 AGV Fleet Management
- Multi-AGV coordination and tracking
- Battery level monitoring and alerts
- Task assignment and priority management
- Collision detection and path optimization

### 📦 Stock Management
- Real-time inventory tracking across racks and locations
- Color-coded stock status (Green: optimal, Orange: low, Red: critical)
- Hierarchical location system (Rack → Shelf → Position)
- Automated alerts for low stock and overstocking

### 📊 KPI Dashboard
- Real-time operational metrics
- Stock turnover and fill rates
- AGV utilization and efficiency metrics
- Historical trend analysis

### ⚡ Real-time Synchronization
- Supabase Realtime WebSocket integration
- Instant updates across all connected clients
- Optimistic UI updates with conflict resolution
- Efficient pub/sub messaging system

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT BROWSER                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Frontend Application (Vanilla JS)             │  │
│  │                                                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │ Three.js │  │   HTML   │  │  Supabase Client │  │  │
│  │  │ 3D Scene │  │   Pages  │  │   (@supabase/    │  │  │
│  │  │          │  │          │  │   supabase-js)   │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │  │
│  │       │             │                  │            │  │
│  │       └─────────────┴──────────────────┘            │  │
│  │                     │                                │  │
│  └─────────────────────┼────────────────────────────────┘  │
└────────────────────────┼───────────────────────────────────┘
                         │
                         │ HTTPS / WebSocket
                         │
┌────────────────────────▼───────────────────────────────────┐
│                  SUPABASE CLOUD                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Database                     │  │
│  │  ┌────────┐  ┌────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │ Stocks │  │  AGVs  │  │  Racks   │  │  Views  │ │  │
│  │  │ Table  │  │ Table  │  │  Table   │  │         │ │  │
│  │  └────────┘  └────────┘  └──────────┘  └─────────┘ │  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │     Row Level Security (RLS) Policies          │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Realtime Server (WebSocket)               │  │
│  │         - Table Change Notifications                 │  │
│  │         - Pub/Sub Channels                           │  │
│  │         - Broadcast Messages                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key Points:**
- ✅ **Serverless Architecture**: No backend server required
- ✅ **Direct Database Access**: Frontend uses Supabase client library
- ✅ **Real-time Updates**: WebSocket-based pub/sub for instant synchronization
- ✅ **Secure**: Row Level Security policies protect data access

---

## 🛠️ Tech Stack

### Frontend
- **Three.js r137**: 3D visualization and rendering
- **Vanilla JavaScript ES6+**: Core application logic
- **HTML5 & CSS3**: Modern web standards
- **Supabase JS Client v2**: Direct database and realtime access

### Backend (Serverless)
- **Supabase**: Backend-as-a-Service platform
  - PostgreSQL 15 database
  - Realtime WebSocket server
  - Authentication & authorization
  - Row Level Security (RLS)

### Development Tools
- **http-server**: Local development server
- **Git**: Version control

---

## 📁 Project Structure

```
Projet_Digital_twin_WMS/
│
├── frontend/                      # Frontend application
│   ├── index.html                 # 3D warehouse visualization (main page)
│   ├── home.html                  # Landing page
│   ├── warehouse-2d.html          # 2D warehouse overview
│   ├── kpi-dashboard.html         # KPI metrics dashboard
│   ├── stock-analysis.html        # Stock analytics and reports
│   ├── management.html            # AGV and task management
│   ├── diagnostic.html            # System diagnostics
│   ├── clear-cache.html           # Cache management utility
│   │
│   ├── css/                       # Stylesheets
│   │   ├── styles.css             # Global styles
│   │   ├── navigation.css         # Navigation bar styles
│   │   ├── warehouse-2d.css       # 2D view styles
│   │   ├── kpi-dashboard.css      # Dashboard styles
│   │   └── ...
│   │
│   ├── js/                        # JavaScript modules
│   │   ├── supabase-config.js     # Supabase client configuration
│   │   ├── main.js                # 3D scene initialization
│   │   ├── warehouse.js           # Warehouse model builder
│   │   ├── agv.js                 # AGV visualization & logic
│   │   ├── racks.js               # Rack system management
│   │   ├── stock.js               # Stock tracking logic
│   │   ├── realtime-sync.js       # Supabase realtime integration
│   │   ├── websocket-supabase.js  # WebSocket manager
│   │   ├── kpi-dashboard.js       # KPI calculations
│   │   ├── stock-analysis.js      # Analytics logic
│   │   ├── warehouse-2d.js        # 2D visualization
│   │   ├── navigation.js          # Page navigation
│   │   ├── taskManager.js         # Task management
│   │   └── ...
│   │
│   └── lib/                       # Third-party libraries
│       └── three.min.js           # Three.js r137
│
├── database/                      # Database schema & migrations
│   ├── supabase-schema.sql        # Complete database schema
│   ├── setup_rls_policies.sql     # Row Level Security policies
│   ├── REBUILD_FOR_3D.sql         # 3D-specific tables
│   └── DATABASE_RELATIONS.md      # Schema documentation
│
├── docs/                          # Documentation
│   ├── SUPABASE_SETUP_COMPLETE.md # Supabase setup guide
│   ├── REALTIME_SYNC_SETUP.md     # Realtime configuration
│   └── DATABASE_ANALYSIS.md       # Database analysis
│
└── README.md                      # This file
```

---

## 🚀 Getting Started

### Prerequisites

- Modern web browser (Chrome, Firefox, Edge)
- Supabase account (free tier available)
- Node.js (for http-server) or any static file server

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Note your project URL and anon/public API key

### Step 2: Import Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Copy the contents of `database/supabase-schema.sql`
3. Paste and execute the SQL
4. Verify tables are created: `stocks`, `agvs`, `racks`, `sensors`, `tasks`

### Step 3: Enable Realtime

1. In Supabase Dashboard, go to **Database** → **Replication**
2. Enable realtime for these tables:
   - ✅ `stocks`
   - ✅ `agvs`
   - ✅ `tasks`
   - ✅ `sensors`
   - ✅ `racks`

### Step 4: Configure Frontend

1. Open `frontend/js/supabase-config.js`
2. Replace with your Supabase credentials:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### Step 5: Run the Application

```bash
# Install http-server globally (one-time)
npm install -g http-server

# Navigate to frontend directory
cd frontend

# Start development server
http-server -p 8080

# Open browser to http://localhost:8080
```

**Alternative**: Use any static file server (Python, PHP built-in servers, VS Code Live Server, etc.)

---

## 📄 Pages & Features

### 🏠 Home (`home.html`)
Landing page with project overview and navigation to main features.

### 🎨 3D Warehouse (`index.html`)
**Main visualization interface**
- Interactive 3D warehouse model
- Real-time AGV position tracking
- Dynamic rack and stock visualization
- Camera controls (orbit, pan, zoom)
- Color-coded stock status
- Live data synchronization

### 🗺️ 2D Warehouse (`warehouse-2d.html`)
**Top-down overview**
- 2D floor plan with all racks
- AGV positions and paths
- Quick navigation and planning
- Simplified view for layout analysis

### 📊 KPI Dashboard (`kpi-dashboard.html`)
**Real-time metrics and analytics**
- Stock KPIs (fill rate, turnover, alerts)
- AGV KPIs (utilization, efficiency, battery status)
- Operational metrics (tasks completed, response time)
- Historical charts and trends
- Customizable time ranges

### 📈 Stock Analysis (`stock-analysis.html`)
**Advanced inventory analytics**
- Stock level trends over time
- Category-wise distribution
- Location utilization heatmaps
- Demand forecasting
- Export capabilities

### 🎮 Management (`management.html`)
**Control center**
- AGV task assignment
- Manual stock adjustments
- System configuration
- Alert management
- User permissions

### 🔧 Diagnostic (`diagnostic.html`)
**System health monitoring**
- Database connection status
- Realtime sync status
- API response times
- Error logs and debugging
- Performance metrics

### 🗑️ Clear Cache (`clear-cache.html`)
**Maintenance utility**
- Clear local storage
- Reset cached data
- Force refresh database connections
- Troubleshooting tool

---

## 📦 Stock Management

### Location Hierarchy

```
Warehouse
  └─ Rack (e.g., R01)
      └─ Shelf (e.g., E1, E2, E3, E4)
          └─ Position (e.g., P1, P2, P3)
              └─ Stock Item
```

**Full Location Format**: `R01-E2-P3` (Rack 01, Shelf 2, Position 3)

### Stock Status Color Coding

| Status | Color | Condition | Action Required |
|--------|-------|-----------|----------------|
| ✅ Optimal | Green | 50-100% capacity | None |
| ⚠️ Low | Orange | 20-49% capacity | Restock soon |
| 🚨 Critical | Red | 0-19% capacity | Immediate restock |
| ⚫ Overstock | Dark | >100% capacity | Redistribute |

### Database Schema

```sql
CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    quantity INTEGER DEFAULT 0,
    location VARCHAR(50),           -- Format: R01-E2-P3
    rack_id INTEGER REFERENCES racks(id),
    min_quantity INTEGER DEFAULT 10,
    max_quantity INTEGER DEFAULT 100,
    category VARCHAR(50),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'optimal'  -- optimal, low, critical, overstock
);

CREATE INDEX idx_stocks_location ON stocks(location);
CREATE INDEX idx_stocks_rack ON stocks(rack_id);
CREATE INDEX idx_stocks_status ON stocks(status);
```

---

## 🤖 AGV Fleet System

### AGV Architecture

The AGV (Automated Guided Vehicle) system is designed for flexible, multi-agent warehouse operations.

```
AGV Fleet
  ├─ AGV-001 (Active)
  ├─ AGV-002 (Charging)
  └─ AGV-003 (Idle)
      │
      ├─ Position: { x, y, z }
      ├─ Status: idle | moving | picking | charging | error
      ├─ Battery: 0-100%
      ├─ Current Task: task_id
      └─ Path: [ waypoints ]
```

### AGV Data Structure

```sql
CREATE TABLE agvs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    position_z FLOAT DEFAULT 0,
    rotation FLOAT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'idle',  -- idle, moving, picking, dropping, charging, error
    battery_level INTEGER DEFAULT 100,
    current_task_id INTEGER REFERENCES tasks(id),
    speed FLOAT DEFAULT 2.0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    color VARCHAR(7) DEFAULT '#3498db'
);

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,  -- transport, pick, place, charge
    assigned_agv_id INTEGER REFERENCES agvs(id),
    source_location VARCHAR(50),
    target_location VARCHAR(50),
    stock_item_id INTEGER REFERENCES stocks(id),
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, in_progress, completed, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
```

### Battery Management

| Battery Level | Status | Action |
|--------------|--------|--------|
| 80-100% | ✅ Optimal | Available for all tasks |
| 50-79% | ⚡ Good | Continue operations |
| 20-49% | ⚠️ Low | Return to charging after current task |
| 0-19% | 🚨 Critical | Immediate charging required |

### AGV Visualization

- **3D Model**: Custom Three.js geometries
- **Real-time Position**: Updated via Supabase Realtime
- **Path Rendering**: Line geometries showing planned routes
- **Status Indicators**: Color-coded badges
- **Battery Display**: Dynamic gauge visualization

---

## 🗄️ Database Schema

### Entity Relationship Diagram

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│    RACKS     │         │    STOCKS    │         │     AGVS     │
│──────────────│         │──────────────│         │──────────────│
│ id (PK)      │◄───┐    │ id (PK)      │         │ id (PK)      │
│ name         │    └────│ rack_id (FK) │         │ name         │
│ position_x   │         │ item_name    │         │ position_x/y │
│ position_y   │         │ quantity     │         │ status       │
│ position_z   │         │ location     │         │ battery      │
│ width        │         │ min_quantity │    ┌────│ task_id (FK) │
│ height       │         │ max_quantity │    │    └──────────────┘
│ depth        │         │ category     │    │
│ color        │         │ status       │    │    ┌──────────────┐
│ num_shelves  │         └──────────────┘    │    │    TASKS     │
└──────────────┘                             │    │──────────────│
                                             └───►│ id (PK)      │
┌──────────────┐         ┌──────────────┐         │ agv_id (FK)  │
│   SENSORS    │         │ AGV_TELEMETRY│         │ type         │
│──────────────│         │──────────────│         │ priority     │
│ id (PK)      │         │ id (PK)      │         │ status       │
│ name         │         │ agv_id (FK)  │         │ source_loc   │
│ type         │         │ timestamp    │         │ target_loc   │
│ location     │         │ metric_name  │         │ stock_id(FK) │
│ value        │         │ value        │         └──────────────┘
│ status       │         └──────────────┘
└──────────────┘
```

### Core Tables

#### 1. Stocks Table
Manages all inventory items across warehouse locations.

```sql
CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    quantity INTEGER DEFAULT 0,
    location VARCHAR(50),
    rack_id INTEGER REFERENCES racks(id) ON DELETE SET NULL,
    min_quantity INTEGER DEFAULT 10,
    max_quantity INTEGER DEFAULT 100,
    category VARCHAR(50),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'optimal',
    CONSTRAINT valid_quantity CHECK (quantity >= 0),
    CONSTRAINT valid_status CHECK (status IN ('optimal', 'low', 'critical', 'overstock'))
);
```

#### 2. AGVs Table
Tracks autonomous guided vehicles and their states.

```sql
CREATE TABLE agvs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    position_z FLOAT DEFAULT 0,
    rotation FLOAT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'idle',
    battery_level INTEGER DEFAULT 100,
    current_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    speed FLOAT DEFAULT 2.0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    color VARCHAR(7) DEFAULT '#3498db',
    CONSTRAINT valid_battery CHECK (battery_level >= 0 AND battery_level <= 100),
    CONSTRAINT valid_status CHECK (status IN ('idle', 'moving', 'picking', 'dropping', 'charging', 'error'))
);
```

#### 3. Racks Table
Defines physical storage rack structures.

```sql
CREATE TABLE racks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    position_x FLOAT NOT NULL,
    position_y FLOAT NOT NULL,
    position_z FLOAT DEFAULT 0,
    width FLOAT DEFAULT 2.0,
    height FLOAT DEFAULT 4.0,
    depth FLOAT DEFAULT 1.0,
    color VARCHAR(7) DEFAULT '#8B4513',
    num_shelves INTEGER DEFAULT 4,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. Tasks Table
Manages AGV task assignments and workflow.

```sql
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    assigned_agv_id INTEGER REFERENCES agvs(id) ON DELETE SET NULL,
    source_location VARCHAR(50),
    target_location VARCHAR(50),
    stock_item_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT valid_type CHECK (type IN ('transport', 'pick', 'place', 'charge')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled'))
);
```

### Database Views

```sql
-- Stock Status Summary
CREATE VIEW stock_status_summary AS
SELECT 
    status,
    COUNT(*) as count,
    SUM(quantity) as total_quantity
FROM stocks
GROUP BY status;

-- AGV Fleet Status
CREATE VIEW agv_fleet_status AS
SELECT 
    status,
    COUNT(*) as count,
    AVG(battery_level) as avg_battery
FROM agvs
GROUP BY status;

-- Task Performance Metrics
CREATE VIEW task_performance AS
SELECT 
    type,
    status,
    COUNT(*) as task_count,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM tasks
WHERE started_at IS NOT NULL
GROUP BY type, status;
```

### Row Level Security (RLS)

RLS policies ensure secure data access:

```sql
-- Enable RLS on all tables
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON stocks FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON agvs FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON racks FOR SELECT USING (true);

-- Allow authenticated updates
CREATE POLICY "Allow authenticated updates" ON stocks FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated updates" ON agvs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated updates" ON tasks FOR ALL USING (auth.role() = 'authenticated');
```

### Schema Files

- **`supabase-schema.sql`**: Complete database schema with all tables, views, indexes
- **`setup_rls_policies.sql`**: Row Level Security policy definitions
- **`REBUILD_FOR_3D.sql`**: 3D visualization-specific schema updates
- **`DATABASE_RELATIONS.md`**: Detailed schema documentation

---

## 📊 KPIs & Metrics

### Stock KPIs

| Metric | Description | Calculation | Target |
|--------|-------------|-------------|--------|
| **Fill Rate** | Percentage of storage capacity used | `(Total Qty / Total Max) × 100` | 70-85% |
| **Turnover Rate** | Stock movement frequency | `Outbound / Avg Inventory` | >5/month |
| **Critical Items** | Items below minimum threshold | `COUNT(qty < min_qty)` | <5% |
| **Overstock Items** | Items above maximum threshold | `COUNT(qty > max_qty)` | <2% |
| **Stock Accuracy** | Inventory record accuracy | `Correct / Total × 100` | >98% |

### AGV KPIs

| Metric | Description | Calculation | Target |
|--------|-------------|-------------|--------|
| **Fleet Utilization** | AGVs actively working | `(Active AGVs / Total) × 100` | >75% |
| **Average Battery** | Mean battery level across fleet | `AVG(battery_level)` | >60% |
| **Tasks per Hour** | Throughput rate | `Completed Tasks / Hours` | >20 |
| **Task Success Rate** | Completed vs failed tasks | `(Completed / Total) × 100` | >95% |
| **Avg Response Time** | Task start to completion | `AVG(completed - created)` | <5 min |

### Operational Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| **Total Stock Items** | Count of all inventory items | `stocks` table |
| **Total Quantity** | Sum of all quantities | `SUM(stocks.quantity)` |
| **Active AGVs** | AGVs currently working | `agvs` WHERE status != 'idle' |
| **Pending Tasks** | Tasks awaiting assignment | `tasks` WHERE status = 'pending' |
| **Warehouse Capacity** | Total storage positions | `racks.num_shelves × positions` |

### Real-time Monitoring

The KPI Dashboard refreshes metrics every 5 seconds using Supabase Realtime subscriptions:

```javascript
// Subscribe to stock changes
supabase
  .channel('stock-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'stocks' },
    payload => updateStockKPIs()
  )
  .subscribe();

// Subscribe to AGV changes
supabase
  .channel('agv-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'agvs' },
    payload => updateAgvKPIs()
  )
  .subscribe();
```

---

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Browser and version
   - Steps to reproduce
   - Expected vs actual behavior
   - Console errors (if any)
   - Screenshots (if relevant)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly
5. Commit with clear messages: `git commit -m "feat: add amazing feature"`
6. Push to your fork: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Code Style

- Use ES6+ JavaScript features
- Follow existing code formatting
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable names

---

## 📄 License

This project is licensed under the **MIT License** - see below for details:

```
MIT License

Copyright (c) 2024 INSA Digital Twin WMS Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👥 Team

This project is developed by **INSA Engineering Students** as part of an industrial informatics and automation curriculum.

**Project Type**: Academic Engineering Project  
**Institution**: INSA (Institut National des Sciences Appliquées)  
**Focus**: Digital Twin Technology, Warehouse Automation, Real-time Systems

---

## 🎓 Learning Resources

### Technologies Used
- [Three.js Documentation](https://threejs.org/docs/)
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Related Topics
- Digital Twin Technology
- Warehouse Management Systems (WMS)
- Autonomous Guided Vehicles (AGV)
- Real-time Data Synchronization
- 3D Web Visualization

---

## 📞 Support

For questions, issues, or suggestions:

1. **GitHub Issues**: [Report a bug or request a feature](../../issues)
2. **Documentation**: Check the `/docs` folder for detailed guides
3. **Supabase Issues**: For database/realtime issues, consult [Supabase Docs](https://supabase.com/docs)

---

## 🌟 Acknowledgments

- **Three.js Community** for excellent 3D visualization tools
- **Supabase Team** for the powerful serverless platform
- **INSA Faculty** for project guidance and support
- **Open Source Community** for inspiration and best practices

---

## 📈 Project Status

- ✅ Core 3D Visualization
- ✅ Supabase Integration
- ✅ Real-time Synchronization
- ✅ Stock Management
- ✅ AGV Fleet System
- ✅ KPI Dashboard
- ✅ 2D Warehouse View
- 🚧 Advanced Analytics (in progress)
- 🚧 Mobile Responsiveness (in progress)
- ⏳ User Authentication (planned)
- ⏳ Historical Data Archive (planned)

---

**Built with ❤️ by INSA Students**

Last Updated: December 2024
