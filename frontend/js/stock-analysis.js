// Stock Analysis Page - Digital Twin WMS
// Manages stock data visualization, filtering, and analysis

let stockData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 20;
let sortColumn = 'id';
let sortDirection = 'asc';
let virtualScroller = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Stock Analysis with Supabase');
    
    // Initialize data pipeline
    await dataPipeline.initDB();
    
    await loadStockData();
    
    // CRITICAL: Wait for Supabase before enabling realtime
    let attempt = 0;
    while (!window.supabaseClient && attempt < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempt++;
    }
    
    if (window.supabaseClient) {
        console.log('[StockAnalysis] ✅ Supabase ready, enabling real-time updates');
        connectRealtimeUpdates();
    } else {
        console.warn('[StockAnalysis] ⚠️ Supabase not available, real-time disabled');
    }
    
    initializeCharts();
    setupEventListeners();
    updateDisplay();
});

// Load stock data from local Docker API
async function loadStockData() {
    try {
        console.log('📡 Loading from Docker API...');
        
        // Charger from le backend fastapi local
        const locations = await dataPipeline.loadLocations();
        const stock_items = await dataPipeline.loadStockItems();
        
        if (locations && locations.length > 0 && stock_items) {
            stockData = locations.map(loc => {
                const stock = stock_items.find(s => s.location_id === loc.id);
                const fillLevel = stock?.fill_level || 0;
                const occupied = !!stock && fillLevel > 0;
                return {
                    id: loc.id,
                    aisle: loc.row_no || 0,
                    rack: loc.bay_no || 0,
                    level: loc.level_no || 0,
                    position: `R${loc.row_no}B${loc.bay_no}L${loc.level_no}`,
                    category: stock?.category || 'C',
                    sku: stock?.sku || '-',
                    product_name: stock?.product_name || '-',
                    quality_tier: stock?.quality_tier || '-',
                    fillLevel: fillLevel,
                    occupied: occupied,
                    status: !stock || fillLevel === 0 ? 'Vide' : fillLevel < 25 ? 'Faible' : fillLevel < 75 ? 'Moyen' : fillLevel < 90 ? 'Bon' : 'Plein'
                };
            });
            
            filteredData = [...stockData];
            console.log(`✅ Loaded ${stockData.length} items from Docker API`);
            console.log('Sample data:', stockData.slice(0, 3));
            return;
        } else {
            console.warn('⚠️ No locations found from API');
        }
        
        // Fallback: Try IndexedDB
        const dbData = await dataPipeline.loadData('stockData');
        
        if (dbData && dbData.length > 0) {
            stockData = dbData;
            console.log(`✅ Loaded ${stockData.length} items from IndexedDB cache`);
        } else {
            // Try localStorage (fallback)
            const savedData = localStorage.getItem('warehouseStockData');
            if (savedData) {
                stockData = JSON.parse(savedData);
                await dataPipeline.saveData(stockData, 'stockData');
            } else {
                // Generate sample data if none exists
                stockData = generateSampleStockData();
                await dataPipeline.saveData(stockData, 'stockData');
            }
        }
        
        filteredData = [...stockData];
        console.log('Stock data loaded:', stockData.length, 'items');
    } catch (error) {
        console.error('Error loading stock data:', error);
        stockData = generateSampleStockData();
        filteredData = [...stockData];
        await dataPipeline.saveData(stockData, 'stockData');
    }
}

// Connect to Supabase Realtime updates for live stock analysis
function connectRealtimeUpdates() {
    try {
        if (window.DTRealtime && typeof window.DTRealtime.start === 'function') {
            console.log('[StockAnalysis] ✅ Using shared realtime sync');
            window.DTRealtime.start();
            window.addEventListener('dt:stock_items', () => {
                loadStockData().then(() => {
                    updateDisplay();
                    console.log('[StockAnalysis] ✅ Table updated');
                });
            });
            return;
        }

        if (!window.supabaseClient) {
            console.warn('[StockAnalysis] Supabase not available for realtime');
            return;
        }

        console.log('[StockAnalysis] ✅ Subscribing to Supabase Realtime updates');

        window.supabaseClient
            .channel('stockanalysis:stock_items')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'stock_items' },
                (payload) => {
                    console.log('[StockAnalysis] 📨 Real-time event received:', payload.eventType);
                    loadStockData().then(() => {
                        updateDisplay();
                        console.log('[StockAnalysis] ✅ Table updated');
                    });
                }
            )
            .subscribe((status) => {
                console.log('[StockAnalysis] Realtime subscription status:', status);
            });
            
    } catch (err) {
        console.error('[StockAnalysis] ❌ Realtime subscription failed:', err);
    }
}

