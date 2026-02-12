/**
 * Data Pipeline Module - Digital Twin WMS
 * Handles Supabase data loading with IndexedDB cache
 */

class DataPipeline {
    constructor() {
        this.cache = new Map();
        this.indexedDB = null;
        this.dbName = 'WarehouseDB';
        this.dbVersion = 2;
        this.batchSize = 1000;
        this.apiBase = window.API_CONFIG?.BASE_URL || '/api';
        this.initDB();
    }

    /**
     * Wait for Supabase to be initialized
     */
    async waitForSupabase(maxWait = 10000) {
        const start = Date.now();
        
        while (!window.supabaseClient && Date.now() - start < maxWait) {
            console.log('⏳ Waiting for Supabase to initialize...');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!window.supabaseClient) {
            console.error('❌ Supabase failed to initialize after 10 seconds');
            throw new Error('Supabase initialization timeout');
        }

        console.log('✅ Supabase ready!');
        return window.supabaseClient;
    }

    /**
     * Fetch data from Supabase (replaces local API)
     */
    async fetchFromSupabase(table, options = {}) {
        try {
            // CRITICAL: Wait for Supabase to be initialized first!
            const client = await this.waitForSupabase();

            console.log(`📡 Fetching from Supabase table: ${table}`);
            const { data, error } = await client
                .from(table)
                .select(options.select || '*');

            if (error) {
                console.error(`❌ Supabase error on ${table}:`, error);
                throw error;
            }

            console.log(`✅ Fetched ${data?.length || 0} records from ${table}`);
            return data || [];
        } catch (error) {
            console.error(`❌ Error fetching ${table}:`, error.message);
            return [];
        }
    }

    /**
     * Charger les locations depuis Supabase
     */
    async loadLocations() {
        try {
            console.log('📍 Fetching locations from Supabase...');
            const locations = await this.fetchFromSupabase('locations');
            console.log(`✅ Loaded ${locations.length} locations`);
            try { await this.saveData(locations, 'locations'); } catch(e) { console.warn('⚠️ IndexedDB cache failed for locations, using memory only'); }
            return locations;
        } catch (error) {
            console.error('❌ Error loading locations:', error);
            return [];
        }
    }

    /**
     * Charger les stock items depuis Supabase
     */
    async loadStockItems() {
        try {
            console.log('📦 Fetching stock items from Supabase...');
            const stockItems = await this.fetchFromSupabase('stock_items');
            console.log(`✅ Loaded ${stockItems.length} stock items`);
            try { await this.saveData(stockItems, 'stockData'); } catch(e) { console.warn('⚠️ IndexedDB cache failed for stockData, using memory only'); }
            return stockItems;
        } catch (error) {
            console.error('❌ Error loading stock items:', error);
            return [];
        }
    }

    /**
     * Charger les AGVs depuis Supabase
     */
    async loadAGVs() {
        try {
            console.log('🤖 Fetching AGVs from Supabase...');
            const agvs = await this.fetchFromSupabase('agvs');
            console.log(`✅ Loaded ${agvs.length} AGVs`);
            try { await this.saveData(agvs, 'agvs'); } catch(e) { console.warn('⚠️ IndexedDB cache failed for agvs, using memory only'); }
            return agvs;
        } catch (error) {
            console.error('❌ Error loading AGVs:', error);
            return [];
        }
    }

    /**
     * Charger toutes les données nécessaires
     */
    async loadAllData() {
        console.log('🚀 Loading all data from Supabase...');
        const [locations, stockItems, agvs] = await Promise.all([
            this.loadLocations(),
            this.loadStockItems(),
            this.loadAGVs()
        ]);

        return {
            locations,
            stockItems,
            agvs,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Mettre à jour un article de stock via l'API locale
     */
    async updateStockItem(itemId, updates) {
        try {
            if (window.supabaseClient) {
                let result = await window.supabaseClient
                    .from('stock_items')
                    .update(updates)
                    .eq('location_id', itemId)
                    .select();

                if (result.error || !result.data || result.data.length === 0) {
                    result = await window.supabaseClient
                        .from('stock_items')
                        .update(updates)
                        .eq('id', itemId)
                        .select();
                }

                if (result.error) throw result.error;
                console.log('✅ Stock item updated (Supabase):', itemId);
                return result.data?.[0] || null;
            }

            const url = `${this.apiBase}/stock_items/${itemId}`;
            const response = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                throw new Error(`Update failed: ${response.status}`);
            }

            const updated = await response.json();
            console.log('✅ Stock item updated:', itemId);
            return updated;
        } catch (error) {
            console.error('❌ Error updating stock item:', error);
            return null;
        }
    }

    /**
     * Mettre à jour un AGV via l'API locale
     */
    async updateAGV(agvId, updates) {
        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('agvs')
                    .update(updates)
                    .eq('id', agvId)
                    .select();

                if (error) throw error;
                console.log('✅ AGV updated (Supabase):', agvId);
                return data?.[0] || null;
            }

            const url = `${this.apiBase}/agvs/${agvId}`;
            const response = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                throw new Error(`Update failed: ${response.status}`);
            }

