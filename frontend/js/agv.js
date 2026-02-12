/**
 * Digital Twin WMS - AGV (Automated Guided Vehicle)
 * Unified Class: FSM + Promise-based Navigation
 */

// ═══════════════════════════════════════════════════════════════════════════
// AGV Status & Constants
// ═══════════════════════════════════════════════════════════════════════════

const AGV_STATUS = {
    IDLE: 'idle',
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
    WAYPOINT_TOLERANCE: 0.2,
    ROTATION_TOLERANCE: 0.05,
    LOADING_TIME: 1.5,
    FORK_SPEED: 1.0,
    FORK_MAX_HEIGHT: 0.5
};

const STATUS_COLORS = {
    'idle': 0x20c997,
    'moving': 0x4361ee,
    'moving_to_pick': 0x4361ee,
    'moving_to_drop': 0x4361ee,
    'loading': 0xe67e22,
    'unloading': 0xe67e22,
    'charging': 0xf59f00,
    'error': 0xfa5252
};

class AGV {
    constructor(id, position, status = AGV_STATUS.IDLE) {
        this.id = id;
        this.position = position.clone();
        this.rotation = 0;
        this.targetRotation = 0;
        this.status = status;
        this.previousStatus = status;
        this.externalControl = false;

        // Physical properties
        this.battery = Math.random() * 40 + 45;
        this.speed = 0;
        this.targetSpeed = 0;
        this.forkHeight = 0;
        this.targetForkHeight = 0;
        
        // Navigation state
        this.movePhase = MOVE_PHASE.ARRIVED;
        this.currentTask = null;
        this.path = [];
        this.pathNodeIds = [];
        this.currentWaypointIndex = 0;
        this.totalDistanceTraveled = 0;
        this.operationTime = 0;

        // Visual components
        this.model = null;
        this.statusLED = null;
        this.wheels = [];
        this.cargoMesh = null;
        this.isCarryingLoad = false;
        
        // Promise resolvers for direct control (Demo mode)
        this.moveResolve = null;
        this.rotateResolve = null;
        this.loadingResolve = null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Task Manager Integration
    // ═══════════════════════════════════════════════════════════════════════

    assignTask(task, navGrid) {
        this.currentTask = task;
        task.start();

        const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
        
        // If it's a pick task, path to pickup
        if (task.pickupNodeId) {
            this.pathNodeIds = navGrid.findPath(currentNode.id, task.pickupNodeId);
            this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
            this.currentWaypointIndex = 0;

            if (this.path.length > 0) {
                this.setStatus(AGV_STATUS.MOVING_TO_PICK);
                this.movePhase = MOVE_PHASE.ROTATING;
            } else {
                // Already there
                this.setStatus(AGV_STATUS.LOADING);
                this.operationTime = MOTION.LOADING_TIME;
                this.targetForkHeight = MOTION.FORK_MAX_HEIGHT;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Direct Control (Promisified for Demo Mode)
    // ═══════════════════════════════════════════════════════════════════════

    moveTo(targetPosition) {
        return new Promise((resolve) => {
            this.moveResolve = resolve;
            // Create a simple straight path
            this.path = [new THREE.Vector3(targetPosition.x, this.position.y, targetPosition.z)];
            this.currentWaypointIndex = 0;
            this.setStatus(AGV_STATUS.MOVING);
            this.movePhase = MOVE_PHASE.ROTATING;
        });
    }

    rotateToFace(targetObject) {
        return new Promise((resolve) => {
            this.rotateResolve = resolve;
            const targetPos = targetObject.position || targetObject;
            const dx = targetPos.x - this.position.x;
            const dz = targetPos.z - this.position.z;
            this.targetRotation = Math.atan2(dx, dz);
            this.movePhase = MOVE_PHASE.ROTATING;
            // Force status to ensure update loop processes rotation
            if (this.status === AGV_STATUS.IDLE) this.status = AGV_STATUS.MOVING; 
        });
    }

    animateLoading() {
        return new Promise((resolve) => {
            this.loadingResolve = resolve;
            this.setStatus(AGV_STATUS.LOADING);
            this.operationTime = MOTION.LOADING_TIME;
            this.targetForkHeight = MOTION.FORK_MAX_HEIGHT;
        });
    }

    animateUnloading() {
        return new Promise((resolve) => {
            this.loadingResolve = resolve;
            this.setStatus(AGV_STATUS.UNLOADING);
            this.operationTime = MOTION.LOADING_TIME;
            this.targetForkHeight = 0;
        });
    }

    attachCargo(boxMesh) {
        this.isCarryingLoad = true;
        if(boxMesh) boxMesh.visible = false; // Hide original, show AGV internal cargo
        this.updateCargoVisual();
    }

    detachCargo(scene) {
        this.isCarryingLoad = false;
        this.updateCargoVisual();
        // Note: In a real app, we would respawn the boxMesh at the drop location
    }

    returnToIdle() {
        this.setStatus(AGV_STATUS.IDLE);
        return Promise.resolve();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Main Update Loop
    // ═══════════════════════════════════════════════════════════════════════

    update(deltaTime) {
        if (!this.model) return;

        if (this.externalControl) {
            this.targetSpeed = 0;
            this.speed = 0;
            this.updateVisuals(deltaTime);
            return;
        }

        switch (this.status) {
            case AGV_STATUS.IDLE:
                this.updateIdle(deltaTime);
                break;
            case AGV_STATUS.MOVING:
            case AGV_STATUS.MOVING_TO_PICK:
            case AGV_STATUS.MOVING_TO_DROP:
                this.updateMoving(deltaTime);
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
        this.updateForks(deltaTime);
        this.updateVisuals(deltaTime);
        this.updateBattery(deltaTime);
    }

    updateMoving(deltaTime) {
        // Handle pure rotation requests (rotateToFace)
        if (this.path.length === 0 && this.movePhase === MOVE_PHASE.ROTATING) {
             this.handleRotation(deltaTime);
             if (this.movePhase === MOVE_PHASE.ARRIVED) {
                 this.status = AGV_STATUS.IDLE;
                 if (this.rotateResolve) {
                     this.rotateResolve();
                     this.rotateResolve = null;
                 }
             }
             return;
        }

        if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) {
            this.movePhase = MOVE_PHASE.ARRIVED;
            this.targetSpeed = 0;
            this.speed = 0;
            
            // FSM Transitions
            if (this.status === AGV_STATUS.MOVING_TO_PICK) {
                this.setStatus(AGV_STATUS.LOADING);
                this.operationTime = MOTION.LOADING_TIME;
                this.targetForkHeight = MOTION.FORK_MAX_HEIGHT;
            } else if (this.status === AGV_STATUS.MOVING_TO_DROP) {
                this.setStatus(AGV_STATUS.UNLOADING);
                this.operationTime = MOTION.LOADING_TIME;
                this.targetForkHeight = 0;
            } else if (this.status === AGV_STATUS.MOVING && this.moveResolve) {
                // Direct move complete
                this.setStatus(AGV_STATUS.IDLE);
                this.moveResolve();
                this.moveResolve = null;
            }
            return;
        }

        const target = this.path[this.currentWaypointIndex];
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Check if reached waypoint
        if (distance < MOTION.WAYPOINT_TOLERANCE) {
            this.position.x = target.x;
            this.position.z = target.z;
            this.currentWaypointIndex++;
            
            if (this.currentWaypointIndex >= this.path.length) {
                this.movePhase = MOVE_PHASE.ARRIVED; // Will trigger stop next frame
            } else {
                this.movePhase = MOVE_PHASE.ROTATING; // Prepare for next leg
            }
            return;
        }

        // Calculate rotation
        this.targetRotation = Math.atan2(dx, dz);
        
        // Logic: Rotate THEN Move
        this.handleRotation(deltaTime);
        
        if (this.movePhase === MOVE_PHASE.TRAVELING) {
            // Speed logic
            const isLastWaypoint = this.currentWaypointIndex === this.path.length - 1;
            if (isLastWaypoint && distance < MOTION.APPROACH_DISTANCE) {
                this.targetSpeed = MOTION.APPROACH_SPEED;
            } else {
                this.targetSpeed = MOTION.MAX_SPEED;
            }
            this.moveForward(deltaTime);
        }
    }

    handleRotation(deltaTime) {
        let rotationDiff = this.targetRotation - this.rotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        if (Math.abs(rotationDiff) > MOTION.ROTATION_TOLERANCE) {
            this.movePhase = MOVE_PHASE.ROTATING;
            this.targetSpeed = 0;
            this.speed = 0;
            const rotationStep = Math.sign(rotationDiff) * Math.min(Math.abs(rotationDiff), MOTION.ROTATION_SPEED * deltaTime);
            this.rotation += rotationStep;
            this.normalizeRotation();
        } else {
            if (this.movePhase === MOVE_PHASE.ROTATING) {
                this.movePhase = MOVE_PHASE.TRAVELING; // Rotation done, start moving
            } else if (this.path.length === 0) {
                 this.movePhase = MOVE_PHASE.ARRIVED; // Special case for rotateToFace
            }
        }
    }

    updateLoading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;
        
        // Wait for forks
        if (Math.abs(this.forkHeight - this.targetForkHeight) > 0.02) return;

        if (this.operationTime <= 0) {
            // Logic for Task Manager
            if (this.currentTask) {
                this.isCarryingLoad = true;
                this.startDropoffPhase();
            } 
            // Logic for Promise/Demo
            else if (this.loadingResolve) {
                 this.loadingResolve();
                 this.loadingResolve = null;
            }
        }
    }

    updateUnloading(deltaTime) {
        this.targetSpeed = 0;
        this.operationTime -= deltaTime;
        
        if (Math.abs(this.forkHeight - this.targetForkHeight) > 0.02) return;

        if (this.operationTime <= 0) {
            if (this.currentTask) {
                this.isCarryingLoad = false;
                this.completeTask();
            }
            else if (this.loadingResolve) {
                this.loadingResolve();
                this.loadingResolve = null;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helpers (Physics & Visuals)
    // ═══════════════════════════════════════════════════════════════════════

    startDropoffPhase() {
        const navGrid = typeof getNavigationGrid === 'function' ? getNavigationGrid() : null;
        if (this.currentTask && navGrid) {
            const dropoffNode = navGrid.getNode(this.currentTask.dropoffNodeId);
            const currentNode = navGrid.findNearestNode(this.position.x, this.position.z);
            if (dropoffNode && currentNode) {
                this.pathNodeIds = navGrid.findPath(currentNode.id, dropoffNode.id);
                this.path = navGrid.pathToCoordinates(this.pathNodeIds, this.position.y);
                this.currentWaypointIndex = 0;
                this.setStatus(AGV_STATUS.MOVING_TO_DROP);
                this.movePhase = MOVE_PHASE.ROTATING;
            }
        }
    }

    completeTask() {
        if (this.currentTask) this.currentTask.complete();
        this.currentTask = null;
        this.setStatus(AGV_STATUS.IDLE);
    }

    updateIdle(deltaTime) {
        this.targetSpeed = 0;
    }

    updateCharging(deltaTime) {
        this.targetSpeed = 0;
        if (this.battery >= 95) this.setStatus(AGV_STATUS.IDLE);
    }

    applyMotion(deltaTime) {
        const speedDiff = this.targetSpeed - this.speed;
        if (Math.abs(speedDiff) > 0.001) {
            const rate = speedDiff > 0 ? MOTION.ACCELERATION : MOTION.DECELERATION;
            this.speed += speedDiff * rate * deltaTime;
        } else {
            this.speed = this.targetSpeed;
        }
    }

    moveForward(deltaTime) {
        const dist = this.speed * deltaTime;
        this.position.x += Math.sin(this.rotation) * dist;
        this.position.z += Math.cos(this.rotation) * dist;
        this.totalDistanceTraveled += dist;
    }

    updateForks(deltaTime) {
        const diff = this.targetForkHeight - this.forkHeight;
        if (Math.abs(diff) > 0.01) {
            this.forkHeight += Math.sign(diff) * Math.min(Math.abs(diff), MOTION.FORK_SPEED * deltaTime);
        }
    }

    updateVisuals(deltaTime) {
        if (!this.model) return;
        
        // Sync model pos
        const lerpFactor = 1.0;
        this.model.position.lerp(this.position, lerpFactor);
        this.model.rotation.y = this.rotation;

        // Wheels
        if (this.wheels.length > 0) {
            const rot = this.speed * deltaTime * 5;
            this.wheels.forEach(w => w.rotation.x += rot);
        }

        // LED
        if (this.statusLED) {
            const color = STATUS_COLORS[this.status] || 0x20c997;
            this.statusLED.material.color.setHex(color);
            this.statusLED.material.emissive.setHex(color);
        }
    }

    updateCargoVisual() {
        if (this.isCarryingLoad && !this.cargoMesh && this.model) {
            const geo = new THREE.BoxGeometry(0.8, 0.4, 0.6);
            const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
            this.cargoMesh = new THREE.Mesh(geo, mat);
            this.model.add(this.cargoMesh);
        } else if (!this.isCarryingLoad && this.cargoMesh) {
            this.model.remove(this.cargoMesh);
            this.cargoMesh = null;
        }
        
        if (this.cargoMesh) {
            this.cargoMesh.position.set(0, this.forkHeight + 0.35, 0);
        }
    }

    updateBattery(deltaTime) {
        if (this.status === AGV_STATUS.CHARGING) {
            this.battery = Math.min(100, this.battery + deltaTime * 5);
        } else if (this.speed > 0.1) {
            this.battery = Math.max(0, this.battery - deltaTime * 0.05);
        }
    }

    normalizeRotation() {
        while (this.rotation > Math.PI) this.rotation -= Math.PI * 2;
        while (this.rotation < -Math.PI) this.rotation += Math.PI * 2;
    }

    setStatus(status) {
        if (status !== this.status) {
            this.previousStatus = this.status;
            this.status = status;
            console.log(`🤖 ${this.id}: ${this.previousStatus} → ${status}`);
        }
    }

    isAvailable() {
        return !this.externalControl && this.status === AGV_STATUS.IDLE && !this.currentTask && this.battery > 20;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Create AGV Fleet
// ═══════════════════════════════════════════════════════════════════════════

function createAGVs(scene) {
    const agvs = [];
    const initialPositions = [
        { id: 'AGV-001', pos: new THREE.Vector3(-20, 0.3, -10), status: AGV_STATUS.CHARGING, battery: 25 },
        { id: 'AGV-002', pos: new THREE.Vector3(3, 0.3, 0), status: AGV_STATUS.IDLE, battery: 85 },
        { id: 'AGV-003', pos: new THREE.Vector3(-3, 0.3, 8), status: AGV_STATUS.IDLE, battery: 70 }
    ];

    initialPositions.forEach((config) => {
        const agv = new AGV(config.id, config.pos, config.status);
        agv.battery = config.battery;
        agv.model = createAGVModel(agv);
        agv.model.position.copy(config.pos);
        scene.add(agv.model);
        agvs.push(agv);
    });

    return agvs;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3D Model Creation
// ═══════════════════════════════════════════════════════════════════════════

function createAGVLabel(agv) {
    const labelText = String(agv.id || '?');

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Simple high-contrast label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.8, 0.4, 1);
    sprite.position.set(0, 0.7, 0);
    return sprite;
}

function createAGVModel(agv) {
    const agvGroup = new THREE.Group();
    agvGroup.name = `AGV_${agv.id}`;

    // Chassis
    const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.3, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
    );
    chassis.castShadow = true;
    agvGroup.add(chassis);

    // Wheels
    agv.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    [
        {x: -0.4, z: -0.3}, {x: -0.4, z: 0.3}, 
        {x: 0.4, z: -0.3}, {x: 0.4, z: 0.3}
    ].forEach(pos => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI/2;
        w.position.set(pos.x, -0.1, pos.z);
        agvGroup.add(w);
        agv.wheels.push(w);
    });

    // LED Strip
    const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.05, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x20c997, emissive: 0x20c997 })
    );
    led.position.set(0, 0.18, 0);
    agvGroup.add(led);
    agv.statusLED = led;

    // ID Label
    const label = createAGVLabel(agv);
    agvGroup.add(label);
    agv.labelSprite = label;

    // Forks
    const forkGeo = new THREE.BoxGeometry(0.8, 0.05, 0.1);
    const forkMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const f1 = new THREE.Mesh(forkGeo, forkMat); f1.position.set(0.6, 0, -0.2);
    const f2 = new THREE.Mesh(forkGeo, forkMat); f2.position.set(0.6, 0, 0.2);
    agvGroup.add(f1);
    agvGroup.add(f2);

    return agvGroup;
}

// ═══════════════════════════════════════════════════════════════════════════
// Global Helpers
// ═══════════════════════════════════════════════════════════════════════════

function updateAGVs(agvs, deltaTime) {
    agvs.forEach(agv => agv.update(deltaTime));
}

function getAGVById(agvs, id) {
    return agvs.find(agv => agv.id === id);
}
