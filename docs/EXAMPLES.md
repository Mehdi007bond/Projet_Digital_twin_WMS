# 📚 Exemples pratiques - Data Pipeline

## Vue d'ensemble

Ce document contient des exemples concrets d'utilisation du Data Pipeline pour gérer de grandes quantités de données dans le Digital Twin WMS.

## 🎯 Exemples de base

### 1. Charger et afficher des données

```javascript
// Charger les données depuis IndexedDB
const data = await dataPipeline.loadData('stockData');
console.log(`✅ ${data.length} items chargés`);

// Afficher dans un tableau
renderTable(data);
```

### 2. Importer un fichier CSV

```html
<input type="file" id="csv-input" accept=".csv" />

<script>
document.getElementById('csv-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    
    // Parser le CSV
    const data = await dataPipeline.parseCSV(file);
    console.log(`📄 ${data.length} lignes importées`);
    
    // Sauvegarder dans la base
    await dataPipeline.saveData(data, 'stockData');
    console.log('💾 Données sauvegardées');
});
</script>
```

### 3. Filtrer des données

```javascript
// Filtrage simple
const aisle2 = await dataPipeline.filterData(data, {
    aisle: 2
});

// Filtrage multiple
const filtered = await dataPipeline.filterData(data, {
    aisle: [1, 2, 3],
    level: 4,
    fill_level: { min: 50, max: 100 }
});

console.log(`🔍 ${filtered.length} items correspondent aux critères`);
```

### 4. Paginer les résultats

```javascript
const pageSize = 20;
const currentPage = 1;

const result = dataPipeline.paginate(data, currentPage, pageSize);

console.log(`📄 Page ${result.page} sur ${result.totalPages}`);
console.log(`📊 ${result.data.length} items affichés sur ${result.totalItems}`);

// Afficher
renderTable(result.data);
```

## 📊 Exemples d'analytics

### 5. Calculer des statistiques

```javascript
// Statistiques sur le taux de remplissage
const stats = dataPipeline.calculateStats(data, 'fill_level');

console.log(`
📈 Statistiques de remplissage:
- Nombre d'items: ${stats.count}
- Moyenne: ${stats.avg.toFixed(1)}%
- Minimum: ${stats.min}%
- Maximum: ${stats.max}%
- Médiane: ${stats.median}%
`);
```

### 6. Agréger par allée

```javascript
// Moyenne de remplissage par allée
const byAisle = dataPipeline.aggregate(data, 'aisle', {
    fill_level: 'avg',
    id: 'count'
});

console.log('📊 Statistiques par allée:');
byAisle.forEach(item => {
    console.log(`Allée ${item.aisle}: ${item.fill_level_avg.toFixed(1)}% moyen (${item.id_count} items)`);
});

// Résultat :
// Allée 1: 63.2% moyen (20 items)
// Allée 2: 71.5% moyen (20 items)
// Allée 3: 58.9% moyen (20 items)
```

### 7. Trouver les racks vides

```javascript
const emptyRacks = data.filter(item => item.fill_level === 0);

console.log(`🔍 ${emptyRacks.length} emplacements vides:`);
emptyRacks.forEach(item => {
    console.log(`- ${item.id}: ${item.product_name}`);
});
```

### 8. Trouver les racks à réapprovisionner

```javascript
const lowStock = data.filter(item => 
    item.fill_level > 0 && item.fill_level < 25
);

console.log(`⚠️ ${lowStock.length} emplacements nécessitent un réapprovisionnement:`);
lowStock.forEach(item => {
    console.log(`- ${item.id}: ${item.sku} (${item.fill_level}%)`);
});
```

## 🎨 Exemples d'interface

### 9. Tableau avec pagination

```html
<div id="table-container"></div>
<div id="pagination"></div>

<script>
let currentPage = 1;
const pageSize = 20;

async function displayPage(page) {
    const data = await dataPipeline.loadData('stockData');
    const result = dataPipeline.paginate(data, page, pageSize);
    
    // Afficher le tableau
    const html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>SKU</th>
                    <th>Produit</th>
                    <th>Remplissage</th>
                </tr>
            </thead>
            <tbody>
                ${result.data.map(item => `
                    <tr>
                        <td>${item.id}</td>
                        <td>${item.sku}</td>
                        <td>${item.product_name}</td>
                        <td>${item.fill_level}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    document.getElementById('table-container').innerHTML = html;
    
    // Afficher la pagination
    const pagination = `
        <button ${page === 1 ? 'disabled' : ''} onclick="displayPage(${page - 1})">
            Précédent
        </button>
        <span>Page ${page} / ${result.totalPages}</span>
        <button ${page === result.totalPages ? 'disabled' : ''} onclick="displayPage(${page + 1})">
            Suivant
        </button>
    `;
    
    document.getElementById('pagination').innerHTML = pagination;
}

