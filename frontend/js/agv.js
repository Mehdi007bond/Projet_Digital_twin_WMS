/**
 * Digital Twin WMS - AGV (Automated Guided Vehicle)
 * FSM + Navigation grid path following
 */

// ═══════════════════════════════════════════════════════════════════════════
// AGV Status
// ═══════════════════════════════════════════════════════════════════════════

const AGV_STATUS = {
    IDLE: 'idle',
    READY: 'ready',
    MOVING: 'moving',
    MOVING_TO_PICK: 'moving_to_pick',
    MOVING_TO_DROP: 'moving_to_drop',
    LOADING: 'loading',
    UNLOADING: 'unloading',
    CHARGING: 'charging',
    ERROR: 'error'
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
    POSITION_TOLERANCE: 0.1,
    ROTATION_TOLERANCE: 0.05,
    LOADING_TIME: 1.5,
    WAYPOINT_TOLERANCE: 0.2
};

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

        this.waitTime = 0;
        this.operationTime = 0;

        this.model = null;
        this.statusLED = null;
        this.wheels = [];

        this.cargoStockItem = null;
    }

    assignTask(task, navGrid) {
        this.currentTask = task;
        task.start();

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
            case AGV_STATUS.ERROR:
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

        const needsRotation = Math.abs(rotationDiff) > MOTION.ROTATION_TOLERANCE;

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

            this.moveForward(deltaTime);
        }
    }

    updateLoading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;

        if (this.operationTime <= 0) {
            const navGrid = getNavigationGrid();
            if (this.currentTask && navGrid) {
                const pickupNode = navGrid.getNode(this.currentTask.pickupNodeId);
                if (pickupNode) {
                    this.cargoStockItem = pickupNode.stockItem || null;
                    if (pickupNode.stockItem && pickupNode.stockItem.model) {
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
            const navGrid = getNavigationGrid();
            if (this.currentTask && navGrid) {
                const dropoffNode = navGrid.getNode(this.currentTask.dropoffNodeId);
                if (dropoffNode && this.cargoStockItem) {
                    if (this.cargoStockItem.model) {
                        this.cargoStockItem.model.visible = true;
                        this.cargoStockItem.model.position.set(dropoffNode.x, 0.5, dropoffNode.z);
                    }
                    dropoffNode.itemId = this.cargoStockItem.id;
                    dropoffNode.stockItem = this.cargoStockItem;
                }
            }

            this.cargoStockItem = null;
            this.completeTask();
        }
    }

    completeTask() {
        if (this.currentTask) {
            this.currentTask.complete();
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
            const color = this.status === AGV_STATUS.CHARGING ? 0xf59f00 :
                (this.status === AGV_STATUS.LOADING || this.status === AGV_STATUS.UNLOADING) ? 0xe67e22 :
                (this.status === AGV_STATUS.MOVING_TO_PICK || this.status === AGV_STATUS.MOVING_TO_DROP) ? 0x4361ee : 0x20c997;
            this.statusLED.material.color.setHex(color);
            this.statusLED.material.emissive.setHex(color);
        }

        if (this.model) {
            this.model.position.copy(this.position);
            this.model.rotation.y = this.rotation;
        }
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

    return agvs;
}

function createAGVModel(agv) {
    const agvGroup = new THREE.Group();
    agvGroup.name = `AGV_${agv.id}`;

    const chassisMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.5,
        metalness: 0.7
    });

    const chassisGeometry = new THREE.BoxGeometry(1.2, 0.3, 0.8);
    const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    agvGroup.add(chassis);

    const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x20c997,
        emissive: 0x20c997,
        emissiveIntensity: 1,
        roughness: 0.2,
        metalness: 0.8
    });
    const ledGeometry = new THREE.BoxGeometry(0.8, 0.05, 0.6);
    const led = new THREE.Mesh(ledGeometry, ledMaterial);
    led.position.set(0, 0.2, 0);
    agvGroup.add(led);
    agv.statusLED = led;

    return agvGroup;
}

function updateAGVs(agvs, deltaTime) {
    agvs.forEach(agv => agv.update(deltaTime));
}

