/**
 * Digital Twin WMS - Pallet Racking System
 * Creates metal pallet racks (3 rows × 5 bays × 4 levels)
 */

/**
 * Create the complete racking system
 * @param {THREE.Scene} scene - The Three.js scene
 * @returns {Object} Rack system with location data
 */
function createRacks(scene) {
    const rackSystem = {
        racks: [],
        locations: []
    };

    const rows = 3;
    const baysPerRow = 5;
    const levels = 4; // Ground + 3 elevated

    // Rack dimensions (standard pallet rack)
    const bayWidth = 2.7;  // Width of one bay (for 1.2m pallet + clearance)
    const rackDepth = 1.0; // Depth of rack
    const levelHeight = 2.0; // Height between levels
    const firstLevelHeight = 0.3; // Ground level height

    // Spacing between rack rows
    const aisleWidth = 3.5;

    // Materials
    const uprightMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e3a8a, // Dark blue
        roughness: 0.6,
        metalness: 0.8
    });

    const beamMaterial = new THREE.MeshStandardMaterial({
        color: 0xf97316, // Orange
        roughness: 0.6,
        metalness: 0.8
    });

    const deckingMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080, // Gray
        roughness: 0.7,
        metalness: 0.5,
        wireframe: false
    });

    // Create racks for each row
    for (let row = 0; row < rows; row++) {
        const rowZ = (row - 1) * (rackDepth + aisleWidth);

        for (let bay = 0; bay < baysPerRow; bay++) {
            const bayX = (bay - Math.floor(baysPerRow / 2)) * bayWidth;

            const rackGroup = new THREE.Group();
            rackGroup.name = `Rack_R${row + 1}_B${bay + 1}`;
            rackGroup.position.set(bayX, 0, rowZ);

            // Create uprights (vertical posts)
            createUprights(rackGroup, bayWidth, rackDepth, levels, levelHeight, firstLevelHeight, uprightMaterial);

            // Create beams and decking for each level
            for (let level = 0; level < levels; level++) {
                const levelY = firstLevelHeight + level * levelHeight;
                
                // Horizontal beams
                createBeams(rackGroup, bayWidth, rackDepth, levelY, beamMaterial);
                
                // Wire mesh decking
                createDecking(rackGroup, bayWidth, rackDepth, levelY, deckingMaterial);

                // Store location data
                rackSystem.locations.push({
                    id: `R${row + 1}B${bay + 1}L${level + 1}`,
                    row: row + 1,
                    bay: bay + 1,
                    level: level + 1,
                    position: new THREE.Vector3(
                        bayX,
                        levelY + 0.15,
                        rowZ
                    ),
                    occupied: false,
                    stock: null
                });
            }

            // Add rack label
            addRackLabel(rackGroup, `R${row + 1}-B${bay + 1}`, bayWidth / 2, levels * levelHeight);

            scene.add(rackGroup);
            rackSystem.racks.push(rackGroup);
        }
    }

    console.log(`✓ Created ${rackSystem.racks.length} rack bays with ${rackSystem.locations.length} locations`);
    return rackSystem;
}

/**
 * Create vertical uprights for rack
 */
function createUprights(group, bayWidth, rackDepth, levels, levelHeight, firstLevelHeight, material) {
    const uprightHeight = firstLevelHeight + levels * levelHeight;
    const uprightWidth = 0.08;
    const uprightDepth = 0.08;

    const uprightGeometry = new THREE.BoxGeometry(uprightWidth, uprightHeight, uprightDepth);

    // Four corner uprights
    const positions = [
        { x: -bayWidth / 2, z: -rackDepth / 2 },
        { x: -bayWidth / 2, z: rackDepth / 2 },
        { x: bayWidth / 2, z: -rackDepth / 2 },
        { x: bayWidth / 2, z: rackDepth / 2 }
    ];

    positions.forEach(pos => {
        const upright = new THREE.Mesh(uprightGeometry, material);
        upright.position.set(pos.x, uprightHeight / 2, pos.z);
        upright.castShadow = true;
        upright.receiveShadow = true;
        group.add(upright);
    });

    // Cross bracing (diagonal supports)
    const bracingMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        roughness: 0.6,
        metalness: 0.8
    });

    // Back bracing
    for (let level = 0; level < levels; level++) {
        const y = firstLevelHeight + level * levelHeight;
        const braceGeometry = new THREE.BoxGeometry(0.04, Math.sqrt(bayWidth * bayWidth + levelHeight * levelHeight), 0.04);
        
        const brace1 = new THREE.Mesh(braceGeometry, bracingMaterial);
        brace1.position.set(0, y + levelHeight / 2, -rackDepth / 2);
        brace1.rotation.z = Math.atan2(levelHeight, bayWidth);
        group.add(brace1);

        const brace2 = new THREE.Mesh(braceGeometry, bracingMaterial);
        brace2.position.set(0, y + levelHeight / 2, -rackDepth / 2);
        brace2.rotation.z = -Math.atan2(levelHeight, bayWidth);
        group.add(brace2);
    }
}

