/**
 * Digital Twin WMS - Main Three.js Application
 * Initializes the 3D environment and manages the animation loop
 */

// ═══════════════════════════════════════════════════════════════════════════
// Global Variables
// ═══════════════════════════════════════════════════════════════════════════

let scene, camera, renderer, controls;
let warehouseModel, racksModel, agvs, stockItems;
let animationFrameId;
let clock, deltaTime;
let loadingManager;
let simulationSpeed = 1.0;
let isPaused = false;

// Performance monitoring
let fps = 0;
let fpsCounter = 0;
let lastFpsUpdate = 0;

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the Three.js application
 */
function init() {
    console.log('🚀 Initializing Digital Twin WMS...');

    // Create loading manager
    setupLoadingManager();

    // Initialize Three.js core components
    initScene();
    initCamera();
    initRenderer();
    initControls();
    initLights();

    // Initialize warehouse components
    console.log('📦 Creating warehouse environment...');
    warehouseModel = createWarehouse(scene);
    
    console.log('🏗️ Creating rack system...');
    racksModel = createRacks(scene);
    
    console.log('🤖 Creating AGV fleet...');
    agvs = createAGVs(scene);
    
    console.log('📊 Placing stock items...');
    stockItems = createStock(scene, racksModel);

    // Initialize UI controls
    console.log('🎮 Setting up controls...');
    initUIControls(camera, controls, renderer);

    // Initialize WebSocket connection (demo mode)
    console.log('🔌 Connecting to backend (demo mode)...');
    initWebSocket(agvs, stockItems);

    // Setup window resize handler
    window.addEventListener('resize', onWindowResize, false);

    // Setup clock for delta time
    clock = new THREE.Clock();

    // Hide loading screen
    hideLoadingScreen();

    // Start animation loop
    console.log('✅ Initialization complete!');
    animate();
}

/**
 * Setup loading manager for progress tracking
 */
function setupLoadingManager() {
    loadingManager = new THREE.LoadingManager();

    loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
        console.log(`Loading: ${itemsLoaded}/${itemsTotal}`);
    };

    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        const progress = (itemsLoaded / itemsTotal) * 100;
        updateLoadingProgress(progress);
    };

    loadingManager.onLoad = () => {
        console.log('All assets loaded');
    };

    loadingManager.onError = (url) => {
        console.error(`Error loading: ${url}`);
    };
}

/**
 * Update loading screen progress
 */
function updateLoadingProgress(progress) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}%`;
    }
}

/**
 * Hide loading screen with animation
 */
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }, 500);
    }
}

/**
 * Initialize the Three.js scene
 */
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 50, 150);
    console.log('✓ Scene initialized');
}

/**
 * Initialize the camera
 */
function initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);
    console.log('✓ Camera initialized');
}

/**
 * Initialize the WebGL renderer with high quality settings
 */
function initRenderer() {
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Enable shadows
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Tone mapping for better colors
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    // Append to canvas container
    const container = document.getElementById('canvas-container');
    container.appendChild(renderer.domElement);
    
    console.log('✓ Renderer initialized');
}

/**
 * Initialize orbit controls
 */
function initControls() {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground
    controls.target.set(0, 0, 0);
    console.log('✓ Controls initialized');
}

/**
 * Initialize scene lighting
 */
function initLights() {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Main directional light (sun)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    // Hemisphere light for natural lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    console.log('✓ Lights initialized');
}

// ═══════════════════════════════════════════════════════════════════════════
// Animation Loop
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main animation loop
 */
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (!isPaused) {
        // Get delta time
        deltaTime = clock.getDelta() * simulationSpeed;

        // Update controls
        controls.update();

        // Update AGVs
        if (agvs && agvs.length > 0) {
            updateAGVs(agvs, deltaTime);
        }

        // Update stock visualization
        if (stockItems) {
            updateStockVisuals(stockItems, deltaTime);
        }

        // Update FPS counter
        updateFPS();

        // Update object count
        updateObjectCount();
    }

    // Render the scene
    renderer.render(scene, camera);
}

/**
 * Update FPS counter
 */
function updateFPS() {
    fpsCounter++;
    const currentTime = performance.now();
    
    if (currentTime >= lastFpsUpdate + 1000) {
        fps = Math.round((fpsCounter * 1000) / (currentTime - lastFpsUpdate));
        fpsCounter = 0;
        lastFpsUpdate = currentTime;
        
        const fpsElement = document.getElementById('fps-counter');
        if (fpsElement) {
            fpsElement.textContent = fps;
            
            // Color code based on performance
            if (fps >= 55) {
                fpsElement.style.color = '#20c997'; // Green
            } else if (fps >= 30) {
                fpsElement.style.color = '#f59f00'; // Yellow
            } else {
                fpsElement.style.color = '#fa5252'; // Red
            }
        }
    }
}

/**
 * Update object count display
 */
function updateObjectCount() {
    const objectCountElement = document.getElementById('object-count');
    if (objectCountElement) {
        let count = 0;
        scene.traverse(() => count++);
        objectCountElement.textContent = count;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Pause/resume simulation
 */
function togglePause() {
    isPaused = !isPaused;
    console.log(isPaused ? '⏸️ Simulation paused' : '▶️ Simulation resumed');
}

/**
 * Set simulation speed
 */
function setSimulationSpeed(speed) {
    simulationSpeed = Math.max(0.1, Math.min(4, speed));
    console.log(`⚡ Simulation speed: ${simulationSpeed}x`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════════════════════

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export functions for use in other modules
window.digitalTwin = {
    togglePause,
    setSimulationSpeed,
    scene,
    camera,
    renderer,
    controls
};