function getAGVById(agvs, id) {
    return agvs.find(agv => agv.id === id);
}
class AGV {
    constructor(x, z, scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        
        // Corps du robot
        const bodyGeometry = new THREE.BoxGeometry(1, 0.6, 1.5);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.5;
        this.mesh.add(body);
        
        // Tête (pour indiquer la direction)
        const headGeometry = new THREE.ConeGeometry(0.3, 0.5, 8);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.set(0, 0.8, 0.9);
        this.mesh.add(head);
        
        this.mesh.position.set(x, 0.8, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
        
        // Propriétés
        this.state = 'IDLE'; // IDLE, MOVING, LOADING, UNLOADING
        this.position = new THREE.Vector3(x, 0.8, z);
        this.targetPosition = null;
        this.speed = 2.0;
        this.cargo = null;
        this.rotation = 0;
        this.targetRotation = 0;
        this.loadingTimer = 0;
        this.maxLoadingTime = 2.0;
    }
    
    lerp(start, end, t) {
        return start + (end - start) * Math.min(1, Math.max(0, t));
    }
    
    angleLerp(fromAngle, toAngle, t) {
        let delta = toAngle - fromAngle;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        return fromAngle + delta * Math.min(1, Math.max(0, t));
    }
    
    update(deltaTime) {
        // Mise à jour du maillage 3D
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        
        if (this.state === 'MOVING' && this.targetPosition) {
            // Calcul de la direction
            const direction = new THREE.Vector3()
                .subVectors(this.targetPosition, this.position)
                .normalize();
            
            const distance = this.position.distanceTo(this.targetPosition);
            
            // Rotation vers la cible
            this.targetRotation = Math.atan2(direction.x, direction.z);
            this.rotation = this.angleLerp(this.rotation, this.targetRotation, deltaTime * 5);
            
            // Avancement
            if (distance > 0.1) {
                this.position.add(direction.multiplyScalar(this.speed * deltaTime));
            } else {
                this.position.copy(this.targetPosition);
                this.state = 'IDLE';
                this.targetPosition = null;
            }
        }
        
        if (this.state === 'LOADING' || this.state === 'UNLOADING') {
            this.loadingTimer -= deltaTime;
            if (this.loadingTimer <= 0) {
                this.state = 'IDLE';
            }
        }
        
        // Attachement du cargo
        if (this.cargo) {
            this.cargo.position.copy(this.mesh.position);
            this.cargo.position.y += 0.6;
        }
    }
    
    goTo(targetPosition) {
        this.targetPosition = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        this.state = 'MOVING';
    }
    
    moveTo(targetPosition) {
        return new Promise((resolve) => {
            this.state = 'MOVING';
            const targetWithHeight = new THREE.Vector3(targetPosition.x, 0.8, targetPosition.z);
            this.targetPosition = targetWithHeight.clone();

            const checkMovement = () => {
                if (this.state === 'IDLE' && this.mesh.position.distanceTo(targetWithHeight) < 0.1) {
                    resolve();
                } else {
                    requestAnimationFrame(checkMovement);
                }
            };
            
            requestAnimationFrame(checkMovement);
        });
    }

    rotateToFace(targetObject) {
        return new Promise((resolve) => {
            this.state = 'ROTATING';
            const direction = new THREE.Vector3()
                .subVectors(targetObject.position, this.mesh.position)
                .normalize();
            this.targetRotation = Math.atan2(direction.x, direction.z);

            const checkRotation = () => {
                const diff = Math.abs(this.targetRotation - this.rotation);
                if (diff < 0.05) {
                    this.state = 'IDLE';
                    resolve();
                } else {
                    requestAnimationFrame(checkRotation);
                }
            };
            
            requestAnimationFrame(checkRotation);
        });
    }

    animateLoading() {
        return new Promise((resolve) => {
            this.state = 'LOADING';
            setTimeout(() => {
                this.state = 'IDLE';
                resolve();
            }, 2000);
        });
    }

    attachCargo(boxMesh) {
        this.cargo = boxMesh;
        boxMesh.visible = false;
    }

    detachCargo(scene) {
        if (this.cargo) {
            this.cargo.visible = true;
            this.cargo.position.copy(this.mesh.position);
            this.cargo.position.y = 0.3;
            this.cargo = null;
        }
    }

    animateUnloading() {
        return new Promise((resolve) => {
            this.state = 'UNLOADING';
            setTimeout(() => {
                this.state = 'IDLE';
                resolve();
            }, 2000);
        });
    }

    returnToIdle() {
        return new Promise((resolve) => {
            this.state = 'IDLE';
            resolve();
        });
    }

    isAvailable() {
        return this.state === 'IDLE' && !this.cargo;
    }
    
    pickup(boxMesh) {
        this.state = 'LOADING';
        this.loadingTimer = this.maxLoadingTime;
        this.cargo = boxMesh;
        boxMesh.visible = false;
    }
    
    drop() {
        this.state = 'UNLOADING';
        this.loadingTimer = this.maxLoadingTime;
        if (this.cargo) {
            this.cargo.visible = true;
            this.cargo.position.copy(this.position);
            this.cargo.position.y = 0.5;
            this.cargo = null;
        }
    }
}
    
