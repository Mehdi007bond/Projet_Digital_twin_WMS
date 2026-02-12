/**
 * Digital Twin WMS - Navigation Grid System
 * Grid-based pathfinding for AGV fleet management
 */

// ═══════════════════════════════════════════════════════════════════════════
// Navigation Grid Configuration
// ═══════════════════════════════════════════════════════════════════════════

const GRID_CONFIG = {
    cellSize: 2.0,          // 2 meters per cell
    warehouseWidth: 50,     // meters
    warehouseDepth: 30,     // meters
    originX: -25,           // Grid origin X (left edge)
    originZ: -15            // Grid origin Z (back edge)
};

// ═══════════════════════════════════════════════════════════════════════════
// Node Types
// ═══════════════════════════════════════════════════════════════════════════

const NODE_TYPE = {
    PATH: 'path',               // Regular navigation path
    INTERSECTION: 'intersection', // Path intersection
    STORAGE: 'storage',         // Rack storage location
    RECEPTION: 'reception',     // Inbound receiving area
    SHIPPING: 'shipping',       // Outbound shipping dock
    CHARGING: 'charging',       // AGV charging station
    WAITING: 'waiting'          // Waiting/staging area
};

// ═══════════════════════════════════════════════════════════════════════════
// Navigation Node Class
// ═══════════════════════════════════════════════════════════════════════════

class NavigationNode {
    constructor(id, x, z, type = NODE_TYPE.PATH) {
        this.id = id;
        this.x = x;
        this.z = z;
        this.type = type;
        this.neighbors = [];    // Connected nodes
        this.occupied = false;  // Is an AGV currently here?
        this.reservedBy = null; // AGV that reserved this node
        this.itemId = null;     // For storage nodes - what item is stored
        this.rackId = null;     // For storage nodes - which rack
        this.slotIndex = null;  // For storage nodes - slot position
    }

    distanceTo(other) {
        return Math.sqrt(
            Math.pow(this.x - other.x, 2) + 
            Math.pow(this.z - other.z, 2)
        );
    }

    isAvailable() {
        return !this.occupied && !this.reservedBy;
    }

    reserve(agvId) {
        this.reservedBy = agvId;
    }

