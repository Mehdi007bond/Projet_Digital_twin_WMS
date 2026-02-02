/**
 * Widget Manager - Handles draggable panels
 */

class WidgetManager {
    constructor() {
        this.panels = [];
        this.activePanel = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.init();
    }

    init() {
        // Initialize all panels with draggable functionality
        document.querySelectorAll('.panel').forEach(panel => {
            this.initPanel(panel);
        });

        // Global mouse events for dragging
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Load saved positions
        this.loadPositions();
    }

    initPanel(panel) {
        const header = panel.querySelector('.panel-header');
        if (!header) return;

        // Dragging via header
        header.addEventListener('mousedown', (e) => this.onMouseDown(e, panel));

        // Double-click to reset position
        header.addEventListener('dblclick', () => this.resetPanel(panel));

        // Store panel reference
        this.panels.push(panel);

        // Make panel bring to front on click
        panel.addEventListener('mousedown', () => this.bringToFront(panel));
    }

    onMouseDown(e, panel) {
        if (e.target.closest('.panel-toggle')) return;
        
        e.preventDefault();
        this.isDragging = true;
        this.activePanel = panel;
        
        const rect = panel.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        panel.style.transition = 'none';
        panel.style.transform = 'none';
        this.bringToFront(panel);
    }

    onMouseMove(e) {
        if (!this.isDragging || !this.activePanel) return;

        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;

        // Constrain to window bounds
        const rect = this.activePanel.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        const constrainedX = Math.max(0, Math.min(x, maxX));
        const constrainedY = Math.max(60, Math.min(y, maxY)); // 60px for top bar

        this.activePanel.style.left = `${constrainedX}px`;
        this.activePanel.style.top = `${constrainedY}px`;
        this.activePanel.style.right = 'auto';
        this.activePanel.style.bottom = 'auto';
    }

    onMouseUp(e) {
        if (this.isDragging && this.activePanel) {
            this.activePanel.style.transition = '';
            this.savePositions();
        }
        this.isDragging = false;
        this.activePanel = null;
    }

    bringToFront(panel) {
        const maxZ = Math.max(...this.panels.map(p => parseInt(p.style.zIndex || 50)));
        panel.style.zIndex = maxZ + 1;
    }

    resetPanel(panel) {
        // Reset to default size
        panel.style.width = '';
        panel.style.height = '';
        
        // Reset position based on panel type
        if (panel.classList.contains('stats-panel')) {
            panel.style.left = '20px';
            panel.style.top = '80px';
            panel.style.right = 'auto';
        } else if (panel.classList.contains('control-panel')) {
            panel.style.right = '20px';
            panel.style.top = '80px';
            panel.style.left = 'auto';
        } else if (panel.classList.contains('kpi-sidebar')) {
            panel.style.right = '320px';
            panel.style.top = '80px';
            panel.style.left = 'auto';
        }
        
        this.savePositions();
    }

    savePositions() {
        const positions = {};
        this.panels.forEach(panel => {
            const id = panel.id;
            if (id) {
                positions[id] = {
                    left: panel.style.left,
                    top: panel.style.top,
                    right: panel.style.right,
                    bottom: panel.style.bottom,
                    width: panel.style.width,
                    height: panel.style.height,
                    zIndex: panel.style.zIndex
                };
            }
        });
        localStorage.setItem('widgetPositions', JSON.stringify(positions));
    }

    loadPositions() {
        try {
            const saved = localStorage.getItem('widgetPositions');
            if (!saved) return;

            const positions = JSON.parse(saved);
            this.panels.forEach(panel => {
                const id = panel.id;
                if (id && positions[id]) {
                    const pos = positions[id];
                    if (pos.left) panel.style.left = pos.left;
                    if (pos.top) panel.style.top = pos.top;
                    if (pos.right && pos.right !== 'auto') panel.style.right = pos.right;
                    if (pos.bottom && pos.bottom !== 'auto') panel.style.bottom = pos.bottom;
                    if (pos.width) panel.style.width = pos.width;
                    if (pos.height) panel.style.height = pos.height;
                    if (pos.zIndex) panel.style.zIndex = pos.zIndex;
                }
            });
        } catch (e) {
            console.warn('Could not load widget positions:', e);
        }
    }

    resetAllPositions() {
        localStorage.removeItem('widgetPositions');
        this.panels.forEach(panel => this.resetPanel(panel));
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.widgetManager = new WidgetManager();
});
