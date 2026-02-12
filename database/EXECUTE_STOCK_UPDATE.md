# Mise à jour des articles de stock avec SKU

## 📋 Résumé des modifications

### Nouveau modèle de données
- ✅ **Colonne SKU ajoutée** : `sku TEXT`
- ✅ **Colonne product_name** : `product_name TEXT`
- ✅ **Colonne quality_tier** : `quality_tier TEXT`

### 9 SKU uniques créés
| SKU | Produit | Catégorie |
|-----|---------|-----------|
| FL-ECO | Front Light | Economique |
| FL-MED | Front Light | Medium |
| FL-LUX | Front Light | Luxe |
| BL-ECO | Back Light | Economique |
| BL-MED | Back Light | Medium |
| BL-LUX | Back Light | Luxe |
| MC-ECO | Motor Component | Economique |
| MC-MED | Motor Component | Medium |
| MC-LUX | Motor Component | Luxe |

## 🚀 Comment exécuter

### Option 1 : Supabase Dashboard (Recommandé)

1. **Ouvrir Supabase Dashboard**
   - Aller sur [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Sélectionner votre projet
   
2. **Ouvrir SQL Editor**
   - Menu latéral gauche → `SQL Editor`
   
3. **Copier-coller le script**
   - Ouvrir `database/new_stock_items.sql`
   - Copier tout le contenu
   - Coller dans l'éditeur SQL
   
4. **Exécuter**
   - Cliquer sur `Run` ou `Ctrl+Enter`
   
5. **Vérifier les résultats**
   - Les 3 dernières requêtes affichent :
     - 20 exemples d'articles avec SKU
     - Distribution par SKU (9 types)
     - Nombre total d'articles

### Option 2 : Ligne de commande

```bash
# Si vous avez psql installé
psql -h db.xxx.supabase.co -U postgres -d postgres -f database/new_stock_items.sql
```

## 📊 Résultat attendu

Après exécution, vous devriez avoir :
- ✅ Tous les anciens stock_items supprimés
- ✅ Nouveaux articles créés pour **toutes les locations**
- ✅ 9 variantes cyclées (Front Light, Back Light, Motor Component)
- ✅ Chaque article a un **SKU persistant** (pas aléatoire)
- ✅ Niveaux de remplissage aléatoires entre 10-100
- ✅ Format `category` : "Front Light / Economique / Aisle-1 Rack-2"

## 🔄 Synchronisation temps réel

Une fois le script exécuté :
1. **Tous les frontends se mettront à jour automatiquement** via `realtime-sync.js`
2. **Les SKU seront affichés correctement** dans :
   - Vue 3D (index.html)
   - Carte 2D (warehouse-2d.html)
   - Analyse de stock (stock-analysis.html)
   - Dashboard KPI (kpi-dashboard.html)
   - Interface de gestion (management.html)

## ⚠️ Important

- **Les SKU sont maintenant stockés en base** (pas générés aléatoirement)
- **Le schéma Supabase a été mis à jour** avec les nouvelles colonnes
- **Le frontend utilise maintenant `stock?.sku`** au lieu de générer des SKU aléatoires

## 🧪 Test après exécution

```sql
-- Vérifier que les SKU sont bien présents
SELECT sku, COUNT(*) FROM stock_items GROUP BY sku;

-- Expected output: 9 rows (FL-ECO, FL-MED, FL-LUX, BL-ECO, BL-MED, BL-LUX, MC-ECO, MC-MED, MC-LUX)
```

## 📁 Fichiers modifiés

### Base de données
- ✅ `database/supabase-schema.sql` - Colonnes SKU ajoutées
- ✅ `database/new_stock_items.sql` - Script de création avec SKU

### Frontend
- ✅ `frontend/js/stock-analysis.js` - Utilise `stock?.sku`
- ✅ `frontend/js/warehouse-2d.js` - Utilise `stock?.sku`
- ✅ `frontend/js/controls.js` - Passe le SKU entre pages

## 🎯 Prochaine étape

Après avoir exécuté ce script dans Supabase, vous pouvez :
1. **Ouvrir n'importe quelle page frontend**
2. **Les nouveaux produits seront visibles immédiatement**
3. **Les SKU seront cohérents et persistants**
