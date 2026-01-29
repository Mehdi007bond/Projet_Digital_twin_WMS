/**
 * Digital Twin WMS - AGV (Automated Guided Vehicle) Models
 * Creates detailed 3D AGV models with animations
 */

// AGV Status Constants
const AGV_STATUS = {
    READY: 'ready',
    MOVING: 'moving',
    CHARGING: 'charging',
    ERROR: 'error'
};

// AGV Status Colors
const STATUS_COLORS = {
    ready: 0x20c997,    // Green
    moving: 0x4361ee,   // Blue
    charging: 0xf59f00, // Yellow
    error: 0xfa5252     // Red
};

/**
 * AGV Class
 */
class AGV {
    constructor(id, position, status = AGV_STATUS.READY) {
        this.id = id;
        this.position = position.clone();
        this.rotation = 0;
        this.status = status;
        this.battery = Math.random() * 40 + 45; // 45-85%
        this.speed = 0;
        this.targetPosition = null;
        this.model = null;
        this.statusLED = null;
        this.wheels = [];
        this.idleAnimation = {
            time: Math.random() * Math.PI * 2,
            amplitude: 0.02,
            frequency: 2
        };
    }

    /**
     * Update AGV state
     */
    update(deltaTime) {
        if (!this.model) return;

        // Update idle animation (slight hovering)
        this.idleAnimation.time += deltaTime * this.idleAnimation.frequency;
        const hoverOffset = Math.sin(this.idleAnimation.time) * this.idleAnimation.amplitude;
        this.model.position.y = this.position.y + hoverOffset;

        // Rotate wheels based on speed
        if (this.speed > 0 && this.wheels.length > 0) {
            const rotationSpeed = this.speed * deltaTime * 5;
            this.wheels.forEach(wheel => {
                wheel.rotation.x += rotationSpeed;
            });
        }

        // Update status LED color
        if (this.statusLED) {
            const color = STATUS_COLORS[this.status];
            this.statusLED.material.color.setHex(color);
            
            // Pulse effect
            const pulse = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
            this.statusLED.material.emissiveIntensity = pulse;
        }

        // Simulate battery drain when moving
        if (this.status === AGV_STATUS.MOVING) {
            this.battery = Math.max(0, this.battery - deltaTime * 0.05);
        } else if (this.status === AGV_STATUS.CHARGING) {
            this.battery = Math.min(100, this.battery + deltaTime * 2);
        }
    }

    /**
     * Set AGV status
     */
    setStatus(status) {
        this.status = status;
        console.log(`AGV ${this.id} status: ${status}`);
    }

    /**
     * Get AGV info for UI
     */
    getInfo() {
        return {
            id: this.id,
            status: this.status,
            battery: Math.round(this.battery),
            position: this.position,
            speed: this.speed
        };
    }
}

/**
 * Create AGV fleet
 * @param {THREE.Scene} scene - The Three.js scene
 * @returns {Array<AGV>} Array of AGV objects
 */
function createAGVs(scene) {
    const agvs = [];

    // Initial positions for 3 AGVs
    const initialPositions = [
        { id: 'AGV-001', pos: new THREE.Vector3(-20, 0.15, -10), status: AGV_STATUS.CHARGING },
        { id: 'AGV-002', pos: new THREE.Vector3(5, 0.15, 0), status: AGV_STATUS.MOVING },
        { id: 'AGV-003', pos: new THREE.Vector3(0, 0.15, -12), status: AGV_STATUS.READY }
    ];

    initialPositions.forEach(config => {
        const agv = new AGV(config.id, config.pos, config.status);
        agv.model = createAGVModel(agv);
        agv.model.position.copy(config.pos);
        scene.add(agv.model);
        agvs.push(agv);
    });

    console.log(`✓ Created ${agvs.length} AGVs`);
    return agvs;
}

/**
 * Create detailed AGV 3D model
 */
function createAGVModel(agv) {
    const agvGroup = new THREE.Group();
    agvGroup.name = `AGV_${agv.id}`;

    // Dimensions
    const chassisWidth = 1.2;
    const chassisDepth = 0.8;
    const chassisHeight = 0.3;

    // Main chassis body
    const chassisMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.5,
        metalness: 0.7
    });

    const chassisGeometry = new THREE.BoxGeometry(chassisWidth, chassisHeight, chassisDepth);
    const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    agvGroup.add(chassis);

    // Add wheels
    agv.wheels = createWheels(agvGroup, chassisWidth, chassisDepth, chassisHeight);

    // Fork tines (yellow)
    createForkTines(agvGroup, chassisWidth, chassisDepth, chassisHeight);

    // LIDAR dome on top
    createLidarDome(agvGroup, chassisHeight);

    // Safety sensors
    createSensors(agvGroup, chassisWidth, chassisDepth, chassisHeight);

    // Status LED strip
    agv.statusLED = createStatusLED(agvGroup, chassisHeight, agv.status);

    // Headlights
    createLights(agvGroup, chassisWidth, chassisDepth, chassisHeight);

    // AGV label
    createAGVLabel(agvGroup, agv.id, chassisHeight);

    return agvGroup;
}

/**
 * Create wheels for AGV
 */