/**
 * Create horizontal beams for rack level
 */
function createBeams(group, bayWidth, rackDepth, levelY, material) {
    const beamWidth = 0.1;
    const beamHeight = 0.08;

    // Front beam
    const frontBeamGeometry = new THREE.BoxGeometry(bayWidth, beamHeight, beamWidth);
    const frontBeam = new THREE.Mesh(frontBeamGeometry, material);
    frontBeam.position.set(0, levelY, rackDepth / 2);
    frontBeam.castShadow = true;
    group.add(frontBeam);

    // Back beam
    const backBeam = frontBeam.clone();
    backBeam.position.set(0, levelY, -rackDepth / 2);
    group.add(backBeam);

    // Side beams
    const sideBeamGeometry = new THREE.BoxGeometry(beamWidth, beamHeight, rackDepth);
    
    const leftBeam = new THREE.Mesh(sideBeamGeometry, material);
    leftBeam.position.set(-bayWidth / 2, levelY, 0);
    leftBeam.castShadow = true;
    group.add(leftBeam);

    const rightBeam = leftBeam.clone();
    rightBeam.position.set(bayWidth / 2, levelY, 0);
    group.add(rightBeam);
}

/**
 * Create wire mesh decking for rack level
 */
function createDecking(group, bayWidth, rackDepth, levelY, material) {
    const deckingThickness = 0.02;
    
    // Create wire mesh appearance
    const deckingGeometry = new THREE.PlaneGeometry(bayWidth - 0.2, rackDepth - 0.2, 10, 6);
    
    // Create wire mesh material
    const meshMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });

    const decking = new THREE.Mesh(deckingGeometry, meshMaterial);
    decking.rotation.x = -Math.PI / 2;
    decking.position.set(0, levelY + 0.05, 0);
    decking.receiveShadow = true;
    group.add(decking);

    // Add wire grid overlay
    const wireGeometry = new THREE.EdgesGeometry(deckingGeometry);
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x606060 });
    const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
    wireframe.rotation.x = -Math.PI / 2;
    wireframe.position.set(0, levelY + 0.06, 0);
    group.add(wireframe);
}

/**
 * Add label to rack
 */
function addRackLabel(group, label, x, y) {
    // Create a canvas for the label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 256, 128);
    
    // Border
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 128);
    
    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const labelGeometry = new THREE.PlaneGeometry(0.5, 0.25);
    const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
    labelMesh.position.set(x, y + 0.3, 0);
    labelMesh.name = 'RackLabel';
    group.add(labelMesh);
}

/**
 * Get rack location by ID
 */
function getRackLocation(rackSystem, locationId) {
    return rackSystem.locations.find(loc => loc.id === locationId);
}

/**
 * Get available rack locations
 */
function getAvailableLocations(rackSystem) {
    return rackSystem.locations.filter(loc => !loc.occupied);
}

/**
 * Mark location as occupied
 */
function occupyLocation(rackSystem, locationId, stockItem) {
    const location = getRackLocation(rackSystem, locationId);
    if (location) {
        location.occupied = true;
        location.stock = stockItem;
        return true;
    }
    return false;
}

/**
 * Mark location as empty
 */
function freeLocation(rackSystem, locationId) {
    const location = getRackLocation(rackSystem, locationId);
    if (location) {
        location.occupied = false;
        location.stock = null;
        return true;
    }
    return false;
}
