/**
 * Digital Twin WMS - Supabase Realtime Integration
 * Version Corrigée : Case Insensitive + Logs de Debug
 */

let supabaseClient = null;
let supabaseChannels = {};

// ═══════════════════════════════════════════════════════════════════════════
// Wrapper Function for Main.js
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize Supabase Realtime using window.digitalTwin
 * Called from main.js without parameters
 */
async function initSupabaseRealtime() {
    console.log('🚀 Starting Supabase Realtime initialization...');
    
    // Attendre que window.digitalTwin soit disponible
    let attempts = 0;
    while (!window.digitalTwin && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!window.digitalTwin) {
        console.error('❌ window.digitalTwin not available after 5s');
        return;
    }
    
    // Récupérer les AGVs et stock items depuis digitalTwin
    const agvs = window.digitalTwin.agvs || [];
    const stockItems = window.digitalTwin.stockItems || [];
    
    console.log(`✅ Found ${agvs.length} AGVs and ${stockItems.length} stock items`);
    console.log(`📋 AGV IDs disponibles:`, agvs.map(a => a.id));
    
    // Appeler la fonction d'initialisation principale
    await initWebSocket(agvs, stockItems);
}

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

async function initWebSocket(agvs, stockItems) {
    console.log('🔌 Initializing Supabase Realtime...');

    // 1. Récupération du client global
    if (window.supabaseClient) {
        supabaseClient = window.supabaseClient;
    } else {
        console.warn("⚠️ window.supabaseClient non trouvé, tentative d'attente...");
        await new Promise(r => setTimeout(r, 1000));
        supabaseClient = window.supabaseClient;
    }

    if (!supabaseClient) {
        console.error('❌ Supabase Client introuvable. Vérifie supabase-config.js');
        return;
    }

    console.log('✅ Supabase Client détecté.');

    // 2. Abonnement aux AGVs (Table 'agvs')
    supabaseChannels.agvs = supabaseClient
        .channel('realtime_agvs')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'agvs' },
            (payload) => {
                console.log(`📥 REÇU AGV UPDATE:`, payload.new);
                applyAgvUpdate(payload.new);
            }
        )
        .subscribe((status) => {
            console.log(`📡 Statut connexion AGV: ${status}`);
        });

    // 3. Abonnement au Stock (Table 'stock_items')
    supabaseChannels.stockItems = supabaseClient
        .channel('realtime_stock')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'stock_items' },
            (payload) => {
                console.log(`📥 REÇU STOCK UPDATE:`, payload.new);
                applyStockUpdate(payload.new);
            }
        )
        .subscribe((status) => {
            console.log(`📡 Statut connexion Stock: ${status}`);
        });

    // 4. Abonnement aux Tasks (Table 'tasks')
    supabaseChannels.tasks = supabaseClient
        .channel('realtime_tasks')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tasks' },
            (payload) => {
                console.log(`📥 REÇU TASK UPDATE:`, payload.new);
            }
        )
        .subscribe();

    console.log('✅ Tous les abonnements Realtime sont actifs !');
}

// ═══════════════════════════════════════════════════════════════════════════
// Core Logic : Finding & Updating Objects (CASE INSENSITIVE FIX)
// ═══════════════════════════════════════════════════════════════════════════