// Update a single stock item from Supabase change
function updateStockItem(payload) {
    const { record } = payload;
    if (!record || !record.location_id) return;
    
    // Find and update the item in stockData
    const item = stockData.find(s => s.id === record.location_id);
    if (item) {
        item.fillLevel = record.fill_level || 0;
        item.occupied = item.fillLevel > 0;
        item.status = !record || item.fillLevel === 0 ? 'Vide' : 
                      item.fillLevel < 25 ? 'Faible' : 
                      item.fillLevel < 75 ? 'Moyen' : 
                      item.fillLevel < 90 ? 'Bon' : 'Plein';
        item.category = record.category || item.category;
        
        // Update filtered data if item matches current filters
        const filteredItem = filteredData.find(s => s.id === record.location_id);
        if (filteredItem) {
            Object.assign(filteredItem, item);
        }
        
        // Refresh table and charts
        updateDisplay();
    }
}

// Generate sample stock data for demonstration
// ⚠️ THIS SHOULD NOT BE USED - Stock should come from Supabase database with real SKUs
function generateSampleStockData() {
    const data = [];
    const categories = ['A', 'B', 'C'];
    
    // Match 3D structure: 3 rows × 5 bays × 4 levels = 60 locations
    for (let aisle = 1; aisle <= 3; aisle++) {
        for (let rack = 1; rack <= 5; rack++) {
            for (let level = 1; level <= 4; level++) {
                const id = `R${aisle}B${rack}L${level}`;
                const category = categories[Math.floor(Math.random() * categories.length)];
                const fillLevel = Math.floor(Math.random() * 101);
                const occupied = fillLevel > 0;
                
                data.push({
                    id: id,
                    aisle: aisle,
                    rack: rack,
                    level: level,
                    position: `Allée ${aisle} - Rack ${rack} - Niveau ${level}`,
                    category: category,
                    sku: '-', // SKU comes from database now
                    product_name: '-',
                    quality_tier: '-',
                    fillLevel: fillLevel,
                    occupied: occupied,
                    status: fillLevel === 0 ? 'Vide' : fillLevel < 25 ? 'Faible' : fillLevel < 90 ? 'Moyen' : 'Plein'
                });
            }
        }
    }
    
    return data;
}

// Update all statistics displays
function updateDisplay() {
    updateStatistics();
    updateTable();
    updateCharts();
}

// Update statistics cards
function updateStatistics() {
    const total = filteredData.length;
    const occupied = filteredData.filter(item => item.occupied).length;
    const empty = total - occupied;
    const fillRate = total > 0 ? ((occupied / total) * 100).toFixed(1) : 0;
    
    document.getElementById('total-items').textContent = total;
    document.getElementById('occupied-items').textContent = occupied;
    document.getElementById('empty-items').textContent = empty;
    document.getElementById('fill-rate').textContent = fillRate + '%';
}

// Update stock table
function updateTable() {
    const tbody = document.getElementById('stock-tbody');
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredData.slice(start, end);
    console.log(pageData[0]);
    
    tbody.innerHTML = pageData.map(item => `
        <tr class="category-${item.category}">
            <td>${item.id}</td>
            <td>${item.position}</td>
            <td><span class="badge badge-${item.category}">${item.category}</span></td>
            <td>${item.sku}</td>
            <td>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.fillLevel}%"></div>
                    <span class="progress-text">${item.fillLevel}%</span>
                </div>
            </td>
            <td><span class="status-badge">${item.status}</span></td>
        </tr>
        `).join('');
    
    document.getElementById('showing-count').textContent = pageData.length;
    document.getElementById('total-count').textContent = filteredData.length;
    
    updatePagination();
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">«</button>`;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="page-dots">...</span>`;
        }
    }
    
    // Next button
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">»</button>`;
    
    pagination.innerHTML = html;
}

