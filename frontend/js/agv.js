/**
 * Digital Twin WMS - AGV (Automated Guided Vehicle)
 * FSM-based control with navigation grid integration
 */

// AGV Status Constants
const AGV_STATUS = {
    IDLE: 'idle',
    MOVING_TO_PICK: 'moving_to_pick',
    LOADING: 'loading',
    MOVING_TO_DROP: 'moving_to_drop',
    UNLOADING: 'unloading',
    CHARGING: 'charging'
};

const MOVE_PHASE = {
    ROTATING: 'rotating',
    TRAVELING: 'traveling',
    ARRIVED: 'arrived'
};

const MOTION = {
    MAX_SPEED: 2.0,
    APPROACH_SPEED: 0.5,
    ACCELERATION: 1.5,
    DECELERATION: 2.0,
    ROTATION_SPEED: 2.5,
    APPROACH_DISTANCE: 1.0,
    WAYPOINT_TOLERANCE: 0.2,
    LOADING_TIME: 1.5
};

const STATUS_COLORS = {
    idle: 0x20c997,
    moving_to_pick: 0x4361ee,
    moving_to_drop: 0x4361ee,
    loading: 0xe67e22,
    unloading: 0xe67e22,
    charging: 0xf59f00
};

// AGV Class
class AGV {
    constructor(id, position, status = AGV_STATUS.IDLE) {
        this.id = id;
        this.position = position.clone();
        this.rotation = 0;
        this.targetRotation = 0;
        this.status = status;
        this.previousStatus = status;

        this.battery = Math.random() * 40 + 45;
        this.speed = 0;
        this.targetSpeed = 0;
        this.movePhase = MOVE_PHASE.ARRIVED;

        this.currentTask = null;
        this.path = [];
        this.pathNodeIds = [];
        this.currentWaypointIndex = 0;

        this.operationTime = 0;
        this.model = null;
        this.statusLED = null;
        this.wheels = [];
    }

    assignTask(task, navGrid) {
        this.currentTask = task;
        if (task.start) task.start();

        const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
        const pickupNode = navGrid.getNode(task.pickupNodeId);

        if (!currentNode || !pickupNode) {
            console.error(`${this.id}: Cannot find nodes for task`);
            this.currentTask = null;
            return;
        }

        this.pathNodeIds = navGrid.findPath(currentNode.id, task.pickupNodeId);
        this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
        this.currentWaypointIndex = 0;

        if (this.path.length > 0) {
            this.setStatus(AGV_STATUS.MOVING_TO_PICK);
            this.movePhase = MOVE_PHASE.ROTATING;
        } else {
            this.setStatus(AGV_STATUS.LOADING);
            this.operationTime = MOTION.LOADING_TIME;
        }
    }

    update(deltaTime) {
        if (!this.model) return;

        switch (this.status) {
            case AGV_STATUS.IDLE:
                this.updateIdle(deltaTime);
                break;
            case AGV_STATUS.MOVING_TO_PICK:
            case AGV_STATUS.MOVING_TO_DROP:
                this.updateMoving(deltaTime);
                if (this.movePhase === MOVE_PHASE.ARRIVED) {
                    if (this.status === AGV_STATUS.MOVING_TO_PICK) {
                        this.setStatus(AGV_STATUS.LOADING);
                        this.operationTime = MOTION.LOADING_TIME;
                    } else {
                        this.setStatus(AGV_STATUS.UNLOADING);
                        this.operationTime = MOTION.LOADING_TIME;
                    }
                }
                break;
            case AGV_STATUS.LOADING:
                this.updateLoading(deltaTime);
                break;
            case AGV_STATUS.UNLOADING:
                this.updateUnloading(deltaTime);
                break;
            case AGV_STATUS.CHARGING:
                this.updateCharging(deltaTime);
                break;
        }

        this.applyMotion(deltaTime);
        this.updateVisuals(deltaTime);
        this.updateBattery(deltaTime);
    }

    updateIdle(deltaTime) {
        this.targetSpeed = 0;
        this.movePhase = MOVE_PHASE.ARRIVED;

        if (this.battery < 20 && !this.currentTask) {
            this.goToCharging();
        }
    }

    updateMoving(deltaTime) {
        if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) {
            this.movePhase = MOVE_PHASE.ARRIVED;
            this.targetSpeed = 0;
            this.speed = 0;
            return;
        }

