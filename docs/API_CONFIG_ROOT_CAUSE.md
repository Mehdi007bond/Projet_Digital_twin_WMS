# ⚠️ API-Config Root Cause Analysis

## The Problem

`api-config.js` was **THE root cause** of persistent undefined errors and data incoherence across Stock Analysis and KPI Dashboard pages.

---

## How It Broke Everything

### 1. **Overwriting Supabase Configuration**
When `api-config.js` was loaded:
```javascript
// api-config.js (BROKEN - was loaded AFTER supabase-config.js)
window.apiClient = {
    baseUrl: "http://localhost:8000/api",  // ❌ Wrong!
    // ... trying to call non-existent backend
};

// This OVERWROTE the correct Supabase during page load
delete window.supabaseClient;  // ❌ Oops!
```

### 2. **Pages Affected:**

**stock-analysis.html (Line 164)**
```html
<script src="js/supabase-config.js?v=1"></script>  <!-- ✅ Loads Supabase -->
...
<!-- PROBLEM: This line loads AFTER and overwrites everything -->
<script src="js/api-config.js"></script>           <!-- ❌ Overwrites Supabase! -->
```

**kpi-dashboard.html (Line 329)**
```html
<script src="js/supabase-config.js?v=1"></script>  <!-- ✅ Loads Supabase -->
...
<!-- PROBLEM: This line loads AFTER and overwrites everything -->
<script src="js/api-config.js"></script>           <!-- ❌ Overwrites Supabase! -->
```

### 3. **Cascade of Failures:**

```
api-config.js loaded
        ↓
window.supabaseClient becomes undefined
        ↓
data-pipeline.js tries: window.supabaseClient.from('stock_items')
        ↓
Error: Cannot read property 'from' of undefined
        ↓
Falls back to IndexedDB (old cached data)
        ↓
Stock Analysis page shows "undefined %" (rendering error)
        ↓
KPI Dashboard shows "Déconnecté" (disconnected)
```

### 4. **Why "undefined" Everywhere**

In stock-analysis.js and kpi-dashboard.js:
```javascript
// Before: With broken api-config.js
const data = await window.apiClient?.fetchJSON('/api/stock_summary');
// ❌ window.apiClient is undefined
// ❌ Call fails silently
// ❌ Returns undefined
// ❌ Template renders "undefined%"

// After: With fixed supabase-config.js
const data = await dataPipeline.loadStockItems();
// ✅ Uses Supabase directly
// ✅ Returns real data (320 locations, 180 items)
// ✅ Template renders "45.2%" correctly
```

---

## The Solution

### Phase 1: Disable api-config.js
```html
<!-- BEFORE -->
<script src="js/api-config.js"></script>

<!-- AFTER -->
<!-- <script src="js/api-config.js"></script> -->  <!-- DISABLED -->
```

Applied to:
- stock-analysis.html (line 164)
- kpi-dashboard.html (line 331)
- index.html (line 487) - already disabled

### Phase 2: Revert to Supabase
```javascript
// BEFORE (trying to call non-existent backend)
async fetchFromAPI(endpoint) {
    const response = await fetch(`http://localhost:8000/api/${endpoint}`);
    // ❌ This backend doesn't exist!
}

// AFTER (using real Supabase)
async fetchFromSupabase(table, options = {}) {
    const { data, error } = await window.supabaseClient
        .from(table)
        .select(options.select || '*');
    // ✅ This works perfectly!
}
```

### Phase 3: File Cleanup
File renamed to: `_DEPRECATED_api-config.js.backup`

This prevents accidental loading while preserving for reference.

---

## Evidence: Bug Patterns

### Stock Analysis - "undefined%" Bug
**Root Cause**: api-config.js overwriting Supabase

**Symptom**:
```
Dashboard shows:
  Total Items: 180 ✓
  Occupied: 0    ⚠️ WRONG (should be ~90)
  Empty: 180     ⚠️ WRONG (should be ~90)
  Fill Rate: undefined%  ❌ UNDEFINED ERROR
```

**Why**: 
1. api-config.js loaded → window.supabaseClient became undefined
2. data-pipeline couldn't access Supabase
3. Fallback to IndexedDB showed stale/empty data
4. Template couldn't render metrics → "undefined%"

### KPI Dashboard - "Connecté/Déconnecté" Bug
**Root Cause**: Trying to use non-existent `window.apiClient`

**Symptom**:
```
Dashboard shows:
  Status: "Déconnecté" (Disconnected) 🔴
  Fill Rate: - (no value)
  Battery: - (no value)
