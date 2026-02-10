// Warehouse 2D Map - Digital Twin WMS
// Manages 2D warehouse visualization with CSV import and real-time stock levels
// Enhanced with data pipeline for large-scale data handling

// Warehouse structure - synchronized with 3D model (racks.js)
const warehouseStructure = {
    rows: 3,           // 3 allées (A1, A2, A3)
    baysPerRow: 5,     // 5 racks par allée
    levels: 4          // 4 niveaux par rack
};

let warehouseData = [];
let filteredData = [];
let currentFilters = {
    aisle: '',
    level: '',
    status: ''
};

// Performance monitoring
let performanceMetrics = {
    loadTime: 0,
    renderTime: 0,
    filterTime: 0,
    itemCount: 0
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Warehouse 2D with Supabase');
    
    // Initialize data pipeline
    await dataPipeline.initDB();
    
    // Load data from Supabase
    await loadWarehouseDataFromSupabase();
    
    // CRITICAL: Wait for Supabase before enabling realtime
    let attempt = 0;
    while (!window.supabaseClient && attempt < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempt++;
    }
    
    if (window.supabaseClient) {
        console.log('[2D] ✅ Supabase ready, enabling real-time updates');
        connectRealtimeUpdates();
    } else {
        console.warn('[2D] ⚠️ Supabase not available, real-time disabled');
    }
    
    initializeEventListeners();
    updateStatistics();
    renderWarehouse();
    displayPerformanceMetrics();
});

// Load warehouse data from Supabase
async function loadWarehouseDataFromSupabase() {
    try {
        console.log('📡 Loading data from Supabase...');
        
        const locations = await dataPipeline.loadLocations();
        const stockItems = await dataPipeline.loadStockItems();
        
        if (locations && locations.length > 0) {
            // Map Supabase data to warehouse format
            warehouseData = locations.map(loc => {
                const stock = stockItems?.find(s => s.location_id === loc.id);
                const fillLevel = stock?.fill_level || 0;
                
                return {
                    id: loc.id,
                    aisle: loc.row_no,
                    rack: loc.bay_no,
                    level: loc.level_no,
                    position: `A${loc.row_no}R${loc.bay_no}L${loc.level_no}`,
                    category: stock?.category || 'C',
                    sku: stock?.id?.substring(0, 8) || '-',
                    fillLevel: fillLevel,
                    occupied: fillLevel > 0,
                    status: fillLevel === 0 ? 'empty' : fillLevel < 25 ? 'low' : fillLevel < 75 ? 'medium' : fillLevel < 90 ? 'good' : 'full'
                };
            });
            
            filteredData = [...warehouseData];
            console.log(`✅ Loaded ${warehouseData.length} locations from Supabase`);
            
            // Save to IndexedDB cache
            await dataPipeline.saveData(warehouseData, 'stockData');
        } else {
            console.warn('⚠️ No locations found, generating sample data');
            await generateSampleData();
        }
    } catch (error) {
        console.error('❌ Error loading from Supabase:', error);
        
        // Try IndexedDB cache
        const existingData = await dataPipeline.loadData('stockData');
        if (existingData && existingData.length > 0) {
            warehouseData = existingData;
            filteredData = [...warehouseData];
            console.log(`✅ Loaded ${warehouseData.length} items from IndexedDB cache`);
        } else {
            await generateSampleData();
        }
    }
}

// Connect to Supabase Realtime updates for live warehouse map
function connectRealtimeUpdates() {
    try {
        if (!window.supabaseClient) {
            console.warn('[2D] Supabase not available for realtime');
            return;
        }
        
        console.log('[2D] ✅ Subscribing to Supabase Realtime updates');
        
        // Subscribe to stock_items changes - RELOAD ALL DATA on any change
        window.supabaseClient
            .channel('warehouse2d:stock_items')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'stock_items' },
                (payload) => {
                    console.log('[2D] 📨 Real-time event received:', payload.eventType, payload.new);
                    // On any change, reload all data to stay in sync
                    loadWarehouseDataFromSupabase().then(() => {
                        renderWarehouse();
                        updateStatistics();
                        console.log('[2D] ✅ Warehouse 2D updated');
                    });
                }
            )
            .subscribe((status) => {
                console.log('[2D] Realtime subscription status:', status);
            });
            
        // Subscribe to locations changes
        window.supabaseClient
            .channel('warehouse2d:locations')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'locations' },
                (payload) => {
                    console.log('[2D] Location change detected, reloading...');
                    loadWarehouseDataFromSupabase().then(() => {
                        renderWarehouse();
                        updateStatistics();
                    });
                }
            )
            .subscribe();
            
    } catch (err) {
        console.error('[2D] ❌ Realtime subscription failed:', err);
    }
}