// Afficher la première page
displayPage(1);
</script>
```

### 10. Graphique avec Chart.js

```javascript
// Agréger les données par niveau
const byLevel = dataPipeline.aggregate(data, 'level', {
    fill_level: 'avg'
});

// Créer le graphique
const ctx = document.getElementById('chart').getContext('2d');
new Chart(ctx, {
    type: 'bar',
    data: {
        labels: byLevel.map(item => `Niveau ${item.level}`),
        datasets: [{
            label: 'Taux de remplissage moyen (%)',
            data: byLevel.map(item => item.fill_level_avg),
            backgroundColor: 'rgba(99, 102, 241, 0.5)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true,
                max: 100
            }
        }
    }
});
```

## 🔄 Exemples avancés

### 11. Synchronisation entre pages

```javascript
// Page 1 : Sauvegarder les données
await dataPipeline.saveData(warehouseData, 'stockData');

// Page 2 : Charger automatiquement
const data = await dataPipeline.loadData('stockData');
// ✅ Données disponibles immédiatement
```

### 12. Export CSV personnalisé

```javascript
// Préparer les données à exporter
const exportData = filteredData.map(item => ({
    'Identifiant': item.id,
    'Référence': item.sku,
    'Produit': item.product_name,
    'Allée': item.aisle,
    'Rack': item.rack,
    'Niveau': item.level,
    'Remplissage (%)': item.fill_level,
    'Statut': item.fill_level === 0 ? 'Vide' : 
              item.fill_level < 25 ? 'Faible' :
              item.fill_level < 90 ? 'Moyen' : 'Plein'
}));

// Exporter
dataPipeline.exportToCSV(exportData, 'export-entrepot.csv');
```

### 13. Monitoring des performances

```javascript
// Mesurer le temps d'une opération
const startTime = performance.now();

// Opération
const filtered = await dataPipeline.filterData(data, filters);

const endTime = performance.now();
const duration = endTime - startTime;

console.log(`⏱️ Filtrage effectué en ${duration.toFixed(2)}ms`);

// Afficher la mémoire utilisée
if (performance.memory) {
    const usedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
    console.log(`💾 Mémoire utilisée: ${usedMB} MB`);
}
```

### 14. Recherche en temps réel

```html
<input type="text" id="search" placeholder="Rechercher un SKU..." />
<div id="results"></div>

<script>
let debounceTimer;

document.getElementById('search').addEventListener('input', (e) => {
    // Debounce pour éviter trop de recherches
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(async () => {
        const query = e.target.value.toLowerCase();
        
        if (query.length < 2) {
            document.getElementById('results').innerHTML = '';
            return;
        }
        
        // Charger les données
        const data = await dataPipeline.loadData('stockData');
        
        // Filtrer
        const results = data.filter(item => 
            item.sku.toLowerCase().includes(query) ||
            item.product_name.toLowerCase().includes(query)
        );
        
        // Afficher les résultats
        const html = results.slice(0, 10).map(item => `
            <div class="result-item">
                <strong>${item.sku}</strong> - ${item.product_name}
                <br>
                <small>${item.id} (${item.fill_level}%)</small>
            </div>
        `).join('');
        
        document.getElementById('results').innerHTML = html || '<p>Aucun résultat</p>';
    }, 300);  // Attendre 300ms après la dernière frappe
});
</script>
```

### 15. Comparaison entre périodes

```javascript
// Charger les données actuelles
const currentData = await dataPipeline.loadData('stockData');

// Charger les données de la semaine dernière
const previousData = await dataPipeline.loadData('stockData_backup');

// Comparer
const comparison = {
    currentAvg: dataPipeline.calculateStats(currentData, 'fill_level').avg,
    previousAvg: dataPipeline.calculateStats(previousData, 'fill_level').avg
};

const diff = comparison.currentAvg - comparison.previousAvg;
const trend = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';

console.log(`
${trend} Comparaison de remplissage:
- Actuel: ${comparison.currentAvg.toFixed(1)}%
- Précédent: ${comparison.previousAvg.toFixed(1)}%
- Différence: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%
`);
```

## 🎓 Cas d'usage réels

### 16. Dashboard de monitoring

```javascript
async function updateDashboard() {
    const data = await dataPipeline.loadData('stockData');
    
    // KPIs
    const totalItems = data.length;
    const occupied = data.filter(item => item.fill_level > 0).length;
    const empty = totalItems - occupied;
    const lowStock = data.filter(item => item.fill_level > 0 && item.fill_level < 25).length;
    
    // Statistiques
    const stats = dataPipeline.calculateStats(data, 'fill_level');
    
    // Agrégations
    const byAisle = dataPipeline.aggregate(data, 'aisle', {
        fill_level: 'avg',
        id: 'count'
    });
    
    // Afficher
    console.log(`
📊 DASHBOARD ENTREPÔT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Total emplacements: ${totalItems}
✅ Occupés: ${occupied} (${(occupied/totalItems*100).toFixed(1)}%)
⚪ Vides: ${empty} (${(empty/totalItems*100).toFixed(1)}%)
⚠️ Stock faible: ${lowStock}

📈 Taux de remplissage:
- Moyen: ${stats.avg.toFixed(1)}%
- Minimum: ${stats.min}%
- Maximum: ${stats.max}%
- Médiane: ${stats.median}%

🏭 Par allée:
${byAisle.map(a => `- Allée ${a.aisle}: ${a.fill_level_avg.toFixed(1)}% (${a.id_count} items)`).join('\n')}
    `);
}

