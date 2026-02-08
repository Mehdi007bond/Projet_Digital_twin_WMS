#!/usr/bin/env pwsh
# Script de démarrage pour Digital Twin WMS - Docker

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🏭 Digital Twin WMS - Docker Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Docker est installé
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Vérifier si Docker est en cours d'exécution
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker n'est pas en cours d'exécution" -ForegroundColor Red
    Write-Host "   Démarrez Docker Desktop et réessayez" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Docker est prêt" -ForegroundColor Green
Write-Host ""

# Créer le fichier .env s'il n'existe pas
if (!(Test-Path ".env")) {
    Write-Host "📝 Création du fichier .env..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Fichier .env créé à partir de .env.example" -ForegroundColor Green
    Write-Host ""
}

# Arrêter les conteneurs existants
Write-Host "🛑 Arrêt des conteneurs existants..." -ForegroundColor Yellow
docker-compose down 2>$null
Write-Host ""

# Construire les images
Write-Host "🔨 Construction des images Docker..." -ForegroundColor Yellow
docker-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors de la construction des images" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Images construites avec succès" -ForegroundColor Green
Write-Host ""

# Démarrer les conteneurs
Write-Host "🚀 Démarrage des conteneurs..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors du démarrage des conteneurs" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Attendre que les services soient prêts
Write-Host "⏳ Attente du démarrage des services..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Vérifier l'état des conteneurs
Write-Host ""
Write-Host "📊 État des conteneurs:" -ForegroundColor Cyan
docker-compose ps
Write-Host ""

# Afficher les logs en temps réel
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Digital Twin WMS démarré avec succès!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 Accès à l'application:" -ForegroundColor Cyan
Write-Host "   Frontend:  http://localhost" -ForegroundColor White
Write-Host "   API:       http://localhost/api" -ForegroundColor White
Write-Host "   Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "   Database:  localhost:5432" -ForegroundColor White
Write-Host ""
Write-Host "📋 Commandes utiles:" -ForegroundColor Cyan
Write-Host "   Voir les logs:        docker-compose logs -f" -ForegroundColor White
Write-Host "   Arrêter:              docker-compose down" -ForegroundColor White
Write-Host "   Redémarrer:           docker-compose restart" -ForegroundColor White
Write-Host "   Reconstruire:         docker-compose up -d --build" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Affichage des logs (CTRL+C pour quitter)..." -ForegroundColor Yellow
Write-Host ""

# Afficher les logs
docker-compose logs -f
