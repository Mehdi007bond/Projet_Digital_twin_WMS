# Database Scripts - Digital Twin WMS

## 📁 Structure organisée et nettoyée

### 🟢 Scripts actifs (à utiliser)

#### **supabase-schema.sql**
- **Rôle** : Schéma principal de la base de données
- **Contenu** : Tables (warehouses, zones, racks, locations, stock_items, agvs, tasks)
- **Colonnes stock_items** : id, location_id, fill_level, category, sku, product_name, quality_tier
- **Relations** : Toutes les FK définies (voir DATABASE_RELATIONS.md)
- **Usage** : Exécuter lors de l'initialisation d'un nouveau projet Supabase
- **Modification** : ✅ Mis à jour avec les colonnes SKU et FK tasks

#### **fix_foreign_keys.sql** ⭐ NOUVEAU
- **Rôle** : Ajouter les contraintes FK manquantes sur table tasks existante
- **FK ajoutées** : 
  - tasks.pickup_location_id → locations(id)
  - tasks.dropoff_location_id → locations(id)
- **Usage** : Exécuter sur base existante pour corriger l'intégrité référentielle
- **Important** : Script idempotent (peut être exécuté plusieurs fois)

#### **setup_rls_policies.sql**
- **Rôle** : Politiques de sécurité Row Level Security (RLS)
- **Usage** : Exécuter après supabase-schema.sql pour configurer les permissions
- **Important** : Permet l'accès public en lecture/écriture pour la démo

#### **new_stock_items.sql**
- **Rôle** : Créer les articles de stock avec les 9 produits automobiles
- **Produits** :
  - Front Light (Economique, Medium, Luxe)
  - Back Light (Economique, Medium, Luxe)
  - Motor Component (Economique, Medium, Luxe)
- **Usage** : Exécuter pour peupler la base avec des données réalistes
- **SKU générés** : FL-ECO, FL-MED, FL-LUX, BL-ECO, BL-MED, BL-LUX, MC-ECO, MC-MED, MC-LUX

#### **EXECUTE_STOCK_UPDATE.md**
- **Rôle** : Documentation détaillée pour exécuter les mises à jour de stock
- **Contenu** : Instructions pas à pas, résultats attendus, tests

#### **check_database.sql** ⭐ NOUVEAU
- **Rôle** : Script de vérification complète de l'intégrité de la base
- **Vérifications** :
  - Tables existantes
  - Schéma de stock_items (colonnes SKU)
  - Distribution des SKU (9 variantes)
  - Intégrité référentielle
  - Configuration Realtime
  - Statistiques de remplissage
- **Usage** : Exécuter après chaque modification pour valider l'état

#### **DATABASE_RELATIONS.md** ⭐ NOUVEAU
- **Rôle** : Documentation complète des relations de la base
- **Contenu** : Diagramme relationnel ASCII, contraintes FK, règles métier
- **Important** : À consulter avant toute modification du schéma

---

### 📦 Scripts archivés (obsolètes)

Les fichiers suivants ont été déplacés vers `_archive/` car ils sont obsolètes :

#### **schema.sql** ❌ OBSOLÈTE
- Raison : Doublon de supabase-schema.sql sans les colonnes SKU
- Remplacé par : supabase-schema.sql

#### **seed_data.sql** ❌ OBSOLÈTE
- Raison : Données génériques (Electronics, Furniture, Tools) ne correspondant pas au domaine automobile
- Remplacé par : new_stock_items.sql avec les vrais produits (Front Light, Back Light, Motor Component)

#### **add_sku_columns.sql** ❌ OBSOLÈTE
- Raison : Script one-time déjà exécuté pour ajouter les colonnes
- Déjà intégré dans : supabase-schema.sql

---

## 🚀 Ordre d'exécution pour nouvelle installation

```sql
-- 1. Créer le schéma
\i supabase-schema.sql

-- 2. Configurer les permissions
\i setup_rls_policies.sql

-- 3. Peupler avec les données
\i new_stock_items.sql

-- 4. Vérifier l'intégrité
\i check_database.sql
```

## 🔧 Mise à jour d'une base existante

```sql
-- 1. Ajouter les FK manquantes (si nécessaire)
\i fix_foreign_keys.sql

-- 2. Mettre à jour les données de stock
\i new_stock_items.sql

-- 3. Vérifier l'état final
\i check_database.sql
```

---

## ✅ Vérification de l'intégrité

### Vérifier que les colonnes SKU existent :
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'stock_items'
ORDER BY ordinal_position;
```

**Colonnes attendues :**
- id (uuid)
- location_id (text)
- fill_level (integer)
- category (text)
- sku (text) ← NOUVEAU
- product_name (text) ← NOUVEAU
- quality_tier (text) ← NOUVEAU
- created_at (timestamptz)
- updated_at (timestamptz)

### Vérifier les données de stock :
```sql
SELECT 
    sku,
    product_name,
    quality_tier,
    COUNT(*) as count
FROM stock_items
GROUP BY sku, product_name, quality_tier
ORDER BY sku;
```

**Résultat attendu : 9 lignes (9 variantes de produits)**

---

## 🔄 Synchronisation temps réel

Les tables suivantes sont configurées pour le realtime Supabase :
- ✅ `stock_items`
- ✅ `agvs`
- ✅ `tasks`

Vérifier la configuration :
```sql
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

---

## 📝 Notes importantes

1. **Pas de schéma CHECK contraint sur category** : Le champ category TEXT permet des descriptions complètes comme "Front Light / Economique / Aisle-1 Rack-2"

2. **SKU uniques par produit** : Chaque combinaison produit+qualité a un SKU unique et persistant (pas aléatoire)

3. **Distribution cyclée** : Les 9 variantes sont distribuées uniformément sur toutes les locations

4. **Niveaux de remplissage** : Aléatoires entre 10-100 lors de la création

---

## 🗑️ Archive

Le dossier `_archive/` contient les fichiers obsolètes pour référence historique.
Ne pas utiliser ces fichiers, ils sont conservés uniquement à titre de backup.
