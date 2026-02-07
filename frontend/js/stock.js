/**
 * Digital Twin WMS - Stock and Pallet Visualization
 * Creates pallets, boxes, and manages stock levels
 */

// Fill level color mapping
const FILL_COLORS = {
    100: { color: 0x20c997, emissive: 0x20c997, emissiveIntensity: 0.5 },  // Green glow
    75: { color: 0x90ee90, emissive: 0x90ee90, emissiveIntensity: 0.2 },   // Light green
    50: { color: 0xf59f00, emissive: 0xf59f00, emissiveIntensity: 0.2 },   // Yellow
    25: { color: 0xff9966, emissive: 0xff9966, emissiveIntensity: 0.2 },   // Orange
    0: null  // Empty - no pallet shown
};

// ABC category colors
const ABC_COLORS = {
    A: 0xff0000, // Red - High value
    B: 0xffcc00, // Yellow - Medium value
    C: 0x4361ee  // Blue - Low value
};

/**
 * Stock Item Class
 */
class StockItem {
    constructor(id, location, fillLevel, category = 'B') {
        this.id = id;
        this.location = location;
        this.fillLevel = fillLevel; // 0-100
        this.category = category; // A, B, or C
        this.model = null;
        this.glowMesh = null;
        this.animationOffset = Math.random() * Math.PI * 2;
    }

    /**
     * Update stock item visuals
     */
    update(deltaTime) {
        if (!this.model) return;

        // Animate glow for high fill levels
        if (this.glowMesh && this.fillLevel >= 75) {
            this.animationOffset += deltaTime;
            const pulse = Math.sin(this.animationOffset * 2) * 0.3 + 0.7;
            this.glowMesh.material.emissiveIntensity = pulse * 0.5;
        }
    }

    /**
     * Set fill level and update visuals
     */
    setFillLevel(level) {
        this.fillLevel = Math.max(0, Math.min(100, level));
        if (this.model) {
            this.updateVisuals();
        }
    }

    /**
     * Update visual representation based on fill level
     */
    updateVisuals() {
        if (!this.model) return;

        // Determine color based on fill level
        let colorData;
        if (this.fillLevel >= 90) {
            colorData = FILL_COLORS[100];
        } else if (this.fillLevel >= 60) {
            colorData = FILL_COLORS[75];
        } else if (this.fillLevel >= 40) {
            colorData = FILL_COLORS[50];
        } else if (this.fillLevel > 0) {
            colorData = FILL_COLORS[25];
        } else {
            // Empty - hide model
            this.model.visible = false;
            return;
        }

        this.model.visible = true;

        // Update glow mesh if exists
        if (this.glowMesh) {
            this.glowMesh.material.color.setHex(colorData.color);
            this.glowMesh.material.emissive.setHex(colorData.emissive);
            this.glowMesh.material.emissiveIntensity = colorData.emissiveIntensity;
        }
    }
}

/**
 * Create stock items on racks
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {Object} rackSystem - The rack system with locations
 * @returns {Array<StockItem>} Array of stock items
 */
