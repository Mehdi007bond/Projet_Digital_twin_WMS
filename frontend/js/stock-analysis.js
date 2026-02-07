// Stock Analysis Page - Digital Twin WMS
// Manages stock data visualization, filtering, and analysis
// Enhanced with data pipeline for large-scale data handling

let stockData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 20;
let sortColumn = 'id';
let sortDirection = 'asc';
let virtualScroller = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Stock Analysis with Data Pipeline');
    
    // Initialize data pipeline
    await dataPipeline.initDB();
    
    await loadStockData();
    initializeCharts();
    setupEventListeners();
    updateDisplay();
});

// Load stock data from IndexedDB or localStorage
async function loadStockData() {
    try {
        // Try Supabase first if configured
        if (isSupabaseConfigured()) {
            console.log('📡 Loading from Supabase...');
            console.log('Supabase URL:', window.SUPABASE_URL);
            console.log('Supabase key length:', window.SUPABASE_ANON_KEY?.length);
            
            const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            
            console.log('Querying locations...');
            const { data: locations, error: locError } = await supabase.from('locations').select('*');
            console.log('Locations result:', { count: locations?.length, error: locError });
            
            console.log('Querying stock_items...');
            const { data: stock_items, error: stockError } = await supabase.from('stock_items').select('*');
            console.log('Stock items result:', { count: stock_items?.length, error: stockError });
            
            if (!locError && locations && locations.length > 0) {
                stockData = locations.map(loc => {
                    const stock = stock_items?.find(s => s.location_id === loc.id);
                    const fillLevel = stock?.fill_level || 0;
                    const occupied = !!stock && fillLevel > 0;
                    return {
                        id: loc.id,
                        aisle: loc.row_no,
                        rack: loc.bay_no,
                        level: loc.level_no,
                        position: `R${loc.row_no}B${loc.bay_no}L${loc.level_no}`,
                        category: stock?.category || 'C',
                        sku: stock?.product_id || '-',
                        fillLevel: fillLevel,
                        occupied: occupied,
                        status: !stock || fillLevel === 0 ? 'Vide' : fillLevel < 25 ? 'Faible' : fillLevel < 75 ? 'Moyen' : fillLevel < 90 ? 'Bon' : 'Plein'
                    };
                });
                
                filteredData = [...stockData];
                console.log(`✅ Loaded ${stockData.length} items from Supabase`);
                console.log('Sample data:', stockData.slice(0, 3));
                return;
            } else {
                console.warn('⚠️ No locations found or error occurred:', locError);
            }
        } else {
            console.warn('⚠️ Supabase not configured properly');
        }
        
        // Try IndexedDB first (data pipeline)
        const dbData = await dataPipeline.loadData('stockData');
        
        if (dbData && dbData.length > 0) {
            stockData = dbData;
            console.log(`✅ Loaded ${stockData.length} items from IndexedDB`);
        } else {
            // Try localStorage (fallback)
            const savedData = localStorage.getItem('warehouseStockData');
            if (savedData) {
                stockData = JSON.parse(savedData);
                // Save to IndexedDB for future use
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

function isSupabaseConfigured() {
    return (
        typeof window !== 'undefined' &&
        typeof window.SUPABASE_URL === 'string' &&
        typeof window.SUPABASE_ANON_KEY === 'string' &&
        window.SUPABASE_URL.startsWith('https://') &&
        window.SUPABASE_ANON_KEY.length > 20 &&
        !window.SUPABASE_URL.includes('YOUR_PROJECT') &&
        !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')
    );
}

// Generate sample stock data for demonstration
function generateSampleStockData() {
    const data = [];
    const categories = ['A', 'B', 'C'];
    const skuPrefixes = ['SKU', 'ITEM', 'PROD', 'REF'];
    
    for (let aisle = 1; aisle <= 10; aisle++) {
        for (let rack = 1; rack <= 8; rack++) {
            for (let level = 1; level <= 4; level++) {
                const id = `A${aisle.toString().padStart(2, '0')}-R${rack.toString().padStart(2, '0')}-L${level}`;
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
                    sku: occupied ? `${skuPrefixes[Math.floor(Math.random() * skuPrefixes.length)]}-${Math.floor(Math.random() * 9000) + 1000}` : '-',
                    fillLevel: fillLevel,
                    occupied: occupied,
                    status: fillLevel === 0 ? 'Vide' : fillLevel < 25 ? 'Faible' : fillLevel < 75 ? 'Moyen' : fillLevel < 90 ? 'Bon' : 'Plein'
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
                <td><span class="status-badge">${item.status}</span></td>
            </td>
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
