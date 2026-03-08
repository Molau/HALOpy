// HALO Web Application JavaScript

// ============================================================================
// GLOBAL CONSTANTS AND SHARED FUNCTIONS
// ============================================================================
// Year range for observer "seit" (since) dates and data ranges
const YEAR_MIN = 1980;
const YEAR_MAX = 2079;

// Language will be loaded from server session on page load
let currentLanguage = 'de';
window.currentLanguage = currentLanguage;
let i18nStrings = {};
window.i18nStrings = i18nStrings;
let observerData = null; // cache of observer data with regions

// Application constants loaded from backend
let GEOGRAPHIC_REGIONS = []; // Will be loaded from /api/constants on page load
let CIRCULAR_HALOS = new Set(); // Will be loaded from /api/constants on page load
let PILLAR_HEIGHT_VALUES = []; // Light pillar height values (-1, 1-90)
let ALL_PILLAR_HEIGHT_VALUES = []; // All height values including 0
let VALID_HALO_TYPES = []; // Valid halo type numbers (1-77, 99)
let COMBINED_HALO_TYPES = new Set(); // Combined halo types from backend

// Global cloud mode flag - loaded once at startup
let isCloudMode = false;

// Password policy configuration (defaults, overridden by /api/constants at startup)
let PASSWORD_POLICY = {
    minLength: 8,
    requireCategories: 3,
    categories: {
        lowercase: /[a-z]/,
        uppercase: /[A-Z]/,
        digits: /[0-9]/,
        special: /[^a-zA-Z0-9]/
    }
};

// Validate password against policy
function validatePassword(password) {
    if (password.length < PASSWORD_POLICY.minLength) {
        return { valid: false, error: 'password_too_short' };
    }
    
    let categoriesMatched = 0;
    if (PASSWORD_POLICY.categories.lowercase.test(password)) categoriesMatched++;
    if (PASSWORD_POLICY.categories.uppercase.test(password)) categoriesMatched++;
    if (PASSWORD_POLICY.categories.digits.test(password)) categoriesMatched++;
    if (PASSWORD_POLICY.categories.special.test(password)) categoriesMatched++;
    
    if (categoriesMatched < PASSWORD_POLICY.requireCategories) {
        return { valid: false, error: 'password_complexity' };
    }
    
    return { valid: true };
}

// Wait for i18nStrings to be loaded - reusable helper function
// Usage: await waitForI18n() in any module's DOMContentLoaded handler
window.waitForI18n = function() {
    return new Promise((resolve) => {
        if (typeof i18nStrings !== 'undefined' && Object.keys(i18nStrings).length > 0) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (typeof i18nStrings !== 'undefined' && Object.keys(i18nStrings).length > 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50);
        }
    });
};

// Global data store - metadata only, NO observation data
// All observation data stays on the server (in-memory for local mode, DB for cloud mode).
// Only the count is tracked client-side for display purposes.
// isDirty is a cached mirror of the server's DIRTY flag — only set by refreshFileStatus().
window.haloData = {
    count: 0,
    fileName: null,
    isLoaded: false,
    isDirty: false
};

/**
 * Fetch current file status from server and sync client state.
 * This is the ONLY place that sets isDirty — server is the single source of truth.
 */
async function refreshFileStatus() {
    try {
        const resp = await fetch('/api/file/status');
        if (!resp.ok) return;
        const status = await resp.json();
        window.haloData.count = status.count || 0;
        window.haloData.isDirty = status.dirty || false;
        if (status.filename) window.haloData.fileName = status.filename;
        if (status.filename) window.haloData.isLoaded = true;
        saveHaloDataToSession();
        updateFileInfoDisplay(window.haloData.fileName, window.haloData.count);
    } catch (e) {
        console.error('refreshFileStatus failed:', e);
    }
}
window.refreshFileStatus = refreshFileStatus;

// Global config (loaded once at startup)
window.haloConfig = {
    cloud_mode: false
};

// Helper function to save haloData metadata to sessionStorage
function saveHaloDataToSession() {
    if (window.haloData && window.haloData.isLoaded) {
        try {
            const metadata = {
                fileName: window.haloData.fileName,
                isLoaded: window.haloData.isLoaded,
                isDirty: window.haloData.isDirty,
                count: window.haloData.count || 0
            };
            sessionStorage.setItem('haloData', JSON.stringify(metadata));
        } catch (e) {sessionStorage.removeItem('haloData');
        }
    } else {
        sessionStorage.removeItem('haloData');
    }
}