function createStock(scene, rackSystem) {
    const stockItems = [];
    const locations = rackSystem.locations;

    // Fill 60-80% of locations with stock
    const fillRate = 0.6 + Math.random() * 0.2;
    const numStockItems = Math.floor(locations.length * fillRate);

    // Shuffle locations for random distribution
    const shuffled = [...locations].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numStockItems; i++) {
        const location = shuffled[i];
        
        // Random fill level (weighted towards mid-high)
        const fillLevel = Math.floor(Math.random() * 60 + 40); // 40-100%
        
        // Random ABC category (weighted)
        let category;
        const rand = Math.random();
        if (rand < 0.2) category = 'A';
        else if (rand < 0.5) category = 'B';
        else category = 'C';

        const stockItem = new StockItem(
            `STOCK_${location.id}`,
            location,
            fillLevel,
            category
        );

        // Create 3D model
        stockItem.model = createStockModel(stockItem);
        stockItem.model.position.copy(location.position);
        scene.add(stockItem.model);

        // Link stock item to nearest navigation storage node
        const navGrid = typeof getNavigationGrid === 'function' ? getNavigationGrid() : null;
        if (navGrid && navGrid.storageNodes && navGrid.storageNodes.length > 0) {
            let nearestNode = null;
            let minDist = Infinity;
            navGrid.storageNodes.forEach(node => {
                const dx = node.x - location.position.x;
                const dz = node.z - location.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < minDist) {
                    minDist = dist;
                    nearestNode = node;
                }
            });

            if (nearestNode) {
                nearestNode.itemId = stockItem.id;
                nearestNode.stockItem = stockItem;
            }
        }

        // Mark location as occupied
        location.occupied = true;
        location.stock = stockItem;

        stockItems.push(stockItem);
    }

    console.log(`✓ Created ${stockItems.length} stock items (${Math.round(fillRate * 100)}% fill rate)`);
    return stockItems;
}

/**
 * Create 3D model for stock item (pallet + boxes)
 */
function createStockModel(stockItem) {
    const stockGroup = new THREE.Group();
    stockGroup.name = `Stock_${stockItem.id}`;

    // Create euro pallet
    const pallet = createEuroPallet();
    stockGroup.add(pallet);

    // Create stacked boxes on pallet
    const boxes = createStackedBoxes(stockItem.fillLevel);
    stockGroup.add(boxes);

    // Create glow effect for fill level
    const glow = createFillLevelGlow(stockItem);
    stockGroup.add(glow);
    stockItem.glowMesh = glow;

    // Create ABC category indicator
    const categoryIndicator = createCategoryIndicator(stockItem.category);
    categoryIndicator.position.y = 0.8;
    stockGroup.add(categoryIndicator);

    return stockGroup;
}

/**
 * Create Euro pallet model (1.2m × 0.8m × 0.144m)
 */
function createEuroPallet() {
    const palletGroup = new THREE.Group();

    // Wood texture (procedural)
    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b6f47,
        roughness: 0.9,
        metalness: 0.1
    });

    // Pallet dimensions
    const palletWidth = 1.2;
    const palletDepth = 0.8;
    const palletHeight = 0.144;

    // Top deck boards
    const boardThickness = 0.022;
    const boardWidth = palletWidth;
    const numBoards = 7;
    const boardSpacing = palletDepth / numBoards;

    for (let i = 0; i < numBoards; i++) {
        const boardGeometry = new THREE.BoxGeometry(boardWidth, boardThickness, boardSpacing * 0.8);
        const board = new THREE.Mesh(boardGeometry, woodMaterial);
        board.position.y = palletHeight - boardThickness / 2;
        board.position.z = (i - numBoards / 2 + 0.5) * boardSpacing;
        board.castShadow = true;
        board.receiveShadow = true;
        palletGroup.add(board);
    }

    // Bottom deck boards
    for (let i = 0; i < 3; i++) {
        const boardGeometry = new THREE.BoxGeometry(boardWidth, boardThickness, boardSpacing * 0.8);
        const board = new THREE.Mesh(boardGeometry, woodMaterial);
        board.position.y = boardThickness / 2;
        board.position.z = ((i - 1) * palletDepth / 3);
        board.castShadow = true;
        board.receiveShadow = true;
        palletGroup.add(board);
    }

    // Stringers (support beams)
    const stringerHeight = palletHeight - boardThickness * 2;
    const stringerWidth = 0.1;
    const stringerGeometry = new THREE.BoxGeometry(palletWidth, stringerHeight, stringerWidth);

    for (let i = 0; i < 3; i++) {
        const stringer = new THREE.Mesh(stringerGeometry, woodMaterial);
        stringer.position.y = palletHeight / 2;
        stringer.position.z = ((i - 1) * palletDepth / 3);
        stringer.castShadow = true;
        palletGroup.add(stringer);
    }

    // Blocks (support feet)
    const blockGeometry = new THREE.BoxGeometry(0.15, stringerHeight, 0.15);
    const blockPositions = [
        { x: -palletWidth / 3, z: -palletDepth / 3 },
        { x: -palletWidth / 3, z: 0 },
        { x: -palletWidth / 3, z: palletDepth / 3 },
        { x: palletWidth / 3, z: -palletDepth / 3 },
        { x: palletWidth / 3, z: 0 },
        { x: palletWidth / 3, z: palletDepth / 3 }
    ];

    blockPositions.forEach(pos => {
        const block = new THREE.Mesh(blockGeometry, woodMaterial);
        block.position.set(pos.x, palletHeight / 2, pos.z);
        block.castShadow = true;
        palletGroup.add(block);
    });

    return palletGroup;
}