// Mettre à jour toutes les 30 secondes
setInterval(updateDashboard, 30000);
updateDashboard();  // Première exécution
```

### 17. Génération de rapport automatique

```javascript
async function generateReport() {
    const data = await dataPipeline.loadData('stockData');
    const date = new Date().toLocaleDateString('fr-FR');
    
    // Préparer le rapport
    const report = {
        date: date,
        summary: {
            total: data.length,
            occupied: data.filter(i => i.fill_level > 0).length,
            empty: data.filter(i => i.fill_level === 0).length,
            lowStock: data.filter(i => i.fill_level > 0 && i.fill_level < 25).length
        },
        byAisle: dataPipeline.aggregate(data, 'aisle', {
            fill_level: 'avg',
            id: 'count'
        }),
        topProducts: data
            .filter(i => i.fill_level > 0)
            .sort((a, b) => b.fill_level - a.fill_level)
            .slice(0, 10)
            .map(i => ({ sku: i.sku, fill_level: i.fill_level }))
    };
    
    // Sauvegarder le rapport
    localStorage.setItem(`report_${Date.now()}`, JSON.stringify(report));
    
    console.log('✅ Rapport généré:', report);
    return report;
}
```

### 18. Alerte automatique

```javascript
async function checkAlerts() {
    const data = await dataPipeline.loadData('stockData');
    
    // Définir les seuils
    const alerts = [];
    
    // Alerte 1 : Stock critique
    const criticalStock = data.filter(i => i.fill_level > 0 && i.fill_level < 10);
    if (criticalStock.length > 0) {
        alerts.push({
            type: 'critical',
            message: `${criticalStock.length} emplacements en stock critique (<10%)`,
            items: criticalStock
        });
    }
    
    // Alerte 2 : Déséquilibre entre allées
    const byAisle = dataPipeline.aggregate(data, 'aisle', { fill_level: 'avg' });
    const maxDiff = Math.max(...byAisle.map(a => a.fill_level_avg)) - 
                    Math.min(...byAisle.map(a => a.fill_level_avg));
    
    if (maxDiff > 30) {
        alerts.push({
            type: 'warning',
            message: `Déséquilibre détecté entre les allées (${maxDiff.toFixed(1)}% de différence)`
        });
    }
    
    // Afficher les alertes
    if (alerts.length > 0) {
        console.warn('⚠️ ALERTES DÉTECTÉES:');
        alerts.forEach(alert => {
            console.warn(`[${alert.type.toUpperCase()}] ${alert.message}`);
        });
    }
    
    return alerts;
}

// Vérifier toutes les 5 minutes
setInterval(checkAlerts, 300000);
```

## 🔗 Intégration complète

### 19. Système complet avec toutes les fonctionnalités

```javascript
class WarehouseDataManager {
    constructor() {
        this.data = [];
        this.filters = {};
        this.currentPage = 1;
        this.pageSize = 20;
    }
    
    async init() {
        await dataPipeline.initDB();
        await this.loadData();
    }
    
    async loadData() {
        this.data = await dataPipeline.loadData('stockData');
        console.log(`✅ ${this.data.length} items chargés`);
    }
    
    async importCSV(file) {
        const data = await dataPipeline.parseCSV(file);
        await dataPipeline.saveData(data, 'stockData');
        await this.loadData();
        console.log(`📥 ${data.length} items importés`);
    }
    
    async filter(filters) {
        this.filters = filters;
        this.currentPage = 1;
        return await dataPipeline.filterData(this.data, filters);
    }
    
    paginate(data) {
        return dataPipeline.paginate(data, this.currentPage, this.pageSize);
    }
    
    getStats() {
        return dataPipeline.calculateStats(this.data, 'fill_level');
    }
    
    aggregate(by, operations) {
        return dataPipeline.aggregate(this.data, by, operations);
    }
    
    export(filename) {
        dataPipeline.exportToCSV(this.data, filename);
    }
}

// Utilisation
const manager = new WarehouseDataManager();
await manager.init();

// Import
await manager.importCSV(file);

// Filtrer
const filtered = await manager.filter({ aisle: 2 });

// Paginer
const page = manager.paginate(filtered);

// Stats
const stats = manager.getStats();

// Export
manager.export('warehouse-data.csv');
```

---

**Plus d'exemples à venir !**  
*Contribuez avec vos propres cas d'usage* 🚀
