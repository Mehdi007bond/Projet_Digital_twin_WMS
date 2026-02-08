# 🔍 DIAGNOSTIC COMPLET - Stock Analysis Page

## 📋 Problèmes identifiés et corrigés

### 1. ❌ **CLÉ SUPABASE INCORRECTE**
**Problème :** La clé utilisée était `sb_secret_...` (service_role key) au lieu de la clé publique `anon`

**Impact :** 
- Erreurs d'authentification avec Supabase
- Impossible de charger les données depuis la base

**Correction appliquée :**
✅ Remplacé par la vraie clé anon JWT dans `js/supabase-config.js`

```javascript
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

### 2. ⚠️ **MANQUE DE LOGS DE DEBUG**
**Problème :** Aucun log console pour diagnostiquer les erreurs de chargement

**Impact :**
- Impossible de savoir si les données sont chargées
- Pas de visibilité sur les erreurs Supabase

**Correction appliquée :**
✅ Ajout de logs détaillés dans `stock-analysis.js`:
- Log de connexion Supabase
- Log du nombre de locations/stock_items chargés
- Log des erreurs avec détails
- Log d'échantillons de données

---

### 3. 🐛 **MAPPING DE DONNÉES INCORRECT**
**Problème :** 
- Utilisation de `stock?.id` au lieu de `stock?.product_id` pour le SKU
- Pas de gestion du cas où `stock.fill_level` est `null` ou `undefined`
- Status calculé avec erreur sur `stock.fill_level` au lieu de `fillLevel`

**Impact :**
- SKU affichés incorrectement
- FillLevel potentiellement `NaN`
- Status incorrect pour les emplacements

**Correction appliquée :**
✅ Mapping corrigé :
```javascript
{
    id: loc.id,
    aisle: loc.row_no,
    rack: loc.bay_no,
    level: loc.level_no,
    position: `R${loc.row_no}B${loc.bay_no}L${loc.level_no}`,
    category: stock?.category || 'C',
    sku: stock?.product_id || '-',
    fillLevel: stock?.fill_level || 0,
    occupied: loc.occupied,
    status: !stock || fillLevel === 0 ? 'Vide' : ...
}
```

---

### 4. 🔧 **VÉRIFICATION SUPABASE MANQUANTE**
**Problème :** Pas de vérification si locations est vide

**Impact :**
- Page affiche "0 items" si la base est vide
- Pas de fallback vers les données de démonstration

**Correction appliquée :**
✅ Ajout de vérification `locations.length > 0`
✅ Fallback vers IndexedDB/localStorage/sample data si échec

---

## 📊 Structure attendue dans Supabase

### Table `locations`
Doit contenir :
```sql
- id (uuid/text)
- row_no (integer)
- bay_no (integer) 
- level_no (integer)
- occupied (boolean)
- warehouse_id (uuid)
```

### Table `stock_items`
Doit contenir :
```sql
- id (uuid)
- location_id (uuid) -- FK vers locations
- product_id (text/varchar) -- Le SKU du produit
- category (text) -- 'A', 'B', ou 'C'
- fill_level (integer) -- 0-100
```

---

## 🧪 Comment tester

### Étape 1 : Tester la connexion Supabase
Ouvrir : http://localhost:8080/test-supabase.html

Vérifier :
- ✅ Client Supabase créé
- ✅ Connexion réussie
- ✅ Locations chargées (devrait afficher 60 items)
- ✅ Stock items chargés (devrait afficher ~42 items)

### Étape 2 : Ouvrir la console sur stock-analysis
1. Aller sur http://localhost:8080/stock-analysis.html
2. Ouvrir F12 (Console)
3. Regarder les logs :

```
🚀 Initializing Stock Analysis with Data Pipeline
📦 IndexedDB initialized
📡 Loading from Supabase...
Supabase URL: [REDACTED - URL REMOVED FOR SECURITY]
Supabase key length: 164
Querying locations...
Locations result: { count: 60, error: null }
Querying stock_items...
Stock items result: { count: 42, error: null }
✅ Loaded 60 items from Supabase
Sample data: [...]
```

### Étape 3 : Vérifier l'affichage
- La carte "Total Items" devrait afficher **60**
- La carte "Occupés" devrait afficher **~42**
- La carte "Vides" devrait afficher **~18**
- Le tableau devrait afficher les 20 premiers items
- Les graphiques doivent avoir des données

---

## 🚨 Si les données ne s'affichent toujours pas

### Vérification 1 : Base de données vide ?
Exécuter dans Supabase SQL Editor :
```sql
SELECT COUNT(*) FROM locations;
SELECT COUNT(*) FROM stock_items;
```

Si retourne 0, réexécuter :
- `database/schema.sql`
- `database/seed_data.sql`

### Vérification 2 : RLS (Row Level Security) activé ?
Exécuter dans Supabase SQL Editor :
```sql
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read locations" ON locations
FOR SELECT USING (true);

CREATE POLICY "Allow public read stock_items" ON stock_items
FOR SELECT USING (true);
```

### Vérification 3 : Erreur dans la console ?
Si tu vois une erreur rouge dans F12, envoie-moi le message complet.

---

## 📁 Fichiers modifiés

1. ✅ `frontend/js/supabase-config.js` - Clé anon corrigée
2. ✅ `frontend/js/stock-analysis.js` - Logs + mapping corrigé
3. ✅ `frontend/test-supabase.html` - Page de test créée

---

## 🎯 Prochaines étapes

1. **Tester test-supabase.html** pour vérifier connexion
2. **Recharger stock-analysis.html** avec F12 ouvert
3. **Vérifier les logs** dans la console
4. **Lancer la simulation** `python backend/simulation.py` pour voir les mises à jour en temps réel

---

## 💡 Notes importantes

⚠️ **NE JAMAIS** exposer la clé `service_role` côté frontend !
✅ Toujours utiliser la clé `anon` publique
✅ Les permissions se gèrent avec RLS (Row Level Security) dans Supabase
