/**
 * Data Pipeline Module - Digital Twin WMS
 * Architecture 100% Docker locale (SANS Supabase)
 * Handles data processing via API locale avec IndexedDB cache
 */

class DataPipeline {
    constructor() {
        this.cache = new Map();
        this.indexedDB = null;
        this.dbName = 'WarehouseDB';
        this.dbVersion = 1;
        this.batchSize = 1000;
        this.apiBase = window.API_CONFIG?.BASE_URL || '/api';
        this.initDB();
    }

    /**
     * Fetch data from local API (remplace Supabase)
     */
    async fetchFromAPI(endpoint, options = {}) {
        try {
            const url = `${this.apiBase}/${endpoint}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
            return [];
        }
    }

    /**
     * Charger les locations depuis l'API locale
     */
    async loadLocations() {
        try {
            console.log('📍 Fetching locations from local API...');
            const locations = await this.fetchFromAPI('locations');
            console.log(`✅ Loaded ${locations.length} locations`);
            await this.saveData(locations, 'locations');
            return locations;
        } catch (error) {
            console.error('❌ Error loading locations:', error);
            return [];
        }
    }

    /**
     * Charger les stock items depuis l'API locale
     */
    async loadStockItems() {
        try {
            console.log('📦 Fetching stock items from local API...');
            const stockItems = await this.fetchFromAPI('stock_items');
            console.log(`✅ Loaded ${stockItems.length} stock items`);
            await this.saveData(stockItems, 'stockData');
            return stockItems;
        } catch (error) {
            console.error('❌ Error loading stock items:', error);
            return [];
        }
    }

    /**
     * Charger les AGVs depuis l'API locale
     */
    async loadAGVs() {
        try {
            console.log('🤖 Fetching AGVs from local API...');
            const agvs = await this.fetchFromAPI('agvs');
            console.log(`✅ Loaded ${agvs.length} AGVs`);
            await this.saveData(agvs, 'agvs');
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
        console.log('🚀 Loading all data from local API...');
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

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.indexedDB = request.result;
                console.log('📦 IndexedDB initialized');
                resolve(this.indexedDB);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

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
            };
        });
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
