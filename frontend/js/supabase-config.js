/**
 * Supabase Configuration - Digital Twin WMS
 * ✅ Temps réel avec Supabase Realtime
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

window.SUPABASE_URL = 'https://kzmukwchzkakldninibv.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_NN3OZA6lywEkKLgxpRxBLA_HoQKrbGQ';

// Initialise le client Supabase GLOBALEMENT
window.supabaseClient = null;

/**
 * Initialise la connexion Supabase
 */
async function initSupabase() {
    try {
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error('❌ Supabase client not loaded. Add the CDN script');
        }

        window.supabaseClient = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );

        console.log('✅ Supabase connecté avec succès !');
        return window.supabaseClient;
    } catch (error) {
        console.error('❌ Erreur Supabase:', error);
        return null;
    }
}

/**
 * Attend que Supabase soit prêt
 */
async function waitForSupabase(maxWait = 5000) {
    const start = Date.now();
    
    while (!window.supabaseClient && Date.now() - start < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return window.supabaseClient;
}

// Auto-init dès que le document est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}
