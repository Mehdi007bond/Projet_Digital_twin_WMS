/**
 * Digital Twin WMS - Task Queue Manager
 * Central dispatcher for AGV fleet task assignment
 */

// ═══════════════════════════════════════════════════════════════════════════
// Task Types
// ═══════════════════════════════════════════════════════════════════════════

const TASK_TYPE = {
    INBOUND: 'inbound',     // Reception → Storage
    OUTBOUND: 'outbound',   // Storage → Shipping
    CHARGING: 'charging',   // Any → Charging station
    RELOCATE: 'relocate'    // Storage → Storage (optimization)
};

const TASK_STATUS = {
    PENDING: 'pending',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

const TASK_PRIORITY = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    URGENT: 3
};

// ═══════════════════════════════════════════════════════════════════════════
// Task Class
// ═══════════════════════════════════════════════════════════════════════════

class Task {
    constructor(type, pickupNodeId, dropoffNodeId, itemId = null, priority = TASK_PRIORITY.NORMAL) {
        this.id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;
        this.pickupNodeId = pickupNodeId;
        this.dropoffNodeId = dropoffNodeId;
        this.itemId = itemId;
        this.priority = priority;
        this.status = TASK_STATUS.PENDING;
        this.assignedAgvId = null;
        this.createdAt = Date.now();
        this.startedAt = null;
        this.completedAt = null;
    }

    assign(agvId) {
        this.assignedAgvId = agvId;
        this.status = TASK_STATUS.ASSIGNED;
        this.startedAt = Date.now();
    }

    start() {
        this.status = TASK_STATUS.IN_PROGRESS;
    }

    complete() {
        this.status = TASK_STATUS.COMPLETED;
        this.completedAt = Date.now();
    }

    fail() {
        this.status = TASK_STATUS.FAILED;
        this.completedAt = Date.now();
    }