/**
 * Create stacked cardboard boxes on pallet
 */
function createStackedBoxes(fillLevel) {
    const boxesGroup = new THREE.Group();

    const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4a574,
        roughness: 0.8,
        metalness: 0.1
    });

    // Number of boxes based on fill level
    const maxBoxes = 12;
    const numBoxes = Math.ceil((fillLevel / 100) * maxBoxes);

    // Box dimensions (various sizes)
    const boxSizes = [
        { w: 0.4, h: 0.3, d: 0.4 },
        { w: 0.5, h: 0.35, d: 0.5 },
        { w: 0.45, h: 0.4, d: 0.45 },
        { w: 0.3, h: 0.25, d: 0.3 }
    ];

    let currentY = 0.144; // Start on top of pallet
    let layer = 0;
    const boxesPerLayer = 4;

    for (let i = 0; i < numBoxes; i++) {
        const sizeIndex = Math.floor(Math.random() * boxSizes.size);
        const size = boxSizes[i % boxSizes.length];
        
        const boxGeometry = new THREE.BoxGeometry(size.w, size.h, size.d);
        const box = new THREE.Mesh(boxGeometry, boxMaterial);

        // Position in grid pattern
        const posInLayer = i % boxesPerLayer;
        const xOffset = (posInLayer % 2) * 0.3 - 0.15;
        const zOffset = Math.floor(posInLayer / 2) * 0.3 - 0.15;

        box.position.set(xOffset, currentY + size.h / 2, zOffset);
        box.rotation.y = (Math.random() - 0.5) * 0.2; // Slight random rotation
        box.castShadow = true;
        box.receiveShadow = true;
        boxesGroup.add(box);

        // Move to next layer
        if ((i + 1) % boxesPerLayer === 0) {
            layer++;
            currentY += size.h;
        }
    }

    boxesGroup.position.y = 0;
    return boxesGroup;
}

/**
 * Create fill level glow effect
 */
function createFillLevelGlow(stockItem) {
    let colorData;
    if (stockItem.fillLevel >= 90) {
        colorData = FILL_COLORS[100];
    } else if (stockItem.fillLevel >= 60) {
        colorData = FILL_COLORS[75];
    } else if (stockItem.fillLevel >= 40) {
        colorData = FILL_COLORS[50];
    } else {
        colorData = FILL_COLORS[25];
    }

    const glowMaterial = new THREE.MeshStandardMaterial({
        color: colorData.color,
        emissive: colorData.emissive,
        emissiveIntensity: colorData.emissiveIntensity,
        transparent: true,
        opacity: 0.3,
        roughness: 0.5,
        metalness: 0.5
    });

    const glowGeometry = new THREE.BoxGeometry(1.25, 1.0, 0.85);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.y = 0.5;

    return glow;
}

/**
 * Create ABC category indicator
 */
