# Relations de la Base de Données - Digital Twin WMS

## 📊 Schéma Relationnel

```
┌─────────────────┐
│   warehouses    │───┐
│                 │   │
│ id (PK)         │   │
│ name            │   │
│ width_m         │   │
│ depth_m         │   │
│ height_m        │   │
└─────────────────┘   │
                      │
        ┌─────────────┴─────────┬──────────────┐
        │                       │              │
        ▼                       ▼              │
┌─────────────────┐     ┌──────────────┐      │
│     zones       │     │    racks     │      │
│                 │     │              │      │
│ id (PK)         │     │ id (PK)      │      │
│ warehouse_id FK │     │ warehouse_id │──────┘
│ name            │     │ rack_code    │
│ zone_type       │     │ row_no       │
│ x_m, z_m        │     │ bay_no       │
│ width_m         │     │ x_m, z_m     │
│ depth_m         │     └──────┬───────┘
│ color_hex       │            │
└─────────────────┘            │
                               ▼
                        ┌──────────────┐
                        │  locations   │
                        │              │
                        │ id (PK)      │
                        │ rack_id FK   │
                        │ row_no       │
                        │ bay_no       │
                        │ level_no     │
                        │ x_m, y_m, z_m│
                        │ occupied     │
                        └───────┬──────┘
                                │
                ┌───────────────┴──────────────┬──────────────┐
                │                              │              │
                ▼                              │              │
        ┌──────────────┐                       │              │
        │stock_items   │                       │              │
        │              │                       │              │
        │ id (PK)      │                       │              │
        │ location_id  │───────────────────────┘              │
        │ fill_level   │                                      │
        │ category     │                                      │
        │ sku          │ ← NEW                                │
        │ product_name │ ← NEW                                │
        │ quality_tier │ ← NEW                                │
        └──────────────┘                                      │
                                                              │
┌──────────────┐                                              │
│     agvs     │                                              │
│              │                                              │
│ id (PK)      │                                              │
│ name         │                                              │
│ x_m, y_m, z_m│                                              │
│ rotation_rad │                                              │
│ status       │                                              │
│ battery      │                                              │
│ speed_mps    │                                              │
│current_task_id│                                             │
└──────┬───────┘                                              │
       │                                                      │
       ▼                                                      │
┌──────────────────┐                                          │
│      tasks       │                                          │
│                  │                                          │
│ id (PK)          │                                          │
│ agv_id FK        │──────────────────────────────────────────┘
│ task_type        │                                          
│ status           │                                          
│ priority         │                                          
│ pickup_location  │──────────────────────────────────────────┐
│ dropoff_location │──────────────────────────────────────────┤
│ created_at       │                                          │
│ started_at       │                                          │
│ completed_at     │                                          │
└──────────────────┘                                          │
                                                              │
                      ┌───────────────────────────────────────┴──────┘
                      │
                      └──► locations


         📊 VIEW: v_kpi_stock
         (Calculée depuis stock_items)
```

## 🔗 Relations Détaillées

### 1️⃣ Hiérarchie Warehouse → Racks → Locations → Stock
```
warehouses (1)
  ├── zones (N) ............. Zones définies dans l'entrepôt
  └── racks (N) ............ Racks physiques
       └── locations (N) ... Emplacements de stockage (allée, rack, niveau)
            └── stock_items (N) ... Articles stockés avec SKU
```

### 2️⃣ Système AGV et Tasks
```
agvs (N) ........................ Robots autonomes
  └── tasks (N) ................. Tâches assignées
       ├── pickup_location (FK) ...... D'où prendre
       └── dropoff_location (FK) ..... Où déposer
```

## 📋 Contraintes d'Intégrité Référentielle

| Table | Colonne | Référence | Action ON DELETE |
|-------|---------|-----------|------------------|
| zones | warehouse_id | warehouses(id) | CASCADE |
| racks | warehouse_id | warehouses(id) | CASCADE |
| locations | rack_id | racks(id) | CASCADE |
| stock_items | location_id | locations(id) | CASCADE |
| tasks | agv_id | agvs(id) | SET NULL |
| tasks | pickup_location_id | locations(id) | SET NULL |
| tasks | dropoff_location_id | locations(id) | SET NULL |

## ⚡ Tables Realtime Activées

Les tables suivantes diffusent les changements en temps réel :
- ✅ `stock_items` - Mises à jour des niveaux de stock, SKU
- ✅ `agvs` - Position, statut, batterie des robots
- ✅ `tasks` - Statut des tâches

## 🔑 Clés Primaires

| Table | Type PK | Format |
|-------|---------|--------|
| warehouses | UUID | gen_random_uuid() |
| zones | UUID | gen_random_uuid() |
| racks | UUID | gen_random_uuid() |
| locations | TEXT | "RACK-A0-L1" |
| stock_items | UUID | gen_random_uuid() |
| agvs | TEXT | "AGV-001" |
| tasks | TEXT | "TASK-001" |

## 🚨 Contraintes Uniques

### racks
- `UNIQUE(warehouse_id, rack_code)` - Un code de rack unique par entrepôt
- `UNIQUE(warehouse_id, row_no, bay_no)` - Position unique (allée, rack)

## 📊 Règles Métier Implémentées

1. **CASCADE DELETE** : Si un warehouse est supprimé, toutes ses zones et racks sont supprimés
2. **CASCADE DELETE** : Si un rack est supprimé, tous ses emplacements et stock items sont supprimés
3. **SET NULL** : Si un AGV est supprimé, ses tasks restent mais `agv_id` devient NULL
4. **SET NULL** : Si une location est supprimée, les tasks référençant cette location restent mais pickup/dropoff deviennent NULL

## ✅ Fichiers de Migration

Pour appliquer ces relations sur une base existante :
```bash
# 1. Vérifier que le schéma est correct
psql -f supabase-schema.sql

# 2. Ajouter les FK manquantes sur table existante
psql -f fix_foreign_keys.sql

# 3. Vérifier l'intégrité
psql -f check_database.sql
```

## 🔍 Vérification des Relations

Pour vérifier que toutes les relations sont en place :
```sql
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;
```

## 🎯 État Actuel du Schéma

| Table | Statut | Colonnes Critiques |
|-------|--------|-------------------|
| warehouses | ✅ OK | id, name |
| zones | ✅ OK | warehouse_id FK |
| racks | ✅ OK | warehouse_id FK, row_no, bay_no |
| locations | ✅ OK | rack_id FK, row_no, bay_no, level_no |
| stock_items | ✅ OK + SKU | sku, product_name, quality_tier |
| agvs | ✅ OK | id, status, battery, position |
| tasks | ⚠️ FIX NEEDED | pickup_location_id, dropoff_location_id (FK manquantes) |

## 🔧 Action Requise

**Exécuter dans Supabase SQL Editor :**
```sql
-- Fichier: fix_foreign_keys.sql
-- Ajoute les contraintes FK manquantes pour tasks.pickup_location_id et tasks.dropoff_location_id
```

Cela garantira l'intégrité référentielle complète du schéma.
