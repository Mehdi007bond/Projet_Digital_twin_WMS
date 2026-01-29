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
let demoMode = true; // Start in demo mode for Sprint 1

// Demo simulation state
let demoInterval = null;
let simulationTime = 0;

/**
 * Initialize WebSocket connection
 * @param {Array<AGV>} agvs - The AGV fleet
 * @param {Array<StockItem>} stockItems - The stock items
 */
function initWebSocket(agvs, stockItems) {
    console.log('🔌 Initializing WebSocket connection...');
    
    // Start in demo mode for Sprint 1
    updateConnectionStatus('demo', 'Demo Mode (No Backend)');
    startDemoMode(agvs, stockItems);
    
    // Attempt to connect to backend (will fail gracefully in Sprint 1)
    // attemptConnection(agvs, stockItems);
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
        
        // Simulate AGV movements (subtle)
        agvs.forEach((agv, index) => {
            // Simple circular path for demo
            const radius = 5;
            const speed = 0.1 + index * 0.05;
            const angle = simulationTime * speed + index * (Math.PI * 2 / 3);
            
            // Only move if status is 'moving'
            if (agv.status === AGV_STATUS.MOVING) {
                agv.position.x = Math.cos(angle) * radius;
                agv.position.z = Math.sin(angle) * radius;
                agv.rotation = angle + Math.PI / 2;
                agv.speed = 1.5;
            } else {
                agv.speed = 0;
            }
            
            // Update UI
            updateAGVCard(agv);
        });
        
        // Occasionally update stock levels
        if (Math.random() < 0.01) {
            const randomItem = stockItems[Math.floor(Math.random() * stockItems.length)];
            const change = Math.random() * 20 - 10; // -10 to +10
            randomItem.setFillLevel(randomItem.fillLevel + change);
        }
        
        // Update KPIs
        if (simulationTime % 5 < 0.1) {
            updateDemoKPIs(agvs, stockItems);
        }
        
    }, 100); // 100ms update rate
    
    // Randomly change AGV status
    setInterval(() => {
        if (agvs.length > 0) {
            const randomAGV = agvs[Math.floor(Math.random() * agvs.length)];
            const statuses = [AGV_STATUS.READY, AGV_STATUS.MOVING, AGV_STATUS.CHARGING];
            const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
            randomAGV.setStatus(newStatus);
            updateAGVCard(randomAGV);
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
        console.log('Demo mode stopped');
    }
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
        const movingAGVs = agvs.filter(a => a.status === AGV_STATUS.MOVING).length;
        const util = Math.round((movingAGVs / agvs.length) * 100);
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