// Load language and translations on page load
document.addEventListener('DOMContentLoaded', async () => {
    sessionStorage.removeItem('deleteDebug');
    sessionStorage.removeItem('loadDebug');
    
    // Load application constants first
    try {
        const constantsResponse = await fetch('/api/constants');
        if (constantsResponse.ok) {
            const constants = await constantsResponse.json();
            GEOGRAPHIC_REGIONS = constants.geographic_regions;
            CIRCULAR_HALOS = new Set(constants.circular_halos);
            PILLAR_HEIGHT_VALUES = constants.pillar_height_values;
            ALL_PILLAR_HEIGHT_VALUES = constants.all_pillar_height_values;
            VALID_HALO_TYPES = constants.valid_halo_types;
            if (constants.combined_to_individual_halos) {
                COMBINED_HALO_TYPES = new Set(Object.keys(constants.combined_to_individual_halos).map(Number));
            }
            if (constants.password_policy) {
                PASSWORD_POLICY.minLength = constants.password_policy.min_length;
                PASSWORD_POLICY.requireCategories = constants.password_policy.require_categories;
            }
        }
    } catch (e) {
        console.error('Failed to load application constants:', e);
    }
    
    // Load i18n FIRST - required for all UI operations
    await loadCurrentLanguage();
    await loadI18n(currentLanguage);

    // Load config (cloud mode flag)
    try {
        const configResponse = await fetch('/api/config');
        if (configResponse.ok) {
            const config = await configResponse.json();
            isCloudMode = config.cloud_mode; // Initialize global variable
            window.isCloudMode = config.cloud_mode; // Make available to other scripts
            window.haloConfig.cloud_mode = config.cloud_mode;
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }

    // Check if i18n loaded successfully - fail fast if not
    if (!i18nStrings) {
        console.error('Failed to load i18n strings');
        return;  // Stop application
    }
    
    // Restore file state metadata from sessionStorage if available
    // No observation data is fetched - only metadata (count comes from server status)
    const savedHaloData = sessionStorage.getItem('haloData');
    if (savedHaloData) {
        try {
            const metadata = JSON.parse(savedHaloData);
            window.haloData.fileName = metadata.fileName;
            window.haloData.isLoaded = metadata.isLoaded;
            window.haloData.count = metadata.count || 0;
            
            // Verify with server and get current count + dirty state
            if (metadata.isLoaded && metadata.fileName) {
                await refreshFileStatus();
            }
        } catch (e) {
            sessionStorage.removeItem('haloData');
        }
    }

    // Check for updates FIRST - blocks until user decides
    if (i18nStrings.app.version) {
        await checkForUpdates();
    }

    setupLanguageSwitcher();
    setupMenuHandlers();
    setupHoverDropdowns();
    
    // Clear menu highlights if on main page
    if (window.location.pathname === '/') {
        setTimeout(() => {
            clearMenuHighlights();
        }, 50);
    }
    
    // Cloud Mode: always show database count (database is always available)
    if (isCloudMode) {
        try {
            const statusResp = await fetch('/api/file/status');
            if (statusResp.ok) {
                const status = await statusResp.json();
                window.haloData.isLoaded = true;
                updateFileInfoDisplay(null, status.count);
            }
        } catch (e) {
            console.error('Failed to load database count:', e);
        }
    } else if (!window.haloData.isLoaded) {
        // Local Mode: clear file info if no file loaded
        clearFileInfoDisplay();
    }
    
    // Check for autosave recovery AFTER update check
    // IMPORTANT: This must be checked BEFORE setting activeSession flag
    await checkAutosaveRecovery();
    
    // Mark this as an active session (for autosave recovery logic)
    // This flag prevents the recovery dialog from showing during normal navigation
    // Set AFTER checkAutosaveRecovery() so recovery prompt can appear on first load
    sessionStorage.setItem('activeSession', 'true');
    
    // Check if data is loaded on server and update file info display
    // This also syncs window.haloData with server state
    await checkAndDisplayFileInfo();
    
    const editLogs = sessionStorage.getItem('lastEditLogs');
    if (editLogs) {



        sessionStorage.removeItem('lastEditLogs');
    }
    
    // Check for pending notification (e.g., after select operation)
    const pendingNotification = sessionStorage.getItem('pendingNotification');
    if (pendingNotification) {
        try {
            const notification = JSON.parse(pendingNotification);
            showNotification(notification.message, notification.type || 'success', notification.duration || 5000);
        } catch (e) { /* ignore invalid JSON */ }
        sessionStorage.removeItem('pendingNotification');
    }
});

// Flag to track internal navigation (prevents beforeunload warning for internal links)
window.isInternalNavigation = false;

// Helper function for internal navigation (sets flag to prevent beforeunload warning)
window.navigateInternal = function(url) {
    // Block navigation if warning modal is open
    if (window.__warningModalOpen) {
        return;
    }
    
    window.isInternalNavigation = true;
    window.location.href = url;
};

// Check if observation data is loaded. Returns true when ready.
// Cloud Mode: database is always available.
// Local Mode: verifies data via API; shows warning and navigates home on failure.
window.checkDataLoaded = async function() {
    if (window.isCloudMode) return true;

    try {
        const response = await fetch('/api/observations?limit=1');
        if (response.ok) {
            const data = await response.json();
            if (data.total > 0 && data.file) {
                return true;
            }
        }
    } catch (error) {
        console.error('Error checking server data:', error);
    }

    showWarningAndGoHome(i18nStrings.messages.no_data);
    return false;
};

// Warn user before closing browser tab/window if unsaved changes exist
// Only triggers for browser close/refresh or external navigation, not internal navigation
window.addEventListener('beforeunload', (event) => {
    // Skip warning if this is internal navigation (same host)
    if (window.isInternalNavigation) {
        return;
    }
    
    // Check if there are unsaved changes (isDirty always false in Cloud Mode)
    if (window.haloData && window.haloData.isDirty) {
        // Modern browsers ignore custom messages for security reasons
        // They show their own generic "unsaved changes" dialog
        event.preventDefault();
        event.returnValue = ''; // Chrome requires returnValue to be set
        return ''; // Some browsers use the return value
    }
});

// Intercept clicks on internal links to set navigation flag
document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    
    // Check if it's an internal link (same origin or relative path)
    const isInternal = href.startsWith('/') || 
                      (link.hostname === window.location.hostname);
    
    if (isInternal) {
        // Mark that we're doing internal navigation
        window.isInternalNavigation = true;
    }
});

