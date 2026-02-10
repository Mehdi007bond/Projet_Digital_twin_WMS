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
        this.activeTasks = new Map();
        this.agvFleet = [];
        this.autoGenerateTasks = true; // Set to false if you want only manual demos
        this.lastTaskGeneration = 0;
        this.taskGenerationInterval = 8000;
    }

    registerFleet(agvs) {
        this.agvFleet = agvs;
    }

    getStats() {
        return {
            activeTasks: this.activeTasks.size,
            pendingTasks: this.pendingTasks.length,
            completedTasks: 0 // TODO: Track completed tasks
        };
    }

    /**
     * Create and queue a new task
     */
    createTask(type, pickupNodeId, dropoffNodeId, itemId = null, priority = TASK_PRIORITY.NORMAL) {
        const task = new Task(type, pickupNodeId, dropoffNodeId, itemId, priority);
        this.pendingTasks.push(task);

        // Sort by priority (highest first)
        this.pendingTasks.sort((a, b) => b.priority - a.priority);

        console.log(`📋 New ${type} task created: ${task.id}`);
        return task;
    }

    /**
     * Create an inbound task (Reception → Storage)
     */
    createInboundTask(itemId = null) {
        if (!this.navGrid) return null;
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

        return this.createTask(
            TASK_TYPE.INBOUND,
            receptionNode.id,
            storageNode.id,
            itemId || `item_${Date.now()}`,
            TASK_PRIORITY.NORMAL
        );
    }

    /**
     * Create an outbound task (Storage → Red Zone/Shipping)
     */
    createOutboundTask() {
        if (!this.navGrid) return null;
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

        return this.createTask(
            TASK_TYPE.OUTBOUND,
            storageNode.id,
            redZoneNode.id,
            storageNode.itemId,
            TASK_PRIORITY.NORMAL
        );
    }

    /**
     * Main update loop
     */
    update(deltaTime) {
        // Only auto-generate if demo mode is NOT active in main.js
        if (this.autoGenerateTasks && !window.demoRunning) {
            this.autoGenerateTasksUpdate(deltaTime);
        }
        this.dispatchTasks();
        this.checkTaskCompletion();
    }

    /**
     * Dispatch pending tasks to available AGVs
     */
    dispatchTasks() {
        if (this.pendingTasks.length === 0) return;

        const availableAgvs = this.agvFleet.filter(agv => agv.isAvailable());
        
        while (this.pendingTasks.length > 0 && availableAgvs.length > 0) {
            const task = this.pendingTasks[0];
            const agv = availableAgvs[0]; // Simplification: pick first available
            
            if (agv && task) {
                this.assignTask(task, agv);
                this.pendingTasks.shift();
                availableAgvs.shift();
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
        agv.assignTask(task, this.navGrid);
    }

    /**
     * Check for completed tasks
     */
    checkTaskCompletion() {
        this.activeTasks.forEach((task, taskId) => {
            if (task.status === 'completed') {
                this.activeTasks.delete(taskId);
            }
        });
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

    // ═══════════════════════════════════════════════════════════════════════
    // Demo Mission Logic (Uses Promise-based API)
    // ═══════════════════════════════════════════════════════════════════════

    async assignPickAndShipMission(agv, boxMesh, dropZoneVector) {
        if (!agv) return;
        
        window.demoRunning = true; // Signal to stop auto-generation
        console.log(`📦 DEMO: Task started for ${agv.id}`);

        try {
            // 1. Move to Box
            await agv.moveTo(boxMesh.position);
            
            // 2. Rotate to face box
            await agv.rotateToFace(boxMesh);
            
            // 3. Load
            await agv.animateLoading();
            agv.attachCargo(boxMesh);
            
            // 4. Move to Drop Zone
            await agv.moveTo(dropZoneVector);
            
            // 5. Unload
            await agv.animateUnloading();
            agv.detachCargo();
            
            // 6. Return
            await agv.returnToIdle();
            console.log(`✅ DEMO: Task completed`);
            
        } catch (e) {
            console.error("Demo failed", e);
            agv.setStatus('error');
        } finally {
            window.demoRunning = false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Global Task Queue Manager Instance
// ═══════════════════════════════════════════════════════════════════════════

let _taskQueueManagerInstance = null;

function getTaskQueueManager() {
    if (!_taskQueueManagerInstance) {
        _taskQueueManagerInstance = new TaskQueueManager(window.digitalTwin?.navigationGrid);
    }
    return _taskQueueManagerInstance;
}

function initializeTaskQueueManager(agvs) {
    const tqm = getTaskQueueManager();
    tqm.registerFleet(agvs);
    return tqm;
}
