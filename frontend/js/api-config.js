/**
 * API Configuration - Digital Twin WMS
 * Configuration pour l'API locale Docker (remplace Supabase)
 */

// Configuration de l'API locale
window.API_CONFIG = {
    // URL de base de l'API (utilise le proxy Nginx)
    BASE_URL: window.location.origin + '/api',
    
    // URL WebSocket
    WS_URL: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws',
    
    // Timeout pour les requêtes (ms)
    TIMEOUT: 10000,
};

/**
 * Client API pour remplacer Supabase
 */
class APIClient {
    constructor(config) {
        this.baseURL = config.BASE_URL;
        this.wsURL = config.WS_URL;
        this.timeout = config.TIMEOUT;
        this.ws = null;
        this.wsCallbacks = {
            onConnect: [],
            onDisconnect: [],
            onMessage: [],
            onError: []
        };
    }

    /**
     * Effectue une requête GET
     */
    async get(table, options = {}) {
        try {
            const params = new URLSearchParams();
            
            // Support du select
            if (options.select) {
                params.append('select', options.select);
            }
            
            // Support des filtres basiques
            if (options.filters) {
                Object.entries(options.filters).forEach(([key, value]) => {
                    params.append(key, value);
                });
            }
            
            const url = `${this.baseURL}/${table}${params.toString() ? '?' + params.toString() : ''}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return { data, error: null };
        } catch (error) {
            console.error(`Error fetching ${table}:`, error);
            return { data: null, error };
        }
    }

    /**
     * Effectue une requête PATCH (mise à jour)
     */
    async patch(table, id, updates) {
        try {
            const url = `${this.baseURL}/${table}?${id}`;
            
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return { data, error: null };
        } catch (error) {
            console.error(`Error updating ${table}:`, error);
            return { data: null, error };
        }
    }

    /**
     * Effectue une requête POST (création)
     */
    async post(table, data) {
        try {
            const url = `${this.baseURL}/${table}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            return { data: result, error: null };
        } catch (error) {
            console.error(`Error creating in ${table}:`, error);
            return { data: null, error };
        }
    }

    /**
     * Connect to WebSocket for real-time updates
     */
    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }

        console.log('Connecting to WebSocket:', this.wsURL);
        this.ws = new WebSocket(this.wsURL);

        this.ws.onopen = () => {
            console.log('✅ WebSocket connected');
            this.wsCallbacks.onConnect.forEach(cb => cb());
        };

        this.ws.onclose = () => {
            console.log('❌ WebSocket disconnected');
            this.wsCallbacks.onDisconnect.forEach(cb => cb());
            
            // Reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(), 5000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.wsCallbacks.onError.forEach(cb => cb(error));
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.wsCallbacks.onMessage.forEach(cb => cb(message));
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
    }

    /**
     * Subscribe to WebSocket events
     */
    on(event, callback) {
        if (this.wsCallbacks[event]) {
            this.wsCallbacks[event].push(callback);
        }
    }

    /**
     * Send message through WebSocket
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected');
        }
    }

    /**
     * Méthode helper pour from() (compatible avec Supabase)
     */
    from(table) {
        return {
            select: async (columns = '*') => {
                return await this.get(table, { select: columns });
            },
            insert: async (data) => {
                return await this.post(table, data);
            },
            update: async (updates) => {
                return {
                    eq: async (column, value) => {
                        return await this.patch(table, `${column}=eq.${value}`, updates);
                    }
                };
            }
        };
    }
}

// Créer une instance globale du client API
window.apiClient = new APIClient(window.API_CONFIG);

// Pour compatibilité avec le code existant utilisant Supabase
window.supabase = {
    createClient: () => window.apiClient
};

console.log('✅ API Client initialized:', window.API_CONFIG.BASE_URL);
