/**
 * Shared Supabase Realtime Sync
 * Dispatches CustomEvents for all pages to consume.
 */
(function () {
    const state = {
        started: false,
        channels: {}
    };

    async function waitForSupabase(maxWait) {
        const start = Date.now();
        while (!window.supabaseClient && Date.now() - start < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return window.supabaseClient;
    }

    async function start() {
        if (state.started) return true;
        const client = await waitForSupabase(10000);
        if (!client) {
            console.warn('[RealtimeSync] Supabase not available');
            return false;
        }

        const tables = ['agvs', 'stock_items', 'tasks', 'locations'];
        tables.forEach((table) => {
            const channel = client
                .channel(`dt:${table}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table },
                    (payload) => {
                        const detail = {
                            table,
                            eventType: payload.eventType,
                            new: payload.new || null,
                            old: payload.old || null
                        };
                        window.dispatchEvent(new CustomEvent(`dt:${table}`, { detail }));
                        window.dispatchEvent(new CustomEvent('dt:realtime', { detail }));
                    }
                )
                .subscribe();
            state.channels[table] = channel;
        });

        state.started = true;
        console.log('[RealtimeSync] Subscribed to agvs, stock_items, tasks, locations');
        return true;
    }

    function stop() {
        if (!state.started || !window.supabaseClient) return;
        Object.values(state.channels).forEach(channel => {
            window.supabaseClient.removeChannel(channel);
        });
        state.channels = {};
        state.started = false;
        console.log('[RealtimeSync] Stopped');
    }

    window.DTRealtime = {
        start,
        stop,
        isStarted: () => state.started
    };
})();
