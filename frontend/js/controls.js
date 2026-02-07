/**
 * Digital Twin WMS - Camera and UI Controls
 * Handles camera presets, UI interactions, and keyboard shortcuts
 */

// Camera presets
const CAMERA_PRESETS = {
    overview: {
        position: { x: 30, y: 25, z: 30 },
        target: { x: 0, y: 0, z: 0 },
        name: 'Overview'
    },
    front: {
        position: { x: 0, y: 8, z: 35 },
        target: { x: 0, y: 0, z: 0 },
        name: 'Front View'
    },
    top: {
        position: { x: 0, y: 50, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        name: 'Top View'
    },
    agv: {
        followMode: true,
        offset: { x: -5, y: 3, z: 0 },
        name: 'Follow AGV'
    }
};

let currentCameraMode = 'overview';
let followingAGV = null;
let uiVisible = true;

/**
 * Initialize UI controls and event handlers
 * @param {THREE.Camera} camera - The Three.js camera
 * @param {THREE.OrbitControls} controls - The orbit controls
 * @param {THREE.Renderer} renderer - The Three.js renderer
 */
function initUIControls(camera, controls, renderer) {
    console.log('Setting up UI controls...');

    // Configure OrbitControls
    setupOrbitControls(controls);

    // Setup camera view buttons
    setupCameraButtons(camera, controls);

    // Setup simulation controls
    setupSimulationControls();

    // Setup display toggles
    setupDisplayToggles();

    // Setup panel toggles
    setupPanelToggles();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts(camera, controls, renderer);

    // Setup fullscreen button
    setupFullscreenButton();

    // Setup speed slider
    setupSpeedSlider();

    console.log('✓ UI controls initialized');
}

/**
 * Configure orbit controls with constraints
 */
function setupOrbitControls(controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground
    controls.minPolarAngle = 0;
    
    // Pan boundaries (stay within warehouse)
    controls.minPan = new THREE.Vector3(-30, 0, -20);
    controls.maxPan = new THREE.Vector3(30, 20, 20);
    
    controls.enablePan = true;
    controls.panSpeed = 1.0;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
}

/**
 * Setup camera preset buttons
 */
function setupCameraButtons(camera, controls) {
    const cameraButtons = document.querySelectorAll('.camera-btn');
    
    cameraButtons.forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            setCameraView(camera, controls, view);
            
            // Update active state
            cameraButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });
}

/**
 * Set camera to preset view
 */
function setCameraView(camera, controls, view) {
    const preset = CAMERA_PRESETS[view];
    if (!preset) return;

    currentCameraMode = view;

    if (preset.followMode) {
        // Follow AGV mode
        if (window.digitalTwin && window.digitalTwin.agvs && window.digitalTwin.agvs.length > 0) {
            followingAGV = window.digitalTwin.agvs[0]; // Follow first AGV
            console.log(`📹 Following ${followingAGV.id}`);
        }
    } else {
        followingAGV = null;
        
        // Animate camera to preset position
        animateCamera(camera, controls, preset.position, preset.target);
        console.log(`📹 Camera view: ${preset.name}`);
    }
}

/**
 * Animate camera to position
 */
function animateCamera(camera, controls, targetPos, targetLookAt) {
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    
    const endPos = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const endTarget = new THREE.Vector3(targetLookAt.x, targetLookAt.y, targetLookAt.z);
    
    const duration = 1000; // ms
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease in-out
        const eased = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        camera.position.lerpVectors(startPos, endPos, eased);
        controls.target.lerpVectors(startTarget, endTarget, eased);
        controls.update();
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

/**
 * Update camera for follow mode
 */
function updateFollowCamera(camera, controls) {
    if (followingAGV && currentCameraMode === 'agv') {
        const agvPos = followingAGV.position;
        const offset = CAMERA_PRESETS.agv.offset;
        
        const targetPos = new THREE.Vector3(
            agvPos.x + offset.x,
            agvPos.y + offset.y,
            agvPos.z + offset.z
        );
        
        camera.position.lerp(targetPos, 0.05);
        controls.target.lerp(agvPos, 0.05);
    }
}

/**
 * Setup simulation control buttons
 */
function setupSimulationControls() {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (window.digitalTwin && window.digitalTwin.togglePause) {
                window.digitalTwin.togglePause();
            }
            playBtn.classList.add('active');
            if (pauseBtn) pauseBtn.classList.remove('active');
        });
    }
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (window.digitalTwin && window.digitalTwin.togglePause) {
                window.digitalTwin.togglePause();
            }
            pauseBtn.classList.add('active');
            if (playBtn) playBtn.classList.remove('active');
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            console.log('🔄 Resetting simulation...');
            // Reset would reload or reset state
            location.reload();
        });
    }
}