        const target = this.path[this.currentWaypointIndex];
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < MOTION.WAYPOINT_TOLERANCE) {
            this.position.x = target.x;
            this.position.z = target.z;
            this.currentWaypointIndex++;
            this.speed = 0;

            if (this.currentWaypointIndex >= this.path.length) {
                this.movePhase = MOVE_PHASE.ARRIVED;
                this.targetSpeed = 0;
            } else {
                this.movePhase = MOVE_PHASE.ROTATING;
            }
            return;
        }

        this.targetRotation = Math.atan2(dx, dz);
        let rotationDiff = this.targetRotation - this.rotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        const needsRotation = Math.abs(rotationDiff) > 0.05;

        if (needsRotation) {
            this.movePhase = MOVE_PHASE.ROTATING;
            this.targetSpeed = 0;
            this.speed = 0;

            const rotationStep = Math.sign(rotationDiff) *
                Math.min(Math.abs(rotationDiff), MOTION.ROTATION_SPEED * deltaTime);
            this.rotation += rotationStep;
            this.normalizeRotation();
        } else {
            this.movePhase = MOVE_PHASE.TRAVELING;
            const isLastWaypoint = this.currentWaypointIndex === this.path.length - 1;
            if (isLastWaypoint && distance < MOTION.APPROACH_DISTANCE) {
                this.targetSpeed = MOTION.APPROACH_SPEED;
            } else {
                this.targetSpeed = MOTION.MAX_SPEED;
            }
        }
    }

    updateLoading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;

        if (this.operationTime <= 0) {
            const navGrid = getNavigationGrid();
            if (this.currentTask && navGrid) {
                const pickupNode = navGrid.getNode(this.currentTask.pickupNodeId);
                if (pickupNode && pickupNode.stockItem) {
                    if (pickupNode.stockItem.model) {
                        pickupNode.stockItem.model.visible = false;
                    }
                    pickupNode.itemId = null;
                    pickupNode.stockItem = null;
                }
            }
            this.startDropoffPhase();
        }
    }

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
            this.setStatus(AGV_STATUS.UNLOADING);
            this.operationTime = MOTION.LOADING_TIME;
        }
    }

    updateUnloading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;

        if (this.operationTime <= 0) {
            this.completeTask();
        }
    }

    completeTask() {
        if (this.currentTask) {
            if (this.currentTask.complete) this.currentTask.complete();
        }
        this.currentTask = null;
        this.path = [];
        this.pathNodeIds = [];
        this.currentWaypointIndex = 0;
        this.setStatus(AGV_STATUS.IDLE);
    }

    updateCharging(deltaTime) {
        this.targetSpeed = 0;
        if (this.battery >= 95) {
            this.setStatus(AGV_STATUS.IDLE);
        }
    }

    goToCharging() {
        const navGrid = getNavigationGrid();
        if (!navGrid) return;

        const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
        const chargingNode = navGrid.findAvailableChargingNode();
        if (!currentNode || !chargingNode) return;

        this.pathNodeIds = navGrid.findPath(currentNode.id, chargingNode.id);
        this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
        this.currentWaypointIndex = 0;

        this.currentTask = { type: 'charging' };

        if (this.path.length > 0) {
            this.setStatus(AGV_STATUS.MOVING_TO_PICK);
            this.movePhase = MOVE_PHASE.ROTATING;
        } else {
            this.setStatus(AGV_STATUS.CHARGING);
        }
    }

    applyMotion(deltaTime) {
        const speedDifference = this.targetSpeed - this.speed;
        if (Math.abs(speedDifference) > 0.001) {
            const accelRate = speedDifference > 0 ? MOTION.ACCELERATION : MOTION.DECELERATION;
            this.speed += speedDifference * accelRate * deltaTime;
        } else {
            this.speed = this.targetSpeed;
        }

        if (Math.abs(this.speed) < 0.01) {
            this.speed = 0;
        }
    }

    moveForward(deltaTime) {
        const moveDistance = this.speed * deltaTime;
        this.position.x += Math.sin(this.rotation) * moveDistance;
        this.position.z += Math.cos(this.rotation) * moveDistance;
    }

    normalizeRotation() {
        while (this.rotation > Math.PI) this.rotation -= Math.PI * 2;
        while (this.rotation < -Math.PI) this.rotation += Math.PI * 2;
    }

    updateVisuals(deltaTime) {
        if (this.wheels.length > 0) {
            const wheelRotation = this.speed * deltaTime * 5;
            this.wheels.forEach(wheel => {
                wheel.rotation.x += wheelRotation;
            });
        }

        if (this.statusLED) {
            const color = STATUS_COLORS[this.status] || 0x20c997;
            this.statusLED.material.color.setHex(color);
            this.statusLED.material.emissive.setHex(color);
        }

        if (this.model) {
            this.model.position.copy(this.position);
            this.model.rotation.y = this.rotation;
        }

        this.moveForward(deltaTime);
    }

    updateBattery(deltaTime) {
        if (this.status === AGV_STATUS.CHARGING) {
            this.battery = Math.min(100, this.battery + deltaTime * 8);
        } else if (this.speed > 0.1) {
            this.battery = Math.max(0, this.battery - deltaTime * 0.02);
        }
    }

    setStatus(status) {
        if (status !== this.status) {
            this.previousStatus = this.status;
            this.status = status;
        }
    }

    isAvailable() {
        return this.status === AGV_STATUS.IDLE && !this.currentTask && this.battery > 20;
    }
}

