/**
 * Digital Twin WMS - Stock and Pallet Visualization
 * Creates pallets, boxes, and manages stock levels
 */

// Fill level color mapping (synced with 2D warehouse-2d.css)
const FILL_COLORS = {
    full:   { color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.5 },  // Green  (≥90%)
    medium: { color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.3 },  // Amber  (25-89%)
    low:    { color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.3 },  // Red    (1-24%)
    empty:  null  // Hidden (0%)
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

        // Determine color based on fill level (same thresholds as 2D)
        let colorData;
        if (this.fillLevel >= 90) {
            colorData = FILL_COLORS.full;      // Green  ≥90%
        } else if (this.fillLevel >= 25) {
            colorData = FILL_COLORS.medium;    // Amber  25-89%
        } else if (this.fillLevel > 0) {
            colorData = FILL_COLORS.low;       // Red    1-24%
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

    // Fill ALL locations (100%) - real data comes from Supabase sync
    for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        
        // Placeholder fill level - will be overridden by syncStockFromSupabase()
        const fillLevel = 50;
        const category = 'C';

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

    console.log(`✓ Created ${stockItems.length} stock items (100% coverage, awaiting Supabase sync)`);
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
    if (glow) {
        stockGroup.add(glow);
    }
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
    // Skip glow for empty items
    if (stockItem.fillLevel <= 0) return null;

    let colorData;
    if (stockItem.fillLevel >= 90) {
        colorData = FILL_COLORS.full;       // Green  ≥90%
    } else if (stockItem.fillLevel >= 25) {
        colorData = FILL_COLORS.medium;     // Amber  25-89%
    } else {
        colorData = FILL_COLORS.low;        // Red    1-24%
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

/**
 * Sync stock items with Supabase data
 * Loads fill_level, sku, product_name, quality_tier from database
 * and applies them to existing 3D stock items matched by location ID
 * @param {Array<StockItem>} stockItems - 3D stock items from createStock()
 * @returns {Promise<number>} Number of items synced
 */
async function syncStockFromSupabase(stockItems) {
    try {
        console.log('🔄 Syncing 3D stock with Supabase...');
        
        // Wait for Supabase
        let attempts = 0;
        while (!window.supabaseClient && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase not available, keeping local stock data');
            return 0;
        }

        const { data: dbStock, error } = await window.supabaseClient
            .from('stock_items')
            .select('*');

        if (error) {
            console.error('❌ Error fetching stock from Supabase:', error);
            return 0;
        }

        if (!dbStock || dbStock.length === 0) {
            console.warn('⚠️ No stock items in Supabase');
            return 0;
        }

        console.log(`📦 Got ${dbStock.length} items from Supabase, matching to ${stockItems.length} 3D items...`);
        
        // Debug: show ID formats for matching
        if (dbStock.length > 0 && stockItems.length > 0) {
            console.log(`🔍 DB location_id format: "${dbStock[0].location_id}"`);
            console.log(`🔍 3D location.id format: "${stockItems[0].location?.id}"`);
        }

        let synced = 0;
        let notFound = 0;
        dbStock.forEach(dbItem => {
            // Match by location_id → location.id in 3D (format: R1B1L1)
            const item3D = stockItems.find(s => s.location && s.location.id === dbItem.location_id);
            
            if (item3D) {
                // Apply Supabase data to 3D item
                if (dbItem.fill_level !== undefined && item3D.setFillLevel) {
                    item3D.setFillLevel(dbItem.fill_level);
                }
                if (dbItem.category) item3D.category = dbItem.category;
                if (dbItem.sku) item3D.sku = dbItem.sku;
                if (dbItem.product_name) item3D.product_name = dbItem.product_name;
                if (dbItem.quality_tier) item3D.quality_tier = dbItem.quality_tier;
                item3D.supabaseId = dbItem.id; // Store DB id for future writes
                synced++;
            } else {
                notFound++;
                if (notFound <= 3) {
                    console.warn(`⚠️ No 3D match for DB location_id="${dbItem.location_id}"`);
                }
            }
        });

        if (notFound > 3) {
            console.warn(`⚠️ ${notFound} total DB items had no 3D match. Run REBUILD_FOR_3D.sql to align IDs.`);
        }

        console.log(`✅ Synced ${synced}/${dbStock.length} stock items from Supabase to 3D`);
        return synced;
    } catch (err) {
        console.error('❌ syncStockFromSupabase error:', err);
        return 0;
    }
}

/**
 * Push a stock item change from 3D to Supabase
 * @param {StockItem} item - The 3D stock item that changed
 */
async function pushStockToSupabase(item) {
    if (!window.supabaseClient || !item.location) return;
    
    try {
        const updates = {
            fill_level: item.fillLevel,
            category: item.category
        };

        const { error } = await window.supabaseClient
            .from('stock_items')
            .update(updates)
            .eq('location_id', item.location.id);

        if (error) {
            console.error(`❌ Failed to push stock ${item.location.id} to Supabase:`, error);
        } else {
            console.log(`📤 Pushed stock update [${item.location.id}] fill=${item.fillLevel} to Supabase`);
        }
    } catch (err) {
        console.error('❌ pushStockToSupabase error:', err);
    }
}