// Update a single warehouse item from Supabase change
function updateWarehouseItem(payload) {
    const { record } = payload;
    if (!record || !record.location_id) return;
    
    // Find and update the item in warehouseData
    const item = warehouseData.find(w => w.id === record.location_id);
    if (item) {
        item.fillLevel = record.fill_level || 0;
        item.occupied = item.fillLevel > 0;
        item.status = item.fillLevel === 0 ? 'empty' : 
                      item.fillLevel < 25 ? 'low' : 
                      item.fillLevel < 75 ? 'medium' : 
                      item.fillLevel < 90 ? 'good' : 'full';
        item.category = record.category || item.category;
        
        // Update filtered data if item matches current filters
        const filteredItem = filteredData.find(w => w.id === record.location_id);
        if (filteredItem) {
            Object.assign(filteredItem, item);
        }
        
        // Re-render affected cells
        renderWarehouse();
        updateStatistics();
    }
}

// Initialize all event listeners
function initializeEventListeners() {
    // CSV Upload
    document.getElementById('csv-input').addEventListener('change', handleCSVUpload);
    
    // Generate Sample Data
    document.getElementById('generate-sample-btn').addEventListener('click', generateSampleData);
    
    // Download Template
    document.getElementById('download-template-btn').addEventListener('click', downloadTemplate);
    
    // Filters
    document.getElementById('aisle-filter').addEventListener('input', applyFilters);
    document.getElementById('level-filter').addEventListener('change', applyFilters);
    document.getElementById('status-filter').addEventListener('change', applyFilters);
    document.getElementById('reset-filters-btn').addEventListener('click', resetFilters);
    
    // Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
        if (e.target.id === 'detail-modal') closeModal();
    });
}

// Handle CSV Upload
function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const startTime = performance.now();
    const status = document.getElementById('upload-status');
    status.textContent = '⏳ Chargement du fichier...';
    status.style.color = '#f59e0b';
    
    // Use data pipeline for CSV parsing
    dataPipeline.parseCSV(file).then(async (data) => {
        try {
            // Transform data to warehouse format
            const transformedData = data.map(item => ({
                aisle: parseInt(item.aisle) || parseInt(item.allée) || 0,
                rack: parseInt(item.rack) || 0,
                level: parseInt(item.level) || parseInt(item.niveau) || 0,
                sku: item.sku || item.référence || '-',
                product_name: item.product_name || item.produit || 'Unknown',
                fill_level: Math.min(100, Math.max(0, parseInt(item.fill_level) || parseInt(item.remplissage) || 0)),
                id: `A${String(item.aisle || item.allée || 0).padStart(2, '0')}-R${String(item.rack || 0).padStart(2, '0')}-L${item.level || item.niveau || 0}`
            })).filter(item => item.aisle && item.rack && item.level);
            
            if (transformedData.length > 0) {
                // Save to IndexedDB using data pipeline
                status.textContent = '💾 Sauvegarde dans la base de données...';
                await dataPipeline.saveData(transformedData, 'stockData');
                
                warehouseData = transformedData;
                filteredData = [...warehouseData];
                
                const endTime = performance.now();
                performanceMetrics.loadTime = endTime - startTime;
                performanceMetrics.itemCount = warehouseData.length;
                
                updateStatistics();
                renderWarehouse();
                displayPerformanceMetrics();
                
                status.textContent = `✅ ${transformedData.length} items importés avec succès! (${Math.round(performanceMetrics.loadTime)}ms)`;
                status.style.color = '#10b981';
                
                console.log(`CSV imported: ${transformedData.length} items in ${Math.round(performanceMetrics.loadTime)}ms`);
            } else {
                throw new Error('Aucune donnée valide trouvée dans le CSV');
            }
        } catch (error) {
            console.error('Error processing CSV:', error);
            status.textContent = `❌ Erreur: ${error.message}`;
            status.style.color = '#ef4444';
        }
    }).catch(error => {
        console.error('Error parsing CSV:', error);
        status.textContent = `❌ Erreur de lecture: ${error.message}`;
        status.style.color = '#ef4444';
    });
}