// Load current language from server session
async function loadCurrentLanguage() {
    const response = await fetch('/api/language');
    if (!response.ok) {
        throw new Error('Failed to load language from server');
    }
    const data = await response.json();
        currentLanguage = data.language || 'de'; // Default to 'de' if not provided
    window.currentLanguage = currentLanguage;
}

// Ensure only one top-level menu appears highlighted while hovering.
function setupMenuHoverHighlightBehavior() {
    const nav = document.querySelector('.navbar-nav');
    if (!nav) return;

    const deactivateOtherMenuHighlights = (currentTitle = null) => {
        const currentItem = currentTitle ? currentTitle.closest('.nav-item') : null;

        nav.querySelectorAll('.menu-title').forEach(title => {
            if (title !== currentTitle) {
                title.classList.remove('active', 'hover-active', 'show');
            }
        });

        // Ensure only the current dropdown remains open/highlighted.
        nav.querySelectorAll('.nav-item.dropdown .dropdown-toggle').forEach(toggle => {
            if (toggle !== currentTitle) {
                const instance = bootstrap.Dropdown.getInstance(toggle);
                if (instance) {
                    instance.hide();
                }

                // Defensive cleanup: remove residual Bootstrap classes immediately.
                toggle.setAttribute('aria-expanded', 'false');
                const toggleItem = toggle.closest('.nav-item');
                if (toggleItem) {
                    toggleItem.classList.remove('show');
                    const menu = toggleItem.querySelector('.dropdown-menu');
                    if (menu) {
                        menu.classList.remove('show');
                    }
                }
            }
        });

        // Also clear any stale show state on non-current dropdown items.
        nav.querySelectorAll('.nav-item.dropdown').forEach(item => {
            if (item !== currentItem) {
                item.classList.remove('show');
                const menu = item.querySelector('.dropdown-menu');
                if (menu) {
                    menu.classList.remove('show');
                }
                const toggle = item.querySelector('.dropdown-toggle');
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                }
            }
        });

    };

    const clearHoverState = () => {
        document.body.classList.remove('menu-hover-active');
        nav.querySelectorAll('.menu-title.hover-active').forEach(title => {
            title.classList.remove('hover-active');
        });
    };

    nav.querySelectorAll('.nav-item').forEach(item => {
        const title = item.querySelector('.menu-title');
        if (!title) return;

        // Attach to the full nav-item so dropdown menus keep the hovered title highlighted.
        item.addEventListener('mouseenter', () => {
            // Hard reset: remove all existing menu highlight states first.
            // This guarantees there is never more than one highlighted top menu.
            nav.querySelectorAll('.menu-title').forEach(el => {
                el.classList.remove('active', 'hover-active', 'show');
            });
            nav.querySelectorAll('.nav-item.dropdown').forEach(dropItem => {
                dropItem.classList.remove('show');
                const menu = dropItem.querySelector('.dropdown-menu');
                if (menu) menu.classList.remove('show');
                const toggle = dropItem.querySelector('.dropdown-toggle');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            });

            document.body.classList.add('menu-hover-active');
            deactivateOtherMenuHighlights(title);
            title.classList.add('hover-active');
        });
    });

    nav.addEventListener('mouseleave', clearHoverState);
    window.addEventListener('blur', clearHoverState);
}

async function loadObserverCodes() {
    if (observerData) return observerData;
    
    // Load simplified observer list (just KK codes for initial validation)
    // Observer activity is checked via API endpoint when needed (g-field)
    const resp = await fetch('/api/observers/list');
    if (!resp.ok) throw new Error(i18nStrings.messages.observer_list_load_failed);
    const data = await resp.json();
    const observers = data.observers || [];
    
    const codeSet = new Set(
        observers
            .map(o => {
                const kk = o.KK || o.k || o.kk;
                return kk ? String(kk).padStart(2, '0') : null;
            })
            .filter(Boolean)
    );
    
    observerData = { codeSet, observers };
    return observerData;
}

// Show Bootstrap confirmation dialog instead of browser confirm()
// function showConfirmDialog(title, message, onConfirm, onCancel) - defined in modal-utils.js

// Helper function to get default month and year based on date default setting
async function getDateDefault() {
    try {
        const response = await fetch('/api/config/datedefault');
        if (!response.ok) {
            return null;
        }
        const config = await response.json();
        
        if (!config.mode || config.mode === 'none') {
            return null;
        }
        
        const now = new Date();
        let month, year;
        
        if (config.mode === 'current') {
            month = now.getMonth() + 1; // JavaScript months are 0-indexed
            year = now.getFullYear();
        } else if (config.mode === 'previous') {
            month = now.getMonth(); // 0 = Dec of previous year, 1-11 = Jan-Nov of current year
            if (month === 0) {
                month = 12;
                year = now.getFullYear() - 1;
            } else {
                year = now.getFullYear();
            }
        } else if (config.mode === 'constant') {
            month = config.month || 1;
            year = config.year || now.getFullYear();
        }
        
        // Use 4-digit year for consistency with internal format
        const mm = String(month).padStart(2, '0');
        const jj = String(year); // 4-digit year
        
        return { mm, jj, month, year };
    } catch (error) {return null;
    }
}