function createCategoryIndicator(category) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#00000088';
    ctx.fillRect(0, 0, 128, 128);
    
    // Category letter
    ctx.fillStyle = '#' + ABC_COLORS[category].toString(16).padStart(6, '0');
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(category, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const geometry = new THREE.PlaneGeometry(0.2, 0.2);
    const indicator = new THREE.Mesh(geometry, material);
    
    return indicator;
}

/**
 * Update stock item visuals
 */
function updateStockVisuals(stockItems, deltaTime) {
    stockItems.forEach(item => {
        item.update(deltaTime);
    });
}

/**
 * Update stock level for a specific item
 */
function updateStockLevel(stockItems, locationId, newLevel) {
    const item = stockItems.find(stock => stock.location.id === locationId);
    if (item) {
        item.setFillLevel(newLevel);
        console.log(`Updated ${locationId} stock level to ${newLevel}%`);
    }
}

/**
 * Get stock statistics
 */
function getStockStatistics(stockItems) {
    const totalLocations = stockItems.length;
    const occupiedLocations = stockItems.filter(item => item.fillLevel > 0).length;
    const avgFillLevel = stockItems.reduce((sum, item) => sum + item.fillLevel, 0) / totalLocations;

    return {
        total: totalLocations,
        occupied: occupiedLocations,
        fillRate: Math.round((occupiedLocations / totalLocations) * 100),
        avgFillLevel: Math.round(avgFillLevel)
    };
}

/**
 * Perform stock verification - analyze stock levels and generate report
 */
function performStockVerification(stockItems) {
    const verification = {
        timestamp: new Date().toISOString(),
        totalItems: stockItems.length,
        occupied: 0,
        empty: 0,
        lowStock: [],
        fullStock: [],
        byCategory: { A: 0, B: 0, C: 0 },
        byFillLevel: { critical: 0, low: 0, medium: 0, high: 0, full: 0 }
    };

    stockItems.forEach(item => {
        // Count occupied/empty
        if (item.fillLevel > 0) {
            verification.occupied++;
        } else {
            verification.empty++;
        }

        // Category counts
        verification.byCategory[item.category]++;

        // Fill level analysis
        if (item.fillLevel === 0) {
            verification.byFillLevel.critical++;
        } else if (item.fillLevel <= 25) {
            verification.byFillLevel.low++;
            verification.lowStock.push({
                id: item.id,
                location: item.location.id,
                fillLevel: item.fillLevel,
                category: item.category
            });
        } else if (item.fillLevel <= 50) {
            verification.byFillLevel.medium++;
        } else if (item.fillLevel < 90) {
            verification.byFillLevel.high++;
        } else {
            verification.byFillLevel.full++;
            verification.fullStock.push({
                id: item.id,
                location: item.location.id,
                fillLevel: item.fillLevel,
                category: item.category
            });
        }
    });

    verification.fillRate = ((verification.occupied / verification.totalItems) * 100).toFixed(1);
    verification.alerts = generateStockAlerts(verification);

    console.log('📋 Stock Verification Report:', verification);
    return verification;
}

/**
 * Generate alerts based on stock verification
 */
function generateStockAlerts(verification) {
    const alerts = [];

    // Critical: Too many empty locations
    if (verification.empty > verification.totalItems * 0.5) {
        alerts.push({
            level: 'warning',
            message: `Low occupancy: ${verification.empty} empty locations (${((verification.empty / verification.totalItems) * 100).toFixed(1)}%)`
        });
    }

    // Low stock items
    if (verification.lowStock.length > 0) {
        alerts.push({
            level: 'warning',
            message: `${verification.lowStock.length} items with low stock (<25%)`
        });
    }

    // Overstocked
    if (verification.fullStock.length > verification.totalItems * 0.7) {
        alerts.push({
            level: 'info',
            message: `High stock levels: ${verification.fullStock.length} items near capacity`
        });
    }

    // Critical empty
    if (verification.byFillLevel.critical > verification.totalItems * 0.3) {
        alerts.push({
            level: 'critical',
            message: `${verification.byFillLevel.critical} empty locations need restocking`
        });
    }

    return alerts;
}

