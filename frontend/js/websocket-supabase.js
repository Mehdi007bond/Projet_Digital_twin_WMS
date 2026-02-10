/**
 * Digital Twin WMS - Supabase Realtime Integration
 * Real-time synchronization with Supabase (NO Docker WebSocket fallback)
 */

let supabaseClient = null;
let supabaseChannels = {};
let connectionStatus = 'disconnected';
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 3000;

// ═══════════════════════════════════════════════════════════════════════════
// Main Initialization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize Supabase Realtime connection
 * @param {Array<AGV>} agvs - The AGV fleet
 * @param {Array<StockItem>} stockItems - The stock items
 */
async function initWebSocket(agvs, stockItems) {
    console.log('🔌 Initializing Supabase Realtime...');

    // Attendre que Supabase soit prêt
    supabaseClient = await waitForSupabase(5000);
    
    if (!supabaseClient) {
        console.error('❌ Supabase not available');
        updateConnectionStatus('demo', 'Demo Mode (No Supabase)');
        loadDemoData(agvs, stockItems);
        return;
    }

    console.log('✅ Supabase connected');
    updateConnectionStatus('connecting', 'Supabase Realtime');

    try {
        // Charger les données initiales
        await refreshAllData(agvs, stockItems);
        
        // S'abonner aux changements en temps réel
        subscribeToRealtimeUpdates(agvs, stockItems);
        
        // Mettre à jour le statut
        updateConnectionStatus('connected', 'Supabase Realtime');
        reconnectAttempts = 0;
        
        console.log('✅ Realtime subscriptions active');
    } catch (error) {
        console.error('❌ Realtime initialization error:', error);
        console.log('📦 Falling back to demo data...');
        loadDemoData(agvs, stockItems);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Loading
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Charger les données initiales depuis Supabase
 */
async function refreshAllData(agvs, stockItems) {
    try {
        // Charger les AGVs
        const { data: agvData, error: agvError } = await supabaseClient
            .from('agvs')
            .select('*');
        
        if (agvError) throw agvError;
        
        if (agvData && agvs) {
            agvData.forEach(row => applyAgvRow(row, agvs));
        }
        
        // Charger les items de stock
        const { data: stockData, error: stockError } = await supabaseClient
            .from('stock_items')
            .select('*');
        
        if (stockError) throw stockError;
        
        if (stockData && stockItems) {
            stockData.forEach(row => applyStockItemRow(row, stockItems));
        }
        
        // Charger les KPI snapshots
        const { data: kpiStockData } = await supabaseClient
            .from('v_kpi_stock')
            .select('*')
            .single();
        
        const { data: kpiAgvData } = await supabaseClient
            .from('v_kpi_agv')
            .select('*')
            .single();
        
        if (kpiStockData) updateKPIs('stock', kpiStockData);
        if (kpiAgvData) updateKPIs('agv', kpiAgvData);
        
        console.log('✅ Initial data loaded from Supabase');
    } catch (error) {
        console.error('❌ Error loading initial data from Supabase:', error);
        console.log('📦 Falling back to demo data...');
        loadDemoData(agvs, stockItems);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Realtime Subscriptions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to Supabase Realtime changes
 */
function subscribeToRealtimeUpdates(agvs, stockItems) {
    if (!supabaseClient) return;

    // ✅ Subscribe to AGVs table
    supabaseChannels.agvs = supabaseClient
        .channel('public:agvs')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'agvs'
            },
            (payload) => {
                console.log('🤖 AGV Update:', payload);
                if (payload.new) {
                    applyAgvRow(payload.new, agvs);
                }
            }
        )
        .subscribe();

    // ✅ Subscribe to Stock Items table
    supabaseChannels.stockItems = supabaseClient
        .channel('public:stock_items')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'stock_items'
            },
            (payload) => {
                console.log('📦 Stock Update:', payload);
                if (payload.new) {
                    applyStockItemRow(payload.new, stockItems);
                }
            }
        )
        .subscribe();

    // ✅ Subscribe to Tasks table
    supabaseChannels.tasks = supabaseClient
        .channel('public:tasks')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'tasks'
            },
            (payload) => {
                console.log('📋 Task Update:', payload);
                if (payload.new) {
                    handleTaskUpdate(payload.new);
                }
            }
        )
        .subscribe();

    // ✅ Subscribe to KPI Stock View (for real-time stats)
    supabaseChannels.kpiStock = supabaseClient
        .channel('public:v_kpi_stock')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'v_kpi_stock'
            },
            (payload) => {
                console.log('📊 KPI Stock Update:', payload);
                if (payload.new) {
                    updateKPIs('stock', payload.new);
                }
            }
        )
        .subscribe();

    // ✅ Subscribe to KPI AGV View
    supabaseChannels.kpiAgv = supabaseClient
        .channel('public:v_kpi_agv')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'v_kpi_agv'
            },
            (payload) => {
                console.log('📊 KPI AGV Update:', payload);
                if (payload.new) {
                    updateKPIs('agv', payload.new);
                }
            }
        )
        .subscribe();

    console.log('✅ All realtime subscriptions configured');
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Application
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply AGV row to AGV array
 */