// Setup hover dropdowns
function setupHoverDropdowns() {
    // On touch devices, hover interactions cause a two-tap UX (first tap = hover state).
    // Keep Bootstrap's default tap-to-open behavior there.
    const supportsHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!supportsHover) {
        return;
    }

    const dropdowns = document.querySelectorAll('.nav-item.dropdown');
    
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        let timeoutId;
        
        dropdown.addEventListener('mouseenter', () => {
            clearTimeout(timeoutId);
            const bsDropdown = new bootstrap.Dropdown(toggle);
            bsDropdown.show();
        });
        
        dropdown.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                const bsDropdown = bootstrap.Dropdown.getInstance(toggle);
                if (bsDropdown) {
                    bsDropdown.hide();
                }
            }, 100);
        });
    });
}

// Setup menu click handlers
function setupMenuHandlers() {
    // Handle all menu item clicks (works with Bootstrap dropdowns)
    document.querySelectorAll('.dropdown-item').forEach(link => {
        link.addEventListener('click', (e) => {
            // Use e.currentTarget to get the actual clicked element, not nested children
            const action = e.currentTarget.getAttribute('data-action');
            if (action) {
                e.preventDefault();
                handleMenuAction(action);
            }
        });
    });
}

// Handle menu actions
function handleMenuAction(action) {

    
    switch(action) {
        // File menu
        case 'new-file':
            highlightMenu('file');
            showNewFileDialog();
            break;
        case 'load':
            highlightMenu('file');
            showLoadFileDialog();
            break;
        case 'select':
            highlightMenu('file');
            showSelectDialog();
            break;
        case 'merge':
            highlightMenu('file');
            showMergeFileDialog();
            break;
        case 'save':
            highlightMenu('file');
            showSaveFileDialog();
            break;
        case 'upload':
            highlightMenu('file');
            showUploadDialog();
            break;
        case 'download':
            highlightMenu('file');
            showDownloadDialog();
            break;
        
            
        // Observations menu
        case 'obs-display':
            highlightMenu('observations');
            showDisplayObservationsDialog();
            break;
        case 'obs-add':
            highlightMenu('observations');
            showAddObservationDialog();
            break;
        case 'obs-modify':
            highlightMenu('observations');
            showModifyObservationsDialog();
            break;
        case 'obs-delete':
            highlightMenu('observations');
            showDeleteObservationsDialog();
            break;
            
        // Observers menu
        case 'observer-add':
            highlightMenu('observers');
            showAddObserverDialog();
            break;
        case 'observer-modify':
            highlightMenu('observers');
            showEditObserverDialog();
            break;
        case 'observer-delete':
            highlightMenu('observers');
            showDeleteObserverDialog();
            break;
            
        // Analysis menu
        case 'analysis-create':
            window.navigateInternal('/analysis');
            break;
        case 'analysis-load':
            console.info('Load analysis not implemented');
            break;
            
        // Settings menu
        case 'settings-fixed-observer':
            highlightMenu('settings');
            showFixedObserverDialog();
            break;
        case 'settings-datum':
            highlightMenu('settings');
            showDatumDialog();
            break;
        case 'settings-eingabeart':
            highlightMenu('settings');
            showEingabeartDialog();
            break;
        case 'settings-ausgabeart':
            highlightMenu('settings');
            showAusgabeartDialog();
            break;
        case 'settings-change-password':
            highlightMenu('settings');
            if (typeof window.showChangePasswordDialog === 'function') {
                window.showChangePasswordDialog();
            } else {
                console.error('showChangePasswordDialog is not available');
            }
            break;
        case 'settings-active-observers':
            highlightMenu('settings');
            showActiveObserversDialog();
            break;
        case 'settings-startup-file':
            highlightMenu('settings');
            showStartupFileDialog();
            break;
            
        // Output menu
        case 'output-monthly-report':
            window.navigateInternal('/monthly-report');
            break;
        case 'output-monthly-stats':
            window.navigateInternal('/monthly-stats');
            break;
        case 'output-yearly-stats':
            window.navigateInternal('/annual-stats');
            break;
            
        // Help menu
        case 'help-version':
            highlightMenu('version');
            showVersionDialog();
            break;
        case 'help-new':
            highlightMenu('version');
            showWhatsNewDialog();
            break;
        case 'help-text':
            highlightMenu('help');
            showHelpDialog();
            break;
        
        // Logout (cloud mode only)
        case 'logout':
            window.handleLogout();
            break;
            
        // Exit menu removed
            
        default:
            console.info(`Function "${action}" not implemented`);
    }
}

// Load internationalization strings
async function loadI18n(lang) {
    try {
        const response = await fetch(`/api/i18n/${lang}?v=${Date.now()}`);
        i18nStrings = await response.json();
        window.i18nStrings = i18nStrings;
    } catch (error) {}
}

