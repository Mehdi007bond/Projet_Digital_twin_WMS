/**
 * Digital Twin WMS - Warehouse 3D Model
 * Creates detailed warehouse environment (50m x 30m x 10m)
 */

/**
 * Create the complete warehouse environment
 * @param {THREE.Scene} scene - The Three.js scene
 * @returns {THREE.Group} The warehouse group
 */
function createWarehouse(scene) {
    const warehouseGroup = new THREE.Group();
    warehouseGroup.name = 'Warehouse';

    // Warehouse dimensions
    const width = 50;  // 50 meters
    const depth = 30;  // 30 meters
    const height = 10; // 10 meters

    // Create floor
    const floor = createFloor(width, depth);
    warehouseGroup.add(floor);

    // Create walls
    const walls = createWalls(width, depth, height);
    warehouseGroup.add(walls);

    // Ceiling removed for better top-down view
    // const ceiling = createCeiling(width, depth, height);
    // warehouseGroup.add(ceiling);

    // Create support columns
    const columns = createColumns(width, depth, height);
    warehouseGroup.add(columns);

    // Create zone markings
    const zones = createZoneMarkings(width, depth);
    warehouseGroup.add(zones);

    // Add warehouse lights
    addWarehouseLights(scene, width, depth, height);

    scene.add(warehouseGroup);
    return warehouseGroup;
}

/**
 * Create the warehouse floor with realistic texture
 */
function createFloor(width, depth) {
    const floorGroup = new THREE.Group();
    floorGroup.name = 'Floor';

    // Main concrete floor
    const floorGeometry = new THREE.PlaneGeometry(width, depth, 20, 20);
    
    // Create procedural concrete texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base concrete color
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add grid pattern
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    const gridSize = 64;
    for (let i = 0; i <= 512; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
    }
    
    // Add some noise for realism
    for (let i = 0; i < 1000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = Math.random() * 3;
        ctx.fillStyle = `rgba(${Math.random() * 50 + 30}, ${Math.random() * 50 + 30}, ${Math.random() * 50 + 30}, 0.3)`;
        ctx.fillRect(x, y, size, size);
    }
    
    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4, 4);
    
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.8,
        metalness: 0.2
    });
    
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floorGroup.add(floor);

    // Yellow lane markings
    createLaneMarkings(floorGroup, width, depth);

    return floorGroup;
}

/**
 * Create yellow lane markings on floor
 */
function createLaneMarkings(floorGroup, width, depth) {
    const yellowMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    
    // Main aisles (yellow lines)
    const aislePositions = [
        { x: -15, y: 0.01, z: 0, rotation: 0, width: 0.2, length: depth },
        { x: 0, y: 0.01, z: 0, rotation: 0, width: 0.2, length: depth },
        { x: 15, y: 0.01, z: 0, rotation: 0, width: 0.2, length: depth },
    ];
    
    aislePositions.forEach(pos => {
        const geometry = new THREE.PlaneGeometry(pos.width, pos.length);
        const line = new THREE.Mesh(geometry, yellowMaterial);
        line.rotation.x = -Math.PI / 2;
        line.position.set(pos.x, pos.y, pos.z);
        floorGroup.add(line);
    });

    // Cross aisles
    for (let z = -depth/2 + 5; z < depth/2; z += 10) {
        const geometry = new THREE.PlaneGeometry(width, 0.2);
        const line = new THREE.Mesh(geometry, yellowMaterial);
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.01, z);
        floorGroup.add(line);
    }
}

/**
 * Create warehouse walls with dock doors
 */
function createWalls(width, depth, height) {
    const wallsGroup = new THREE.Group();
    wallsGroup.name = 'Walls';

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.9,
        metalness: 0.1
    });

    // Back wall (reception - 3 doors)
    const backWall = createWallWithDoors(width, height, 3, 0x90ee90);
    backWall.position.set(0, height / 2, -depth / 2);
    wallsGroup.add(backWall);

    // Front wall (expedition - 3 doors)
    const frontWall = createWallWithDoors(width, height, 3, 0x87ceeb);
    frontWall.position.set(0, height / 2, depth / 2);
    frontWall.rotation.y = Math.PI;
    wallsGroup.add(frontWall);

    // Left wall
    const leftWallGeometry = new THREE.BoxGeometry(0.3, height, depth);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-width / 2, height / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    wallsGroup.add(leftWall);

    // Right wall
    const rightWall = leftWall.clone();
    rightWall.position.set(width / 2, height / 2, 0);
    wallsGroup.add(rightWall);

    return wallsGroup;
}

/**
 * Create a wall segment with dock doors
 */
function createWallWithDoors(width, height, doorCount, doorColor) {
    const wallGroup = new THREE.Group();
    
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.9,
        metalness: 0.1
    });
    
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: doorColor,
        roughness: 0.5,
        metalness: 0.3
    });

    const doorWidth = 4;
    const doorHeight = 5;
    const spacing = width / (doorCount + 1);

    // Create wall sections between doors
    for (let i = 0; i <= doorCount; i++) {
        const startX = -width / 2 + i * spacing;
        const endX = i === doorCount ? width / 2 : startX + spacing - doorWidth / 2;
        const sectionWidth = endX - startX;
        
        if (sectionWidth > 0.1) {
            const wallGeometry = new THREE.BoxGeometry(sectionWidth, height, 0.3);
            const wallSection = new THREE.Mesh(wallGeometry, wallMaterial);
            wallSection.position.x = (startX + endX) / 2;
            wallSection.castShadow = true;
            wallSection.receiveShadow = true;
            wallGroup.add(wallSection);
        }

        // Add door
        if (i < doorCount) {
            const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 0.2);
            const door = new THREE.Mesh(doorGeometry, doorMaterial);
            door.position.set(startX + spacing / 2, doorHeight / 2 - height / 2, 0);
            wallGroup.add(door);

            // Door frame
            const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
            const frameThickness = 0.2;
            
            // Top frame
            const topFrame = new THREE.Mesh(
                new THREE.BoxGeometry(doorWidth + frameThickness, frameThickness, 0.3),
                frameMaterial
            );
            topFrame.position.set(door.position.x, doorHeight - height / 2, 0);
            wallGroup.add(topFrame);
        }
    }

    return wallGroup;
}