function applyAgvUpdate(data) {
    // 1. Récupérer la liste des AGVs depuis la source la plus fiable (Global)
    const agvList = window.digitalTwin?.agvs || window.agvs || [];

    if (agvList.length === 0) {
        console.warn("⚠️ Aucun AGV dans la scène 3D pour le moment.");
        return;
    }

    // 2. Recherche "Insensible à la casse" (Fix du problème AGV-001 vs agv-001)
    const agv = agvList.find(a => a.id.toLowerCase() === data.id.toLowerCase());

    if (agv) {
        console.log(`✅ Sync AGV [${agv.id}] -> x:${data.x_m}, z:${data.z_m}, status:${data.status}`);

        // Realtime takes control: prevent local simulation from overriding
        agv.externalControl = true;
        agv.path = [];
        agv.currentWaypointIndex = 0;
        agv.movePhase = 'arrived';
        agv.targetSpeed = 0;
        agv.speed = 0;

        // 3. Mise à jour de la position (Téléportation directe pour test)
        if (data.x_m !== undefined) agv.position.x = data.x_m;
        if (data.y_m !== undefined) agv.position.y = data.y_m;
        // Attention : Three.js Y est la hauteur. DB y_m est souvent la profondeur 2D (donc Z en 3D)
        // Vérifie ton mapping : ici je suppose que DB z_m -> 3D z
        if (data.z_m !== undefined) agv.position.z = data.z_m; 
        
        // 4. Mise à jour Rotation
        if (data.rotation_rad !== undefined) agv.rotation = data.rotation_rad;

        // 5. Mise à jour Status
        if (data.status !== undefined && agv.setStatus) {
            agv.setStatus(data.status);
        }

        // 6. Mise à jour Batterie
        if (data.battery !== undefined) {
            agv.battery = data.battery;
        }

        // 7. Mise à jour Speed
        if (data.speed_mps !== undefined) {
            agv.speed = data.speed_mps;
        }

        // Forcer la mise à jour visuelle immédiate si nécessaire
        if (agv.model) {
            agv.model.position.copy(agv.position);
            agv.model.rotation.y = agv.rotation;
        }

    } else {
        console.error(`❌ AGV introuvable ! ID Reçu: "${data.id}". IDs disponibles:`, agvList.map(a => a.id));
    }
}

function applyStockUpdate(data) {
    const stockList = window.digitalTwin?.stockItems || window.stockItems || [];
    
    if (stockList.length === 0) {
        console.warn("⚠️ Aucun stock item dans la scène 3D.");
        return;
    }

    // Recherche par location_id (plus fiable que l'ID)
    const item = stockList.find(s => s.location && s.location.id === data.location_id);

    if (item) {
        console.log(`📦 Stock Update [${data.location_id}]: Level ${data.fill_level}`);
        if (data.fill_level !== undefined && item.setFillLevel) {
            item.setFillLevel(data.fill_level);
        }
        if (data.category !== undefined) {
            item.category = data.category;
        }
        // Update SKU and product info
        if (data.sku !== undefined) {
            item.sku = data.sku;
        }
        if (data.product_name !== undefined) {
            item.product_name = data.product_name;
        }
        if (data.quality_tier !== undefined) {
            item.quality_tier = data.quality_tier;
        }

        // Dispatch event for other components on same page (KPI widgets etc.)
        window.dispatchEvent(new CustomEvent('stock:updated', { 
            detail: { locationId: data.location_id, data: data }
        }));
    } else {
        console.error(`❌ Stock item introuvable ! Location: "${data.location_id}". IDs disponibles:`, 
            stockList.slice(0, 5).map(s => s.location?.id));
    }
}

/**
 * Push AGV state from 3D to Supabase
 * Call this when AGV position changes locally (e.g., simulation)
 */
async function pushAGVToSupabase(agv) {
    if (!supabaseClient || !agv) return;
    
    try {
        const { error } = await supabaseClient
            .from('agvs')
            .update({
                x_m: agv.position.x,
                y_m: agv.position.y,
                z_m: agv.position.z,
                rotation_rad: agv.rotation,
                status: agv.status,
                battery: agv.battery,
                speed_mps: agv.speed
            })
            .eq('id', agv.id);

        if (error) console.error(`❌ Push AGV ${agv.id} failed:`, error);
    } catch (err) {
        console.error('❌ pushAGVToSupabase error:', err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Close all subscriptions
 */
function closeWebSocket() {
    if (!supabaseClient) return;
    
    Object.values(supabaseChannels).forEach(channel => {
        supabaseClient.removeChannel(channel);
    });
    
    supabaseChannels = {};
    console.log('✅ All realtime subscriptions closed');
}

// Cleanup on page unload
window.addEventListener('beforeunload', closeWebSocket);