// Parse CSV content
function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        
        // Validate required fields
        if (obj.aisle && obj.rack && obj.level) {
            data.push({
                aisle: parseInt(obj.aisle),
                rack: parseInt(obj.rack),
                level: parseInt(obj.level),
                sku: obj.sku || `-`,
                product_name: obj.product_name || 'Unknown',
                fill_level: Math.min(100, Math.max(0, parseInt(obj.fill_level) || 0)),
                id: `A${obj.aisle.padStart(2, '0')}-R${obj.rack.padStart(2, '0')}-L${obj.level}`
            });
        }
    }
    
    return data;
}

// Generate sample warehouse data
async function generateSampleData() {
    const startTime = performance.now();
    warehouseData = [];
    const skuPrefixes = ['SKU', 'ITEM', 'PROD', 'REF'];
    const products = ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'];
    
    // Use warehouse structure from 3D model
    for (let aisle = 1; aisle <= warehouseStructure.rows; aisle++) {
        for (let rack = 1; rack <= warehouseStructure.baysPerRow; rack++) {
            for (let level = 1; level <= warehouseStructure.levels; level++) {
                const id = `A${aisle.toString().padStart(2, '0')}-R${rack.toString().padStart(2, '0')}-L${level}`;
                const fillLevel = Math.floor(Math.random() * 101);
                
                warehouseData.push({
                    aisle: aisle,
                    rack: rack,
                    level: level,
                    sku: fillLevel > 0 ? `${skuPrefixes[Math.floor(Math.random() * skuPrefixes.length)]}-${Math.floor(Math.random() * 9000) + 1000}` : '-',
                    product_name: fillLevel > 0 ? products[Math.floor(Math.random() * products.length)] : 'Empty',
                    fill_level: fillLevel,
                    id: id
                });
            }
        }
    }
    
    // Save to IndexedDB using data pipeline
    await dataPipeline.saveData(warehouseData, 'stockData');
    
    const endTime = performance.now();
    performanceMetrics.loadTime = endTime - startTime;
    performanceMetrics.itemCount = warehouseData.length;
    
    filteredData = [...warehouseData];
    updateStatistics();
    renderWarehouse();
    
    const status = document.getElementById('upload-status');
    status.textContent = `✅ ${warehouseData.length} items de test générés! (${Math.round(performanceMetrics.loadTime)}ms)`;
    status.style.color = '#10b981';
    
    console.log(`Sample data generated: ${warehouseData.length} items in ${Math.round(performanceMetrics.loadTime)}ms`);
}

