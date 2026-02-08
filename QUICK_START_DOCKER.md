# 🚀 Démarrage Rapide - Digital Twin WMS avec Docker

## 📋 Prérequis

- **Docker Desktop** installé et en cours d'exécution
- **Git** (pour cloner le projet)
- **8 GB RAM minimum** recommandé
- **Ports libres**: 80, 8000, 5432

## ⚡ Lancement en 3 étapes

### 1️⃣ Cloner et naviguer
```bash
git clone <votre-repo>
cd Projet_Digital_twin_WMS
```

### 2️⃣ Configurer l'environnement
```bash
# Copier le fichier d'exemple
cp .env.example .env

# Optionnel: Éditer .env pour personnaliser les mots de passe
```

### 3️⃣ Lancer avec le script

**Windows (PowerShell):**
```powershell
.\start.ps1
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

Le script va automatiquement:
- ✅ Vérifier Docker
- ✅ Créer le fichier .env
- ✅ Construire les images Docker
- ✅ Démarrer tous les services
- ✅ Afficher les logs en temps réel

## 🌐 Accès à l'application

Une fois démarré (après ~30 secondes):

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost | Interface 3D principale |
| **API** | http://localhost/api | API REST |
| **Backend** | http://localhost:8000 | Backend FastAPI direct |
| **Database** | localhost:5432 | PostgreSQL |

## 🎮 Pages disponibles

1. **Vue 3D principale**: http://localhost/index.html
2. **Analyse des stocks**: http://localhost/stock-analysis.html
3. **Vue 2D**: http://localhost/warehouse-2d.html

## 🛠️ Commandes utiles

```bash
# Voir l'état des conteneurs
docker-compose ps

# Voir les logs
docker-compose logs -f

# Voir les logs d'un service spécifique
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db

# Arrêter l'application
docker-compose down

# Redémarrer un service
docker-compose restart backend

# Reconstruire après des modifications
docker-compose up -d --build

# Arrêter et supprimer les volumes (⚠️ supprime les données)
docker-compose down -v
```

## 🗄️ Accès à la base de données

```bash
# Se connecter à PostgreSQL
docker-compose exec db psql -U digital_twin -d digital_twin

# Lister les tables
\dt

# Voir les AGVs
SELECT * FROM agvs;

# Quitter
\q
```

## 🤖 Lancer la simulation AGV

```bash
# Option 1: Depuis le conteneur backend
docker-compose exec backend python simulation_postgres.py

# Option 2: Localement (si Python installé)
cd backend
pip install -r requirements.txt
python simulation_postgres.py
```

## 🔧 Personnalisation

### Modifier les ports

Éditez [docker-compose.yml](docker-compose.yml):

```yaml
services:
  frontend:
    ports:
      - "8080:80"  # Changer 80 en 8080
  
  backend:
    ports:
      - "9000:8000"  # Changer 8000 en 9000
```

### Modifier les identifiants de base de données

Éditez [.env](.env):

```env
POSTGRES_DB=mon_jumeau_numerique
POSTGRES_USER=admin
POSTGRES_PASSWORD=mon_mot_de_passe_securise
```

## 📊 Architecture Docker

```
┌─────────────────────────────────────────────────────┐
│                   Docker Network                     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Frontend   │  │   Backend    │  │ PostgreSQL│ │
│  │   (Nginx)    │  │  (FastAPI)   │  │   (DB)    │ │
│  │   Port 80    │  │  Port 8000   │  │ Port 5432 │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                  │                 │       │
│         └─────── API ──────┴─────── SQL ────┘       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 🐛 Dépannage

### Les conteneurs ne démarrent pas

```bash
# Voir les erreurs
docker-compose logs

# Vérifier si les ports sont libres
# Windows
netstat -ano | findstr :80
netstat -ano | findstr :8000
netstat -ano | findstr :5432

# Linux/Mac
lsof -i :80
lsof -i :8000
lsof -i :5432
```

### Le frontend affiche une erreur 502

```bash
# Le backend n'est probablement pas prêt
# Attendre 10-15 secondes de plus ou vérifier:
docker-compose logs backend
```

### Erreur de connexion à la base de données

```bash
# Vérifier que la DB est UP
docker-compose ps db

# Voir les logs
docker-compose logs db

# Redémarrer la DB
docker-compose restart db
```

### Page blanche ou erreur de chargement

```bash
# Vider le cache du navigateur
# Chrome: Ctrl+Shift+R
# Firefox: Ctrl+F5

# Reconstruire le frontend
docker-compose up -d --build frontend
```

## 🔄 Réinitialiser complètement

```bash
# Arrêter et supprimer tout (conteneurs + volumes + réseau)
docker-compose down -v

# Supprimer les images
docker-compose down --rmi all

# Nettoyer Docker
docker system prune -a --volumes

# Redémarrer proprement
.\start.ps1  # ou ./start.sh
```

## 📚 Documentation complète

- **[MIGRATION_DOCKER.md](MIGRATION_DOCKER.md)**: Guide de migration Supabase → Docker
- **[README.md](README.md)**: Documentation complète du projet
- **[docs/](docs/)**: Documentation technique détaillée

## ✅ Vérification du bon fonctionnement

Après le démarrage, vérifiez:

1. ✅ **Frontend accessible**: http://localhost
2. ✅ **API répond**: http://localhost:8000/health → `{"status":"healthy"}`
3. ✅ **WebSocket connecté**: Console navigateur → "✅ WebSocket connected"
4. ✅ **3D se charge**: Entrepôt visible avec AGVs
5. ✅ **Données chargées**: Statistiques affichées dans les panneaux

## 🎉 C'est parti !

Une fois tout démarré, explorez:
- 🏭 La visualisation 3D de l'entrepôt
- 🤖 Les AGVs en mouvement
- 📦 Les racks de stockage
- 📊 Les statistiques en temps réel
- 🎮 Les contrôles interactifs

**Bon jumeau numérique !** 🚀