/**
 * Setup speed slider
 */
function setupSpeedSlider() {
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    
    if (speedSlider && speedValue) {
        speedSlider.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            speedValue.textContent = `${speed.toFixed(1)}x`;
            
            if (window.digitalTwin && window.digitalTwin.setSimulationSpeed) {
                window.digitalTwin.setSimulationSpeed(speed);
            }
        });
    }
}

/**
 * Setup display toggle switches
 */
function setupDisplayToggles() {
    const toggles = {
        'toggle-grid': toggleGrid,
        'toggle-paths': togglePaths,
        'toggle-labels': toggleLabels,
        'toggle-shadows': toggleShadows
    };
    
    Object.keys(toggles).forEach(id => {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                toggles[id](e.target.checked);
            });
        }
    });

    // Setup stock verification button
    setupStockVerificationControls();
}

/**
 * Setup stock verification controls
 */
function setupStockVerificationControls() {
    const verifyBtn = document.getElementById('verify-stock-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            if (window.digitalTwin && window.digitalTwin.stockItems) {
                const verification = performStockVerification(window.digitalTwin.stockItems);
                displayStockVerificationReport(verification);
                
                // Show alert to user
                showStockVerificationAlert(verification);
            } else {
                console.warn('Stock items not available');
            }
        });
    }

    // Setup filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            if (window.digitalTwin && window.digitalTwin.stockItems) {
                if (filter === 'clear') {
                    clearStockHighlights(window.digitalTwin.stockItems);
                } else {
                    highlightStockByFilter(window.digitalTwin.stockItems, filter);
                }
            }
        });
    });
}

/**
 * Show stock verification alert in UI
 */