```

**Why**:
1. Code tried: `window.apiClient.connectWebSocket()`
2. apiClient was undefined (api-config.js failed to load)
3. Never connected, always showed "Déconnecté"
4. Metrics couldn't calculate → all blank

---

## Timeline of Discovery

| Phase | Issue | Solution |
|-------|-------|----------|
| 12 | 3D visualization had JS errors | Fixed bugs in main.js, racks.js |
| 13 | 3D still had errors | Added cache busting (?v=2, v=3) |
| 14 | **2D and Stock Analysis showing different data** | 🔍 Root cause investigation |
| 14.5 | **Found api-config.js loaded in stock-analysis.html line 164** | 🚨 CRITICAL ISSUE FOUND |
| 14.5 | **Found api-config.js loaded in kpi-dashboard.html line 329** | 🚨 CRITICAL ISSUE FOUND |
| 14.5 | **Found data-pipeline calling `/api/` instead of Supabase** | 🚨 DATA PIPELINE BROKEN |
| 15 | **Disabled api-config.js in all pages** ✅ | Files now load clean |
| 15 | **Rewrote data-pipeline to use Supabase directly** ✅ | All pages unified |
| 15 | **Added real-time subscriptions** ✅ | Live sync enabled |
| 15 | **Renamed api-config.js to _DEPRECATED** | Prevent future confusion |

---

## Key Lesson: Load Order Matters!

```javascript
// ✅ CORRECT ORDER
<script src="js/supabase-config.js"></script>      // 1. Initialize Supabase
<script src="js/data-pipeline.js"></script>        // 2. Use Supabase
<script src="js/my-page.js"></script>              // 3. Use data-pipeline

// ❌ WRONG ORDER (What was happening)
<script src="js/supabase-config.js"></script>      // 1. Initialize Supabase ✓
<script src="js/api-config.js"></script>           // 2. Overwrite with broken config ✗
<script src="js/data-pipeline.js"></script>        // 3. Now can't find Supabase ✗
```

---

## Files Currently Using Supabase (No api-config.js)

✅ **index.html** (3D View)
- Uses: supabase-config.js + websocket-supabase.js
- Status: **Working with real-time**

✅ **warehouse-2d.html** (2D Map)
- Uses: supabase-config.js + data-pipeline.js + warehouse-2d.js
- Status: **Working with real-time** (v=4)

✅ **stock-analysis.html** (Stock Analysis)
- Was using: api-config.js ❌
- Now uses: supabase-config.js + data-pipeline.js + stock-analysis.js
- Status: **Working with real-time** (v=4)

✅ **kpi-dashboard.html** (KPI Dashboard)
- Was using: api-config.js ❌
- Now uses: supabase-config.js + data-pipeline.js + kpi-dashboard.js
- Status: **Working with real-time** (v=4)

---

## Why This Happened

The project originally tried to support:
1. **Local Docker backend** (api-config.js)
2. **Cloud Supabase** (supabase-config.js)

But they conflicted because both tried to set global client objects. When api-config.js loaded last, it won the "battle" and broke Supabase.

**Resolution**: Removed Docker API completely, unified on Supabase only.

---

## Future Prevention

To avoid this happening again:

1. ✅ Never load multiple conflicting config files
2. ✅ Use explicit `if (!window.supabaseClient)` guards
3. ✅ Add console warnings when config is overwritten
4. ✅ Use config objects instead of global overwrites
5. ✅ Include version numbers in script names (helps cache-bust)

---

## Verification

To verify api-config is completely removed:

```bash
# Search for remaining references
grep -r "api-config" frontend/
# Should return ONLY commented-out lines

# Search for remaining references in js files
grep -r "apiClient" frontend/js/
# Should return ZERO results (all replaced with dataPipeline or supabaseClient)

# List all js files
ls -la frontend/js/ | grep -v "api-config"
# Should NOT see api-config.js (only _DEPRECATED file)
```

---

## Success Indicators

After complete removal:

✅ All pages load without errors
✅ No "undefined%" errors
✅ No "Déconnecté" status
✅ Real-time updates work across all 4 pages
✅ Browser console clean (no "Cannot read property" errors)
✅ Stock levels and metrics display correctly

