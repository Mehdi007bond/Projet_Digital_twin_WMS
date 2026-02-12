/**
 * KPI Dashboard - Digital Twin WMS
 * Fetches KPI data from backend, renders metrics, charts, and alerts.
 */

class KPIDashboard {
    constructor() {
        this.charts = {};
        this.alerts = [];
        this.refreshInterval = null;
        this.historyHours = 24;
        this.previousData = null;
    }

    // ═══════════════════════════════════════
    //  INITIALISATION
    // ═══════════════════════════════════════

    async init() {
        console.log('[KPI] Dashboard initializing...');
        
        // CRITICAL: Wait for Supabase to be ready first!
        await this.waitForSupabase();
        
        this.bindEvents();
        this.initCharts();
        await this.fetchAndRender();
        this.startAutoRefresh(30000); // 30s
        this.connectWebSocket();
        this.updateTimestamp();
        console.log('[KPI] Dashboard ready');
    }

    async waitForSupabase(maxWait = 10000) {
        const start = Date.now();
        while (!window.supabaseClient && Date.now() - start < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!window.supabaseClient) {
            console.error('[KPI] ❌ Supabase initialization timeout');
        } else {
            console.log('[KPI] ✅ Supabase ready');
        }
    }

    bindEvents() {
        // Chart range buttons
        document.querySelectorAll('.chart-range-btn[data-hours]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-range-btn[data-hours]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.historyHours = parseInt(e.target.dataset.hours);
                this.fetchHistory();
            });
        });

        // Clear alerts
        const clearBtn = document.getElementById('clearAlerts');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.alerts = [];
                this.renderAlerts();
            });
        }
    }

    // ═══════════════════════════════════════
    //  DATA FETCHING
    // ═══════════════════════════════════════

    async fetchAndRender() {
        try {
            const [summary, history] = await Promise.all([
                this.fetchJSON('/api/kpis/summary'),
                this.fetchJSON(`/api/kpis/history?hours=${this.historyHours}`)
            ]);

            if (summary) {
                this.renderSummary(summary);
                this.renderStockKPIs(summary.stock);
                this.renderAGVKPIs(summary.agv);
                this.renderWMSKPIs(summary.wms);
                this.generateAlerts(summary);
                this.previousData = summary;
            }

            if (history) {
                this.updateThroughputChart(history);
            }

            // Fetch stock distribution for doughnut
            await this.fetchStockDistribution();

            this.updateTimestamp();
        } catch (err) {
            console.error('[KPI] Fetch error:', err);
            this.addAlert('critical', `Erreur de récupération des KPIs: ${err.message}`);
        }
    }

    async fetchHistory() {
        try {
            const history = await this.fetchJSON(`/api/kpis/history?hours=${this.historyHours}`);
            if (history) this.updateThroughputChart(history);
        } catch (err) {
            console.error('[KPI] History fetch error:', err);
        }
    }

    async fetchStockDistribution() {
        try {
            const data = await this.fetchJSON('/api/kpis/stock');
            if (data && data.categories) {
                this.updateStockDistributionChart(data.categories);
            }
        } catch (err) {
            console.error('[KPI] Stock distribution fetch error:', err);
        }
    }

    async fetchJSON(path) {
        try {
            // Use Supabase via dataPipeline for all KPI data
            if (path.includes('/summary') || path.includes('/stock_summary')) {
                const stockItems = await dataPipeline.loadStockItems();
                const locations = await dataPipeline.loadLocations();
                const agvs = await dataPipeline.loadAGVs();
                
                if (stockItems && locations) {
                    const totalLocations = locations.length;
                    const occupiedLocations = stockItems.filter(s => s.fill_level > 0).length;
                    const avgFillLevel = stockItems.length > 0 
                        ? stockItems.reduce((sum, s) => sum + (s.fill_level || 0), 0) / stockItems.length 
                        : 0;
                    const avgBattery = agvs && agvs.length > 0
                        ? agvs.reduce((sum, a) => sum + (a.battery || 0), 0) / agvs.length
                        : 0;
                    
                    return {
                        stock: {
                            fill_rate: totalLocations > 0 ? (occupiedLocations / totalLocations) * 100 : 0,
                            available_locations: totalLocations - occupiedLocations,
                            total_items: stockItems.length,
                            avg_fill_level: avgFillLevel
                        },
                        agv: {
                            utilization_rate: avgBattery,
                            avg_battery: avgBattery,
                            total: agvs ? agvs.length : 0
                        },
                        wms: {
                            throughput: 0,
                            accuracy: 99.2
                        }
                    };
                }
            } else if (path.includes('/history')) {
                // No history data available yet
                return null;
            } else if (path.includes('/stock') || path.includes('/agv_status')) {
                const stockItems = await dataPipeline.loadStockItems();
                if (stockItems) {
                    // Group by SKU for distribution
                    const categories = {};
                    stockItems.forEach(s => {
                        const key = s.sku || 'Unknown';
                        if (!categories[key]) categories[key] = { count: 0, total_fill: 0 };
                        categories[key].count++;
                        categories[key].total_fill += (s.fill_level || 0);
                    });
                    return { categories };
                }
            }
            
            console.warn('[KPI] No Supabase data available for:', path);
            return null;
        } catch (err) {
            console.warn('[KPI] Supabase call failed:', path, err.message);
            return null;
        }
    }

    // ═══════════════════════════════════════
    //  SUMMARY BAR
    // ═══════════════════════════════════════

    renderSummary(data) {
        // Fill Rate
        const fillRate = data.stock?.fill_rate ?? 0;
        this.setText('summaryFillRate', `${fillRate.toFixed(1)}%`);
        this.setCardStatus('summaryStock', this.getStatus(fillRate, 75, 50));
        this.setTrend('summaryFillTrend', fillRate, this.previousData?.stock?.fill_rate);

        // AGV Utilization
        const agvUtil = data.agv?.utilization_rate ?? 0;
        this.setText('summaryAGVUtil', `${agvUtil.toFixed(1)}%`);
        this.setCardStatus('summaryAGV', this.getStatus(agvUtil, 80, 50));
        this.setTrend('summaryAGVTrend', agvUtil, this.previousData?.agv?.utilization_rate);

        // Fulfillment
        const fulfillment = data.wms?.order_fulfillment ?? 0;
        this.setText('summaryFulfillment', `${fulfillment.toFixed(1)}%`);
        this.setCardStatus('summaryWMS', this.getStatus(fulfillment, 99, 90));
        this.setTrend('summaryWMSTrend', fulfillment, this.previousData?.wms?.order_fulfillment);

        // Alerts count
        this.setText('summaryAlertCount', String(this.alerts.length));
    }

    // ═══════════════════════════════════════
    //  STOCK KPIs
    // ═══════════════════════════════════════

    renderStockKPIs(stock) {
        if (!stock) return;

        this.updateKPI('kpiStockFillRate', 'barStockFillRate', 'statusStockFillRate',
            `${stock.fill_rate?.toFixed(1) ?? '—'}%`, stock.fill_rate, 100, stock.fill_rate_status);

        this.updateKPI('kpiInventoryAccuracy', 'barInventoryAccuracy', 'statusInventoryAccuracy',
            `${stock.inventory_accuracy?.toFixed(1) ?? '—'}%`, stock.inventory_accuracy, 100, stock.inventory_accuracy_status);

        this.updateKPI('kpiStockoutRate', 'barStockoutRate', 'statusStockoutRate',
            `${stock.stockout_rate?.toFixed(1) ?? '—'}%`, stock.stockout_rate, 10, stock.stockout_rate_status);

        this.updateKPI('kpiStockRotation', 'barStockRotation', 'statusStockRotation',
            `${stock.stock_rotation?.toFixed(1) ?? '—'}/an`, stock.stock_rotation, 20, stock.stock_rotation_status);

        this.updateKPI('kpiDaysInStock', 'barDaysInStock', 'statusDaysInStock',
            `${stock.avg_days_in_stock?.toFixed(0) ?? '—'} j`, Math.max(0, 60 - (stock.avg_days_in_stock ?? 0)), 60, stock.days_in_stock_status);
    }

    // ═══════════════════════════════════════
    //  AGV KPIs
    // ═══════════════════════════════════════

    renderAGVKPIs(agv) {
        if (!agv) return;

        this.updateKPI('kpiAGVUtilization', 'barAGVUtilization', 'statusAGVUtilization',
            `${agv.utilization_rate?.toFixed(1) ?? '—'}%`, agv.utilization_rate, 100, agv.utilization_status);

        this.updateKPI('kpiMissionsCompleted', 'barMissionsCompleted', 'statusMissionsCompleted',
            `${agv.missions_completed ?? '—'}`, Math.min(agv.missions_completed ?? 0, 200), 200, agv.missions_status);

        this.updateKPI('kpiAvgMissionTime', 'barAvgMissionTime', 'statusAvgMissionTime',
            `${agv.avg_mission_time?.toFixed(1) ?? '—'} min`, Math.max(0, 5 - (agv.avg_mission_time ?? 0)), 5, agv.mission_time_status);

        this.updateKPI('kpiDistanceTraveled', 'barDistanceTraveled', 'statusDistanceTraveled',
            `${(agv.total_distance ?? 0).toFixed(1)} km`, Math.min(agv.total_distance ?? 0, 100), 100, 'green');

        this.updateKPI('kpiBatteryEfficiency', 'barBatteryEfficiency', 'statusBatteryEfficiency',
            `${agv.battery_efficiency?.toFixed(0) ?? '—'} mis/charge`, Math.min(agv.battery_efficiency ?? 0, 80), 80, agv.battery_status);
    }

    // ═══════════════════════════════════════
    //  WMS KPIs
    // ═══════════════════════════════════════

    renderWMSKPIs(wms) {
        if (!wms) return;

        this.updateKPI('kpiLeadTime', 'barLeadTime', 'statusLeadTime',
            `${wms.lead_time?.toFixed(1) ?? '—'} h`, Math.max(0, 8 - (wms.lead_time ?? 0)), 8, wms.lead_time_status);

        this.updateKPI('kpiThroughput', 'barThroughput', 'statusThroughput',
            `${wms.throughput?.toFixed(0) ?? '—'}/h`, Math.min(wms.throughput ?? 0, 100), 100, wms.throughput_status);

        this.updateKPI('kpiFulfillment', 'barFulfillment', 'statusFulfillment',
            `${wms.order_fulfillment?.toFixed(1) ?? '—'}%`, wms.order_fulfillment, 100, wms.fulfillment_status);

        this.updateKPI('kpiPickingAccuracy', 'barPickingAccuracy', 'statusPickingAccuracy',
            `${wms.picking_accuracy?.toFixed(2) ?? '—'}%`, wms.picking_accuracy, 100, wms.picking_status);
    }

    // ═══════════════════════════════════════
    //  CHART INITIALIZATION
    // ═══════════════════════════════════════

    initCharts() {
        // Default Chart.js theme for dark mode
        Chart.defaults.color = '#9ca3af';
        Chart.defaults.borderColor = 'rgba(55, 65, 81, 0.5)';

        // Throughput / Utilisation line chart
        const ctxLine = document.getElementById('chartThroughput');
        if (ctxLine) {
            this.charts.throughput = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Throughput (cmd/h)',
                            data: [],
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            borderWidth: 2
                        },
                        {
                            label: 'Utilisation AGV (%)',
                            data: [],
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            borderWidth: 2
                        },
                        {
                            label: 'Fill Rate (%)',
                            data: [],
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.05)',
                            fill: false,
                            tension: 0.4,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            borderWidth: 1.5,
                            borderDash: [5, 3]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { usePointStyle: true, padding: 15, font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
                        y: { beginAtZero: true, grid: { color: 'rgba(55, 65, 81, 0.3)' }, ticks: { font: { size: 10 } } }
                    }
                }
            });
        }

        // Stock Distribution doughnut
        const ctxDoughnut = document.getElementById('chartStockDistribution');
        if (ctxDoughnut) {
            this.charts.distribution = new Chart(ctxDoughnut, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#6366f1', '#8b5cf6', '#10b981', '#f59e0b',
                            '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'
                        ],
                        borderColor: '#1a1a1f',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { usePointStyle: true, padding: 12, font: { size: 10 } }
                        }
                    }
                }
            });
        }
    }

    // ═══════════════════════════════════════
    //  CHART UPDATES
    // ═══════════════════════════════════════

    updateThroughputChart(history) {
        if (!this.charts.throughput || !history?.data) return;

        const labels = history.data.map(d => {
            const date = new Date(d.hour);
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        });

        this.charts.throughput.data.labels = labels;
        this.charts.throughput.data.datasets[0].data = history.data.map(d => d.throughput);
        this.charts.throughput.data.datasets[1].data = history.data.map(d => d.utilization);
        this.charts.throughput.data.datasets[2].data = history.data.map(d => d.fill_rate);
        this.charts.throughput.update('none');
    }

    updateStockDistributionChart(categories) {
        if (!this.charts.distribution || !categories) return;

        const labels = Object.keys(categories);
        const data = Object.values(categories);

        this.charts.distribution.data.labels = labels;
        this.charts.distribution.data.datasets[0].data = data;
        this.charts.distribution.update('none');
    }

    // ═══════════════════════════════════════
    //  ALERTS
    // ═══════════════════════════════════════

    generateAlerts(data) {
        this.alerts = [];

        // Stock alerts
        if (data.stock) {
            if (data.stock.fill_rate_status === 'red')
                this.addAlert('critical', `Taux de remplissage critique: ${data.stock.fill_rate?.toFixed(1)}%`);
            if (data.stock.stockout_rate_status === 'red')
                this.addAlert('critical', `Taux de rupture élevé: ${data.stock.stockout_rate?.toFixed(1)}%`);
            if (data.stock.inventory_accuracy_status === 'yellow')
                this.addAlert('warning', `Précision d'inventaire en baisse: ${data.stock.inventory_accuracy?.toFixed(1)}%`);
        }

        // AGV alerts
        if (data.agv) {
            if (data.agv.utilization_status === 'red')
                this.addAlert('critical', `Utilisation AGV très faible: ${data.agv.utilization_rate?.toFixed(1)}%`);
            if (data.agv.mission_time_status === 'red')
                this.addAlert('warning', `Temps mission AGV élevé: ${data.agv.avg_mission_time?.toFixed(1)} min`);
            if (data.agv.battery_status === 'red')
                this.addAlert('critical', `Efficacité batterie AGV critique: ${data.agv.battery_efficiency?.toFixed(0)} missions/charge`);
        }

        // WMS alerts
        if (data.wms) {
            if (data.wms.lead_time_status === 'red')
                this.addAlert('critical', `Délai de traitement excessif: ${data.wms.lead_time?.toFixed(1)}h`);
            if (data.wms.fulfillment_status === 'red')
                this.addAlert('critical', `Taux de fulfillment critique: ${data.wms.order_fulfillment?.toFixed(1)}%`);
            if (data.wms.throughput_status === 'yellow')
                this.addAlert('warning', `Débit en dessous de la cible: ${data.wms.throughput?.toFixed(0)}/h`);
        }

        if (this.alerts.length === 0) {
            this.addAlert('info', 'Tous les KPIs sont dans les seuils normaux ✅');
        }

        this.renderAlerts();
    }

    addAlert(level, message) {
        this.alerts.push({
            level,
            message,
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });
    }

    renderAlerts() {
        const container = document.getElementById('alertsList');
        const badge = document.getElementById('alertBadge');
        if (!container) return;

        const criticalCount = this.alerts.filter(a => a.level === 'critical').length;
        if (badge) badge.textContent = criticalCount;

        // Update summary alert count
        this.setText('summaryAlertCount', String(criticalCount));
        const summaryCard = document.getElementById('summaryAlerts');
        if (summaryCard) {
            summaryCard.className = `summary-card ${criticalCount > 0 ? 'red' : this.alerts.length > 0 ? 'yellow' : 'green'}`;
        }

        if (this.alerts.length === 0) {
            container.innerHTML = `
                <div class="alert-item alert-info">
                    <div class="alert-dot"></div>
                    <div class="alert-content">
                        <div class="alert-message">Aucune alerte active</div>
                        <div class="alert-time">—</div>
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = this.alerts.map(a => `
            <div class="alert-item alert-${a.level}">
                <div class="alert-dot"></div>
                <div class="alert-content">
                    <div class="alert-message">${a.message}</div>
                    <div class="alert-time">${a.time}</div>
                </div>
            </div>
        `).join('');
    }

    // ═══════════════════════════════════════
    //  WEBSOCKET (real-time)
    // ═══════════════════════════════════════

    connectWebSocket() {
        try {
            if (this._rtHandler) return;

            if (window.DTRealtime && typeof window.DTRealtime.start === 'function') {
                console.log('[KPI] ✅ Using shared realtime sync');
                this.setWSStatus(true);
                window.DTRealtime.start();

                let refreshTimer = null;
                this._rtHandler = () => {
                    if (refreshTimer) clearTimeout(refreshTimer);
                    refreshTimer = setTimeout(() => this.fetchAndRender(), 300);
                };

                window.addEventListener('dt:stock_items', this._rtHandler);
                window.addEventListener('dt:agvs', this._rtHandler);
                return;
            }

            if (!window.supabaseClient) {
                console.warn('[KPI] ❌ Supabase not available');
                this.setWSStatus(false);
                return;
            }

            console.log('[KPI] ✅ Subscribing to Supabase Realtime updates');
            this.setWSStatus(true);

            window.supabaseClient
                .channel('kpi:stock_items')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'stock_items' },
                    (payload) => {
                        console.log('[KPI] 📨 Stock update received - reloading dashboard:', payload.eventType);
                        this.fetchAndRender();
                    }
                )
                .subscribe((status) => {
                    console.log('[KPI] Stock subscription status:', status);
                });

            window.supabaseClient
                .channel('kpi:agvs')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'agvs' },
                    (payload) => {
                        console.log('[KPI] 📨 AGV update received - reloading dashboard:', payload.eventType);
                        this.fetchAndRender();
                    }
                )
                .subscribe((status) => {
                    console.log('[KPI] AGV subscription status:', status);
                });
                
        } catch (err) {
            console.error('[KPI] ❌ Realtime subscribe failed:', err);
            this.setWSStatus(false);
        }
    }

    setWSStatus(connected) {
        const dot = document.getElementById('wsIndicator');
        const text = document.getElementById('wsText');
        if (dot) dot.className = `ws-dot ${connected ? 'connected' : ''}`;
        if (text) text.textContent = connected ? 'Connecté' : 'Déconnecté';
    }

    // ═══════════════════════════════════════
    //  AUTO-REFRESH
    // ═══════════════════════════════════════

    startAutoRefresh(interval) {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => this.fetchAndRender(), interval);
    }

    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════

    updateKPI(valueId, barId, statusId, displayValue, rawValue, maxValue, status) {
        const el = document.getElementById(valueId);
        if (el) el.textContent = displayValue;

        const bar = document.getElementById(barId);
        if (bar) {
            const pct = Math.min(100, Math.max(0, (rawValue / maxValue) * 100));
            bar.style.width = `${pct}%`;
            bar.className = `kpi-progress-fill progress-${status || 'green'}`;
        }

        const statusEl = document.getElementById(statusId);
        if (statusEl) statusEl.className = `kpi-status status-${status || 'green'}`;
    }

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    setCardStatus(id, status) {
        const card = document.getElementById(id);
        if (card) {
            card.className = card.className.replace(/\b(green|yellow|red|blue)\b/g, '').trim() + ' ' + status;
        }
    }

    setTrend(id, current, previous) {
        const el = document.getElementById(id);
        if (!el) return;
        if (previous == null) {
            el.textContent = '—';
            el.className = 'summary-trend trend-stable';
            return;
        }
        const diff = current - previous;
        if (Math.abs(diff) < 0.1) {
            el.textContent = '→ Stable';
            el.className = 'summary-trend trend-stable';
        } else if (diff > 0) {
            el.textContent = `▲ +${diff.toFixed(1)}`;
            el.className = 'summary-trend trend-up';
        } else {
            el.textContent = `▼ ${diff.toFixed(1)}`;
            el.className = 'summary-trend trend-down';
        }
    }

    getStatus(value, greenThreshold, yellowThreshold) {
        if (value >= greenThreshold) return 'green';
        if (value >= yellowThreshold) return 'yellow';
        return 'red';
    }

    updateTimestamp() {
        const el = document.getElementById('lastUpdate');
        if (el) {
            el.textContent = `Mis à jour: ${new Date().toLocaleTimeString('fr-FR')}`;
        }
    }
}

// ═══════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new KPIDashboard();
    dashboard.init();
});
