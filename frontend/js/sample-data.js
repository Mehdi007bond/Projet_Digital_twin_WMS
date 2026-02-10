/**
 * Demo Sample Data - Digital Twin WMS
 * Provides hardcoded sample data when Supabase is not available
 * Used for offline development and testing
 */

const DEMO_DATA = {
    // Sample Warehouse
    warehouse: {
        id: 'warehouse-1',
        name: 'Main Warehouse',
        width_m: 100,
        depth_m: 50,
        height_m: 10,
        created_at: new Date().toISOString()
    },

    // Sample Zones
    zones: [
        {
            id: 'zone-1',
            warehouse_id: 'warehouse-1',
            name: 'Storage Zone A',
            zone_type: 'storage',
            x_m: 10,
            z_m: 10,
            width_m: 30,
            depth_m: 30,
            color_hex: '#4CAF50'
        },
        {
            id: 'zone-2',
            warehouse_id: 'warehouse-1',
            name: 'Shipping Zone',
            zone_type: 'shipping',
            x_m: 50,
            z_m: 35,
            width_m: 30,
            depth_m: 10,
            color_hex: '#2196F3'
        },
        {
            id: 'zone-3',
            warehouse_id: 'warehouse-1',
            name: 'Receiving Zone',
            zone_type: 'receiving',
            x_m: 10,
            z_m: 40,
            width_m: 20,
            depth_m: 8,
            color_hex: '#FF9800'
        }
    ],

    // Sample AGVs
    agvs: [
        {
            id: 'agv-001',
            name: 'AGV-001',
            x_m: 15,
            y_m: 0.5,
            z_m: 15,
            rotation_rad: 0,
            status: 'idle',
            battery: 85,
            speed_mps: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'agv-002',
            name: 'AGV-002',
            x_m: 25,
            y_m: 0.5,
            z_m: 20,
            rotation_rad: Math.PI / 2,
            status: 'moving',
            battery: 62,
            speed_mps: 0.5,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'agv-003',
            name: 'AGV-003',
            x_m: 35,
            y_m: 0.5,
            z_m: 25,
            rotation_rad: Math.PI,
            status: 'charging',
            battery: 45,
            speed_mps: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    ],

    // Sample Stock Items (creates 100 items)
    createStockItems: function() {
        const items = [];
        const categories = ['Electronics', 'Furniture', 'Tools', 'Textiles', 'Industrial'];
        
        for (let i = 0; i < 100; i++) {
            items.push({
                id: `stock-${i + 1}`,
                location_id: `loc-${Math.floor(i / 5) + 1}`,
                fill_level: Math.floor(Math.random() * 100),
                category: categories[Math.floor(Math.random() * categories.length)],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
        return items;
    },

    // KPI Data
    kpi_stock: {
        total_items: 100,
        filled_items: 78,
        fill_rate_percent: 78.0,
        avg_fill_level: 52.3,
        unique_categories: 5,
        accuracy_percent: 99.2,
        inventory_rotation: 12.5
    },

    kpi_agv: {
        total_agvs: 3,
        idle_agvs: 1,
        moving_agvs: 1,
        charging_agvs: 1,
        utilization_percent: 66.7,
        avg_battery: 64.0,
        missions_per_hour: 24
    }
};

/**
 * Load demo data globally for testing
 */
function loadDemoData() {
    console.log('📦 Loading demo data...');
    
    // Make available globally
    window.DEMO_DATA = DEMO_DATA;
    window.DEMO_STOCK_ITEMS = DEMO_DATA.createStockItems();
    
    console.log('✅ Demo data loaded:', {
        warehouse: DEMO_DATA.warehouse,
        zones: DEMO_DATA.zones.length,
        agvs: DEMO_DATA.agvs.length,
        stock_items: window.DEMO_STOCK_ITEMS.length
    });
}

// Auto-load on script include
if (typeof window !== 'undefined') {
    loadDemoData();
}