// Change page
function changePage(page) {
    currentPage = page;
    updateTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initialize charts
let abcChart = null;
let fillChart = null;

function initializeCharts() {
    // ABC Category Chart
    const abcCtx = document.getElementById('abc-chart').getContext('2d');
    abcChart = new Chart(abcCtx, {
        type: 'doughnut',
        data: {
            labels: ['Type A', 'Type B', 'Type C'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                borderWidth: 2,
                borderColor: '#1a1a1f'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e5e7eb', font: { size: 14 } }
                }
            }
        }
    });
    
    // Fill Level Distribution Chart
    const fillCtx = document.getElementById('fill-chart').getContext('2d');
    fillChart = new Chart(fillCtx, {
        type: 'bar',
        data: {
            labels: ['Vide (0%)', 'Faible (<25%)', 'Moyen (25-75%)', 'Bon (75-90%)', 'Plein (>90%)'],
            datasets: [{
                label: 'Nombre d\'items',
                data: [0, 0, 0, 0, 0],
                backgroundColor: ['#6b7280', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'],
                borderWidth: 2,
                borderColor: '#1a1a1f'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#e5e7eb' },
                    grid: { color: '#374151' }
                },
                x: {
                    ticks: { color: '#e5e7eb' },
                    grid: { color: '#374151' }
                }
            }
        }
    });
}

// Update charts with current data
function updateCharts() {
    // ABC Chart
    const categoryA = filteredData.filter(item => item.category === 'A').length;
    const categoryB = filteredData.filter(item => item.category === 'B').length;
    const categoryC = filteredData.filter(item => item.category === 'C').length;
    
    abcChart.data.datasets[0].data = [categoryA, categoryB, categoryC];
    abcChart.update();
    
    // Fill Level Chart
    const empty = filteredData.filter(item => item.fillLevel === 0).length;
    const low = filteredData.filter(item => item.fillLevel > 0 && item.fillLevel < 25).length;
    const medium = filteredData.filter(item => item.fillLevel >= 25 && item.fillLevel < 75).length;
    const good = filteredData.filter(item => item.fillLevel >= 75 && item.fillLevel < 90).length;
    const full = filteredData.filter(item => item.fillLevel >= 90).length;
    
    fillChart.data.datasets[0].data = [empty, low, medium, good, full];
    fillChart.update();
}

// Setup event listeners
function setupEventListeners() {
    // ABC Category Filters
    document.querySelectorAll('.filter-btn-abc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn-abc').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            const filter = e.currentTarget.dataset.filter;
            if (filter === 'all') {
                filteredData = [...stockData];
            } else {
                filteredData = stockData.filter(item => item.category === filter);
            }
            
            currentPage = 1;
            updateDisplay();
        });
    });
    
    // Status Filters
    document.querySelectorAll('.filter-btn-status').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.currentTarget.dataset.filter;
            
            if (filter === 'low') {
                filteredData = stockData.filter(item => item.fillLevel > 0 && item.fillLevel <= 25);
            } else if (filter === 'empty') {
                filteredData = stockData.filter(item => item.fillLevel === 0);
            } else if (filter === 'full') {
                filteredData = stockData.filter(item => item.fillLevel >= 90);
            }
            
            // Reset ABC filter
            document.querySelectorAll('.filter-btn-abc').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn-abc[data-filter="all"]').classList.add('active');
            
            currentPage = 1;
            updateDisplay();
        });
    });
    
    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filteredData = stockData.filter(item => 
            item.id.toLowerCase().includes(query) ||
            item.sku.toLowerCase().includes(query) ||
            item.position.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        );
        currentPage = 1;
        updateDisplay();
    });
    
    // Table sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            sortData();
            updateTable();
        });
    });
    
    // Export CSV
    document.getElementById('export-btn').addEventListener('click', exportToCSV);
}

// Sort data
function sortData() {
    filteredData.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}

// Export to CSV
function exportToCSV() {
    const headers = ['ID', 'Position', 'Catégorie ABC', 'SKU', 'Niveau (%)', 'Statut'];
    const rows = filteredData.map(item => [
        item.id,
        item.position,
        item.category,
        item.sku,
        item.fillLevel,
        item.status
    ]);
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-analysis-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}