// Download CSV template
function downloadTemplate() {
    const template = `aisle,rack,level,sku,product_name,fill_level
1,1,1,SKU-001,Product A,85
1,1,2,SKU-002,Product B,45
1,1,3,SKU-003,Product C,0
1,1,4,SKU-004,Product D,92
1,2,1,SKU-005,Product E,30
1,2,2,SKU-006,Product F,78`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'warehouse-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Apply filters
async function applyFilters() {
    const startTime = performance.now();
    
    currentFilters.aisle = document.getElementById('aisle-filter').value || '';
    currentFilters.level = document.getElementById('level-filter').value || '';
    currentFilters.status = document.getElementById('status-filter').value || '';
    
    // Build filter object for data pipeline
    const filters = {};
    if (currentFilters.aisle) filters.aisle = parseInt(currentFilters.aisle);
    if (currentFilters.level) filters.level = parseInt(currentFilters.level);
    
    // Use data pipeline for efficient filtering
    filteredData = await dataPipeline.filterData(warehouseData, filters);
    
    // Apply status filter
    if (currentFilters.status) {
        filteredData = filteredData.filter(item => {
            const fill = item.fill_level;
            if (currentFilters.status === 'empty' && fill !== 0) return false;
            if (currentFilters.status === 'low' && (fill < 1 || fill > 24)) return false;
            if (currentFilters.status === 'medium' && (fill < 25 || fill > 89)) return false;
            if (currentFilters.status === 'full' && fill < 90) return false;
            return true;
        });
    }
    
    const endTime = performance.now();
    performanceMetrics.filterTime = endTime - startTime;
    
    updateStatistics();
    renderWarehouse();
    displayPerformanceMetrics();
    
    console.log(`Filters applied: ${filteredData.length} items in ${Math.round(performanceMetrics.filterTime)}ms`);
}

// Reset filters
function resetFilters() {
    document.getElementById('aisle-filter').value = '';
    document.getElementById('level-filter').value = '';
    document.getElementById('status-filter').value = '';
    currentFilters = { aisle: '', level: '', status: '' };
    
    filteredData = [...warehouseData];
    updateStatistics();
    renderWarehouse();
}

// Render warehouse map
function renderWarehouse() {
    const container = document.getElementById('warehouse-map');
    container.innerHTML = '';
    
    // Group by aisle
    const aisles = {};
    filteredData.forEach(item => {
        if (!aisles[item.aisle]) aisles[item.aisle] = {};
        if (!aisles[item.aisle][item.rack]) aisles[item.aisle][item.rack] = [];
        aisles[item.aisle][item.rack].push(item);
    });
    
    // Render aisles
    Object.keys(aisles).sort((a, b) => a - b).forEach(aisleNum => {
        const aisleEl = document.createElement('div');
        aisleEl.className = 'aisle';
        
        const aisleLabel = document.createElement('div');
        aisleLabel.className = 'aisle-label';
        aisleLabel.textContent = `Allée ${aisleNum}`;
        aisleEl.appendChild(aisleLabel);
        
        const racksContainer = document.createElement('div');
        racksContainer.className = 'racks-container';
        
        // Render racks
        Object.keys(aisles[aisleNum]).sort((a, b) => a - b).forEach(rackNum => {
            const rackEl = document.createElement('div');
            rackEl.className = 'rack';
            
            const rackLabel = document.createElement('div');
            rackLabel.className = 'rack-label';
            rackLabel.textContent = `Rack ${rackNum}`;
            rackEl.appendChild(rackLabel);
            
            // Render levels
            const levelsContainer = document.createElement('div');
            levelsContainer.className = 'levels-container';
            
            for (let level = 1; level <= warehouseStructure.levels; level++) {
                const item = aisles[aisleNum][rackNum].find(i => i.level === level);
                const levelEl = document.createElement('div');
                levelEl.className = `level level-${level}`;
                
                if (item) {
                    const status = getStockStatus(item.fill_level);
                    levelEl.className += ` ${status}`;
                    levelEl.style.backgroundColor = getStatusColor(item.fill_level);
                    levelEl.title = `${item.sku} - ${item.product_name} - ${item.fill_level}%`;
                    
                    // Display SKU and fill level
                    const skuText = document.createElement('div');
                    skuText.className = 'sku-text';
                    skuText.textContent = item.sku;
                    levelEl.appendChild(skuText);
                    
                    const fillText = document.createElement('div');
                    fillText.className = 'fill-text';
                    fillText.textContent = `${item.fill_level}%`;
                    levelEl.appendChild(fillText);
                    
                    levelEl.addEventListener('click', () => showDetails(item));
                } else {
                    levelEl.className += ' empty';
                    levelEl.style.backgroundColor = '#6b7280';
                    levelEl.textContent = '-';
                }
                
                levelsContainer.appendChild(levelEl);
            }
            
            rackEl.appendChild(levelsContainer);
            racksContainer.appendChild(rackEl);
        });
        
        aisleEl.appendChild(racksContainer);
        container.appendChild(aisleEl);
    });
}

// Get stock status
function getStockStatus(fillLevel) {
    if (fillLevel === 0) return 'empty';
    if (fillLevel < 25) return 'low';
    if (fillLevel < 90) return 'medium';
    return 'full';
}

// Get status color
function getStatusColor(fillLevel) {
    if (fillLevel === 0) return '#6b7280';    // Gray - Empty
    if (fillLevel < 25) return '#ef4444';     // Red - Low
    if (fillLevel < 90) return '#f59e0b';     // Orange - Medium
    return '#10b981';                          // Green - Full
}

// Show details modal
function showDetails(item) {
    const modal = document.getElementById('detail-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDetails = document.getElementById('modal-details');
    
    modalTitle.textContent = `Détails - Allée ${item.aisle}, Rack ${item.rack}, Niveau ${item.level}`;
    
    modalDetails.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <label>ID:</label>
                <value>${item.id}</value>
            </div>
            <div class="detail-item">
                <label>SKU:</label>
                <value>${item.sku}</value>
            </div>
            <div class="detail-item">
                <label>Produit:</label>
                <value>${item.product_name}</value>
            </div>
            <div class="detail-item">
                <label>Niveau de remplissage:</label>
                <value>${item.fill_level}%</value>
            </div>
            <div class="detail-item">
                <label>Statut:</label>
                <value>
                    <span class="status-badge" style="background: ${getStatusColor(item.fill_level)}; padding: 4px 8px; border-radius: 4px; color: white; display: inline-block;">
                        ${getStockStatus(item.fill_level).toUpperCase()}
                    </span>
                </value>
            </div>
            <div class="detail-item full-width">
                <label>Progression:</label>
                <div class="progress-bar-full">
                    <div class="progress-fill" style="width: ${item.fill_level}%; background: ${getStatusColor(item.fill_level)};"></div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// Close modal
function closeModal() {
    document.getElementById('detail-modal').style.display = 'none';
}

// Update statistics
function updateStatistics() {
    const total = filteredData.length;
    const occupied = filteredData.filter(item => item.fill_level > 0).length;
    const empty = total - occupied;
    const average = total > 0 ? Math.round(filteredData.reduce((sum, item) => sum + item.fill_level, 0) / total) : 0;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-occupied').textContent = occupied;
    document.getElementById('stat-empty').textContent = empty;
    document.getElementById('stat-average').textContent = average + '%';
}

// Display performance metrics (for debugging/monitoring)
function displayPerformanceMetrics() {
    console.log('📊 Performance Metrics:', {
        loadTime: `${Math.round(performanceMetrics.loadTime)}ms`,
        renderTime: `${Math.round(performanceMetrics.renderTime)}ms`,
        filterTime: `${Math.round(performanceMetrics.filterTime)}ms`,
        itemCount: performanceMetrics.itemCount,
        memoryUsage: performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : 'N/A'
    });
}

// Export current filtered data to CSV
function exportData() {
    const filename = `warehouse-data-${new Date().toISOString().split('T')[0]}.csv`;
    dataPipeline.exportToCSV(filteredData, filename);
    console.log(`✅ Exported ${filteredData.length} items to ${filename}`);
}

// Get aggregated statistics using data pipeline
async function getAggregatedStats() {
    const stats = {
        byAisle: dataPipeline.aggregate(warehouseData, 'aisle', { fill_level: 'avg', id: 'count' }),
        byLevel: dataPipeline.aggregate(warehouseData, 'level', { fill_level: 'avg', id: 'count' }),
        fillLevelStats: dataPipeline.calculateStats(warehouseData, 'fill_level')
    };
    
    console.log('📈 Aggregated Statistics:', stats);
    return stats;
}

// Clear all data
async function clearAllData() {
    if (confirm('Êtes-vous sûr de vouloir supprimer toutes les données ?')) {
        await dataPipeline.clearDatabase('stockData');
        warehouseData = [];
        filteredData = [];
        updateStatistics();
        renderWarehouse();
        console.log('🗑️ All data cleared');
    }
}
