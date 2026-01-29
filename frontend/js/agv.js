/**
 * Digital Twin WMS - AGV (Automated Guided Vehicle) Models
 * Creates detailed 3D AGV models with realistic differential drive kinematics
 * Implements FSM: IDLE → MOVING_TO_PICK → LOADING → MOVING_TO_DROP → UNLOADING
 */

// ═══════════════════════════════════════════════════════════════════════════
// AGV Finite State Machine States
// ═══════════════════════════════════════════════════════════════════════════

const AGV_STATUS = {
    IDLE: 'idle',                   // Waiting for task assignment
    MOVING_TO_PICK: 'moving_to_pick', // Traveling to pickup location
    LOADING: 'loading',             // Performing pickup operation
    MOVING_TO_DROP: 'moving_to_drop', // Traveling to dropoff location
    UNLOADING: 'unloading',         // Performing dropoff operation
    CHARGING: 'charging',           // At charging station
    ERROR: 'error'                  // Fault condition
};

// Sub-states for fine-grained movement control
const MOVE_PHASE = {
    ROTATING: 'rotating',           // Pivoting to face waypoint
    TRAVELING: 'traveling',         // High-speed travel
    APPROACHING: 'approaching',     // Slow fine-positioning
    ARRIVED: 'arrived'              // At destination
};

// AGV Status Colors for LED visualization
const STATUS_COLORS = {
    idle: 0x20c997,             // Green - Ready
    moving_to_pick: 0x4361ee,   // Blue - Moving to pickup
    loading: 0xe67e22,          // Orange - Loading
    moving_to_drop: 0x9b59b6,   // Purple - Moving to dropoff  
    unloading: 0xe67e22,        // Orange - Unloading
    charging: 0xf59f00,         // Yellow - Charging
    error: 0xfa5252             // Red - Error
};

// Motion Profile Constants (realistic forklift values)
const MOTION = {
    MAX_SPEED: 1.5,             // m/s - max travel speed
    APPROACH_SPEED: 0.3,        // m/s - fine positioning speed
    ACCELERATION: 0.8,          // m/s² - smooth trapezoid profile
    DECELERATION: 1.2,          // m/s² - slightly faster braking
    ROTATION_SPEED: 1.5,        // rad/s - differential drive rotation
    APPROACH_DISTANCE: 1.5,     // m - start slowing down
    POSITION_TOLERANCE: 0.15,   // m - arrival threshold
    ROTATION_TOLERANCE: 0.08,   // rad - ~5 degrees
    FORK_SPEED: 0.4,            // m/s - fork lift speed
    FORK_MAX_HEIGHT: 0.6,       // m - max fork height
    LOADING_TIME: 2.0,          // seconds - time to load/unload
    WAYPOINT_TOLERANCE: 0.3     // m - waypoint reached threshold
};

// ═══════════════════════════════════════════════════════════════════════════
// AGV Class - Differential Drive Kinematics with FSM
// ═══════════════════════════════════════════════════════════════════════════

