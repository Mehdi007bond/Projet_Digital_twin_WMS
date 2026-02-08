# Digital Twin WMS - Migration Supabase vers Docker

## 🎯 Objectif

Ce guide explique comment migrer de Supabase vers une architecture Docker complète avec PostgreSQL local.

## ✅ Ce qui a été fait

### 1. Backend FastAPI créé (`backend/main.py`)
- API REST complète pour remplacer Supabase REST API
- Endpoints pour warehouses, zones, racks, locations, stock_items, agvs, missions, orders
- Support WebSocket pour les mises à jour en temps réel
- Connexion PostgreSQL via asyncpg

### 2. Docker Configuration (`docker-compose.yml`)
- **db**: PostgreSQL 16 avec initialization scripts
- **backend**: FastAPI avec hot-reload
- **frontend**: Nginx servant les fichiers statiques et proxy API/WebSocket

### 3. Frontend API Client (`frontend/js/api-config.js`)
- Client API JavaScript qui remplace Supabase client
- Compatible avec l'ancien code utilisant `window.supabase.createClient()`
- Support WebSocket pour temps réel

### 4. Simulation PostgreSQL (`backend/simulation_postgres.py`)
- Version de la simulation qui utilise asyncpg au lieu de Supabase
- Connexion directe à PostgreSQL
- Boucle de simulation AGVs avec mise à jour en base

### 5. Configuration
- Fichiers `.env` et `.env.example` pour variables d'environnement
- Nginx configuré avec proxy vers backend
- Scripts de démarrage PowerShell et Bash

## 🚀 Comment lancer le projet

### Option 1: Tout en un avec le script (Recommandé)

**Windows (PowerShell):**
```powershell
.\start.ps1
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manuellement

```bash
# 1. Vérifier la configuration
cp .env.example .env
# Éditer .env si nécessaire

# 2. Construire et démarrer
docker-compose build
docker-compose up -d

# 3. Vérifier les logs
docker-compose logs -f

# 4. Accéder à l'application
# Frontend: http://localhost
# API: http://localhost:8000
# Database: localhost:5432
```

## 📁 Structure mise à jour

```
Projet_Digital_twin_WMS/
├── docker-compose.yml          # Configuration Docker complète
├── .env                          # Variables d'environnement
├── .env.example                  # Template de configuration
├── start.ps1                     # Script de démarrage Windows
├── start.sh                      # Script de démarrage Linux/Mac
│
├── backend/
│   ├── Dockerfile               # Image Docker backend
│   ├── main.py                  # ✨ NOUVEAU - API FastAPI
│   ├── simulation_postgres.py  # ✨ NOUVEAU - Simulation PostgreSQL
│   ├── simulation.py            # Ancien (Supabase) - conservé
│   └── requirements.txt         # Dépendances Python mises à jour
│
├── frontend/
│   ├── Dockerfile               # Image Docker frontend
│   ├── nginx.conf               # Configuration Nginx avec proxy
│   ├── index.html               # Mis à jour (api-config.js)
│   ├── stock-analysis.html      # Mis à jour (api-config.js)
│   └── js/
│       ├── api-config.js        # ✨ NOUVEAU - Client API local
│       └── supabase-config.js   # Ancien - conservé pour référence
│
└── database/
    ├── schema.sql               # Structure de la base
    ├── seed_data.sql            # Données initiales
    └── setup_rls_policies.sql   # Politiques (optionnel)
```

## 🔄 Différences clés

| Aspect | Avant (Supabase) | Après (Docker) |
|--------|------------------|----------------|
| **Base de données** | Supabase Cloud | PostgreSQL local (Docker) |
| **API REST** | Supabase REST API | FastAPI (backend/main.py) |
| **Real-time** | Supabase Realtime | WebSocket custom |
| **Frontend Config** | supabase-config.js | api-config.js |
| **Auth** | Supabase Auth | Non implémenté (à ajouter si besoin) |
| **Déploiement** | Cloud | Docker local ou serveur |

## 🛠️ Commandes utiles

```bash
# Voir l'état des conteneurs
docker-compose ps

# Voir les logs
docker-compose logs -f
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db

# Arrêter
docker-compose down

# Redémarrer un service
docker-compose restart backend

# Reconstruire après modifications
docker-compose up -d --build

# Accéder à la base de données
docker-compose exec db psql -U digital_twin -d digital_twin

# Exécuter la simulation
docker-compose exec backend python simulation_postgres.py
```

## 🔍 Vérifications

### 1. Vérifier que tous les services sont UP
```bash
docker-compose ps
```
Tous devraient être "Up"

### 2. Tester l'API backend
```bash
curl http://localhost:8000/health
```
Devrait retourner `{"status":"healthy","database":"ok"}`

### 3. Tester les endpoints
```bash
# AGVs
curl http://localhost:8000/api/agvs

# Locations
curl http://localhost:8000/api/locations

# Stock Items
curl http://localhost:8000/api/stock_items
```

### 4. Accéder au frontend
Ouvrir http://localhost dans le navigateur

### 5. Vérifier WebSocket
Ouvrir la console du navigateur, vous devriez voir:
```
✅ API Client initialized: http://localhost/api
✅ WebSocket connected
```

## 🐛 Dépannage

### Le frontend ne se charge pas
```bash
# Vérifier les logs Nginx
docker-compose logs frontend

# Reconstruire
docker-compose up -d --build frontend
```

### L'API ne répond pas
```bash
# Vérifier les logs backend
docker-compose logs backend

# Redémarrer
docker-compose restart backend
```

### Erreurs de base de données
```bash
# Vérifier PostgreSQL
docker-compose logs db

# Se connecter à la DB
docker-compose exec db psql -U digital_twin -d digital_twin

# Vérifier les tables
\dt
```

### Ports déjà utilisés
Si les ports 80, 8000 ou 5432 sont déjà utilisés:
1. Modifier les ports dans `docker-compose.yml`
2. Mettre à jour `.env` si nécessaire
3. Relancer: `docker-compose up -d`

## 📝 Notes importantes

1. **Données persistantes**: Les données PostgreSQL sont stockées dans un volume Docker nommé `db_data`
2. **Hot reload**: Le backend FastAPI et le frontend supportent le hot reload (modifications en direct)
3. **Sécurité**: En production, changez les mots de passe dans `.env`
4. **Performances**: Pour de meilleures performances, augmentez les ressources Docker (RAM, CPU)

## 🎉 Prochaines étapes

1. ✅ Migration Supabase → Docker: **Terminée**
2. 🔄 Tester toutes les fonctionnalités
3. 🔐 Ajouter l'authentification si nécessaire
4. 📊 Optimiser les requêtes DB
5. 🚀 Déploiement en production

## 💡 Avantages de cette architecture

- ✅ **Contrôle total**: Pas de dépendance externe
- ✅ **Développement local**: Tout tourne localement
- ✅ **Portable**: Fonctionne partout avec Docker
- ✅ **Économique**: Pas de coûts cloud Supabase
- ✅ **Performance**: Latence minimale
- ✅ **Personnalisable**: Code backend modifiable

## 📞 Support

En cas de problème:
1. Vérifier les logs: `docker-compose logs -f`
2. Vérifier l'état: `docker-compose ps`
3. Redémarrer: `docker-compose restart`
4. Reconstruire: `docker-compose up -d --build`
