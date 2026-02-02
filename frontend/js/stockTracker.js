/**
 * Stock Update Tracker - Real-time stock movement display
 */

class StockTracker {
    constructor() {
        this.movingItems = new Map(); // itemId -> {status, agvId, from, to}
        this.init();
    }

    init() {
        // Set global callback for task manager
        window.stockUpdateCallback = (update) => this.updateStockMovement(update);
    }

    /**
     * Update stock movement status
     */
    updateStockMovement(update) {
        const { itemId, status, from, to, agvId, taskId } = update;

        if (status === 'moving') {
            // Add to moving items
            this.movingItems.set(itemId, {
                status: 'moving',
                from,
                to,
                agvId,
                taskId,
                startTime: Date.now()
            });
            this.renderMovingItems();
        } else if (status === 'completed') {
            // Remove from moving items
            this.movingItems.delete(itemId);
            this.renderMovingItems();
        }
    }

    /**
     * Render moving items in the UI
     */
    renderMovingItems() {
        const container = document.getElementById('moving-items');
        if (!container) return;

        if (this.movingItems.size === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        this.movingItems.forEach((item, itemId) => {
            const displayId = itemId.substring(0, 8);
            html += `
                <div class="moving-item">
                    <span class="item-id">${displayId}...</span>
                    <span class="item-status">→RZ</span>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Get moving items count
     */
    getMovingItemsCount() {
        return this.movingItems.size;
    }
}

// Initialize stock tracker when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.stockTracker = new StockTracker();
});