class AGV {
    constructor(id, position, status = AGV_STATUS.IDLE) {
        this.id = id;
        this.position = position.clone();
        this.rotation = 0;
        this.targetRotation = 0;
        this.status = status;
        this.previousStatus = status;
        
        // Battery system
        this.battery = Math.random() * 40 + 45;
        
        // Motion state
        this.speed = 0;
        this.targetSpeed = 0;
        this.movePhase = MOVE_PHASE.ARRIVED;
        
        // Fork state
        this.forkHeight = 0;
        this.targetForkHeight = 0;
        this.isCarryingLoad = false;
        
        // Task & Path following
        this.currentTask = null;
        this.path = [];                     // Array of THREE.Vector3 waypoints
        this.pathNodeIds = [];              // Array of node IDs for the path
        this.currentWaypointIndex = 0;
        
        // Timing
        this.waitTime = 0;
        this.operationTime = 0;
        
        // 3D Model references
        this.model = null;
        this.statusLED = null;
        this.wheels = [];
        this.forks = [];
        this.cargoMesh = null;              // Visual representation of carried load
        
        // Statistics
        this.totalDistanceTraveled = 0;
        this.tasksCompleted = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Task Assignment from TaskQueueManager
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Assign a task to this AGV
     * @param {Task} task - Task object from TaskQueueManager
     * @param {NavigationGrid} navGrid - Navigation grid for pathfinding
     */
    assignTask(task, navGrid) {
        this.currentTask = task;
        task.start();
        
        // Find path to pickup location
        const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
        const pickupNode = navGrid.getNode(task.pickupNodeId);
        
        if (!currentNode || !pickupNode) {
            console.error(`${this.id}: Cannot find nodes for task`);
            this.currentTask = null;
            return;
        }

        // Calculate path using A*
        this.pathNodeIds = navGrid.findPath(currentNode.id, task.pickupNodeId);
        this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
        this.currentWaypointIndex = 0;
        
        console.log(`🤖 ${this.id}: Assigned task ${task.type}, path length: ${this.path.length}`);
        
        if (this.path.length > 0) {
            this.setStatus(AGV_STATUS.MOVING_TO_PICK);
            this.movePhase = MOVE_PHASE.ROTATING;
        } else {
            // Already at pickup location
            this.setStatus(AGV_STATUS.LOADING);
            this.operationTime = MOTION.LOADING_TIME;
            this.targetForkHeight = MOTION.FORK_MAX_HEIGHT;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Main Update Loop - FSM Controller
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Main update loop - Finite State Machine
     */
    update(deltaTime) {
        if (!this.model) return;

        // FSM: Update based on current status
        switch (this.status) {
            case AGV_STATUS.IDLE:
                this.updateIdle(deltaTime);
                break;
                
            case AGV_STATUS.MOVING_TO_PICK:
                this.updateMoving(deltaTime);
                // Check if arrived at pickup
                if (this.movePhase === MOVE_PHASE.ARRIVED) {
                    this.setStatus(AGV_STATUS.LOADING);
                    this.operationTime = MOTION.LOADING_TIME;
                    this.targetForkHeight = MOTION.FORK_MAX_HEIGHT;
                }
                break;
                
            case AGV_STATUS.LOADING:
                this.updateLoading(deltaTime);
                break;
                
            case AGV_STATUS.MOVING_TO_DROP:
                this.updateMoving(deltaTime);
                // Check if arrived at dropoff
                if (this.movePhase === MOVE_PHASE.ARRIVED) {
                    this.setStatus(AGV_STATUS.UNLOADING);
                    this.operationTime = MOTION.LOADING_TIME;
                    this.targetForkHeight = 0;
                }
                break;
                
            case AGV_STATUS.UNLOADING:
                this.updateUnloading(deltaTime);
                break;
                
            case AGV_STATUS.CHARGING:
                this.updateCharging(deltaTime);
                break;
                
            case AGV_STATUS.ERROR:
                // Stay in error state until reset
                break;
        }

        // Apply physics - Trapezoid velocity profile
        this.applyMotion(deltaTime);
        
        // Update fork animation
        this.updateForks(deltaTime);
        
        // Update visual elements
        this.updateVisuals(deltaTime);
        
        // Update cargo visual
        this.updateCargoVisual();
        
        // Battery management
        this.updateBattery(deltaTime);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FSM State Handlers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * IDLE state - Waiting for task assignment
     */
    updateIdle(deltaTime) {
        this.targetSpeed = 0;
        this.movePhase = MOVE_PHASE.ARRIVED;
        
        // Check battery - go to charging if low
        if (this.battery < 20 && !this.currentTask) {
            this.goToCharging();
        }
    }

    /**
     * MOVING state - Handle path following (used by MOVING_TO_PICK and MOVING_TO_DROP)
     */
    updateMoving(deltaTime) {
        if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) {
            this.movePhase = MOVE_PHASE.ARRIVED;
            this.targetSpeed = 0;
            return;
        }

        const target = this.path[this.currentWaypointIndex];
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Calculate target rotation
        this.targetRotation = Math.atan2(dx, dz);

        // Get normalized rotation difference
        let rotationDiff = this.targetRotation - this.rotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        const needsRotation = Math.abs(rotationDiff) > MOTION.ROTATION_TOLERANCE;
        const isLastWaypoint = this.currentWaypointIndex === this.path.length - 1;

        // Determine movement phase
        if (needsRotation && this.speed < 0.1) {
            // ROTATING phase - pivot to face target
            this.movePhase = MOVE_PHASE.ROTATING;
            this.targetSpeed = 0;
            
            const rotationStep = Math.sign(rotationDiff) * 
                Math.min(Math.abs(rotationDiff), MOTION.ROTATION_SPEED * deltaTime);
            this.rotation += rotationStep;
            this.normalizeRotation();
            
        } else if (distance < MOTION.WAYPOINT_TOLERANCE) {
            // Reached waypoint
            this.currentWaypointIndex++;
            
            if (this.currentWaypointIndex >= this.path.length) {
                this.movePhase = MOVE_PHASE.ARRIVED;
                this.targetSpeed = 0;
            }
            
        } else if (isLastWaypoint && distance < MOTION.APPROACH_DISTANCE) {
            // APPROACHING phase - slow down for final approach
            this.movePhase = MOVE_PHASE.APPROACHING;
            this.targetSpeed = MOTION.APPROACH_SPEED;
            this.moveForward(deltaTime);
            
            // Fine rotation correction
            if (Math.abs(rotationDiff) > 0.02) {
                const correction = Math.sign(rotationDiff) * 
                    Math.min(Math.abs(rotationDiff), MOTION.ROTATION_SPEED * 0.3 * deltaTime);
                this.rotation += correction;
                this.normalizeRotation();
            }
            
        } else {
            // TRAVELING phase - full speed
            this.movePhase = MOVE_PHASE.TRAVELING;
            
            // Calculate speed based on distance to next waypoint
            const distanceToSlow = isLastWaypoint ? MOTION.APPROACH_DISTANCE * 2 : MOTION.WAYPOINT_TOLERANCE * 3;
            if (distance < distanceToSlow) {
                this.targetSpeed = Math.max(MOTION.APPROACH_SPEED, MOTION.MAX_SPEED * (distance / distanceToSlow));
            } else {
                this.targetSpeed = MOTION.MAX_SPEED;
            }
            
            this.moveForward(deltaTime);
            
            // Slight steering correction while moving
            if (Math.abs(rotationDiff) > 0.02) {
                const correction = Math.sign(rotationDiff) * 
                    Math.min(Math.abs(rotationDiff), MOTION.ROTATION_SPEED * 0.5 * deltaTime);
                this.rotation += correction;
                this.normalizeRotation();
            }
        }

        // Track distance traveled
        if (this.speed > 0.01) {
            this.totalDistanceTraveled += this.speed * deltaTime;
        }
    }

    /**
     * LOADING state - Pickup operation with fork animation
     */
    updateLoading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;

        // Fork lift animation
        if (Math.abs(this.forkHeight - this.targetForkHeight) > 0.02) {
            return; // Still lifting
        }

        if (this.operationTime <= 0) {
            // Loading complete
            this.isCarryingLoad = true;
            
            // Update storage node (mark as empty)
            const navGrid = getNavigationGrid();
            if (this.currentTask && navGrid) {
                const pickupNode = navGrid.getNode(this.currentTask.pickupNodeId);
                if (pickupNode && pickupNode.type === NODE_TYPE.STORAGE) {
                    pickupNode.itemId = null;
                }
            }

            // Calculate path to dropoff
            this.startDropoffPhase();
        }
    }

    /**
     * Start the dropoff phase after loading
     */
    startDropoffPhase() {
        const navGrid = getNavigationGrid();
        if (!this.currentTask || !navGrid) {
            this.completeTask();
            return;
        }

        const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
        const dropoffNode = navGrid.getNode(this.currentTask.dropoffNodeId);

        if (!currentNode || !dropoffNode) {
            console.error(`${this.id}: Cannot find dropoff nodes`);
            this.completeTask();
            return;
        }

        this.pathNodeIds = navGrid.findPath(currentNode.id, this.currentTask.dropoffNodeId);
        this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
        this.currentWaypointIndex = 0;

        if (this.path.length > 0) {
            this.setStatus(AGV_STATUS.MOVING_TO_DROP);
            this.movePhase = MOVE_PHASE.ROTATING;
        } else {
            // Already at dropoff location
            this.setStatus(AGV_STATUS.UNLOADING);
            this.operationTime = MOTION.LOADING_TIME;
            this.targetForkHeight = 0;
        }
    }

    /**
     * UNLOADING state - Dropoff operation with fork animation
     */
    updateUnloading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;

        // Fork lower animation
        if (Math.abs(this.forkHeight - this.targetForkHeight) > 0.02) {
            return; // Still lowering
        }

        if (this.operationTime <= 0) {
            // Unloading complete
            this.isCarryingLoad = false;
            
            // Update storage/shipping node (mark as occupied for storage)
            const navGrid = getNavigationGrid();
            if (this.currentTask && navGrid) {
                const dropoffNode = navGrid.getNode(this.currentTask.dropoffNodeId);
                if (dropoffNode && dropoffNode.type === NODE_TYPE.STORAGE) {
                    dropoffNode.itemId = this.currentTask.itemId;
                }
            }

            this.completeTask();
        }
    }

    /**
     * Complete current task
     */
    completeTask() {
        if (this.currentTask) {
            this.currentTask.complete();
            this.tasksCompleted++;
            console.log(`✅ ${this.id}: Task completed (total: ${this.tasksCompleted})`);
        }
        
        this.currentTask = null;
        this.path = [];
        this.pathNodeIds = [];
        this.currentWaypointIndex = 0;
        this.isCarryingLoad = false;
        this.setStatus(AGV_STATUS.IDLE);
    }

    /**
     * CHARGING state - At charging station
     */
    updateCharging(deltaTime) {
        this.targetSpeed = 0;
        
        if (this.battery >= 95) {
            this.setStatus(AGV_STATUS.IDLE);
        }
    }

    /**
     * Go to charging station
     */
    goToCharging() {
        const navGrid = getNavigationGrid();
        if (!navGrid) return;
        
        const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
        const chargingNode = navGrid.findAvailableChargingNode();
        
        if (!currentNode || !chargingNode) return;
        
        this.pathNodeIds = navGrid.findPath(currentNode.id, chargingNode.id);
        this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
        this.currentWaypointIndex = 0;
        
        // Create a virtual charging task
        this.currentTask = {
            type: 'charging',
            pickupNodeId: chargingNode.id,
            dropoffNodeId: chargingNode.id
        };
        
        if (this.path.length > 0) {
            this.setStatus(AGV_STATUS.MOVING_TO_PICK);
            this.movePhase = MOVE_PHASE.ROTATING;
        } else {
            this.setStatus(AGV_STATUS.CHARGING);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════
    // Physics & Animation Helpers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Apply trapezoid motion profile
     */
    applyMotion(deltaTime) {
        // Smooth acceleration/deceleration
        if (this.speed < this.targetSpeed) {
            this.speed = Math.min(this.speed + MOTION.ACCELERATION * deltaTime, this.targetSpeed);
        } else if (this.speed > this.targetSpeed) {
            this.speed = Math.max(this.speed - MOTION.DECELERATION * deltaTime, this.targetSpeed);
        }

        // Apply very small deadband
        if (this.speed < 0.01) {
            this.speed = 0;
        }
    }

    /**
     * Move forward in current facing direction
     */
    moveForward(deltaTime) {
        const moveDistance = this.speed * deltaTime;
        this.position.x += Math.sin(this.rotation) * moveDistance;
        this.position.z += Math.cos(this.rotation) * moveDistance;
    }

    /**
     * Normalize rotation to [-PI, PI]
     */
    normalizeRotation() {
        while (this.rotation > Math.PI) this.rotation -= Math.PI * 2;
        while (this.rotation < -Math.PI) this.rotation += Math.PI * 2;
    }

    /**
     * Update fork height animation
     */
    updateForks(deltaTime) {
        const forkDiff = this.targetForkHeight - this.forkHeight;
        if (Math.abs(forkDiff) > 0.01) {
            const step = Math.sign(forkDiff) * Math.min(Math.abs(forkDiff), MOTION.FORK_SPEED * deltaTime);
            this.forkHeight += step;
        }
    }

    /**
     * Update visual elements (LEDs, wheels, etc.)
     */
    updateVisuals(deltaTime) {
        // Rotate wheels based on speed
        if (this.wheels.length > 0) {
            const wheelRotation = this.speed * deltaTime * 5;
            this.wheels.forEach(wheel => {
                wheel.rotation.x += wheelRotation;
            });
        }

        // Update status LED
        if (this.statusLED) {
            const color = STATUS_COLORS[this.status] || 0x20c997;
            this.statusLED.material.color.setHex(color);
            this.statusLED.material.emissive.setHex(color);

            // Pulse based on status
            let pulseSpeed = 0.003;
            if (this.status === AGV_STATUS.MOVING_TO_PICK || this.status === AGV_STATUS.MOVING_TO_DROP) {
                pulseSpeed = 0.008;
            }
            if (this.status === AGV_STATUS.LOADING || this.status === AGV_STATUS.UNLOADING) {
                pulseSpeed = 0.005;
            }
            
            const pulse = Math.sin(Date.now() * pulseSpeed) * 0.3 + 0.7;
            this.statusLED.material.emissiveIntensity = pulse;
        }
    }

    /**
     * Update cargo visual when carrying load
     */
    updateCargoVisual() {
        if (this.isCarryingLoad && !this.cargoMesh && this.model) {
            // Create cargo visual
            const cargoGeometry = new THREE.BoxGeometry(0.8, 0.4, 0.6);
            const cargoMaterial = new THREE.MeshStandardMaterial({
                color: 0x8B4513,
                roughness: 0.7
            });
            this.cargoMesh = new THREE.Mesh(cargoGeometry, cargoMaterial);
            this.cargoMesh.position.set(0.8, this.forkHeight + 0.2, 0);
            this.cargoMesh.castShadow = true;
            this.model.add(this.cargoMesh);
        } else if (!this.isCarryingLoad && this.cargoMesh && this.model) {
            // Remove cargo visual
            this.model.remove(this.cargoMesh);
            this.cargoMesh.geometry.dispose();
            this.cargoMesh.material.dispose();
            this.cargoMesh = null;
        }
        
        // Update cargo position based on fork height
        if (this.cargoMesh) {
            this.cargoMesh.position.y = this.forkHeight + 0.2;
        }
    }

    /**
     * Update battery level
     */
    updateBattery(deltaTime) {
        if (this.status === AGV_STATUS.CHARGING) {
            this.battery = Math.min(100, this.battery + deltaTime * 8);
        } else if (this.speed > 0.1) {
            this.battery = Math.max(0, this.battery - deltaTime * 0.02);
        }

        // Low battery - go to charging
        if (this.battery < 15 && this.status === AGV_STATUS.IDLE && !this.currentTask) {
            this.goToCharging();
        }
    }

    /**
     * Set AGV status with logging
     */
    setStatus(status) {
        if (status !== this.status) {
            this.previousStatus = this.status;
            this.status = status;
            console.log(`🤖 ${this.id}: ${this.previousStatus} → ${status}`);
        }
    }

    /**
     * Get AGV info for UI
     */
    getInfo() {
        return {
            id: this.id,
            status: this.status,
            battery: Math.round(this.battery),
            position: { x: this.position.x.toFixed(2), z: this.position.z.toFixed(2) },
            speed: this.speed.toFixed(2),
            isCarryingLoad: this.isCarryingLoad,
            forkHeight: this.forkHeight.toFixed(2),
            tasksCompleted: this.tasksCompleted,
            currentTask: this.currentTask ? this.currentTask.type : null
        };
    }

    /**
     * Check if AGV is available for new task
     */
    isAvailable() {
        return this.status === AGV_STATUS.IDLE && 
               !this.currentTask && 
               this.battery > 20;
    }
}

/**
 * Create AGV fleet
 * @param {THREE.Scene} scene - The Three.js scene
 * @returns {Array<AGV>} Array of AGV objects
 */
function createAGVs(scene) {
    const agvs = [];

    // Initial positions for 3 AGVs with varied starting states
    const initialPositions = [
        { id: 'AGV-001', pos: new THREE.Vector3(-20, 0.15, -10), status: AGV_STATUS.CHARGING, battery: 25 },
        { id: 'AGV-002', pos: new THREE.Vector3(3, 0.15, 0), status: AGV_STATUS.IDLE, battery: 85 },
        { id: 'AGV-003', pos: new THREE.Vector3(-3, 0.15, 8), status: AGV_STATUS.IDLE, battery: 70 }
    ];

    initialPositions.forEach((config, index) => {
        const agv = new AGV(config.id, config.pos, config.status);
        agv.battery = config.battery;
        agv.model = createAGVModel(agv);
        agv.model.position.copy(config.pos);
        scene.add(agv.model);
        
        // Stagger mission start times for visual variety
        if (config.status === AGV_STATUS.IDLE) {
            agv.waitTime = index * 2 + 1;
        }
        
        agvs.push(agv);
    });

    console.log(`✓ Created ${agvs.length} AGVs with realistic motion system`);
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