/**
 * Create ceiling with metal beam structure
 */
function createCeiling(width, depth, height) {
    const ceilingGroup = new THREE.Group();
    ceilingGroup.name = 'Ceiling';

    // Main ceiling panels
    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3a3a,
        roughness: 0.7,
        metalness: 0.3,
        side: THREE.DoubleSide
    });

    const ceilingGeometry = new THREE.PlaneGeometry(width, depth);
    const ceiling = new THREE.Mesh(ceilingGeometry, panelMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    ceiling.receiveShadow = true;
    ceilingGroup.add(ceiling);

    // Metal beams
    const beamMaterial = new THREE.MeshStandardMaterial({
        color: 0x505050,
        roughness: 0.6,
        metalness: 0.8
    });

    // Longitudinal beams
    for (let x = -width / 2; x <= width / 2; x += 10) {
        const beamGeometry = new THREE.BoxGeometry(0.3, 0.4, depth);
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.set(x, height - 0.2, 0);
        beam.castShadow = true;
        ceilingGroup.add(beam);
    }

    // Transverse beams
    for (let z = -depth / 2; z <= depth / 2; z += 10) {
        const beamGeometry = new THREE.BoxGeometry(width, 0.4, 0.3);
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.set(0, height - 0.2, z);
        beam.castShadow = true;
        ceilingGroup.add(beam);
    }

    return ceilingGroup;
}

/**
 * Create support columns throughout warehouse
 */
function createColumns(width, depth, height) {
    const columnsGroup = new THREE.Group();
    columnsGroup.name = 'Columns';

    const columnMaterial = new THREE.MeshStandardMaterial({
        color: 0x505050,
        roughness: 0.6,
        metalness: 0.8
    });

    const columnRadius = 0.3;
    const columnGeometry = new THREE.CylinderGeometry(columnRadius, columnRadius, height, 8);

    // Place columns every 10m
    for (let x = -width / 2 + 10; x < width / 2; x += 10) {
        for (let z = -depth / 2 + 10; z < depth / 2; z += 10) {
            const column = new THREE.Mesh(columnGeometry, columnMaterial);
            column.position.set(x, height / 2, z);
            column.castShadow = true;
            column.receiveShadow = true;
            columnsGroup.add(column);
        }
    }

    return columnsGroup;
}

/**
 * Create zone markings on floor
 */
function createZoneMarkings(width, depth) {
    const zonesGroup = new THREE.Group();
    zonesGroup.name = 'Zones';

    const zones = [
        { name: 'Reception', color: 0x90ee90, x: 0, z: -depth / 2 + 5, width: width, depth: 8 },
        { name: 'Storage', color: 0x808080, x: 0, z: 0, width: width, depth: depth - 16 },
        { name: 'Expedition', color: 0x87ceeb, x: 0, z: depth / 2 - 5, width: width, depth: 8 },
        { name: 'Charging', color: 0xffcc00, x: -width / 2 + 5, z: -depth / 2 + 5, width: 8, depth: 8 }
    ];

    zones.forEach(zone => {
        const geometry = new THREE.PlaneGeometry(zone.width, zone.depth);
        const material = new THREE.MeshBasicMaterial({
            color: zone.color,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        
        const zonePlane = new THREE.Mesh(geometry, material);
        zonePlane.rotation.x = -Math.PI / 2;
        zonePlane.position.set(zone.x, 0.02, zone.z);
        zonesGroup.add(zonePlane);

        // Zone border
        const borderMaterial = new THREE.LineBasicMaterial({ color: zone.color, linewidth: 2 });
        const borderGeometry = new THREE.EdgesGeometry(geometry);
        const border = new THREE.LineSegments(borderGeometry, borderMaterial);
        border.rotation.x = -Math.PI / 2;
        border.position.set(zone.x, 0.03, zone.z);
        zonesGroup.add(border);
    });

    return zonesGroup;
}

/**
 * Add warehouse lighting system
 */
function addWarehouseLights(scene, width, depth, height) {
    // Warehouse ceiling lights (industrial LED panels)
    const lightColor = 0xffffff;
    const lightIntensity = 0.3;
    
    for (let x = -width / 2 + 8; x < width / 2; x += 10) {
        for (let z = -depth / 2 + 8; z < depth / 2; z += 10) {
            const spotLight = new THREE.SpotLight(lightColor, lightIntensity);
            spotLight.position.set(x, height - 1, z);
            spotLight.angle = Math.PI / 6;
            spotLight.penumbra = 0.3;
            spotLight.decay = 2;
            spotLight.distance = 25;
            spotLight.castShadow = true;
            spotLight.shadow.mapSize.width = 512;
            spotLight.shadow.mapSize.height = 512;
            spotLight.shadow.camera.near = 1;
            spotLight.shadow.camera.far = 20;
            scene.add(spotLight);

            // Light fixture (visual only)
            const fixtureGeometry = new THREE.BoxGeometry(1, 0.1, 1);
            const fixtureMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
            fixture.position.set(x, height - 0.5, z);
            scene.add(fixture);
        }
    }
}
