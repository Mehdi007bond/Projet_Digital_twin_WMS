# 🚀 Migration vers Supabase Realtime - Guide Complet

## ✅ Étape 1 : Configuration Supabase (FAITE ✓)

Vous avez déjà :
- ✅ Créé un projet Supabase
- ✅ Copié les clés
- ✅ Configuration disponible dans `frontend/js/supabase-config.js`

**Vos clés** :
- Project URL: `https://kzmukwchzkakldninibv.supabase.co`
- Anon Key: `sb_publishable_NN3OZA6lywEkKLgxpRxBLA_HoQKrbGQ`

---

## 🗄️ Étape 2 : Importer le Schema SQL

### Option A : Dashboard Supabase (Recommandé)

1. Allez sur **https://supabase.com/dashboard**
2. Sélectionnez votre projet
3. Allez dans **SQL Editor** (panneau gauche)
4. Cliquez **New Query**
5. Collez le contenu de `database/supabase-schema.sql`
6. Cliquez **Run** (bouton gris)
7. ✅ Attendez la completion

### Option B : Copier-Coller Direct

```bash
# Alternatif : utiliser la CLI Supabase (si installée)
supabase db push
```

---

## 📝 Étape 3 : Activer Realtime pour chaque table

Après avoir importé le schema, vous devez **activer Realtime** :

1. **Supabase Dashboard** → **Database** → **Publications**
2. Cliquez sur la publication `supabase_realtime`
3. Vérifiez que ces tables sont **cochées** ✅:
   - `agvs`
   - `stock_items`
   - `tasks`
   - `v_kpi_stock` (optionnel)
   - `v_kpi_agv` (optionnel)

Si ce n'est pas coché, cliquez **Edit** et cochez-les.

---

## 🔄 Étape 4 : Mettre à jour les fichiers HTML

Le CDN Supabase et la configuration sont **déjà ajoutés** :

- ✅ `frontend/index.html`
- ✅ `frontend/warehouse-2d.html`
- ✅ `frontend/kpi-dashboard.html`
- ✅ `frontend/stock-analysis.html`
- ✅ `frontend/js/supabase-config.js`

Nouveau fichier Realtime :
- ✅ `frontend/js/websocket-supabase.js`

---

## 🔗 Étape 5 : Utiliser le nouveau WebSocket

### Remplacer l'ancienne connexion WebSocket

**Avant** (Docker) :
```javascript
<script src="js/websocket.js"></script>
```

**Après** (Supabase) :
```javascript
<script src="js/websocket-supabase.js"></script>
```

**À faire dans tous les fichiers HTML** :
- `index.html`
- `warehouse-2d.html`
- `kpi-dashboard.html`
- `stock-analysis.html`

---

## 📡 Étape 6 : Tester la connexion

Ouvrez votre application dans le navigateur :

1. Ouvrez **DevTools** (F12)
2. Allez dans l'onglet **Console**
3. Cherchez les messages :
   - ✅ `"✅ Supabase connecté avec succès !"`
   - ✅ `"✅ Initial data loaded from Supabase"`
   - ✅ `"🤖 AGV Update:"` (en direct)
   - ✅ `"📦 Stock Update:"` (en direct)

Si vous voyez ces messages → **Temps réel = ACTIF** 🎉

---

## 🆘 Dépannage

### ❌ "Supabase client not loaded"

**Cause** : Le CDN n'a pas chargé à temps

**Solution** :
1. Vérifiez votre connexion internet
2. Rafraîchissez la page (Ctrl+F5)
3. Vérifiez que `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js...">` est dans le `<head>`

### ❌ "Error: relation does not exist"

**Cause** : Le schema SQL n'a pas été importé correctement

**Solution** :
1. Allez dans Supabase Dashboard → **SQL Editor**
2. Réimportez `database/supabase-schema.sql`
3. Cliquez **Run**

### ❌ Pas de mises à jour temps réel

**Cause** : Realtime n'est pas activée pour les tables

**Solution** :
1. Supabase Dashboard → **Database** → **Publications**
2. Vérifiez que `agvs`, `stock_items`, `tasks` sont cochées ✅
3. Rafraîchissez votre application

---

## 🎯 Architecture Finale

```
Frontend (HTML/JS avec Supabase CDN)
    ↓
supabase-config.js (init Supabase)
    ↓
websocket-supabase.js (Realtime subscriptions)
    ↓
Supabase PostgreSQL
    ↓
Supabase Realtime Pub/Sub
    ↓
Frontend (mise à jour en direct)
```

---

## ✨ Avantages Supabase Realtime

| Avant (Docker) | Après (Supabase) |
|---|---|
| ❌ WebSocket custom | ✅ Realtime natif |
| ❌ Backend à gérer | ✅ Serveurs gérés |
| ❌ Zéro scaling | ✅ Auto-scaling |
| ❌ 1 datacenter | ✅ Multi-région |
| ❌ Latence variable | ✅ < 100ms garanti |

---

## 💡 Prochaines étapes

1. **Importer le schema SQL** (étape 2)
2. **Activer Realtime** (étape 3)
3. **Remplacer websocket.js par websocket-supabase.js** dans tous les HTML
4. **Tester en ouvrant l'application**
5. **Vérifier les logs de la console**

---

## 📞 Questions ?

Si quelque chose ne fonctionne pas :

1. ✅ Vérifiez les logs Console (F12)
2. ✅ Allez dans Supabase Dashboard pour voir les erreurs
3. ✅ Vérifiez que le schema SQL est bien importé

---

**Bon déploiement ! 🚀** Votre application est maintenant **100% temps réel** avec Supabase.