// Create AGV Fleet
function createAGVs(scene) {
    const agvs = [];
    const initialPositions = [
        { id: 'AGV-001', pos: new THREE.Vector3(-20, 0.3, -10), status: AGV_STATUS.CHARGING, battery: 25 },
        { id: 'AGV-002', pos: new THREE.Vector3(3, 0.3, 0), status: AGV_STATUS.IDLE, battery: 85 },
        { id: 'AGV-003', pos: new THREE.Vector3(-3, 0.3, 8), status: AGV_STATUS.IDLE, battery: 70 }
    ];

    initialPositions.forEach((config, index) => {
        const agv = new AGV(config.id, config.pos, config.status);
        agv.battery = config.battery;
        agv.model = createAGVModel(agv);
        agv.model.position.copy(config.pos);
        scene.add(agv.model);
        agvs.push(agv);
    });

    console.log(`✓ Created ${agvs.length} AGVs`);
    return agvs;
}

// Create AGV 3D Model
function createAGVModel(agv) {
    const agvGroup = new THREE.Group();
    agvGroup.name = `AGV_${agv.id}`;

    const chassisWidth = 1.2;
    const chassisDepth = 0.8;
    const chassisHeight = 0.3;

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

    agv.wheels = createWheels(agvGroup, chassisWidth, chassisDepth, chassisHeight);
    createForkTines(agvGroup, chassisWidth, chassisDepth, chassisHeight);
    createLidarDome(agvGroup, chassisHeight);
    createSensors(agvGroup, chassisWidth, chassisDepth, chassisHeight);
    agv.statusLED = createStatusLED(agvGroup, chassisHeight, agv.status);
    createLights(agvGroup, chassisWidth, chassisDepth, chassisHeight);
    createAGVLabel(agvGroup, agv.id, chassisHeight);

    return agvGroup;
}

// Create Wheels
function createWheels(group, chassisWidth, chassisDepth, chassisHeight) {
    const wheels = [];
    const wheelRadius = 0.12;
    const wheelWidth = 0.08;

    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.2
    });

    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 8);

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

// Create Fork Tines
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

    const spacing = 0.4;
    [-spacing / 2, spacing / 2].forEach(z => {
        const tine = new THREE.Mesh(tineGeometry, forkMaterial);
        tine.position.set(chassisWidth / 2 + tineLength / 2, -chassisHeight / 2 + tineHeight / 2, z);
        tine.castShadow = true;
        group.add(tine);
    });

    const carriageGeometry = new THREE.BoxGeometry(0.1, chassisHeight * 0.8, chassisDepth * 0.6);
    const carriage = new THREE.Mesh(carriageGeometry, forkMaterial);
    carriage.position.set(chassisWidth / 2 - 0.05, 0, 0);
    carriage.castShadow = true;
    group.add(carriage);
}

// Create LIDAR Dome
function createLidarDome(group, chassisHeight) {
    const lidarMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.3,
        metalness: 0.8,
        transparent: true,
        opacity: 0.8
    });

    const lidarGeometry = new THREE.SphereGeometry(0.08, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const lidar = new THREE.Mesh(lidarGeometry, lidarMaterial);
    lidar.position.set(0, chassisHeight / 2 + 0.08, 0);
    group.add(lidar);

    const sensorGeometry = new THREE.BoxGeometry(0.12, 0.02, 0.02);
    const sensorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
    sensor.position.set(0, chassisHeight / 2 + 0.05, 0);
    group.add(sensor);
}

// Create Sensors
function createSensors(group, chassisWidth, chassisDepth, chassisHeight) {
    const sensorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sensorGeometry = new THREE.SphereGeometry(0.03, 4, 4);

    [-0.2, 0, 0.2].forEach(z => {
        const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
        sensor.position.set(chassisWidth / 2, 0, z);
        group.add(sensor);
    });

    [-0.2, 0.2].forEach(z => {
        const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
        sensor.position.set(-chassisWidth / 2, 0, z);
        group.add(sensor);
    });

    [-chassisDepth / 2, chassisDepth / 2].forEach(z => {
        const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
        sensor.position.set(0, 0, z);
        group.add(sensor);
    });
}

// Create Status LED
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

// Create Lights
function createLights(group, chassisWidth, chassisDepth, chassisHeight) {
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headlightGeometry = new THREE.CircleGeometry(0.04, 8);

    [-0.15, 0.15].forEach(z => {
        const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        headlight.position.set(chassisWidth / 2 + 0.01, -chassisHeight / 4, z);
        headlight.rotation.y = -Math.PI / 2;
        group.add(headlight);
    });

    const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const taillightGeometry = new THREE.CircleGeometry(0.04, 8);

    [-0.15, 0.15].forEach(z => {
        const taillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        taillight.position.set(-chassisWidth / 2 - 0.01, -chassisHeight / 4, z);
        taillight.rotation.y = Math.PI / 2;
        group.add(taillight);
    });
}

// Create AGV Label
function createAGVLabel(group, id, chassisHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 256, 128);
    
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

// Update All AGVs
function updateAGVs(agvs, deltaTime) {
    agvs.forEach(agv => agv.update(deltaTime));
}

// Get AGV by ID
function getAGVById(agvs, id) {
    return agvs.find(agv => agv.id === id);
}