    release() {
        this.reservedBy = null;
        this.occupied = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigation Grid Manager
// ═══════════════════════════════════════════════════════════════════════════

class NavigationGrid {
    constructor() {
        this.nodes = new Map();     // id -> NavigationNode
        this.pathNodes = [];        // Quick access to path nodes
        this.storageNodes = [];     // Storage locations
        this.receptionNodes = [];   // Reception area nodes
        this.shippingNodes = [];    // Shipping dock nodes
        this.redZoneNodes = [];     // Red Zone nodes (outbound)
        this.chargingNodes = [];    // Charging station nodes
        
        this.initializeGrid();
    }

    /**
     * Initialize the warehouse navigation grid
     */
    initializeGrid() {
        console.log('🗺️ Initializing navigation grid...');

        // Define main aisles (Z coordinates - horizontal paths)
        const mainAisles = [-10, -5, 0, 5, 10];
        
        // Define cross aisles (X coordinates - vertical paths)
        const crossAisles = [-20, -15, -10, -5, 0, 5, 10, 15, 20];

        // Create intersection nodes at aisle crossings
        let nodeId = 0;
        mainAisles.forEach(z => {
            crossAisles.forEach(x => {
                const node = new NavigationNode(
                    `node_${nodeId}`,
                    x, z,
                    NODE_TYPE.INTERSECTION
                );
                this.nodes.set(node.id, node);
                this.pathNodes.push(node);
                nodeId++;
            });
        });

        // Connect neighboring nodes (create graph edges)
        this.connectNodes();

        // Create storage nodes (rack positions)
        this.createStorageNodes();

        // Create reception area nodes (inbound)
        this.createReceptionNodes();

        // Create shipping dock nodes (outbound)
        this.createShippingNodes();
        // Create RED ZONE nodes (shipping area with red indicator)
        this.createRedZoneNodes();
        // Create charging station nodes
        this.createChargingNodes();

        console.log(`✓ Navigation grid created: ${this.nodes.size} nodes`);
        console.log(`  - Storage: ${this.storageNodes.length}`);
        console.log(`  - Reception: ${this.receptionNodes.length}`);
        console.log(`  - Shipping: ${this.shippingNodes.length}`);
        console.log(`  - Red Zone: ${this.redZoneNodes.length}`);
        console.log(`  - Charging: ${this.chargingNodes.length}`);
    }

    /**
     * Connect neighboring nodes for pathfinding
     * ONLY horizontal and vertical connections (no diagonals)
     */
    connectNodes() {
        const nodeArray = Array.from(this.nodes.values());
        
        nodeArray.forEach(node => {
            nodeArray.forEach(other => {
                if (node.id !== other.id) {
                    const dist = node.distanceTo(other);
                    // Connect nodes that are within one grid step AND aligned
                    if (dist <= 5.1 && dist > 0) {
                        // ONLY connect if they are EXACTLY on the same line (X or Z)
                        const onSameX = Math.abs(node.x - other.x) < 0.1;
                        const onSameZ = Math.abs(node.z - other.z) < 0.1;
                        
                        // Must be on same X OR same Z (not both, and not diagonal)
                        if ((onSameX && !onSameZ) || (!onSameX && onSameZ)) {
                            node.neighbors.push(other.id);
                        }
                    }
                }
            });
        });
    }

    /**
     * Create storage nodes along the racks
     */
    createStorageNodes() {
        // Racks are positioned between main aisles
        const rackPositions = [
            // Row A (between z=-10 and z=-5)
            { rackId: 'A1', x: -12, z: -7.5, slots: 3 },
            { rackId: 'A2', x: -6, z: -7.5, slots: 3 },
            { rackId: 'A3', x: 0, z: -7.5, slots: 3 },
            { rackId: 'A4', x: 6, z: -7.5, slots: 3 },
            { rackId: 'A5', x: 12, z: -7.5, slots: 3 },
            
            // Row B (between z=-5 and z=0)
            { rackId: 'B1', x: -12, z: -2.5, slots: 3 },
            { rackId: 'B2', x: -6, z: -2.5, slots: 3 },
            { rackId: 'B3', x: 0, z: -2.5, slots: 3 },
            { rackId: 'B4', x: 6, z: -2.5, slots: 3 },
            { rackId: 'B5', x: 12, z: -2.5, slots: 3 },

            // Row C (between z=0 and z=5)
            { rackId: 'C1', x: -12, z: 2.5, slots: 3 },
            { rackId: 'C2', x: -6, z: 2.5, slots: 3 },
            { rackId: 'C3', x: 0, z: 2.5, slots: 3 },
            { rackId: 'C4', x: 6, z: 2.5, slots: 3 },
            { rackId: 'C5', x: 12, z: 2.5, slots: 3 }
        ];

        rackPositions.forEach(rack => {
            for (let slot = 0; slot < rack.slots; slot++) {
                const nodeId = `storage_${rack.rackId}_${slot}`;
                const node = new NavigationNode(
                    nodeId,
                    rack.x + (slot - 1) * 1.5, // Offset slots
                    rack.z,
                    NODE_TYPE.STORAGE
                );
                node.rackId = rack.rackId;
                node.slotIndex = slot;
                
                // Connect to nearest path node
                const nearestPath = this.findNearestPathNode(node.x, node.z);
                if (nearestPath) {
                    node.neighbors.push(nearestPath.id);
                    nearestPath.neighbors.push(nodeId);
                }

                this.nodes.set(nodeId, node);
                this.storageNodes.push(node);
            }
        });
    }

    /**
     * Create reception area nodes (inbound zone)
     */
    createReceptionNodes() {
        // Reception area in the back-left corner
        const receptionPositions = [
            { x: -22, z: -12 },
            { x: -22, z: -10 },
            { x: -22, z: -8 }
        ];

        receptionPositions.forEach((pos, index) => {
            const nodeId = `reception_${index}`;
            const node = new NavigationNode(
                nodeId,
                pos.x, pos.z,
                NODE_TYPE.RECEPTION
            );

            // Connect to nearest path node
            const nearestPath = this.findNearestPathNode(pos.x, pos.z);
            if (nearestPath) {
                node.neighbors.push(nearestPath.id);
                nearestPath.neighbors.push(nodeId);
            }

            this.nodes.set(nodeId, node);
            this.receptionNodes.push(node);
        });
    }

    /**
     * Create shipping dock nodes (outbound zone)
     */
    createShippingNodes() {
        // Shipping dock on the right side
        const shippingPositions = [
            { x: 22, z: -8 },
            { x: 22, z: -5 },
            { x: 22, z: 0 },
            { x: 22, z: 5 },
            { x: 22, z: 8 }
        ];

        shippingPositions.forEach((pos, index) => {
            const nodeId = `shipping_${index}`;
            const node = new NavigationNode(
                nodeId,
                pos.x, pos.z,
                NODE_TYPE.SHIPPING
            );

            // Connect to nearest path node
            const nearestPath = this.findNearestPathNode(pos.x, pos.z);
            if (nearestPath) {
                node.neighbors.push(nearestPath.id);
                nearestPath.neighbors.push(nodeId);
            }

            this.nodes.set(nodeId, node);
            this.shippingNodes.push(node);
        });
    }


    /**
     * Create RED ZONE nodes (outbound shipping area)
     */
    createRedZoneNodes() {
        // Red Zone on the far right - bright RED visible area
        const redZonePositions = [
            { x: 24, z: -10 },
            { x: 24, z: -5 },
            { x: 24, z: 0 },
            { x: 24, z: 5 },
            { x: 24, z: 10 }
        ];

        redZonePositions.forEach((pos, index) => {
            const nodeId = `red_zone_${index}`;
            const node = new NavigationNode(
                nodeId,
                pos.x, pos.z,
                NODE_TYPE.SHIPPING  // Use SHIPPING type for red zone
            );
            node.isRedZone = true;  // Mark as red zone

            // Connect to nearest path node
            const nearestPath = this.findNearestPathNode(pos.x, pos.z);
            if (nearestPath) {
                node.neighbors.push(nearestPath.id);
                nearestPath.neighbors.push(nodeId);
            }

            this.nodes.set(nodeId, node);
            this.redZoneNodes.push(node);
        });
    }

    /**
     * Create charging station nodes
     */
    createChargingNodes() {
        // Charging stations in the front-left corner
        const chargingPositions = [
            { x: -22, z: 10 },
            { x: -22, z: 12 }
        ];

        chargingPositions.forEach((pos, index) => {
            const nodeId = `charging_${index}`;
            const node = new NavigationNode(
                nodeId,
                pos.x, pos.z,
                NODE_TYPE.CHARGING
            );

            // Connect to nearest path node
            const nearestPath = this.findNearestPathNode(pos.x, pos.z);
            if (nearestPath) {
                node.neighbors.push(nearestPath.id);
                nearestPath.neighbors.push(nodeId);
            }

            this.nodes.set(nodeId, node);
            this.chargingNodes.push(node);
        });
    }

    /**
     * Find nearest path node to given coordinates
     */
    findNearestPathNode(x, z) {
        let nearest = null;
        let minDist = Infinity;

        this.pathNodes.forEach(node => {
            const dist = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.z - z, 2));
            if (dist < minDist) {
                minDist = dist;
                nearest = node;
            }
        });

        return nearest;
    }