    getDuration() {
        if (this.completedAt && this.startedAt) {
            return (this.completedAt - this.startedAt) / 1000;
        }
        if (this.startedAt) {
            return (Date.now() - this.startedAt) / 1000;
        }
        return 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Task Queue Manager - Central Dispatcher
// ═══════════════════════════════════════════════════════════════════════════

class TaskQueueManager {
    constructor(navGrid) {
        this.navGrid = navGrid;
        this.pendingTasks = [];
        this.activeTasks = new Map();   // taskId -> Task
        this.completedTasks = [];
        this.agvFleet = [];
        
        // Statistics
        this.stats = {
            totalTasksCreated: 0,
            totalTasksCompleted: 0,
            totalTasksFailed: 0,
            averageCompletionTime: 0,
            inboundCount: 0,
            outboundCount: 0
        };

        // Simulation settings
        this.autoGenerateTasks = true;
        this.taskGenerationInterval = 5000; // ms
        this.lastTaskGeneration = 0;

        console.log('📋 TaskQueueManager initialized');
    }

    /**
     * Register AGV fleet
     */
    registerFleet(agvs) {
        this.agvFleet = agvs;
        console.log(`📋 Registered ${agvs.length} AGVs with TaskQueueManager`);
    }

    /**
     * Create and queue a new task
     */
    createTask(type, pickupNodeId, dropoffNodeId, itemId = null, priority = TASK_PRIORITY.NORMAL) {
        const task = new Task(type, pickupNodeId, dropoffNodeId, itemId, priority);
        this.pendingTasks.push(task);
        this.stats.totalTasksCreated++;

        // Sort by priority (highest first)
        this.pendingTasks.sort((a, b) => b.priority - a.priority);

        console.log(`📋 New ${type} task created: ${task.id}`);
        return task;
    }

    /**
     * Create an inbound task (Reception → Storage)
     */
    createInboundTask(itemId = null) {
        const receptionNode = this.navGrid.findAvailableReceptionNode();
        const storageNode = this.navGrid.findEmptyStorageSlot();

        if (!receptionNode) {
            console.warn('No available reception node');
            return null;
        }
        if (!storageNode) {
            console.warn('No empty storage slots');
            return null;
        }

        const task = this.createTask(
            TASK_TYPE.INBOUND,
            receptionNode.id,
            storageNode.id,
            itemId || `item_${Date.now()}`,
            TASK_PRIORITY.NORMAL
        );

        this.stats.inboundCount++;
        return task;
    }

    /**
     * Create an outbound task (Storage → Red Zone/Shipping)
     */
    createOutboundTask() {
        const storageNode = this.navGrid.findOccupiedStorageSlot();
        const redZoneNode = this.navGrid.findAvailableRedZoneNode();

        if (!storageNode) {
            console.warn('No items in storage to ship');
            return null;
        }
        if (!redZoneNode) {
            console.warn('No available red zone nodes');
            return null;
        }

        const task = this.createTask(
            TASK_TYPE.OUTBOUND,
            storageNode.id,
            redZoneNode.id,
            storageNode.itemId,
            TASK_PRIORITY.NORMAL
        );

        // Emit event for stock update
        if (window.stockUpdateCallback) {
            window.stockUpdateCallback({
                itemId: storageNode.itemId,
                status: 'moving',
                from: 'storage',
                to: 'red_zone',
                agvId: null // Will be set when assigned
            });
        }

        this.stats.outboundCount++;
        return task;
    }

    /**
     * Main update loop - dispatch tasks to available AGVs
     */
    update(deltaTime) {
        // Auto-generate tasks for simulation
        if (this.autoGenerateTasks) {
            this.autoGenerateTasksUpdate(deltaTime);
        }

        // Process pending tasks
        this.dispatchTasks();

        // Check for completed tasks
        this.checkTaskCompletion();
    }

    /**
     * Dispatch pending tasks to available AGVs
     */
    dispatchTasks() {
        if (this.pendingTasks.length === 0) return;

        // Find available AGVs
        const availableAgvs = this.agvFleet.filter(agv => 
            agv.status === AGV_STATUS.IDLE && 
            !agv.currentTask &&
            agv.battery > 20
        );

        if (availableAgvs.length === 0) return;

        // Assign tasks to nearest AGVs
        while (this.pendingTasks.length > 0 && availableAgvs.length > 0) {
            const task = this.pendingTasks[0];
            const pickupNode = this.navGrid.getNode(task.pickupNodeId);

            if (!pickupNode) {
                this.pendingTasks.shift();
                continue;
            }

            // Find nearest available AGV to pickup location
            let nearestAgv = null;
            let minDistance = Infinity;

            availableAgvs.forEach(agv => {
                const dist = Math.sqrt(
                    Math.pow(agv.position.x - pickupNode.x, 2) +
                    Math.pow(agv.position.z - pickupNode.z, 2)
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestAgv = agv;
                }
            });

            if (nearestAgv) {
                this.assignTask(task, nearestAgv);
                this.pendingTasks.shift();
                
                // Remove AGV from available list
                const agvIndex = availableAgvs.indexOf(nearestAgv);
                if (agvIndex > -1) {
                    availableAgvs.splice(agvIndex, 1);
                }
            } else {
                break;
            }
        }
    }

    /**
     * Assign a task to an AGV
     */
    assignTask(task, agv) {
        task.assign(agv.id);
        this.activeTasks.set(task.id, task);

        // Set up AGV mission
        agv.currentTask = task;
        agv.assignTask(task, this.navGrid);

        console.log(`📋 Task ${task.id} assigned to ${agv.id}`);
    }

    /**
     * Check for completed tasks
     */
    checkTaskCompletion() {
        this.activeTasks.forEach((task, taskId) => {
            if (task.status === TASK_STATUS.COMPLETED) {
                this.completedTasks.push(task);
                this.activeTasks.delete(taskId);
                this.stats.totalTasksCompleted++;
                this.updateAverageCompletionTime(task);
                console.log(`✅ Task ${taskId} completed in ${task.getDuration().toFixed(1)}s`);
            } else if (task.status === TASK_STATUS.FAILED) {
                this.activeTasks.delete(taskId);
                this.stats.totalTasksFailed++;
                console.log(`❌ Task ${taskId} failed`);
            }
        });
    }

    /**
     * Update average completion time statistic
     */
    updateAverageCompletionTime(task) {
        const duration = task.getDuration();
        const n = this.stats.totalTasksCompleted;
        this.stats.averageCompletionTime = 
            ((this.stats.averageCompletionTime * (n - 1)) + duration) / n;
    }

    /**
     * Auto-generate tasks for simulation demo
     */
    autoGenerateTasksUpdate(deltaTime) {
        this.lastTaskGeneration += deltaTime * 1000;

        if (this.lastTaskGeneration >= this.taskGenerationInterval) {
            this.lastTaskGeneration = 0;

            // 60% inbound, 40% outbound
            if (Math.random() < 0.6) {
                this.createInboundTask();
            } else {
                this.createOutboundTask();
            }
        }
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            ...this.stats,
            pendingCount: this.pendingTasks.length,
            activeCount: this.activeTasks.size,
            completedCount: this.completedTasks.length
        };
    }

    /**
     * Mark task as completed
     */
    completeTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.complete();
        }
    }

    /**
     * Mark task as failed
     */
    failTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.fail();
        }
    }

    /**
     * Pick and ship mission with promises (async)
     */
    async assignPickAndShipMission(agv, boxMesh, dropZoneVector) {
        if (!agv.isAvailable()) {
            console.warn(`AGV ${agv.id} is not available`);
            return false;
        }

        try {
            console.log(`📦 Task started for ${agv.id}: Pick from ${boxMesh.position.x.toFixed(1)}, ${boxMesh.position.z.toFixed(1)}`);
            
            // Step 1: Move to box
            console.log(`  → Moving to box...`);
            await agv.moveTo(boxMesh.position);
            
            // Step 2: Rotate to face box
            console.log(`  → Rotating to face box...`);
            await agv.rotateToFace(boxMesh);
            
            // Step 3: Loading animation
            console.log(`  → Loading cargo...`);
            await agv.animateLoading();
            
            // Step 4: Attach cargo
            console.log(`  → Attaching cargo...`);
            agv.attachCargo(boxMesh);
            
            // Step 5: Move to drop zone
            console.log(`  → Moving to drop zone (${dropZoneVector.x.toFixed(1)}, ${dropZoneVector.z.toFixed(1)})...`);
            await agv.moveTo(dropZoneVector);
            
            // Step 6: Rotate at drop zone
            const tempDropObj = { position: dropZoneVector };
            console.log(`  → Rotating at drop zone...`);
            await agv.rotateToFace(tempDropObj);
            
            // Step 7: Unloading animation
            console.log(`  → Unloading cargo...`);
            await agv.animateUnloading();
            
            // Step 8: Detach cargo
            console.log(`  → Detaching cargo...`);
            agv.detachCargo(this.navGrid ? this.navGrid.scene : null);
            
            // Step 9: Return to IDLE
            console.log(`  → Returning to IDLE...`);
            await agv.returnToIdle();
            
            console.log(`✅ Task completed for ${agv.id}`);
            return true;

        } catch (error) {
            console.error(`❌ Task failed for ${agv.id}:`, error);
            agv.setStatus(AGV_STATUS.IDLE);
            agv.currentTask = null;
            return false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Global Task Queue Manager Instance
// ═══════════════════════════════════════════════════════════════════════════

let _taskQueueManagerInstance = null;

function getTaskQueueManager() {
    if (!_taskQueueManagerInstance) {
        const navGrid = getNavigationGrid();
        _taskQueueManagerInstance = new TaskQueueManager(navGrid);
    }
    return _taskQueueManagerInstance;
}

function initializeTaskQueueManager(agvs) {
    const tqm = getTaskQueueManager();
    tqm.registerFleet(agvs);
    
    // Pre-populate some storage items for outbound demo
    const navGrid = getNavigationGrid();
    navGrid.storageNodes.slice(0, 15).forEach((node, index) => {
        if (index % 3 === 0) { // Every 3rd slot has an item
            node.itemId = `initial_item_${index}`;
        }
    });

    return tqm;
}
