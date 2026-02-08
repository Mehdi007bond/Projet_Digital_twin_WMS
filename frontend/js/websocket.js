/**
 * Digital Twin WMS - WebSocket Connection & Demo Mode
 * Handles real-time communication with backend (with demo simulation)
 */

// WebSocket connection state
let ws = null;
let connectionStatus = 'disconnected';
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 3000;
let demoMode = false; // Use real backend WebSocket by default

// Supabase realtime
let supabaseClient = null;
let supabaseChannel = null;
let kpiRefreshTimeout = null;

// Demo simulation state
let demoInterval = null;
let simulationTime = 0;
let demoStatusInterval = null;

// Flag: when true, the main demo (pick-and-ship) is running,
// so the websocket circular-demo should NOT move AGVs.
// Synced with window.demoRunning used by taskManager.js
function isMainDemoRunning() { return !!window.demoRunning; }
function setMainDemoRunning(v) { window.demoRunning = !!v; }

/**
 * Initialize WebSocket connection
 * @param {Array<AGV>} agvs - The AGV fleet
 * @param {Array<StockItem>} stockItems - The stock items
 */
function initWebSocket(agvs, stockItems) {
    console.log('🔌 Initializing WebSocket connection...');

    // Prefer Supabase Realtime if configured
    if (isSupabaseConfigured()) {
        initSupabaseRealtime(agvs, stockItems);
        return;
    }

    // Connect to Docker backend WebSocket
    attemptConnection(agvs, stockItems);
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

async function initSupabaseRealtime(agvs, stockItems) {
    try {
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error('Supabase client not loaded');
        }

        supabaseClient = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );

        updateConnectionStatus('connected', 'Supabase Realtime');
        demoMode = false;
        stopDemoMode();

        await refreshSupabaseSnapshots(agvs, stockItems);
        subscribeSupabaseRealtime(agvs, stockItems);
    } catch (error) {
        console.error('Supabase init error:', error);
        updateConnectionStatus('demo', 'Demo Mode (Supabase Error)');
        demoMode = true;
        startDemoMode(agvs, stockItems);
    }
}

async function refreshSupabaseSnapshots(agvs, stockItems) {
    if (!supabaseClient) return;

    const [agvResult, stockResult, kpiStockResult, kpiAgvResult, missionsResult] = await Promise.all([
        supabaseClient.from('agvs').select('*'),
        supabaseClient.from('stock_items').select('*'),
        supabaseClient.from('v_kpi_stock').select('*').single(),
        supabaseClient.from('v_kpi_agv').select('*').single(),
        supabaseClient.from('missions').select('id,status')
    ]);

    if (!agvResult.error && agvResult.data) {
        agvResult.data.forEach(row => applyAgvRow(row, agvs));
    }

    if (!stockResult.error && stockResult.data) {
        applyStockSnapshot(stockResult.data, stockItems);
    }

    if (!kpiStockResult.error && !kpiAgvResult.error) {
        applyKpiSnapshot(kpiStockResult.data, kpiAgvResult.data, missionsResult?.data);
    }
}

function subscribeSupabaseRealtime(agvs, stockItems) {
    if (!supabaseClient) return;

    if (supabaseChannel) {
        supabaseClient.removeChannel(supabaseChannel);
    }

    supabaseChannel = supabaseClient
        .channel('wms-realtime')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'agvs' },
            payload => {
                const row = payload.new || payload.old;
                if (row) {
                    applyAgvRow(row, agvs);
                    scheduleKpiRefresh(agvs, stockItems);
                }
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'stock_items' },
            payload => {
                applyStockChange(payload, stockItems);
                scheduleKpiRefresh(agvs, stockItems);
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'missions' },
            payload => {
                applyMissionChange(payload);
                scheduleKpiRefresh(agvs, stockItems);
            }
        )
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                updateConnectionStatus('connected', 'Supabase Realtime');
            }
        });
}

function applyAgvRow(row, agvs) {
    const data = {
        agv_id: row.id,
        x: row.x_m,
        y: row.y_m,
        z: row.z_m,
        rotation: row.rotation_rad || 0,
        status: row.status,
        battery: row.battery,
        speed: row.speed_mps || 0
    };
    handleAGVPositionUpdate(data, agvs);
}