    /**
     * Find nearest node of any type to given coordinates
     */
    findNearestNode(x, z) {
        let nearest = null;
        let minDist = Infinity;

        this.nodes.forEach(node => {
            const dist = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.z - z, 2));
            if (dist < minDist) {
                minDist = dist;
                nearest = node;
            }
        });

        return nearest;
    }

    /**
     * A* Pathfinding algorithm
     */
    findPath(startNodeId, endNodeId) {
        const startNode = this.nodes.get(startNodeId);
        const endNode = this.nodes.get(endNodeId);

        if (!startNode || !endNode) {
            console.error(`Pathfinding error: Invalid nodes ${startNodeId} -> ${endNodeId}`);
            return [];
        }

        const openSet = new Set([startNodeId]);
        const cameFrom = new Map();
        
        const gScore = new Map();
        gScore.set(startNodeId, 0);
        
        const fScore = new Map();
        fScore.set(startNodeId, startNode.distanceTo(endNode));

        while (openSet.size > 0) {
            // Get node with lowest fScore
            let current = null;
            let lowestF = Infinity;
            openSet.forEach(nodeId => {
                const f = fScore.get(nodeId) || Infinity;
                if (f < lowestF) {
                    lowestF = f;
                    current = nodeId;
                }
            });

            if (current === endNodeId) {
                // Reconstruct path
                return this.reconstructPath(cameFrom, current);
            }

            openSet.delete(current);
            const currentNode = this.nodes.get(current);

            currentNode.neighbors.forEach(neighborId => {
                const neighbor = this.nodes.get(neighborId);
                if (!neighbor) return;

                // Skip occupied nodes (except destination)
                if (neighbor.occupied && neighborId !== endNodeId) return;

                const tentativeG = (gScore.get(current) || Infinity) + 
                                   currentNode.distanceTo(neighbor);

                if (tentativeG < (gScore.get(neighborId) || Infinity)) {
                    cameFrom.set(neighborId, current);
                    gScore.set(neighborId, tentativeG);
                    fScore.set(neighborId, tentativeG + neighbor.distanceTo(endNode));
                    openSet.add(neighborId);
                }
            });
        }

        console.warn(`No path found from ${startNodeId} to ${endNodeId}`);
        return [];
    }

    /**
     * Reconstruct path from A* result
     */
    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }
        return path;
    }

    /**
     * Find an empty storage slot
     */
    findEmptyStorageSlot() {
        const emptySlots = this.storageNodes.filter(node => 
            node.itemId === null && node.isAvailable()
        );
        
        if (emptySlots.length === 0) return null;
        
        // Return random empty slot
        return emptySlots[Math.floor(Math.random() * emptySlots.length)];
    }

    /**
     * Find a storage node with an item (for retrieval)
     */
    findOccupiedStorageSlot() {
        const occupiedSlots = this.storageNodes.filter(node => 
            node.itemId !== null && node.isAvailable()
        );
        
        if (occupiedSlots.length === 0) return null;
        
        // Return random occupied slot
        return occupiedSlots[Math.floor(Math.random() * occupiedSlots.length)];
    }

    /**
     * Find available reception node
     */
    findAvailableReceptionNode() {
        return this.receptionNodes.find(node => node.isAvailable()) || null;
    }

    /**
     * Find available shipping node
     */
    findAvailableShippingNode() {
        return this.shippingNodes.find(node => node.isAvailable()) || null;
    }

    /**
     * Find available RED ZONE node
     */
    findAvailableRedZoneNode() {
        return this.redZoneNodes.find(node => node.isAvailable()) || null;
    }

    /**
     * Find available charging node
     */
    findAvailableChargingNode() {
        return this.chargingNodes.find(node => node.isAvailable()) || null;
    }

    /**
     * Get node by ID
     */
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    /**
     * Convert path of node IDs to coordinates
     */
    pathToCoordinates(pathNodeIds, y = 0.3) {  // Height increased from 0.15 to 0.3
        return pathNodeIds.map(nodeId => {
            const node = this.nodes.get(nodeId);
            return node ? new THREE.Vector3(node.x, y, node.z) : null;
        }).filter(pos => pos !== null);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Create 3D visualization of navigation grid
// ═══════════════════════════════════════════════════════════════════════════

function createNavigationGridVisual(scene, navGrid) {
    const gridGroup = new THREE.Group();
    gridGroup.name = 'NavigationGrid';

    // Yellow line material for paths
    const pathMaterial = new THREE.LineBasicMaterial({ 
        color: 0xffcc00, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });

    // Create lines between connected nodes
    const drawnConnections = new Set();

    navGrid.nodes.forEach(node => {
        node.neighbors.forEach(neighborId => {
            const connectionKey = [node.id, neighborId].sort().join('-');
            if (drawnConnections.has(connectionKey)) return;
            drawnConnections.add(connectionKey);

            const neighbor = navGrid.nodes.get(neighborId);
            if (!neighbor) return;

            const points = [
                new THREE.Vector3(node.x, 0.02, node.z),
                new THREE.Vector3(neighbor.x, 0.02, neighbor.z)
            ];

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, pathMaterial);
            gridGroup.add(line);
        });
    });

    // Create node markers
    navGrid.nodes.forEach(node => {
        let color, size;

        switch (node.type) {
            case NODE_TYPE.INTERSECTION:
                color = 0xffcc00; size = 0.15;
                break;
            case NODE_TYPE.STORAGE:
                color = 0x3498db; size = 0.2;
                break;
            case NODE_TYPE.RECEPTION:
                color = 0x2ecc71; size = 0.3;
                break;
            case NODE_TYPE.SHIPPING:
                color = 0xe74c3c; size = 0.3;
                break;
            case NODE_TYPE.CHARGING:
                color = 0xf39c12; size = 0.25;
                break;
            default:
                color = 0xffffff; size = 0.1;
        }

        const markerGeometry = new THREE.CircleGeometry(size, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(node.x, 0.03, node.z);
        gridGroup.add(marker);
    });

    // Add zone labels
    createZoneLabels(gridGroup);

    scene.add(gridGroup);
    return gridGroup;
}

/**
 * Create zone labels for visual clarity
 */
function createZoneLabels(group) {
    const zones = [
        { text: 'RECEPTION', x: -22, z: -10, color: '#2ecc71' },
        { text: 'SHIPPING', x: 22, z: 0, color: '#e74c3c' },
        { text: 'CHARGING', x: -22, z: 11, color: '#f39c12' }
    ];

    zones.forEach(zone => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = zone.color;
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zone.text, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({ 
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        const geometry = new THREE.PlaneGeometry(4, 1);
        const label = new THREE.Mesh(geometry, material);
        label.rotation.x = -Math.PI / 2;
        label.position.set(zone.x, 0.05, zone.z);
        group.add(label);
    });
}

// Navigation grid singleton instance
let _navigationGridInstance = null;

function getNavigationGrid() {
    if (!_navigationGridInstance) {
        _navigationGridInstance = new NavigationGrid();
    }
    return _navigationGridInstance;
}