function showStockVerificationAlert(verification) {
    const alertsContainer = document.getElementById('alerts-container');
    if (!alertsContainer) return;

    // Clear old alerts
    alertsContainer.innerHTML = '';

    // Create summary alert
    const summaryAlert = document.createElement('div');
    summaryAlert.className = 'alert alert-info';
    summaryAlert.innerHTML = `
        <strong>📋 Stock Verification Complete</strong><br>
        Occupied: ${verification.occupied}/${verification.totalItems} (${verification.fillRate}%)<br>
        Low Stock: ${verification.lowStock.length} items
    `;
    alertsContainer.appendChild(summaryAlert);

    // Add specific alerts
    verification.alerts.forEach(alert => {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${alert.level}`;
        alertDiv.innerHTML = `<strong>${alert.level.toUpperCase()}:</strong> ${alert.message}`;
        alertsContainer.appendChild(alertDiv);
    });

    // Auto-remove after 10 seconds
    setTimeout(() => {
        alertsContainer.innerHTML = '';
    }, 10000);
}

/**
 * Toggle grid visibility
 */
function toggleGrid(show) {
    console.log(`Grid: ${show ? 'ON' : 'OFF'}`);
    if (window.digitalTwin && window.digitalTwin.navigationGridVisual) {
        window.digitalTwin.navigationGridVisual.visible = show;
    }
}

/**
 * Toggle path visualization
 */
function togglePaths(show) {
    console.log(`Paths: ${show ? 'ON' : 'OFF'}`);
    if (window.digitalTwin && window.digitalTwin.navigationGridVisual) {
        window.digitalTwin.navigationGridVisual.visible = show;
    }
}

/**
 * Toggle label visibility
 */
function toggleLabels(show) {
    console.log(`Labels: ${show ? 'ON' : 'OFF'}`);
    // Toggle all labels in scene
    if (window.digitalTwin && window.digitalTwin.scene) {
        window.digitalTwin.scene.traverse(object => {
            if (object.name && (object.name.includes('Label') || object.name.includes('label'))) {
                object.visible = show;
            }
        });
    }
}

/**
 * Toggle shadow rendering
 */
function toggleShadows(show) {
    console.log(`Shadows: ${show ? 'ON' : 'OFF'}`);
    if (window.digitalTwin && window.digitalTwin.renderer) {
        window.digitalTwin.renderer.shadowMap.enabled = show;
    }
}

/**
 * Setup panel collapse/expand toggles
 */
function setupPanelToggles() {
    const toggleButtons = document.querySelectorAll('.panel-toggle');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const panelId = button.dataset.panel;
            const panel = document.getElementById(panelId);
            
            if (panel) {
                const content = panel.querySelector('.panel-content');
                const isCollapsed = content.style.display === 'none';
                
                content.style.display = isCollapsed ? 'block' : 'none';
                button.textContent = isCollapsed ? '−' : '+';
                
                // Save state to localStorage
                localStorage.setItem(`panel-${panelId}`, isCollapsed ? 'open' : 'closed');
            }
        });
    });
    
    // Restore panel states from localStorage
    toggleButtons.forEach(button => {
        const panelId = button.dataset.panel;
        const savedState = localStorage.getItem(`panel-${panelId}`);
        
        if (savedState === 'closed') {
            const panel = document.getElementById(panelId);
            if (panel) {
                const content = panel.querySelector('.panel-content');
                content.style.display = 'none';
                button.textContent = '+';
            }
        }
    });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts(camera, controls, renderer) {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch (e.key.toLowerCase()) {
            case ' ': // Space - Play/Pause
                e.preventDefault();
                if (window.digitalTwin && window.digitalTwin.togglePause) {
                    window.digitalTwin.togglePause();
                }
                break;
                
            case '1': // Overview
                setCameraView(camera, controls, 'overview');
                break;
                
            case '2': // Front view
                setCameraView(camera, controls, 'front');
                break;
                
            case '3': // Top view
                setCameraView(camera, controls, 'top');
                break;
                
            case '4': // Follow AGV
                setCameraView(camera, controls, 'agv');
                break;
                
            case 'f': // Fullscreen
                toggleFullscreen();
                break;
                
            case 'h': // Toggle UI
                toggleUI();
                break;
                
            case '?': // Help
                toggleShortcutsHelp();
                break;
        }
    });
}

/**
 * Setup fullscreen button
 */
function setupFullscreenButton() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
}

/**
 * Toggle fullscreen mode
 */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

/**
 * Toggle UI visibility
 */
function toggleUI() {
    uiVisible = !uiVisible;
    
    const panels = document.querySelectorAll('.panel, .top-bar, .info-bar');
    panels.forEach(panel => {
        panel.style.display = uiVisible ? '' : 'none';
    });
    
    console.log(`UI: ${uiVisible ? 'ON' : 'OFF'}`);
}

/**
 * Toggle shortcuts help display
 */
function toggleShortcutsHelp() {
    const help = document.getElementById('shortcuts-help');
    if (help) {
        help.style.display = help.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Update simulation time display
 */
function updateSimulationTime() {
    const timeElement = document.getElementById('simulation-time');
    if (timeElement) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        timeElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
}

// Update time display every second
setInterval(updateSimulationTime, 1000);
updateSimulationTime();

/**
 * Setup Stock Analysis Page button
 */
function setupAnalysisPageButton() {
    const openAnalysisBtn = document.getElementById('open-analysis-btn');
    if (openAnalysisBtn) {
        openAnalysisBtn.addEventListener('click', () => {
            // Save current stock data to localStorage before opening the page
            if (window.digitalTwin && window.digitalTwin.stockItems) {
                const stockData = window.digitalTwin.stockItems.map(item => ({
                    id: item.id,
                    aisle: item.aisle,
                    rack: item.rack,
                    level: item.level,
                    position: `Allée ${item.aisle} - Rack ${item.rack} - Niveau ${item.level}`,
                    category: item.category,
                    sku: item.sku || '-',
                    fillLevel: item.fillLevel,
                    occupied: item.fillLevel > 0,
                    status: item.fillLevel === 0 ? 'Vide' : 
                            item.fillLevel < 25 ? 'Faible' : 
                            item.fillLevel < 75 ? 'Moyen' : 
                            item.fillLevel < 90 ? 'Bon' : 'Plein'
                }));
                
                localStorage.setItem('warehouseStockData', JSON.stringify(stockData));
                console.log('Stock data saved to localStorage:', stockData.length, 'items');
            }
            
            // Open the analysis page
            window.open('stock-analysis.html', '_blank');
        });
        console.log('Stock Analysis Page button initialized');
    }
}

/**
 * Setup 2D Warehouse Map button
 */
function setup2DMapButton() {
    const open2DMapBtn = document.getElementById('open-2d-map-btn');
    if (open2DMapBtn) {
        open2DMapBtn.addEventListener('click', () => {
            // Open the 2D warehouse map page
            window.open('warehouse-2d.html', '_blank');
        });
        console.log('2D Warehouse Map button initialized');
    }
}

// Initialize the buttons when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupAnalysisPageButton();
        setup2DMapButton();
    });
} else {
    setupAnalysisPageButton();
    setup2DMapButton();
}