// Auto-update: check GitHub releases and prompt user
async function checkForUpdates() {
    try {
        const repo = window.UPDATE_REPO;
        if (!repo) return;
        
        let resp;
        try {
            resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
                signal: AbortSignal.timeout(5000)  // 5 second timeout
            });
        } catch (fetchErr) {
            // Network error, timeout, or fetch failed - silently skip update check
            // This is common in offline/restricted network environments
            return;
        }
        
        if (!resp.ok) {
            // Silent exit for 404 (repo not found) or other errors
            return;
        }
        
        const json = await resp.json();
        const latestTag = json.tag_name;
        const latest = latestTag.replace(/^v/, '');
        // Use ISO date format (YYYY-MM-DD) for consistency
        const latestDate = json.published_at ? json.published_at.split('T')[0] : '';
        
        if (isNewerVersion(latest, i18nStrings.app.version)) {
            // Block startup until user decides
            await new Promise((resolve) => {
                const message = i18nStrings.update.message
                    .replace('{latest}', latest)
                    .replace('{latestDate}', latestDate)
                    .replace('{current}', i18nStrings.app.version_display)
                    .replace('{currentDate}', i18nStrings.app.version_date);
                showConfirmDialog(i18nStrings.update.title, message, async () => {
                    try {
                        const { modal, modalEl } = showInfoModal(i18nStrings.update.title, i18nStrings.upload_download.download_progress);
                        
                        // Send update request - expect connection to be reset when Flask reloads
                        try {
                            await fetch('/api/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ repo, tag: latestTag })
                            });
                        } catch (fetchErr) {
                            // Connection reset is expected - Flask reloader kills connection
                            // Update likely succeeded, just wait a moment
                        }
                        
                        // Close loading modal
                        modal.hide();
                        modalEl.remove();
                        
                        // Wait briefly for Flask to restart, then reload page
                        const { modal: successModal, modalEl: successModalEl } = showInfoModal(i18nStrings.update.title, i18nStrings.update.success);
                        
                        // Give Flask 2 seconds to restart, then reload
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                    } catch (e) {
                        showErrorDialog(i18nStrings.update.title, i18nStrings.messages.error_loading.replace('{error}', String(e)));
                        resolve();
                    }
                }, () => {
                    // User clicked Cancel
                    resolve();
                });
            });
        }
    } catch (e) {
        // Silent fail on update check
        console.warn('Update check failed:', e);
    }
}

function isNewerVersion(a, b) {
    const pa = a.split('.').map(x => parseInt(x, 10) || 0);
    const pb = b.split('.').map(x => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da > db) return true;
        if (da < db) return false;
    }
    return false;
}



// Setup language switcher buttons
// Setup language switcher buttons
function setupLanguageSwitcher() {
    const deBtn = document.getElementById('lang-de');
    const enBtn = document.getElementById('lang-en');
    
    // Set button states based on current language
    if (currentLanguage === 'de') {
        deBtn.classList.remove('btn-outline-light');
        deBtn.classList.add('btn-light');
        enBtn.classList.remove('btn-light');
        enBtn.classList.add('btn-outline-light');
    } else {
        enBtn.classList.remove('btn-outline-light');
        enBtn.classList.add('btn-light');
        deBtn.classList.remove('btn-light');
        deBtn.classList.add('btn-outline-light');
    }
    
    if (deBtn) {
        deBtn.addEventListener('click', () => switchLanguage('de'));
    }
    
    if (enBtn) {
        enBtn.addEventListener('click', () => switchLanguage('en'));
    }
}