    lerp(start, end, t) {
        return start + (end - start) * Math.min(1, Math.max(0, t));
    }
    
    angleLerp(fromAngle, toAngle, t) {
        let delta = toAngle - fromAngle;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        return fromAngle + delta * Math.min(1, Math.max(0, t));
    }
    
    update(deltaTime) {
        // Mise à jour du maillage 3D
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        
        if (this.state === 'MOVING' && this.targetPosition) {
            // Calcul de la direction
            const direction = new THREE.Vector3()
                .subVectors(this.targetPosition, this.position)
                .normalize();
            
            const distance = this.position.distanceTo(this.targetPosition);
            
            // Rotation vers la cible
            this.targetRotation = Math.atan2(direction.x, direction.z);
            this.rotation = this.angleLerp(this.rotation, this.targetRotation, deltaTime * 5);
            
            // Avancement
            if (distance > 0.1) {
                this.position.add(direction.multiplyScalar(this.speed * deltaTime));
            } else {
                this.position.copy(this.targetPosition);
                this.state = 'IDLE';
                this.targetPosition = null;
            }
        }
        
        if (this.state === 'LOADING' || this.state === 'UNLOADING') {
            this.loadingTimer -= deltaTime;
            if (this.loadingTimer <= 0) {
                this.state = 'IDLE';
            }
        }
        
        // Attachement du cargo
        if (this.cargo) {
            this.cargo.position.copy(this.mesh.position);
            this.cargo.position.y += 0.6;
        }
    }
    
    goTo(targetPosition) {
        this.targetPosition = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        this.state = 'MOVING';
    }
    
    pickup(boxMesh) {
        this.state = 'LOADING';
        this.loadingTimer = this.maxLoadingTime;
        this.cargo = boxMesh;
        boxMesh.visible = false;
    }
    