function createWheels(group, chassisWidth, chassisDepth, chassisHeight) {
    const wheels = [];
    const wheelRadius = 0.12;
    const wheelWidth = 0.08;

    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.2
    });

    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);

    const wheelPositions = [
        { x: -chassisWidth / 2 + 0.2, z: -chassisDepth / 2 + 0.15 },
        { x: -chassisWidth / 2 + 0.2, z: chassisDepth / 2 - 0.15 },
        { x: chassisWidth / 2 - 0.2, z: -chassisDepth / 2 + 0.15 },
        { x: chassisWidth / 2 - 0.2, z: chassisDepth / 2 - 0.15 }
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, -chassisHeight / 2, pos.z);
        wheel.castShadow = true;
        group.add(wheel);
        wheels.push(wheel);
    });

    return wheels;
}

/**
 * Create fork tines for lifting pallets
 */
function createForkTines(group, chassisWidth, chassisDepth, chassisHeight) {
    const forkMaterial = new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        roughness: 0.6,
        metalness: 0.7
    });

    const tineLength = 1.0;
    const tineWidth = 0.1;
    const tineHeight = 0.05;
    const tineGeometry = new THREE.BoxGeometry(tineLength, tineHeight, tineWidth);

    // Two fork tines
    const spacing = 0.4;
    [-spacing / 2, spacing / 2].forEach(z => {
        const tine = new THREE.Mesh(tineGeometry, forkMaterial);
        tine.position.set(chassisWidth / 2 + tineLength / 2, -chassisHeight / 2 + tineHeight / 2, z);
        tine.castShadow = true;
        group.add(tine);
    });

    // Fork carriage
    const carriageGeometry = new THREE.BoxGeometry(0.1, chassisHeight * 0.8, chassisDepth * 0.6);
    const carriage = new THREE.Mesh(carriageGeometry, forkMaterial);
    carriage.position.set(chassisWidth / 2 - 0.05, 0, 0);
    carriage.castShadow = true;
    group.add(carriage);
}

/**
 * Create LIDAR sensor dome
 */
function createLidarDome(group, chassisHeight) {
    const lidarMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.3,
        metalness: 0.8,
        transparent: true,
        opacity: 0.8
    });

    const lidarGeometry = new THREE.SphereGeometry(0.08, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const lidar = new THREE.Mesh(lidarGeometry, lidarMaterial);
    lidar.position.set(0, chassisHeight / 2 + 0.08, 0);
    group.add(lidar);

    // Spinning sensor (visual element)
    const sensorGeometry = new THREE.BoxGeometry(0.12, 0.02, 0.02);
    const sensorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
    sensor.position.set(0, chassisHeight / 2 + 0.05, 0);
    group.add(sensor);
}

/**
 * Create safety sensors
 */
function createSensors(group, chassisWidth, chassisDepth, chassisHeight) {
    const sensorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sensorGeometry = new THREE.SphereGeometry(0.03, 8, 8);

    // Front sensors
    [-0.2, 0, 0.2].forEach(z => {
        const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
        sensor.position.set(chassisWidth / 2, 0, z);
        group.add(sensor);
    });

    // Rear sensors
    [-0.2, 0.2].forEach(z => {
        const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
        sensor.position.set(-chassisWidth / 2, 0, z);
        group.add(sensor);
    });

    // Side sensors
    [-chassisDepth / 2, chassisDepth / 2].forEach(z => {
        const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
        sensor.position.set(0, 0, z);
        group.add(sensor);
    });
}

/**
 * Create status LED strip
 */
function createStatusLED(group, chassisHeight, status) {
    const ledMaterial = new THREE.MeshStandardMaterial({
        color: STATUS_COLORS[status],
        emissive: STATUS_COLORS[status],
        emissiveIntensity: 1,
        roughness: 0.2,
        metalness: 0.8
    });

    const ledGeometry = new THREE.BoxGeometry(0.8, 0.05, 0.6);
    const led = new THREE.Mesh(ledGeometry, ledMaterial);
    led.position.set(0, chassisHeight / 2 + 0.025, 0);
    group.add(led);

    return led;
}

/**
 * Create headlights and tail lights
 */
function createLights(group, chassisWidth, chassisDepth, chassisHeight) {
    // Headlights (white)
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headlightGeometry = new THREE.CircleGeometry(0.04, 8);

    [-0.15, 0.15].forEach(z => {
        const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        headlight.position.set(chassisWidth / 2 + 0.01, -chassisHeight / 4, z);
        headlight.rotation.y = -Math.PI / 2;
        group.add(headlight);
    });

    // Tail lights (red)
    const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const taillightGeometry = new THREE.CircleGeometry(0.04, 8);

    [-0.15, 0.15].forEach(z => {
        const taillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        taillight.position.set(-chassisWidth / 2 - 0.01, -chassisHeight / 4, z);
        taillight.rotation.y = Math.PI / 2;
        group.add(taillight);
    });
}

/**
 * Create AGV label
 */
function createAGVLabel(group, id, chassisHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 256, 128);
    
    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id, 128, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const labelGeometry = new THREE.PlaneGeometry(0.4, 0.2);
    const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
    labelMesh.position.set(0, chassisHeight / 2 + 0.15, 0);
    labelMesh.rotation.x = -Math.PI / 4;
    group.add(labelMesh);
}

/**
 * Update all AGVs
 */
function updateAGVs(agvs, deltaTime) {
    agvs.forEach(agv => {
        agv.update(deltaTime);
        
        // Update model position
        if (agv.model) {
            agv.model.position.x = agv.position.x;
            agv.model.position.z = agv.position.z;
            agv.model.rotation.y = agv.rotation;
        }
    });
}

/**
 * Get AGV by ID
 */
function getAGVById(agvs, id) {
    return agvs.find(agv => agv.id === id);
}
