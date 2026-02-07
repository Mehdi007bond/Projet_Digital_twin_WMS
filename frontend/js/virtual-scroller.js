/**
 * Virtual Scroller - Digital Twin WMS
 * Renders only visible items for optimal performance with large datasets
 */

class VirtualScroller {
    constructor(container, options = {}) {
        this.container = container;
        this.data = [];
        this.itemHeight = options.itemHeight || 60;
        this.buffer = options.buffer || 5;
        this.renderItem = options.renderItem || this.defaultRenderItem.bind(this);
        this.onItemClick = options.onItemClick || null;
        
        this.scrollTop = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.renderedItems = new Map();
        
        this.init();
    }

    init() {
        // Create scroll container
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.style.cssText = `
            position: relative;
            overflow-y: auto;
            height: 100%;
            width: 100%;
        `;

        // Create content wrapper
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.style.cssText = `
            position: relative;
            width: 100%;
        `;

        this.scrollContainer.appendChild(this.contentWrapper);
        this.container.appendChild(this.scrollContainer);

        // Attach scroll listener
        this.scrollContainer.addEventListener('scroll', this.handleScroll.bind(this));
        
        // Observe resize
        this.resizeObserver = new ResizeObserver(() => this.render());
        this.resizeObserver.observe(this.scrollContainer);
    }

    setData(data) {
        this.data = data;
        this.contentWrapper.style.height = `${this.data.length * this.itemHeight}px`;
        this.render();
    }

    handleScroll() {
        this.scrollTop = this.scrollContainer.scrollTop;
        this.render();
    }

    render() {
        const containerHeight = this.scrollContainer.clientHeight;
        const visibleStart = Math.floor(this.scrollTop / this.itemHeight);
        const visibleEnd = Math.ceil((this.scrollTop + containerHeight) / this.itemHeight);

        // Add buffer
        this.visibleStart = Math.max(0, visibleStart - this.buffer);
        this.visibleEnd = Math.min(this.data.length, visibleEnd + this.buffer);

        // Remove items outside visible range
        this.renderedItems.forEach((element, index) => {
            if (index < this.visibleStart || index >= this.visibleEnd) {
                element.remove();
                this.renderedItems.delete(index);
            }
        });

        // Render visible items
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            if (!this.renderedItems.has(i)) {
                const element = this.createItemElement(this.data[i], i);
                this.renderedItems.set(i, element);
                this.contentWrapper.appendChild(element);
            }
        }
    }

    createItemElement(item, index) {
        const element = document.createElement('div');
        element.style.cssText = `
            position: absolute;
            top: ${index * this.itemHeight}px;
            width: 100%;
            height: ${this.itemHeight}px;
        `;

        element.innerHTML = this.renderItem(item, index);

        if (this.onItemClick) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', () => this.onItemClick(item, index));
        }

        return element;
    }

    defaultRenderItem(item, index) {
        return `<div style="padding: 10px; border-bottom: 1px solid #ddd;">
            Item ${index}: ${JSON.stringify(item)}
        </div>`;
    }

    scrollToIndex(index) {
        this.scrollContainer.scrollTop = index * this.itemHeight;
    }

    destroy() {
        this.resizeObserver.disconnect();
        this.scrollContainer.removeEventListener('scroll', this.handleScroll.bind(this));
        this.container.innerHTML = '';
    }
}

/**
 * Virtual Grid - For 2D warehouse visualization
 */
class VirtualGrid {
    constructor(container, options = {}) {
        this.container = container;
        this.data = [];
        this.cellWidth = options.cellWidth || 100;
        this.cellHeight = options.cellHeight || 80;
        this.columns = options.columns || 5;
        this.renderCell = options.renderCell || this.defaultRenderCell.bind(this);
        this.onCellClick = options.onCellClick || null;
        
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.renderedCells = new Map();
        
        this.init();
    }

    init() {
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.style.cssText = `
            position: relative;
            overflow: auto;
            height: 100%;
            width: 100%;
        `;

        this.contentWrapper = document.createElement('div');
        this.contentWrapper.style.cssText = `
            position: relative;
        `;

        this.scrollContainer.appendChild(this.contentWrapper);
        this.container.appendChild(this.scrollContainer);

        this.scrollContainer.addEventListener('scroll', this.handleScroll.bind(this));
        this.resizeObserver = new ResizeObserver(() => this.render());
        this.resizeObserver.observe(this.scrollContainer);
    }

    setData(data) {
        this.data = data;
        const rows = Math.ceil(this.data.length / this.columns);
        this.contentWrapper.style.width = `${this.columns * this.cellWidth}px`;
        this.contentWrapper.style.height = `${rows * this.cellHeight}px`;
        this.render();
    }

    handleScroll() {
        this.scrollTop = this.scrollContainer.scrollTop;
        this.scrollLeft = this.scrollContainer.scrollLeft;
        this.render();
    }

    render() {
        const containerHeight = this.scrollContainer.clientHeight;
        const containerWidth = this.scrollContainer.clientWidth;
        
        const startRow = Math.floor(this.scrollTop / this.cellHeight);
        const endRow = Math.ceil((this.scrollTop + containerHeight) / this.cellHeight);
        const startCol = Math.floor(this.scrollLeft / this.cellWidth);
        const endCol = Math.ceil((this.scrollLeft + containerWidth) / this.cellWidth);

        // Clear cells outside visible area
        this.renderedCells.forEach((element, key) => {
            const [row, col] = key.split('-').map(Number);
            if (row < startRow || row >= endRow || col < startCol || col >= endCol) {
                element.remove();
                this.renderedCells.delete(key);
            }
        });

        // Render visible cells
        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < Math.min(endCol, this.columns); col++) {
                const index = row * this.columns + col;
                if (index >= this.data.length) continue;

                const key = `${row}-${col}`;
                if (!this.renderedCells.has(key)) {
                    const element = this.createCellElement(this.data[index], row, col, index);
                    this.renderedCells.set(key, element);
                    this.contentWrapper.appendChild(element);
                }
            }
        }
    }

    createCellElement(item, row, col, index) {
        const element = document.createElement('div');
        element.style.cssText = `
            position: absolute;
            top: ${row * this.cellHeight}px;
            left: ${col * this.cellWidth}px;
            width: ${this.cellWidth}px;
            height: ${this.cellHeight}px;
        `;

        element.innerHTML = this.renderCell(item, index);

        if (this.onCellClick) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', () => this.onCellClick(item, index));
        }

        return element;
    }

    defaultRenderCell(item, index) {
        return `<div style="padding: 5px; border: 1px solid #ddd; text-align: center;">
            ${index}
        </div>`;
    }

    destroy() {
        this.resizeObserver.disconnect();
        this.scrollContainer.removeEventListener('scroll', this.handleScroll.bind(this));
        this.container.innerHTML = '';
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VirtualScroller, VirtualGrid };
}