    drop() {
        this.state = 'UNLOADING';
        this.loadingTimer = this.maxLoadingTime;
        if (this.cargo) {
            this.cargo.visible = true;
            this.cargo.position.copy(this.position);
            this.cargo.position.y = 0.3;
            this.cargo = null;
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
     * Simplified: AGV follows waypoints strictly on the grid lines
     */
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

        // Check if we reached the waypoint
        if (distance < MOTION.WAYPOINT_TOLERANCE) {
            // Snap to waypoint position to stay on grid
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

        // Calculate target rotation to face next waypoint
        this.targetRotation = Math.atan2(dx, dz);

        // Get normalized rotation difference
        let rotationDiff = this.targetRotation - this.rotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        const needsRotation = Math.abs(rotationDiff) > MOTION.ROTATION_TOLERANCE;

        if (needsRotation) {
            // ROTATING phase - stop and rotate to face target
            // Important: AGV must rotate before moving (realistic differential drive)
            this.movePhase = MOVE_PHASE.ROTATING;
            this.targetSpeed = 0;
            this.speed = 0;
            
            // Smooth rotation using frame-independent deltaTime
            const rotationStep = Math.sign(rotationDiff) * 
                Math.min(Math.abs(rotationDiff), MOTION.ROTATION_SPEED * deltaTime);
            this.rotation += rotationStep;
            this.normalizeRotation();
        } else {
            // TRAVELING phase - move straight toward waypoint
            this.movePhase = MOVE_PHASE.TRAVELING;
            
            // Speed based on distance - slow down when approaching
            const isLastWaypoint = this.currentWaypointIndex === this.path.length - 1;
            if (isLastWaypoint && distance < MOTION.APPROACH_DISTANCE) {
                this.targetSpeed = MOTION.APPROACH_SPEED;
            } else {
                this.targetSpeed = MOTION.MAX_SPEED;
            }
            
            // Apply motion profile (smooth acceleration/deceleration)
            this.applyMotion(deltaTime);
            
            // Move in a straight line toward waypoint (on the grid line)
            this.moveForward(deltaTime);
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
     * Apply smooth motion profile with acceleration/deceleration
     * Uses deltaTime for frame-independent smooth movement
     */
    applyMotion(deltaTime) {
        // Smooth acceleration/deceleration using exponential smoothing
        const speedDifference = this.targetSpeed - this.speed;
        
        if (Math.abs(speedDifference) > 0.001) {
            // Use different acceleration/deceleration rates for smooth feel
            const accelRate = speedDifference > 0 ? MOTION.ACCELERATION : MOTION.DECELERATION;
            this.speed += speedDifference * accelRate * deltaTime;
        } else {
            this.speed = this.targetSpeed;
        }

        // Apply very small deadband to stop speed ripple
        if (Math.abs(this.speed) < 0.01) {
            this.speed = 0;
        }
    }

    /**
     * Move forward in current facing direction
     * Using frame-independent movement with deltaTime
     */
    moveForward(deltaTime) {
        // Calculate distance based on current speed and frame time
        const moveDistance = this.speed * deltaTime;
        
        // Move in direction of current rotation
        // sin/cos for correct XZ plane movement in Three.js
        this.position.x += Math.sin(this.rotation) * moveDistance;
        this.position.z += Math.cos(this.rotation) * moveDistance;
        
        // Ensure small movements don't accumulate precision errors
        const POSITION_PRECISION = 0.001;
        this.position.x = Math.round(this.position.x / POSITION_PRECISION) * POSITION_PRECISION;
        this.position.z = Math.round(this.position.z / POSITION_PRECISION) * POSITION_PRECISION;
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
 * Lerp (Linear Interpolation) - smooth position transition
 */
function lerp(start, end, t) {
    return start + (end - start) * Math.max(0, Math.min(1, t));
}

/**
 * Slerp (Spherical Linear Interpolation) for rotations
 */
function angleLerp(fromAngle, toAngle, t) {
    let diff = toAngle - fromAngle;
    
    // Normalize angle difference to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    
    return fromAngle + diff * Math.max(0, Math.min(1, t));
}

/**
 * Update all AGVs with smooth interpolation
 */
function updateAGVs(agvs, deltaTime) {
    agvs.forEach(agv => {
        // Store previous position for interpolation
        const prevPosition = { x: agv.position.x, z: agv.position.z };
        const prevRotation = agv.rotation;
        
        // Update AGV state machine
        agv.update(deltaTime);
        
        // Update model with smooth interpolation
        if (agv.model) {
            const interpolationFactor = Math.min(1, deltaTime * 10); // Smooth factor
            
            // Smooth position update (Lerp)
            agv.model.position.x = lerp(prevPosition.x, agv.position.x, interpolationFactor);
            agv.model.position.z = lerp(prevPosition.z, agv.position.z, interpolationFactor);
            
            // Smooth rotation update (Angular Lerp)
            agv.model.rotation.y = angleLerp(prevRotation, agv.rotation, interpolationFactor);
        }
    });
}

/**
 * Get AGV by ID
 */
function getAGVById(agvs, id) {
    return agvs.find(agv => agv.id === id);
}