/**
 * Display stock verification results in console
 */
function displayStockVerificationReport(verification) {
    console.log('\n' + '='.repeat(60));
    console.log('📦 STOCK VERIFICATION REPORT');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${new Date(verification.timestamp).toLocaleString()}`);
    console.log(`\nOccupancy:`);
    console.log(`  Total Locations: ${verification.totalItems}`);
    console.log(`  Occupied: ${verification.occupied} (${verification.fillRate}%)`);
    console.log(`  Empty: ${verification.empty} (${((verification.empty / verification.totalItems) * 100).toFixed(1)}%)`);
    
    console.log(`\nBy Category (ABC Analysis):`);
    console.log(`  Category A: ${verification.byCategory.A} items`);
    console.log(`  Category B: ${verification.byCategory.B} items`);
    console.log(`  Category C: ${verification.byCategory.C} items`);
    
    console.log(`\nBy Fill Level:`);
    console.log(`  Critical (0%): ${verification.byFillLevel.critical}`);
    console.log(`  Low (1-25%): ${verification.byFillLevel.low}`);
    console.log(`  Medium (26-50%): ${verification.byFillLevel.medium}`);
    console.log(`  High (51-89%): ${verification.byFillLevel.high}`);
    console.log(`  Full (90-100%): ${verification.byFillLevel.full}`);
    
    if (verification.alerts.length > 0) {
        console.log(`\n⚠️  Alerts (${verification.alerts.length}):`);
        verification.alerts.forEach((alert, i) => {
            const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`  ${icon} ${alert.message}`);
        });
    } else {
        console.log(`\n✅ No alerts - Stock levels are optimal`);
    }
    
    if (verification.lowStock.length > 0 && verification.lowStock.length <= 10) {
        console.log(`\n📋 Low Stock Items:`);
        verification.lowStock.forEach(item => {
            console.log(`  - ${item.id} (${item.location}): ${item.fillLevel}% [${item.category}]`);
        });
    }
    
    console.log('='.repeat(60) + '\n');
    
    return verification;
}

/**
 * Highlight stock items by filter criteria
 */
function highlightStockByFilter(stockItems, filter) {
    stockItems.forEach(item => {
        let shouldHighlight = false;
        
        switch (filter) {
            case 'low':
                shouldHighlight = item.fillLevel > 0 && item.fillLevel <= 25;
                break;
            case 'empty':
                shouldHighlight = item.fillLevel === 0;
                break;
            case 'full':
                shouldHighlight = item.fillLevel >= 90;
                break;
            case 'categoryA':
                shouldHighlight = item.category === 'A';
                break;
            case 'categoryB':
                shouldHighlight = item.category === 'B';
                break;
            case 'categoryC':
                shouldHighlight = item.category === 'C';
                break;
            default:
                shouldHighlight = false;
        }
        
        if (item.model && shouldHighlight) {
            // Add highlight effect
            if (!item.highlightMesh) {
                const highlightGeometry = new THREE.BoxGeometry(1.3, 1.3, 1.3);
                const highlightMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffff00,
                    transparent: true,
                    opacity: 0.3,
                    wireframe: true
                });
                item.highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
                item.highlightMesh.position.copy(item.model.position);
                item.model.parent.add(item.highlightMesh);
            }
            item.highlightMesh.visible = true;
        } else if (item.highlightMesh) {
            item.highlightMesh.visible = false;
        }
    });
    
    console.log(`🔍 Highlighting items: ${filter}`);
}

/**
 * Clear all highlight effects
 */
function clearStockHighlights(stockItems) {
    stockItems.forEach(item => {
        if (item.highlightMesh) {
            item.highlightMesh.visible = false;
        }
    });
    console.log('✨ Highlights cleared');
}