function applyStockSnapshot(rows, stockItems) {
    const byLocation = new Map();
    stockItems.forEach(item => {
        if (item.location && item.location.id) {
            byLocation.set(item.location.id, item);
        }
    });

    const dbLocations = new Set();
    rows.forEach(row => {
        dbLocations.add(row.location_id);
        const item = byLocation.get(row.location_id);
        if (item) {
            item.setFillLevel(row.fill_level);
            item.category = row.category || item.category;
            item.location.occupied = row.fill_level > 0;
        }
    });

    stockItems.forEach(item => {
        if (!dbLocations.has(item.location.id)) {
            item.setFillLevel(0);
            item.location.occupied = false;
        }
    });
}

function applyStockChange(payload, stockItems) {
    const row = payload.new || payload.old;
    if (!row) return;

    const item = stockItems.find(s => s.location && s.location.id === row.location_id);
    if (!item) return;

    if (payload.eventType === 'DELETE') {
        item.setFillLevel(0);
        item.location.occupied = false;
        return;
    }

    item.setFillLevel(row.fill_level);
    item.category = row.category || item.category;
    item.location.occupied = row.fill_level > 0;
}

function applyMissionChange(payload) {
    const missionsElement = document.getElementById('missions-active');
    if (!missionsElement) return;

    if (payload.eventType === 'INSERT') {
        const current = parseInt(missionsElement.textContent || '0', 10);
        missionsElement.textContent = String(current + 1);
    } else if (payload.eventType === 'DELETE') {
        const current = parseInt(missionsElement.textContent || '0', 10);
        missionsElement.textContent = String(Math.max(0, current - 1));
    }
}

function scheduleKpiRefresh(agvs, stockItems) {
    if (kpiRefreshTimeout) {
        clearTimeout(kpiRefreshTimeout);
    }

    kpiRefreshTimeout = setTimeout(async () => {
        if (!supabaseClient) return;
        const [kpiStockResult, kpiAgvResult, missionsResult] = await Promise.all([
            supabaseClient.from('v_kpi_stock').select('*').single(),
            supabaseClient.from('v_kpi_agv').select('*').single(),
            supabaseClient.from('missions').select('id,status')
        ]);
        if (!kpiStockResult.error && !kpiAgvResult.error) {
            applyKpiSnapshot(kpiStockResult.data, kpiAgvResult.data, missionsResult?.data);
        }
    }, 400);
}

function applyKpiSnapshot(kpiStock, kpiAgv, missions) {
    const fillRate = kpiStock?.fill_rate_percent ?? null;
    const totalLocations = kpiStock?.total_locations ?? null;
    const filledLocations = kpiStock?.filled_locations ?? null;
    const agvCount = kpiAgv?.total_agvs ?? null;

    if (fillRate !== null) {
        const stockLevel = document.getElementById('stock-level');
        if (stockLevel) stockLevel.textContent = `${fillRate}%`;

        const stockBarFill = document.getElementById('stock-bar-fill');
        if (stockBarFill) stockBarFill.style.width = `${fillRate}%`;
    }

    if (filledLocations !== null) {
        const stockOccupied = document.getElementById('stock-occupied');
        if (stockOccupied) stockOccupied.textContent = filledLocations;
    }

    if (totalLocations !== null) {
        const stockTotal = document.getElementById('stock-total');
        if (stockTotal) stockTotal.textContent = totalLocations;
    }

    if (agvCount !== null) {
        const agvCountEl = document.getElementById('agv-count');
        if (agvCountEl) agvCountEl.textContent = agvCount;
    }

    if (Array.isArray(missions)) {
        const activeMissions = missions.filter(m => !['completed', 'cancelled'].includes(m.status)).length;
        const missionsElement = document.getElementById('missions-active');
        if (missionsElement) missionsElement.textContent = activeMissions;
    }
}

/**
 * Attempt to connect to WebSocket server
 */