function applyAgvRow(row, agvs) {
    if (!agvs) return;
    
    let agv = agvs.find(a => a.id === row.id);
    
    if (!agv) {
        // AGV not found - skip (we only update existing AGVs created by createAGVs())
        console.warn(`⚠️ AGV ${row.id} not found in scene - ignoring update`);
        return;
    }

    // Mettre à jour les positions et propriétés de l'AGV existant
    if (row.x_m !== undefined && agv.position) {
        agv.position.x = row.x_m;
    }
    if (row.y_m !== undefined && agv.position) {
        agv.position.y = row.y_m;
    }
    if (row.z_m !== undefined && agv.position) {
        agv.position.z = row.z_m;
    }
    if (row.rotation_rad !== undefined) agv.rotation = row.rotation_rad;
    if (row.status !== undefined && agv.setStatus) {
        agv.setStatus(row.status);
    }
    if (row.battery !== undefined) agv.battery = row.battery;
    if (row.speed_mps !== undefined) agv.speed = row.speed_mps;
    if (row.updated_at !== undefined) agv.updatedAt = new Date(row.updated_at);

    // Déclencher la mise à jour visuelle
    if (typeof updateAGVVisuals === 'function') {
        updateAGVVisuals(agv);
    }
}

/**
 * Apply Stock Item row to Stock array
 */
function applyStockItemRow(row, stockItems) {
    if (!stockItems) return;
    
    // Essayer de trouver par location_id (plus fiable que l'ID)
    let item = stockItems.find(s => s.location && s.location.id === row.location_id);
    
    if (!item) {
        // Stock item not found - skip (we only update existing items created by createStock())
        console.warn(`⚠️ Stock item at location ${row.location_id} not found - ignoring update`);
        return;
    }

    // Mettre à jour les propriétés du stock item existant
    if (row.fill_level !== undefined && item.setFillLevel) {
        item.setFillLevel(row.fill_level);
    }
    if (row.category !== undefined) {
        item.category = row.category;
    }
    if (row.updated_at !== undefined) {
        item.updatedAt = new Date(row.updated_at);
    }
}

/**
 * Handle task updates
 */
function handleTaskUpdate(task) {
    if (typeof updateTaskUI === 'function') {
        updateTaskUI(task);
    }
}

/**
 * Update KPI display
 */
function updateKPIs(type, data) {
    if (type === 'stock') {
        if (typeof updateKPIDisplay === 'function') {
            updateKPIDisplay({
                fillRate: data.fill_rate_percent,
                accuracy: data.accuracy_percent,
                rotation: data.inventory_rotation
            });
        }
    } else if (type === 'agv') {
        if (typeof updateAGVKPIs === 'function') {
            updateAGVKPIs({
                utilization: data.utilization_percent,
                missionsPerHour: data.missions_per_hour
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Status Updates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update connection status display
 */
function updateConnectionStatus(status, message) {
    connectionStatus = status;
    
    const statusDot = document.getElementById('connection-dot');
    const statusText = document.getElementById('connection-text');
    
    if (statusDot) {
        statusDot.className = 'status-dot';
        statusDot.classList.add(status);
    }
    
    if (statusText) {
        statusText.textContent = message || status;
    }
    
    // Ajouter une notification
    const color = status === 'connected' ? '#22c55e' : status === 'error' ? '#ef4444' : '#f59f00';
    console.log(`📡 ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Close all subscriptions
 */
function closeWebSocket() {
    if (!supabaseClient) return;
    
    Object.values(supabaseChannels).forEach(channel => {
        supabaseClient.removeChannel(channel);
    });
    
    supabaseChannels = {};
    updateConnectionStatus('disconnected', 'Disconnected');
    console.log('✅ All realtime subscriptions closed');
}

// Cleanup on page unload
window.addEventListener('beforeunload', closeWebSocket);

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Wait for Supabase
// ═══════════════════════════════════════════════════════════════════════════
// Demo Data Fallback
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load demo data when Supabase is not available
 */
function loadDemoData(agvs, stockItems) {
    console.log('📦 Loading demo data (Supabase not available)...');
    
    if (typeof window !== 'undefined' && window.DEMO_DATA && window.DEMO_STOCK_ITEMS) {
        // Update AGVs with demo data
        if (agvs && window.DEMO_DATA.agvs) {
            window.DEMO_DATA.agvs.forEach(demoAgv => {
                applyAgvRow(demoAgv, agvs);
                console.log(`✅ Loaded AGV: ${demoAgv.name}`);
            });
        }
        
        // Update Stock Items with demo data
        if (stockItems && window.DEMO_STOCK_ITEMS) {
            window.DEMO_STOCK_ITEMS.forEach(demoItem => {
                applyStockItemRow(demoItem, stockItems);
            });
            console.log(`✅ Loaded ${window.DEMO_STOCK_ITEMS.length} stock items`);
        }
        
        // Update KPIs with demo data
        if (window.DEMO_DATA.kpi_stock) {
            updateKPIs('stock', window.DEMO_DATA.kpi_stock);
        }
        if (window.DEMO_DATA.kpi_agv) {
            updateKPIs('agv', window.DEMO_DATA.kpi_agv);
        }
        
        updateConnectionStatus('connected', '✨ Demo Mode - Local Data');
        console.log('✅ Demo data loaded successfully');
    } else {
        console.warn('⚠️ Demo data not available');
        updateConnectionStatus('error', 'No data available');
    }
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attendre que Supabase soit initialisé
 */
async function waitForSupabase(maxWait = 5000) {
    const start = Date.now();
    
    while (!window.supabaseClient && Date.now() - start < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return window.supabaseClient;
}