            const updated = await response.json();
            console.log('✅ AGV updated:', agvId);
            return updated;
        } catch (error) {
            console.error('❌ Error updating AGV:', error);
            return null;
        }
    }

    /**
     * Mettre à jour plusieurs items en batch
     */
    async batchUpdateStockItems(items) {
        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('stock_items')
                    .upsert(items, { onConflict: 'location_id' })
                    .select();

                if (error) throw error;
                console.log(`✅ Batch updated ${data?.length || 0} stock items (Supabase)`);
                return { updated: data?.length || 0 };
            }

            const url = `${this.apiBase}/batch/stock_items`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items)
            });

            if (!response.ok) {
                throw new Error(`Batch update failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`✅ Batch updated ${result.updated} items`);
            return result;
        } catch (error) {
            console.error('❌ Error in batch update:', error);
            return null;
        }
    }

    /**
     * Mettre à jour plusieurs AGVs en batch
     */
    async batchUpdateAGVs(agvs) {
        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('agvs')
                    .upsert(agvs, { onConflict: 'id' })
                    .select();

                if (error) throw error;
                console.log(`✅ Batch updated ${data?.length || 0} AGVs (Supabase)`);
                return { updated: data?.length || 0 };
            }

            const url = `${this.apiBase}/batch/agvs`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agvs)
            });

            if (!response.ok) {
                throw new Error(`Batch update failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`✅ Batch updated ${result.updated} AGVs`);
            return result;
        } catch (error) {
            console.error('❌ Error in batch update:', error);
            return null;
        }
    }

    /**
     * Initialize IndexedDB for persistent storage
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.warn('⚠️ IndexedDB open failed, deleting and retrying...');
                indexedDB.deleteDatabase(this.dbName);
                // Retry once after deletion
                const retry = indexedDB.open(this.dbName, this.dbVersion);
                retry.onerror = () => {
                    console.error('❌ IndexedDB retry failed, running without cache');
                    resolve(null);
                };
                retry.onsuccess = () => {
                    this.indexedDB = retry.result;
                    console.log('📦 IndexedDB initialized (after reset)');
                    resolve(this.indexedDB);
                };
                retry.onupgradeneeded = (event) => this._createStores(event.target.result);
            };
            request.onsuccess = () => {
                this.indexedDB = request.result;
                console.log('📦 IndexedDB initialized');
                resolve(this.indexedDB);
            };

            request.onupgradeneeded = (event) => this._createStores(event.target.result);
        });
    }

    /**
     * Create all required IndexedDB object stores
     */
    _createStores(db) {
        // Create object stores
        if (!db.objectStoreNames.contains('stockData')) {
            const stockStore = db.createObjectStore('stockData', { keyPath: 'id' });
            stockStore.createIndex('aisle', 'aisle', { unique: false });
            stockStore.createIndex('rack', 'rack', { unique: false });
            stockStore.createIndex('level', 'level', { unique: false });
            stockStore.createIndex('category', 'category', { unique: false });
            stockStore.createIndex('fillLevel', 'fill_level', { unique: false });
        }

        if (!db.objectStoreNames.contains('transactions')) {
            db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        }

        // Stores pour locations, agvs, tasks
        if (!db.objectStoreNames.contains('locations')) {
            db.createObjectStore('locations', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('agvs')) {
            db.createObjectStore('agvs', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('tasks')) {
            db.createObjectStore('tasks', { keyPath: 'id' });
        }
    }

    /**
     * Save large dataset to IndexedDB with batch processing
     */
    async saveData(data, storeName = 'stockData') {
        if (!this.indexedDB) await this.initDB();

        const batches = this.createBatches(data, this.batchSize);
        let savedCount = 0;

        for (const batch of batches) {
            await this.saveBatch(batch, storeName);
            savedCount += batch.length;
            console.log(`💾 Saved ${savedCount}/${data.length} items`);
        }

        // Update cache
        this.cache.set(storeName, data);
        return savedCount;
    }

    /**
     * Save a batch of data
     */
    async saveBatch(batch, storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            batch.forEach(item => store.put(item));

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Load data from IndexedDB
     */
    async loadData(storeName = 'stockData') {
        // Check cache first
        if (this.cache.has(storeName)) {
            console.log('⚡ Loading from cache');
            return this.cache.get(storeName);
        }

        if (!this.indexedDB) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const data = request.result;
                this.cache.set(storeName, data);
                console.log(`📥 Loaded ${data.length} items from IndexedDB`);
                resolve(data);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Query data with indexes for fast filtering
     */
    async queryData(storeName, indexName, value) {
        if (!this.indexedDB) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Advanced filtering with multiple criteria
     */
    async filterData(data, filters) {
        return new Promise((resolve) => {
            const filtered = data.filter(item => {
                for (const [key, value] of Object.entries(filters)) {
                    if (value === null || value === '' || value === undefined) continue;

                    if (Array.isArray(value)) {
                        if (!value.includes(item[key])) return false;
                    } else if (typeof value === 'object' && value.min !== undefined && value.max !== undefined) {
                        if (item[key] < value.min || item[key] > value.max) return false;
                    } else {
                        if (item[key] !== value) return false;
                    }
                }
                return true;
            });

            resolve(filtered);
        });
    }

    /**
     * Paginate large datasets
     */
    paginate(data, page = 1, pageSize = 20) {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return {
            data: data.slice(start, end),
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil(data.length / pageSize),
            totalItems: data.length
        };
    }

    /**
     * Sort data efficiently
     */
    sortData(data, column, direction = 'asc') {
        return [...data].sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // Handle different data types
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    /**
     * Create data batches for processing
     */
    createBatches(data, batchSize) {
        const batches = [];
        for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Aggregate data for analytics
     */
    aggregate(data, groupBy, aggregations) {
        const groups = new Map();

        // Group data
        data.forEach(item => {
            const key = item[groupBy];
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(item);
        });

        // Apply aggregations
        const result = [];
        groups.forEach((items, key) => {
            const aggregated = { [groupBy]: key };

            for (const [field, operation] of Object.entries(aggregations)) {
                switch (operation) {
                    case 'count':
                        aggregated[`${field}_count`] = items.length;
                        break;
                    case 'sum':
                        aggregated[`${field}_sum`] = items.reduce((sum, item) => sum + (item[field] || 0), 0);
                        break;
                    case 'avg':
                        aggregated[`${field}_avg`] = items.reduce((sum, item) => sum + (item[field] || 0), 0) / items.length;
                        break;
                    case 'min':
                        aggregated[`${field}_min`] = Math.min(...items.map(item => item[field] || 0));
                        break;
                    case 'max':
                        aggregated[`${field}_max`] = Math.max(...items.map(item => item[field] || 0));
                        break;
                }
            }

            result.push(aggregated);
        });

        return result;
    }

    /**
     * Process CSV files asynchronously
     */
    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n');
                    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                    const data = [];

                    // Process in batches for large files
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;

                        const values = line.split(',').map(v => v.trim());
                        const obj = {};

                        headers.forEach((header, index) => {
                            obj[header] = values[index] || '';
                        });

                        data.push(obj);

                        // Progress update for large files
                        if (i % 1000 === 0) {
                            console.log(`📄 Parsing: ${i}/${lines.length} lines`);
                        }
                    }

                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    /**
     * Export data to CSV
     */
    exportToCSV(data, filename = 'export.csv') {
        if (data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => row[header]).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    /**
     * Calculate statistics
     */
    calculateStats(data, field) {
        const values = data.map(item => item[field]).filter(v => typeof v === 'number');
        
        return {
            count: values.length,
            sum: values.reduce((a, b) => a + b, 0),
            avg: values.reduce((a, b) => a + b, 0) / values.length || 0,
            min: Math.min(...values),
            max: Math.max(...values),
            median: this.calculateMedian(values)
        };
    }

    /**
     * Calculate median
     */
    calculateMedian(values) {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        
        return sorted.length % 2 !== 0 
            ? sorted[mid] 
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Cache cleared');
    }

    /**
     * Clear all data from IndexedDB
     */
    async clearDatabase(storeName = 'stockData') {
        if (!this.indexedDB) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                this.cache.delete(storeName);
                console.log('🗑️ Database cleared');
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }
}

// Create global instance
window.dataPipeline = new DataPipeline();
console.log('✅ Data Pipeline initialized (Architecture Docker complète, API locale)');
