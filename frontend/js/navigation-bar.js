/**
 * Navigation Bar Component
 * Add navigation bar to any page
 */

function addNavigationBar(currentPage = '') {
    // Create navigation bar HTML
    const navHTML = `
        <div class="nav-bar">
            <div class="nav-title">
                🏭 Digital Twin WMS - ${currentPage}
            </div>
            <div class="nav-buttons">
                <a href="home.html" class="nav-button home">🏠 Menu Principal</a>
                <a href="index.html" class="nav-button ${currentPage === 'Vue 3D' ? 'active' : ''}">🎮 Vue 3D</a>
                <a href="kpi-dashboard.html" class="nav-button ${currentPage === 'Dashboard' ? 'active' : ''}">📊 KPI</a>
                <a href="management.html" class="nav-button ${currentPage === 'Management' ? 'active' : ''}">⚙️ Gestion</a>
            </div>
        </div>
    `;

    // Insert at beginning of body
    document.body.insertAdjacentHTML('afterbegin', navHTML);
    document.body.classList.add('with-nav');
}

// Auto-initialize if not home page
document.addEventListener('DOMContentLoaded', () => {
    // Don't add nav bar to home.html
    if (!window.location.pathname.includes('home.html')) {
        const pageName = document.title.split('-')[1]?.trim() || 'Application';
        addNavigationBar(pageName);
    }
});
