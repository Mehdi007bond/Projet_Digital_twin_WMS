#!/bin/bash
# Script de démarrage pour Digital Twin WMS - Docker

echo "========================================"
echo "🏭 Digital Twin WMS - Docker Startup"
echo "========================================"
echo ""

# Vérifier si Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé ou n'est pas dans le PATH"
    echo "   Installez Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Vérifier si Docker est en cours d'exécution
if ! docker info &> /dev/null; then
    echo "❌ Docker n'est pas en cours d'exécution"
    echo "   Démarrez le service Docker et réessayez"
    exit 1
fi

echo "✅ Docker est prêt"
echo ""

# Créer le fichier .env s'il n'existe pas
if [ ! -f ".env" ]; then
    echo "📝 Création du fichier .env..."
    cp .env.example .env
    echo "✅ Fichier .env créé à partir de .env.example"
    echo ""
fi

# Arrêter les conteneurs existants
echo "🛑 Arrêt des conteneurs existants..."
docker-compose down 2>/dev/null
echo ""

# Construire les images
echo "🔨 Construction des images Docker..."
docker-compose build --no-cache
if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de la construction des images"
    exit 1
fi
echo "✅ Images construites avec succès"
echo ""

# Démarrer les conteneurs
echo "🚀 Démarrage des conteneurs..."
docker-compose up -d
if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du démarrage des conteneurs"
    exit 1
fi
echo ""

# Attendre que les services soient prêts
echo "⏳ Attente du démarrage des services..."
sleep 5

# Vérifier l'état des conteneurs
echo ""
echo "📊 État des conteneurs:"
docker-compose ps
echo ""

# Afficher les informations
echo "========================================"
echo "✅ Digital Twin WMS démarré avec succès!"
echo "========================================"
echo ""
echo "🌐 Accès à l'application:"
echo "   Frontend:  http://localhost"
echo "   API:       http://localhost/api"
echo "   Backend:   http://localhost:8000"
echo "   Database:  localhost:5432"
echo ""
echo "📋 Commandes utiles:"
echo "   Voir les logs:        docker-compose logs -f"
echo "   Arrêter:              docker-compose down"
echo "   Redémarrer:           docker-compose restart"
echo "   Reconstruire:         docker-compose up -d --build"
echo ""
echo "🔍 Affichage des logs (CTRL+C pour quitter)..."
echo ""

# Afficher les logs
docker-compose logs -f