function attemptConnection(agvs, stockItems) {
    try {
        // Backend WebSocket URL (will be available in later sprints)
        const wsUrl = 'ws://localhost:8000/ws';
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ WebSocket connected');
            updateConnectionStatus('connected', 'Connected');
            reconnectAttempts = 0;
            demoMode = false;
            stopDemoMode();
        };
        
        ws.onmessage = (event) => {
            handleMessage(event.data, agvs, stockItems);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus('error', 'Connection Error');
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus('disconnected', 'Disconnected');
            
            // Auto-reconnect logic
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
                setTimeout(() => attemptConnection(agvs, stockItems), reconnectDelay);
            } else {
                console.log('Max reconnection attempts reached. Starting demo mode.');
                demoMode = true;
                startDemoMode(agvs, stockItems);
            }
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        updateConnectionStatus('demo', 'Demo Mode');
        demoMode = true;
        startDemoMode(agvs, stockItems);
    }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status, text) {
    connectionStatus = status;
    
    const statusDot = document.getElementById('connection-dot');
    const statusText = document.getElementById('connection-text');
    
    if (statusDot) {
        statusDot.className = 'status-dot';
        
        switch (status) {
            case 'connected':
                statusDot.classList.add('connected');
                break;
            case 'disconnected':
                statusDot.classList.add('disconnected');
                break;
            case 'demo':
                statusDot.classList.add('demo');
                break;
            case 'error':
                statusDot.classList.add('error');
                break;
        }
    }
    
    if (statusText) {
        statusText.textContent = text;
    }
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(data, agvs, stockItems) {
    try {
        const message = JSON.parse(data);
        
        switch (message.type) {
            case 'agv_position':
                handleAGVPositionUpdate(message.data, agvs);
                break;
                
            case 'stock_update':
                handleStockUpdate(message.data, stockItems);
                break;
                
            case 'mission_update':
                handleMissionUpdate(message.data);
                break;
                
            case 'kpi_update':
                handleKPIUpdate(message.data);
                break;
                
            default:
                console.warn('Unknown message type:', message.type);
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

/**
 * Handle AGV position updates
 */
function handleAGVPositionUpdate(data, agvs) {
    const agv = agvs.find(a => a.id === data.agv_id);
    if (agv) {
        agv.position.set(data.x, data.y, data.z);
        agv.rotation = data.rotation || 0;
        agv.status = data.status || agv.status;
        agv.battery = data.battery || agv.battery;
        agv.speed = data.speed || 0;
    }
}

/**
 * Handle stock level updates
 */
function handleStockUpdate(data, stockItems) {
    const item = stockItems.find(s => s.location.id === data.location_id);
    if (item) {
        item.setFillLevel(data.fill_level);
    }
}

/**
 * Handle mission updates
 */
function handleMissionUpdate(data) {
    console.log('Mission update:', data);
    
    const missionsElement = document.getElementById('missions-active');
    if (missionsElement && data.active_missions !== undefined) {
        missionsElement.textContent = data.active_missions;
    }
}

/**
 * Handle KPI updates
 */
function handleKPIUpdate(data) {
    console.log('KPI update:', data);
    
    // Update KPI displays
    const kpiElements = {
        'stock-level': data.stock_level,
        'agv-count': data.agv_count,
        'throughput': data.throughput,
        'kpi-fill-rate': data.fill_rate,
        'kpi-accuracy': data.accuracy,
        'kpi-utilization': data.utilization,
        'kpi-missions-hour': data.missions_per_hour
    };
    
    Object.keys(kpiElements).forEach(id => {
        const element = document.getElementById(id);
        if (element && kpiElements[id] !== undefined) {
            element.textContent = kpiElements[id];
        }
    });
}

/**
 * Send message to WebSocket server
 */
function sendMessage(type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({ type, data });
        ws.send(message);
    } else {
        console.warn('WebSocket not connected. Message not sent:', type);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Demo Mode (Simulation without backend)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start demo mode simulation
 */
function startDemoMode(agvs, stockItems) {
    console.log('🎮 Starting demo mode...');
    
    // Simulate AGV movements
    demoInterval = setInterval(() => {
        simulationTime += 0.1;

        // Skip AGV movement if the main demo (pick-and-ship) is active
        if (!isMainDemoRunning()) {
            agvs.forEach((agv, index) => {
                // Only touch IDLE AGVs that aren't on a real task
                if (agv.status !== AGV_STATUS.IDLE || agv.currentTask) return;

                // Subtle idle sway so they look alive
                const swayAmplitude = 0.002;
                agv.position.x += Math.sin(simulationTime + index) * swayAmplitude;
                agv.position.z += Math.cos(simulationTime + index * 1.5) * swayAmplitude;

                updateAGVCard(agv);
            });
        }

        // Occasionally update stock levels
        if (Math.random() < 0.01 && stockItems.length > 0) {
            const randomItem = stockItems[Math.floor(Math.random() * stockItems.length)];
            const change = Math.random() * 20 - 10;
            randomItem.setFillLevel(randomItem.fillLevel + change);
        }

        // Update KPIs
        if (simulationTime % 5 < 0.1) {
            updateDemoKPIs(agvs, stockItems);
        }

    }, 100); // 100ms update rate

    // Randomly change IDLE AGV status (only if main demo isn't running)
    demoStatusInterval = setInterval(() => {
        if (isMainDemoRunning()) return;
        if (agvs.length > 0) {
            const idleAGVs = agvs.filter(a => a.status === AGV_STATUS.IDLE && !a.currentTask);
            if (idleAGVs.length > 0) {
                const randomAGV = idleAGVs[Math.floor(Math.random() * idleAGVs.length)];
                const statuses = [AGV_STATUS.IDLE, AGV_STATUS.CHARGING];
                const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
                randomAGV.setStatus(newStatus);
                updateAGVCard(randomAGV);
            }
        }
    }, 10000); // Change every 10 seconds
}

/**
 * Stop demo mode simulation
 */
function stopDemoMode() {
    if (demoInterval) {
        clearInterval(demoInterval);
        demoInterval = null;
    }
    if (demoStatusInterval) {
        clearInterval(demoStatusInterval);
        demoStatusInterval = null;
    }
    console.log('Demo mode stopped');
}

/**
 * Update AGV card in UI
 */
function updateAGVCard(agv) {
    const card = document.querySelector(`[data-agv="${agv.id}"]`);
    if (!card) return;
    
    // Update status indicator
    const indicator = card.querySelector('.agv-status-indicator');
    if (indicator) {
        indicator.className = 'agv-status-indicator';
        indicator.classList.add(agv.status);
    }
    
    // Update status text
    const statusText = card.querySelector('.agv-status-text');
    if (statusText) {
        statusText.textContent = agv.status.charAt(0).toUpperCase() + agv.status.slice(1);
    }
    
    // Update battery
    const batterySpan = card.querySelector('.agv-battery span');
    if (batterySpan) {
        batterySpan.textContent = `${Math.round(agv.battery)}%`;
    }
    
    // Update battery visual
    const batteryRect = card.querySelector('.agv-battery rect[fill]');
    if (batteryRect) {
        const batteryWidth = (agv.battery / 100) * 12;
        batteryRect.setAttribute('width', batteryWidth.toString());
        
        // Color based on level
        if (agv.battery > 60) {
            batteryRect.setAttribute('fill', '#2ec4b6');
        } else if (agv.battery > 30) {
            batteryRect.setAttribute('fill', '#f59f00');
        } else {
            batteryRect.setAttribute('fill', '#fa5252');
        }
    }
}

/**
 * Update KPIs in demo mode
 */
function updateDemoKPIs(agvs, stockItems) {
    // Calculate stock level
    const avgFillLevel = stockItems.reduce((sum, item) => sum + item.fillLevel, 0) / stockItems.length;
    const stockLevel = document.getElementById('stock-level');
    if (stockLevel) {
        stockLevel.textContent = `${Math.round(avgFillLevel)}%`;
    }
    
    // Update fill rate KPI
    const fillRate = document.getElementById('kpi-fill-rate');
    if (fillRate) {
        fillRate.textContent = `${Math.round(avgFillLevel)}%`;
    }
    
    // Update throughput (simulate)
    const throughput = document.getElementById('throughput');
    const kpiThroughput = document.getElementById('kpi-throughput');
    const value = Math.floor(45 + Math.random() * 15);
    if (throughput) throughput.textContent = value;
    if (kpiThroughput) kpiThroughput.textContent = `${value}/hr`;
    
    // Update active missions
    const missions = document.getElementById('missions-active');
    if (missions) {
        missions.textContent = Math.floor(3 + Math.random() * 5);
    }
    
    // Update AGV utilization
    const utilization = document.getElementById('kpi-utilization');
    if (utilization) {
        const activeAGVs = agvs.filter(a =>
            a.status !== AGV_STATUS.IDLE && a.status !== AGV_STATUS.CHARGING
        ).length;
        const util = agvs.length > 0 ? Math.round((activeAGVs / agvs.length) * 100) : 0;
        utilization.textContent = `${util}%`;
    }
    
    // Update missions per hour
    const missionsHour = document.getElementById('kpi-missions-hour');
    if (missionsHour) {
        missionsHour.textContent = Math.floor(20 + Math.random() * 10);
    }
}

/**
 * Close WebSocket connection
 */
function closeConnection() {
    if (ws) {
        ws.close();
        ws = null;
    }
    stopDemoMode();
}

// Cleanup on page unload
window.addEventListener('beforeunload', closeConnection);