// Switch language
async function switchLanguage(lang) {
    try {
        // Update language on server (session)
        const response = await fetch(`/api/language/${lang}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to set language on server');
        }
        
        // Store in localStorage as backup
        localStorage.setItem('halo_language', lang);
        
        // Reload page to get server-rendered content in new language
        // This ensures all templates, menus, and content are properly translated
        window.location.reload();
        
    } catch (error) {}
}

// Update menu text with current language
function updateMenuText() {
    // Update main menu titles (skip first one which is the help icon "=")
    const menuTitles = document.querySelectorAll('.menu-title');
    const titles = ['=', i18nStrings.menu_titles.file, i18nStrings.menu_titles.observations, 
                    i18nStrings.menu_titles.observers, i18nStrings.menu_titles.analysis, 
                    i18nStrings.menu_titles.output, i18nStrings.menu_titles.settings];
    menuTitles.forEach((title, i) => {
        if (titles[i] && i > 0) title.textContent = titles[i];
    });
    
    // Update dropdown menu items (i18n already contains correct language)
    updateDropdownItem('help-version', i18nStrings.help.version);
    updateDropdownItem('help-new', i18nStrings.help.whats_new);
    updateDropdownItem('new-file', i18nStrings.file.new_file);
    updateDropdownItem('load', i18nStrings.file.load);
    updateDropdownItem('select', i18nStrings.file.select);
    updateDropdownItem('merge', i18nStrings.file.merge);
    updateDropdownItem('save', i18nStrings.file.save);
    updateDropdownItem('upload', i18nStrings.file.upload);
    updateDropdownItem('download', i18nStrings.file.download);
    
    // Observations menu (Display uses href, handled separately below)
    updateDropdownItem('obs-add', i18nStrings.common.add);
    updateDropdownItem('obs-modify', i18nStrings.common.modify);
    updateDropdownItem('obs-delete', i18nStrings.common.delete);
    
    // Observers menu (Display uses href, handled separately below)
    updateDropdownItem('observer-add', i18nStrings.common.add);
    updateDropdownItem('observer-modify', i18nStrings.common.modify);
    updateDropdownItem('observer-delete', i18nStrings.common.delete);
    
    updateDropdownItem('output-monthly-report', i18nStrings.output.monthly_report);
    updateDropdownItem('output-monthly-stats', i18nStrings.output.monthly_stats);
    updateDropdownItem('output-yearly-stats', i18nStrings.output.yearly_stats);
    updateDropdownItem('settings-fixed-observer', i18nStrings.settings.fixed_observer);
    updateDropdownItem('settings-eingabeart', i18nStrings.settings.input_type);
    if (i18nStrings.settings.active_observers) {
        updateDropdownItem('settings-active-observers', i18nStrings.settings.active_observers);
    }
    
    // Update display links (use href, not data-action, so need separate handling)
    const obsLink = document.querySelector('a[href="/observations"]');
    if (obsLink) obsLink.textContent = i18nStrings.common.display;
    const observerLink = document.querySelector('a[href="/observers"]');
    if (observerLink) observerLink.textContent = i18nStrings.common.display;
}

function updateDropdownItem(action, text) {
    const item = document.querySelector(`[data-action="${action}"]`);
    if (item) item.textContent = text;
}

// Clear all menu highlights (called when returning to main page or closing dialogs)
function clearMenuHighlights() {
    document.querySelectorAll('.menu-title').forEach(menu => menu.classList.remove('active'));
}

// Highlight a specific menu by its data-page attribute
function highlightMenu(page) {
    clearMenuHighlights();
    const menu = document.querySelector(`.menu-title[data-page="${page}"]`);
    if (menu) {
        menu.classList.add('active');
    }
}

// Fetch observers from /api/observers, dedup by KK (keep latest seit), sort by KK.
// Returns array of { kk, vname, nname, seit }.
async function fetchObserversDeduped() {
    const response = await fetch('/api/observers');
    if (!response.ok) throw new Error('Failed to load observers');
    const data = await response.json();
    const all = data.observers || [];

    const map = new Map();
    for (const obs of all) {
        const kk = parseInt(obs.KK);
        const seit = obs.seit;
        if (!map.has(kk) || seit > map.get(kk).seit) {
            map.set(kk, { kk, vname: obs.VName || '', nname: obs.NName || '', seit });
        }
    }
    return Array.from(map.values()).sort((a, b) => a.kk - b.kk);
}

// Populate a <select> element with observer options (DOM approach).
// @param {HTMLSelectElement} selectElement - The <select> to populate
// @param {Object} [options]
// @param {string} [options.placeholder] - Placeholder text (first option with value="")
// @param {string} [options.fixedObserver] - KK of fixed observer (pre-select + disable)
// @param {Array}  [options.observers] - Pre-loaded observer array; if null, fetches from API
window.populateObserverDropdown = async function(selectElement, options = {}) {
    let observers;
    try {
        observers = options.observers || await fetchObserversDeduped();
    } catch (e) {
        console.error('Error loading observers:', e);
        return;
    }

    selectElement.innerHTML = '';
    if (options.placeholder) {
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = options.placeholder;
        selectElement.appendChild(ph);
    }

    for (const obs of observers) {
        const option = document.createElement('option');
        option.value = obs.kk;
        option.textContent = `${String(obs.kk).padStart(2, '0')} - ${escapeHtml(obs.vname)} ${escapeHtml(obs.nname)}`;
        selectElement.appendChild(option);
    }

    if (options.fixedObserver) {
        const fixedKK = String(parseInt(options.fixedObserver));
        selectElement.value = fixedKK;
        // Cloud Mode: pre-select but allow changing; Local Mode: disable
        selectElement.disabled = !window.isCloudMode;
    }
};

// Build observer <option> elements as an HTML string (for inline HTML templates).
// Uses escapeHtml, dedup, sort, KK padding. Returns joined HTML string.
// @param {Array} observers - Raw observer array from API
// @param {string} [fixedObserver] - KK to pre-select
window.buildObserverOptionsHtml = function(observers, fixedObserver) {
    // Dedup by KK (keep latest seit)
    const map = new Map();
    for (const obs of observers) {
        const kk = parseInt(obs.KK);
        const seit = obs.seit;
        if (!map.has(kk) || seit > map.get(kk).seit) {
            map.set(kk, obs);
        }
    }
    const sorted = Array.from(map.values()).sort((a, b) => parseInt(a.KK) - parseInt(b.KK));

    return sorted.map(obs => {
        const kk = String(parseInt(obs.KK)).padStart(2, '0');
        const selected = (fixedObserver && String(obs.KK) === String(fixedObserver)) ? ' selected' : '';
        return `<option value="${obs.KK}"${selected}>${kk} - ${escapeHtml(obs.VName || '')} ${escapeHtml(obs.NName || '')}</option>`;
    }).join('');
};

// Get range values for a parameter code. Used by analysis and observation dialogs.
// @param {string} paramCode - Parameter code (JJ, MM, TT, ZZ, SH, KK, GG, O, f, C, d, EE, DD, H, F, V, zz, HO_HU, SE)
// @param {Array} [observers=[]] - Observer array (needed for KK case, loaded from API)
window.getParameterRange = function(paramCode, observers) {
    if (!observers) observers = [];

    function getMonthName(monthNum) {
        if (Array.isArray(i18nStrings.months)) {
            return i18nStrings.months[monthNum - 1];
        } else {
            return i18nStrings.months[String(monthNum)];
        }
    }

    switch (paramCode) {
        case 'JJ':
            const years = [];
            for (let i = YEAR_MIN; i <= YEAR_MAX; i++) {
                years.push({ value: i, display: String(i) });
            }
            return years;

        case 'MM':
            const months = [];
            for (let i = 1; i <= 12; i++) {
                const monthName = getMonthName(i);
                months.push({ value: i, display: `${String(i).padStart(2, '0')} - ${monthName}` });
            }
            return months;

        case 'TT':
            const days = [];
            for (let i = 1; i <= 31; i++) {
                days.push({ value: i, display: String(i).padStart(2, '0') });
            }
            return days;

        case 'ZZ':
            const hours = [];
            for (let i = 0; i <= 23; i++) {
                hours.push({ value: i, display: i18nStrings.fields.hour_display.replace('{h}', i) });
            }
            return hours;

        case 'SH':
            const altitudes = [];
            for (let i = -10; i <= 90; i++) {
                altitudes.push({ value: i, display: String(i) + '°' });
            }
            return altitudes;

        case 'KK':
            return observers.map(obs => ({
                value: obs.KK,
                display: `${String(obs.KK).padStart(2, '0')} - ${obs.VName} ${obs.NName}`
            }));

        case 'GG':
            return GEOGRAPHIC_REGIONS.map(gg => {
                const regionName = i18nStrings.geographic_regions[String(gg)];
                return { value: gg, display: `${String(gg).padStart(2, '0')} - ${regionName}` };
            });

        case 'O':
            const objects = [];
            for (let i = 1; i <= 5; i++) {
                const objName = i18nStrings.object_types[String(i)];
                objects.push({ value: i, display: `${i} - ${objName}` });
            }
            return objects;

        case 'f':
            const fronts = [];
            for (let i = 0; i <= 8; i++) {
                const frontName = i18nStrings.weather_front[String(i)];
                fronts.push({ value: i, display: `${i} - ${frontName}` });
            }
            return fronts;

        case 'C':
            const cirrus = [];
            for (let i = 0; i <= 7; i++) {
                const cirrusName = i18nStrings.cirrus_types[String(i)];
                cirrus.push({ value: i, display: `${i} - ${cirrusName}` });
            }
            return cirrus;

        case 'd':
            return [
                { value: 0, display: `0 - ${i18nStrings.cirrus_density['0']}` },
                { value: 1, display: `1 - ${i18nStrings.cirrus_density['1']}` },
                { value: 2, display: `2 - ${i18nStrings.cirrus_density['2']}` },
                { value: 4, display: `4 - ${i18nStrings.cirrus_density['4']}` },
                { value: 5, display: `5 - ${i18nStrings.cirrus_density['5']}` },
                { value: 6, display: `6 - ${i18nStrings.cirrus_density['6']}` },
                { value: 7, display: `7 - ${i18nStrings.cirrus_density['7']}` }
            ];

        case 'EE':
            return VALID_HALO_TYPES.map(i => {
                const haloName = i18nStrings.halo_types[String(i)];
                return { value: i, display: `${String(i).padStart(2, '0')} - ${haloName}` };
            });

        case 'DD':
            const durations = [];
            const minuteText = i18nStrings.observations.detail_labels.minutes.trim();
            for (let i = 0; i <= 99; i += 10) {
                durations.push({ value: i, display: `${i} ${minuteText}` });
            }
            return durations;

        case 'H':
            const brightness = [];
            for (let i = 0; i <= 3; i++) {
                const brightName = i18nStrings.brightness[String(i)];
                brightness.push({ value: i, display: `${i} - ${brightName}` });
            }
            return brightness;

        case 'F':
            const colours = [];
            for (let i = 0; i <= 5; i++) {
                const colorName = i18nStrings.color[String(i)];
                colours.push({ value: i, display: `${i} - ${colorName}` });
            }
            return colours;

        case 'V':
            return [
                { value: 1, display: `1 - ${i18nStrings.completeness['1']}` },
                { value: 2, display: `2 - ${i18nStrings.completeness['2']}` }
            ];

        case 'zz':
            const zzTimes = [];
            const hourText = i18nStrings.observations.detail_labels.hours.trim();
            for (let i = 0; i <= 99; i++) {
                zzTimes.push({ value: i, display: `${i} ${hourText}` });
            }
            return zzTimes;

        case 'HO_HU':
            const heights = [];
            for (let i = 0; i <= 30; i++) {
                heights.push({ value: i, display: String(i) + '°' });
            }
            return heights;

        case 'SE':
            return ['a','b','c','d','e','f','g','h'].map(letter => ({ value: letter, display: letter }));

        default:
            return [];
    }
};

// Show help
function showHelp() {
    // Prefer rich markdown help dialog over alerts
    showHelpDialog();
}


// Show warning modal with custom message - defined in modal-utils.js

// Show notification with custom message and type
// - Auto-dismisses after 3 seconds
// - User can manually close with X button
// - z-index: 9999 (always on top)

function showNotification(message, type = 'success', duration = 3000) {
    const notification = document.createElement('div');
    const alertClass = {
        'success': 'alert-success',
        'info': 'alert-info',
        'warning': 'alert-warning',
        'danger': 'alert-danger'
    }[type] || 'alert-success';
    
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    notification.style.cssText = 'z-index:9999;min-width:300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    if (duration > 0) {
        setTimeout(() => notification.remove(), duration);
    }
}

// Show version information dialog
function showVersionDialog() {
    const v = i18nStrings.app.version_dialog;
    const versionNumber = i18nStrings.app.version_display;
    const versionDate = i18nStrings.app.version_date;
    const versionTitle = `${i18nStrings.app.title} ${versionNumber}`;

    const versionText = `<h4 class="text-center mb-4">${versionTitle}</h4>
           <p class="mb-2"><strong>${v.date_label}:</strong> ${versionDate}</p>
           <p class="mb-3"><strong>${v.author_label}:</strong> ${v.contact_name}</p>
           <hr class="my-3">
           <p class="mb-2">${i18nStrings.app.description}</p>
           <p class="mb-3">${v.workgroup}</p>
           <hr class="my-3">
           <p class="mb-1">Sirko Molau</p>
           <p class="mb-1">Abenstastr. 13b</p>
           <p class="mb-1">D-84072 Seysdorf</p>
           <p class="mb-3">Germany</p>
           <p class="mb-0"><small>E-Mail: sirko@molau.de</small></p>`;
    
    const modalHtml = `
        <div class="modal fade" id="version-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.help.version}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <i class="bi bi-cloud-sun text-primary" style="font-size: 3rem;"></i>
                        </div>
                        ${versionText}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-version-ok" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('version-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    setupModalKeyboard(modalEl, document.getElementById('btn-version-ok'));
    modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
    setupModalCleanup(modalEl);
}

// Show what's new dialog
async function showWhatsNewDialog() {
    try {
        const response = await fetch(`/api/whats-new/${currentLanguage}`);
        const data = await response.json();
        
        if (!response.ok) {
            showErrorDialog(i18nStrings.messages.error_loading + ': ' + data.error);
            return;
        }
        
        // Convert markdown to HTML
        let htmlContent = data.content
            // ## headers (markdown h2)
            .replace(/^##(.+?)##$/gm, '<h4 class="mt-4 mb-3 text-primary">$1</h4>')
            // # headers (markdown h1 - used as subheadings)
            .replace(/^#(.+?)#$/gm, '<h5 class="mt-3 mb-2 fw-bold">$1</h5>')
            // Main headers (bold) - backup for ** syntax
            .replace(/\*\*(.*?)\*\*/g, '<h4 class="mt-4 mb-3 text-primary">$1</h4>')
            // Sub-headers (italic) - backup for * syntax
            .replace(/\*(.*?)\*/g, '<h5 class="mt-3 mb-2 fw-bold">$1</h5>')
            // Paragraphs
            .replace(/\n\n/g, '</p><p class="mb-2">')
            // Line breaks
            .replace(/\n/g, '<br>');
        
        htmlContent = '<p class="mb-2">' + htmlContent + '</p>';
        
        const modalHtml = `
            <div class="modal fade" id="whatsnew-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.help.whats_new}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="font-size: 14px; line-height: 1.6;">
                            ${htmlContent}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-whatsnew-ok" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('whatsnew-modal');
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        setupModalKeyboard(modalEl, document.getElementById('btn-whatsnew-ok'));
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
        
    } catch (error) {
        clearMenuHighlights();
        showErrorDialog(i18nStrings.common.error + ': ' + error.message);
    }
}

// Show help dialog
async function showHelpDialog() {
    try {
        const response = await fetch(`/api/help/${currentLanguage}`);
        const data = await response.json();
        
        if (!response.ok) {
            showErrorDialog(i18nStrings.messages.error_loading + ': ' + data.error);
            return;
        }
        
        // Convert markdown to HTML
        let htmlContent = data.content
            // # headers (markdown h1)
            .replace(/^# (.+)$/gm, '<h3 class="mt-4 mb-3 text-primary">$1</h3>')
            // ## headers (markdown h2)
            .replace(/^## (.+)$/gm, '<h4 class="mt-3 mb-2 text-primary">$1</h4>')
            // ### headers (markdown h3)
            .replace(/^### (.+)$/gm, '<h5 class="mt-3 mb-2 fw-bold">$1</h5>')
            // Bullet points (4-space indented = 2nd level)
            .replace(/^    \* (.+)$/gm, '<li style="margin-left: 40px;">$1</li>')
            // Bullet points (2-space indented = 1st level)
            .replace(/^  \* (.+)$/gm, '<li style="margin-left: 20px;">$1</li>')
            // Bullet points (no indent = top level)
            .replace(/^\* (.+)$/gm, '<li>$1</li>')
            // Paragraphs
            .replace(/\n\n/g, '</p><p class="mb-2">')
            // Line breaks
            .replace(/\n/g, '<br>');
        
        htmlContent = '<p class="mb-2">' + htmlContent + '</p>';
        
        const modalHtml = `
            <div class="modal fade" id="help-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.menu_titles.help}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="font-size: 14px; line-height: 1.6;">
                            ${htmlContent}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-help-ok" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('help-modal');
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        setupModalKeyboard(modalEl, document.getElementById('btn-help-ok'));
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
        
    } catch (error) {
        clearMenuHighlights();
        showErrorDialog(i18nStrings.common.error + ': ' + error.message);
    }
}

// Logout handler (cloud mode only)
window.handleLogout = async function() {
    // Show confirmation modal
    const modalHtml = `
        <div class="modal fade" id="logout-confirm-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.logout.confirm_title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${i18nStrings.logout.confirm_message}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="logout-confirm-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('logout-confirm-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    setupModalKeyboard(modalEl, document.getElementById('logout-confirm-yes'));
    
    // Handle Yes button
    document.getElementById('logout-confirm-yes').addEventListener('click', async () => {
        modal.hide();
        
        try {
            const configResponse = await fetch('/api/config');
            const config = await configResponse.json();
            const apiBase = isCloudMode ? '' : config.cloud_server_url;
            if (!isCloudMode && !apiBase) {
                showErrorDialog(i18nStrings.messages.error_loading);
                return;
            }
            const logoutUrl = apiBase === '' ? '/api/logout' : `${apiBase.replace(/\/$/, '')}/api/logout`;
            const response = await fetch(logoutUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                // Redirect to login page
                window.location.href = '/login';
            } else {
                showErrorDialog(i18nStrings.common.error);
            }
        } catch (error) {
            showErrorDialog(i18nStrings.common.error + ': ' + error.message);
        }
    });
    
    setupModalCleanup(modalEl);
    
    modal.show();
}

