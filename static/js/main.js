// HALO Web Application JavaScript

// ============================================================================
// GLOBAL CONSTANTS
// ============================================================================
// Year range for observer "seit" (since) dates and data ranges
const YEAR_MIN = 1980;
const YEAR_MAX = 2079;

// Language will be loaded from server session on page load
let currentLanguage = 'de';
window.currentLanguage = currentLanguage;
let i18nStrings = {};
let observerData = null; // cache of observer data with regions

// Application constants loaded from backend
let CIRCULAR_HALOS = new Set(); // Will be loaded from /api/constants on page load
let PILLAR_HEIGHT_VALUES = []; // Light pillar height values (-1, 1-90)
let ALL_PILLAR_HEIGHT_VALUES = []; // All height values including 0

// Global cloud mode flag - loaded once at startup
let isCloudMode = false;

// Password policy configuration
const PASSWORD_POLICY = {
    minLength: 8,
    requireCategories: 3, // At least 3 of 4 categories required
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

// Global data store for loaded observations
window.haloData = {
    observations: [],
    fileName: null,
    isLoaded: false,
    isDirty: false
};

// Global config (loaded once at startup)
window.haloConfig = {
    cloud_mode: false
};

// Helper function to save haloData metadata to sessionStorage
// Note: We only save metadata (fileName, isLoaded, isDirty, count), NOT the observations array
// For large files (200k+ observations), storing all data exceeds browser storage limits
// Server keeps all observations in memory, so we fetch them via API when needed
function saveHaloDataToSession() {
    if (window.haloData && window.haloData.isLoaded) {
        try {
            // Store only metadata, not the full observations array
            const metadata = {
                fileName: window.haloData.fileName,
                isLoaded: window.haloData.isLoaded,
                isDirty: window.haloData.isDirty,
                count: window.haloData.observations.length || 0
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
    // Note: We only restore metadata, not observations array
    // Observations are always fetched from server when needed
    const savedHaloData = sessionStorage.getItem('haloData');
    if (savedHaloData) {
        try {
            const metadata = JSON.parse(savedHaloData);
            // Restore metadata only
            window.haloData.fileName = metadata.fileName;
            window.haloData.isLoaded = metadata.isLoaded;
            window.haloData.isDirty = metadata.isDirty;
            // Don't restore observations array - it will be fetched from server when needed
            window.haloData.observations = [];
            
            // If file was loaded before, fetch observations from server
            if (metadata.isLoaded && metadata.fileName) {
                try {
                    const resp = await fetch(`/api/observations`);
                    if (resp.ok) {
                        const data = await resp.json();
                        // API returns { observations: [...], total: n, limit: n, offset: n }
                        window.haloData.observations = data.observations || [];
                        if (window.haloData.observations.length > 0) {
                            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
                        }
                    }
                } catch (e) {
                    console.error('Failed to restore observations from server:', e);
                    // Keep observations empty on error
                    window.haloData.observations = [];
                }
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
// Backward compatibility wrapper - actual implementation in modal-manager.js
// function showConfirmDialog(title, message, onConfirm, onCancel) - defined in modal-manager.js

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
        
        // Convert to 2-digit format for consistency with HALO data format
        const mm = String(month).padStart(2, '0');
        const jj = String(year % 100).padStart(2, '0'); // 2-digit year
        
        return { mm, jj, month, year };
    } catch (error) {return null;
    }
}

// Setup hover dropdowns
function setupHoverDropdowns() {
    const dropdowns = document.querySelectorAll('.nav-item.dropdown');
    
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const menu = dropdown.querySelector('.dropdown-menu');
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
            highlightFileMenu();
            showNewFileDialog();
            break;
        case 'load':
            highlightFileMenu();
            showLoadFileDialog();
            break;
        case 'select':
            highlightFileMenu();
            showSelectDialog();
            break;
        case 'merge':
            highlightFileMenu();
            showMergeFileDialog();
            break;
        case 'save':
            highlightFileMenu();
            showSaveFileDialog();
            break;
        case 'upload':
            highlightFileMenu();
            showUploadDialog();
            break;
        case 'download':
            highlightFileMenu();
            showDownloadDialog();
            break;
        
            
        // Observations menu
        case 'obs-display':
            showDisplayObservationsDialog();
            break;
        case 'obs-add':
            showAddObservationDialog();
            break;
        case 'obs-modify':
            showModifyObservationsDialog();
            break;
        case 'obs-delete':
            showDeleteObservationsDialog();
            break;
            
        // Observers menu
        case 'observer-add':
            showAddObserverDialog();
            break;
        case 'observer-modify':
            showEditObserverDialog();
            break;
        case 'observer-delete':
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
            highlightSettingsMenu();
            showFixedObserverDialog();
            break;
        case 'settings-datum':
            highlightSettingsMenu();
            showDatumDialog();
            break;
        case 'settings-eingabeart':
            highlightSettingsMenu();
            showEingabeartDialog();
            break;
        case 'settings-ausgabeart':
            highlightSettingsMenu();
            showAusgabeartDialog();
            break;
        case 'settings-change-password':
            highlightSettingsMenu();
            showChangePasswordDialog();
            break;
        case 'settings-active-observers':
            highlightSettingsMenu();
            showActiveObserversDialog();
            break;
        case 'settings-startup-file':
            highlightSettingsMenu();
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
            highlightVersionMenu();
            showVersionDialog();
            break;
        case 'help-new':
            highlightVersionMenu();
            showWhatsNewDialog();
            break;
        case 'help-text':
            highlightHelpMenu();
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

// Show dialog asking if user wants to add another observation
// Returns: Promise<boolean> - true if user wants to add another, false otherwise
function showAddAnotherObservationDialog() {
    return new Promise((resolve) => {
        // Add delay before creating modal to allow previous modal's backdrop to disappear
        setTimeout(() => {
            const modalHtml = `
            <div class="modal fade" id="add-another-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h6 class="modal-title mb-0">${i18nStrings.observations.add_another_title}</h6>
                        </div>
                        <div class="modal-body py-3">
                            <p class="mb-0">${i18nStrings.observations.add_another_message}</p>
                        </div>
                        <div class="modal-footer py-2">
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-no">${i18nStrings.common.no}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-yes">${i18nStrings.common.yes}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('add-another-modal');
        const modal = new bootstrap.Modal(modalEl);
        
        let resolved = false;
        
        const btnYes = modalEl.querySelector('#btn-yes');
        
        // Yes button - add another
        btnYes.addEventListener('click', () => {
            if (!resolved) {
                resolved = true;
                modal.hide();
                resolve(true);
            }
        });
        
        // No button - don't add another
        modalEl.querySelector('#btn-no').addEventListener('click', () => {
            if (!resolved) {
                resolved = true;
                modal.hide();
                resolve(false);
            }
        });
        
        // Cleanup on modal hidden
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!resolved) {
                // ESC or backdrop click - treat as No
                resolved = true;
                resolve(false);
            }
            modalEl.remove();
        });
        
        modal.show();
        setupModalKeyboard(modalEl, btnYes);
        }, 300); // 300ms delay to let previous modal backdrop fully disappear
    });
}

// Add Observation dialog entry point
async function showAddObservationDialog() {
    try {
        const modeResp = await fetch('/api/config/inputmode');
        const modeData = await modeResp.json();
        const mode = modeData.mode;
        if (mode === 'N') {
            return await showAddObservationDialogNumeric();
        } else {
            return await showAddObservationDialogMenu();
        }
    } catch (e) {}
}

// Numeric entry (Kurzeingabe) dialog
async function showAddObservationDialogNumeric() {
    // Get config to check cloud mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    
    // Check if a file is loaded (Local Mode only - Cloud Mode has database always available)
    if (!isCloudMode && !window.haloData.isLoaded) {
        showWarningModal(i18nStrings.observations.no_file_loaded);
        return;
    }
    
    // Ensure i18n is loaded
    if (!i18nStrings.observations) {
        await loadI18n(currentLanguage);
        if (!i18nStrings.observations) {throw new Error('i18n strings not loaded');
        }
    }
    
    // CRITICAL: Flag to prevent race conditions during async field calculations
    let isProcessingInput = false;
    const inputQueue = [];
    
    // Get fixed observer setting
    let fixedObserver = '';
    try {
        const configResponse = await fetch('/api/config/fixed_observer');
        const config = await configResponse.json();
        fixedObserver = config.observer;
    } catch (e) {}

    // Get date default setting
    let dateDefault = null;
    try {
        dateDefault = await getDateDefault();
    } catch (e) {}
    
    const modalHtml = `
        <div class="modal fade" id="add-observation-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg" style="max-width: 900px;">
                <div class="modal-content">
                    <div class="modal-header py-1">
                        <h6 class="modal-title mb-0">${i18nStrings.observations.add_observation}</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body py-2">
                        <div class="border rounded mb-2" style="font-family: var(--bs-font-monospace, monospace); white-space: pre; background: #f8f9fa; padding: 4px 6px; font-size: 14px; color: #000;"><div id="obs-guide-header" style="margin: 0; padding: 0; line-height: 1.4;">${i18nStrings.observations.input_pattern}</div><div id="obs-guide-entered" style="margin: 0; padding: 0; line-height: 1.4;"></div><div id="obs-guide-remarks" style="margin: 0; padding: 0; line-height: 1.4; display: none;"></div><div id="obs-guide-caret" style="color:#0d6efd; margin: 0; padding: 0; line-height: 1.4;"></div></div>
                        <input id="obs-code-input" class="form-control form-control-sm py-1" autocomplete="off" spellcheck="false" style="opacity: 0; height: 0; padding: 0; margin: 0; border: none; font-family: var(--bs-font-monospace, monospace); font-size: 14px;" size="110" placeholder="KKOJJMMTTgZZZZdDDNCcEEHFVfzzGG...">
                        <div id="obs-code-error" class="text-danger mt-1" style="display:none; font-size: 12px;"></div>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-add-obs-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;

    let observerCodes;
    let observers;
    try {
        const data = await loadObserverCodes();
        observerCodes = data.codeSet;
        observers = data.observers;
    } catch (e) {showErrorDialog(i18nStrings.messages.error_loading_observers);
        return;
    }

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('add-observation-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    setupModalKeyboard(modalEl, document.getElementById('btn-add-obs-ok'));

    const input = document.getElementById('obs-code-input');
    const errEl = document.getElementById('obs-code-error');
    let eing = fixedObserver;  // Pre-fill with fixed observer KK
    
    // If date default is available, append MM and JJ after KK and O (positions 2-3)
    if (dateDefault && eing.length >= 4) {
        // Keep KK (2 chars) + O (1 char) + JJ (2 chars) + MM (2 chars)
        eing = eing.substring(0, 3) + dateDefault.jj + dateDefault.mm + eing.substring(5);
    }

    const ensureNumericInputFocus = () => {
        if (document.body.contains(input) && document.activeElement !== input) {
            input.focus();
        }
    };

    const handleVisibilityChange = () => {
        if (!document.hidden) {
            setTimeout(ensureNumericInputFocus, 0);
        }
    };

    // Focus input as soon as modal is shown
    modalEl.addEventListener('shown.bs.modal', () => {
        ensureNumericInputFocus();
        // Set initial value and render
        input.value = eing;
        renderNumericGuide(eing);
    });

    // Restore focus when returning to the tab/window or clicking inside the modal
    window.addEventListener('focus', ensureNumericInputFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    modalEl.addEventListener('mousedown', ensureNumericInputFocus);
    
    // Restore focus when clicking anywhere in the document (handles clicks outside modal)
    const handleDocumentClick = (e) => {
        // Only refocus if the modal is still visible and click wasn't on a button that closes the modal
        if (document.body.contains(input) && !e.target.closest('.btn-close, #btn-add-obs-ok, #btn-add-obs-cancel')) {
            setTimeout(ensureNumericInputFocus, 0);
        }
    };
    document.addEventListener('click', handleDocumentClick);

    // Cleanup listeners when modal closes
    modalEl.addEventListener('hidden.bs.modal', () => {
        window.removeEventListener('focus', ensureNumericInputFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        modalEl.removeEventListener('mousedown', ensureNumericInputFocus);
        document.removeEventListener('click', handleDocumentClick);
    });

    // Enter key triggers OK button
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-add-obs-ok').click();
        }
    });

    function renderNumericGuide(s) {
        const enteredEl = document.getElementById('obs-guide-entered');
        const remarksEl = document.getElementById('obs-guide-remarks');
        const caretEl = document.getElementById('obs-guide-caret');
        
        // Split into main part (up to position 100) and overflow remarks (from position 100)
        // First 50 chars = HALO key fields, next 50 chars = first part of remarks (same line)
        const mainPart = s.substring(0, Math.min(s.length, 100));
        const overflowPart = s.length > 100 ? s.substring(100) : '';
        
        // Format main part (HALO key fields up to sectors + first 50 chars of remarks)
        let formatted = '';
        for (let i = 0; i < mainPart.length; i++) {
            formatted += mainPart[i];
            // Add space after every 5 characters only up to position 34 (end of 8HHHH)
            if ((i + 1) % 5 === 0 && i < 34) formatted += ' ';
            // Add extra separator space after 8HHHH (pos 34) and after sectors (pos 49)
            if (i === 34 || i === 49) formatted += ' ';
        }
        enteredEl.textContent = formatted;
        
        // Calculate indent for overflow line (should align with start of remarks = position 50)
        // Position 50 comes after: 50 chars + spaces
        // Spaces: 34/5 = 6 spaces up to pos 34, +1 after 8HHHH, +1 after sectors = 8 spaces total
        const remarksIndent = 50 + 8; // 58 characters to align with start of remarks
        
        // Show overflow remarks on separate line if present (only if > 100 chars total)
        if (overflowPart.length > 0) {
            remarksEl.textContent = ' '.repeat(remarksIndent) + overflowPart;
            remarksEl.style.display = 'block';
        } else {
            remarksEl.textContent = '';
            remarksEl.style.display = 'none';
        }
        
        // Position caret
        const L = s.length;
        if (L <= 100) {
            // Caret in main part (first line)
            let spacesBefore = L <= 34 ? Math.floor(L / 5) : Math.floor(34 / 5);
            if (L > 34) spacesBefore += 1; // separator after 8HHHH
            if (L > 49) spacesBefore += 1; // separator after sectors
            const caretPos = L + spacesBefore;
            caretEl.textContent = ' '.repeat(Math.max(caretPos, 0)) + '^';
        } else {
            // Caret in overflow line - position relative to start of overflow (position 100), plus indent
            const overflowPos = L - 100;
            caretEl.textContent = ' '.repeat(remarksIndent + overflowPos) + '^';
        }
    }

    // Track which positions were auto-filled (to handle backspace correctly)
    const autoFilledPositions = new Set();

    // initial render
    renderNumericGuide(eing);

    // Process input from queue one at a time (blocking/sequential)
    async function processInputQueue() {
        if (isProcessingInput || inputQueue.length === 0) return;
        
        isProcessingInput = true;
        const ev = inputQueue.shift();
        
        await handleKeydownEvent(ev);
        
        isProcessingInput = false;
        
        // Process next item in queue if any
        if (inputQueue.length > 0) {
            processInputQueue();
        }
    }

    // Queue-based keydown handler to prevent race conditions
    input.addEventListener('keydown', (ev) => {
        // Add to queue and process sequentially
        inputQueue.push(ev);
        processInputQueue();
    });
    
    // Main keydown event handler (now called sequentially from queue)
    async function handleKeydownEvent(ev) {
        // Allow navigation keys
        const navKeys = ['ArrowLeft','ArrowRight','Home','End','Tab'];
        if (navKeys.includes(ev.key)) return;
        if (ev.key === 'Backspace') {
            // Prevent deletion if fixed observer is set and we're at position 2 or less (KK protected)
            if (fixedObserver && eing.length <= 2) {
                ev.preventDefault();
                return;
            }
            if (eing.length > 0) {
                // Smart backspace from start of remarks (position 50): jump back to last input field
                // Only at position 50 (start of remarks), NOT for every character in remarks
                // This must come BEFORE auto-fill handling to prevent early returns
                if (eing.length === 50) {
                    const ee = parseInt(eing.slice(20,22),10);
                    const g = parseInt(eing.slice(9,10),10);
                    const v = parseInt(eing.slice(24,25),10);
                    
                    if (ee === 8) {
                        // EE 08: Jump to position 32 (delete last char of HO)
                        eing = eing.slice(0, 32);
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    } else if (ee === 9 || ee === 10) {
                        // EE 09/10: Sectors were auto-filled, jump to end of 8HHHH (position 34)
                        eing = eing.slice(0, 34);
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    } else if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                        // Incomplete circular halo: Sectors were manually entered
                        // Delete trailing spaces AND the last entered sector character
                        let pos = 49; // Start at end of sectors (position 49)
                        // Skip trailing spaces
                        while (pos >= 35 && eing[pos] === ' ') {
                            pos--;
                        }
                        // Now delete the last non-space character too
                        if (pos >= 35) {
                            pos--;
                        }
                        eing = eing.slice(0, pos + 1);
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    } else {
                        // Complete halo or non-circular: Sectors (15 chars) + 8//// (5 chars) were auto-filled
                        // If g=1: Delete last char of GG (manually entered) → position 29
                        // If g != 1: GG was also auto-filled, delete it and last char of zz → position 27
                        if (g === 1) {
                            // g=1: GG was manually entered, delete last digit
                            eing = eing.slice(0, 29);
                        } else {
                            // g=0 or g=2: GG was auto-filled, delete it and last char of zz
                            eing = eing.slice(0, 27);
                        }
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    }
                }
                
                // Smart backspace from start of sectors (position 35): after manually deleting all sectors
                // This handles incomplete circular halos where sectors were manually entered
                if (eing.length === 35) {
                    const ee = parseInt(eing.slice(20,22),10);
                    const g = parseInt(eing.slice(9,10),10);
                    const v = parseInt(eing.slice(24,25),10);
                    
                    if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                        // Incomplete circular halo: Sectors were manually entered and now all deleted
                        // If g=1: Delete last char of GG → position 29
                        // If g != 1: Delete GG completely and last char of zz → position 27
                        if (g === 1) {
                            eing = eing.slice(0, 29);
                        } else {
                            eing = eing.slice(0, 27);
                        }
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    }
                    // For other cases at position 35, fall through to normal backspace
                }
                
                // Smart backspace from start of HU field (position 33): after manually deleting HU for EE 09
                // For EE 09: 8// is auto-filled, HU was manually entered at position 33-34
                // For EE 10: 8 is auto-filled, but HO/HU/MD spans 31-36, so position 33 is mid-field
                if (eing.length === 33) {
                    const ee = parseInt(eing.slice(20,22),10);
                    const g = parseInt(eing.slice(9,10),10);
                    if (ee === 9) {
                        // EE 09 only: 8// was auto-filled
                        // If g=1: Delete last char of GG → position 29
                        // If g != 1: Delete GG and last char of zz → position 27
                        if (g === 1) {
                            eing = eing.slice(0, 29);
                        } else {
                            eing = eing.slice(0, 27);
                        }
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    }
                    // For other cases at position 33 (including EE 10), fall through to normal backspace
                }
                
                // Smart backspace from start of HO field (position 31): after manually deleting HO for EE 08/10
                // For EE 08: 8 is auto-filled, HO was manually entered
                // For EE 10: 8 is auto-filled, HO/HU/MD were manually entered
                if (eing.length === 31) {
                    const ee = parseInt(eing.slice(20,22),10);
                    const g = parseInt(eing.slice(9,10),10);
                    if (ee === 8 || ee === 10) {
                        // EE 08/10: 8 was auto-filled
                        // If g=1: Delete last char of GG → position 29
                        // If g != 1: Delete GG and last char of zz → position 27
                        if (g === 1) {
                            eing = eing.slice(0, 29);
                        } else {
                            eing = eing.slice(0, 27);
                        }
                        input.value = eing;
                        renderNumericGuide(eing);
                        ev.preventDefault();
                        return;
                    }
                    // For other cases at position 31, fall through to normal backspace
                }
                
                // Check if we're deleting an auto-filled character
                // If yes, delete all consecutive auto-filled characters plus the one that triggered them
                let currentPos = eing.length - 1;
                
                // Keep looping while we're on auto-filled positions
                while (currentPos >= 0 && autoFilledPositions.has(currentPos)) {// Delete the auto-filled character
                    eing = eing.slice(0, -1);
                    autoFilledPositions.delete(currentPos);
                    currentPos--;
                    
                    // Keep deleting while we're on auto-filled positions
                    while (currentPos >= 0 && autoFilledPositions.has(currentPos)) {eing = eing.slice(0, -1);
                        autoFilledPositions.delete(currentPos);
                        currentPos--;
                    }
                    
                    // Delete one more character (the one that triggered the auto-fill)
                    if (currentPos >= 0) {eing = eing.slice(0, -1);
                        autoFilledPositions.delete(currentPos); // Clean up just in case
                        currentPos--;
                    }
                    // Loop continues to check if THIS position is also auto-filled
                }
                
                if (eing.length < input.value.length) {input.value = eing;
                    renderNumericGuide(eing);
                    ev.preventDefault();
                    return;
                }// Special handling for sector field trailing spaces (positions 36-50)
                // If we're deleting spaces from the sector field, delete all trailing spaces at once
                if (eing.length > 35 && eing.length <= 50) {
                    // Check if current position and all positions before it (in sector field) are spaces
                    let pos = eing.length - 1;
                    if (eing[pos] === ' ') {
                        // Find the last non-space character before this position
                        while (pos >= 35 && eing[pos] === ' ') {
                            pos--;
                        }
                        // Delete all spaces back to the last non-space character (or start of sector field)
                        eing = eing.slice(0, pos + 1);
                    } else {
                        // Not a space, delete single character as normal
                        eing = eing.slice(0, -1);
                    }
                } else {
                    // Normal deletion outside sector field
                    eing = eing.slice(0, -1);
                }
                input.value = eing;
                renderNumericGuide(eing);
            }
            ev.preventDefault();
            return;
        }
        // Only accept single character entries
        if (ev.key.length !== 1) return;
        const ch = ev.key;
        
        // Limit total length to 150 characters (50 HALO key + 100 remarks)
        if (eing.length >= 150) {
            ev.preventDefault();
            return;
        }
        
        // Convert to lowercase in sector field (positions 36-50 need lowercase a-h)
        const inSectorField = eing.length >= 35 && eing.length < 50;
        // Allow space in 8HHHH field (positions 31-34 = HHHH part, position 30 is '8') for non-observed values
        const in8HHHHField = eing.length >= 31 && eing.length < 35;
        // Convert space to '/' in 8HHHH field for "not observed" indication
        const effectiveCh = (in8HHHHField && ch === ' ') ? '/' : ch;
        let candidate = eing + (inSectorField ? effectiveCh.toLowerCase() : effectiveCh);
        
        // Auto-fill JJ and MM when user reaches position 3 (after KK + O)
        if (candidate.length === 3 && dateDefault) {
            // Validate up to position 3 (synchronous, no observer check yet)
            const result = validateNumericProgress(candidate, observerCodes);
            if (!result.ok) {
                errEl.textContent = result.msg;
                errEl.style.display = 'block';
                ev.preventDefault();
                return;
            }
            // Auto-fill JJ and MM
            candidate = candidate + dateDefault.jj + dateDefault.mm;
            eing = candidate;
            input.value = eing;
            errEl.style.display = 'none';
            renderNumericGuide(eing);
            ev.preventDefault();
            return;
        }
        
        // Auto-fill GG when g=0 or g=2 (after zz complete at position 28)
        if (candidate.length === 28) {
            const g = parseInt(candidate.slice(9,10),10);

            if (g === 0 || g === 2) {

                
                // First validate and add the character the user just typed (async possible)
                const result = validateNumericProgress(candidate, observerCodes);
                const handleResult = async (res) => {
                    if (!res.ok) {
                        if (res.reset) {
                            eing = '';
                            input.value = eing;
                            errEl.textContent = res.msg;
                            errEl.style.display = 'block';
                            renderNumericGuide(eing);
                        } else {
                            errEl.textContent = res.msg;
                            errEl.style.display = 'block';
                        }
                        ev.preventDefault();
                        return;
                    }
                    
                    // Add the validated character to eing
                    eing = candidate;
                    input.value = eing;
                    errEl.style.display = 'none';
                    renderNumericGuide(eing);
                    
                    // Now fetch and auto-fill GG
                    const kk = eing.slice(0,2);
                    const jj = eing.slice(3,5);
                    const mm = eing.slice(5,7);
                    
                    try {
                        // CRITICAL: await the fetch to prevent race conditions
                        const response = await fetch(`/api/observers?kk=${kk}&jj=${jj}&mm=${mm}`);
                        const data = await response.json();
                        const observer = data.observer;

                        
                        if (observer) {
                            // Get region - use GH for main site (g=0), GN for secondary site (g=2)
                            let gg = g === 0 ? observer.GH : observer.GN;

                            if (gg !== null && gg !== undefined) {
                                gg = String(gg).padStart(2,'0');

                                // Auto-fill the GG field
                                eing = eing + gg;
                                autoFilledPositions.add(28);
                                autoFilledPositions.add(29);
                                input.value = eing;
                                renderNumericGuide(eing);
                                
                                // Auto-fill 8HHHH sun pillar altitude field after GG
                                const ee = parseInt(eing.slice(20,22),10);

                                if (ee === 8) {
                                    // EE 08: 8HOHU// ? user enters HO (Oberkante) at positions 31-32, HU (Unterkante) at 33-34, then // auto-filled
                                    eing = eing + '8';
                                    autoFilledPositions.add(30); // '8' is auto-filled
                                } else if (ee === 9) {
                                    // EE 09: 8//HOHU ? // auto-filled, user enters HO (Oberkante) at 33-34, HU (Unterkante) follows
                                    eing = eing + '8//';
                                    autoFilledPositions.add(30); // '8'
                                    autoFilledPositions.add(31); // '/'
                                    autoFilledPositions.add(32); // '/'
                                } else if (ee === 10) {
                                    // EE 10: 8HOHUMD ? user enters all 4 digits: HO (31-32), HU (33-34), MD follows
                                    eing = eing + '8';
                                    autoFilledPositions.add(30); // '8' is auto-filled
                                } else {
                                    // All other EE values: no sun pillar ? 8////
                                    eing = eing + '8////';
                                    // Track all 5 positions as auto-filled
                                    autoFilledPositions.add(30);
                                    autoFilledPositions.add(31);
                                    autoFilledPositions.add(32);
                                    autoFilledPositions.add(33);
                                    autoFilledPositions.add(34);
                                }
                                input.value = eing;
                                renderNumericGuide(eing);
                                
                                // Auto-fill sectors after 8HHHH is complete
                                // Sectors are only needed for incomplete (V=1) circular halos
                                // CRITICAL: For EE 08/09/10, don't auto-fill sectors yet - user must enter HO/HU first
                                const v = parseInt(eing.slice(24,25),10);
                                
                                // Only auto-fill sectors if 8HHHH field is COMPLETE (5 chars = position 35)
                                // For EE 08/09/10: field is NOT complete yet, user needs to enter HO/HU
                                const is8HHHHComplete = eing.length === 35;
                                
                                if (is8HHHHComplete) {
                                    if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                                        // Incomplete circular halo: user will enter sectors (do nothing)
                                    } else {
                                        // Complete halo or non-circular: auto-fill 15 spaces
                                        eing = eing + '               ';
                                        input.value = eing;
                                        renderNumericGuide(eing);
                                    }
                                } else {
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Failed to fetch observer data:', err);
                    }
                };
                
                if (result && typeof result.then === 'function') {
                    await result.then(handleResult);
                    ev.preventDefault();
                    return;
                } else {
                    await handleResult(result);
                    ev.preventDefault();
                    return;
                }
            }
            // If g=1, fall through to normal validation (manual GG entry)
        }
        
        // Auto-fill 8HHHH sun pillar altitude field after GG (position 29 complete)
        if (eing.length === 29) {
            const ee = parseInt(eing.slice(20,22),10);
            const v = parseInt(eing.slice(24,25),10);
            
            if (ee === 8) {
                // EE 08: 8HOHU// ? user enters HO at positions 31-32, HU at 33-34, then // auto-filled
                candidate = candidate + '8';
            } else if (ee === 9) {
                // EE 09: 8//HOHU ? // auto-filled at 31-32, user enters HO at 33-34
                candidate = candidate + '8//';
            } else if (ee === 10) {
                // EE 10: 8HOHUMD ? user enters all 4 digits
                candidate = candidate + '8';
            } else {
                // All other EE values: no sun pillar ? 8////
                candidate = candidate + '8////';
                // Track all 5 positions as auto-filled (will be added to set in validation handler)
                // Note: These are added in the validation result handler when eing is updated
                
                // Since we just auto-filled 8//// (5 chars), we're now at position 35
                // Check if we need to auto-fill sectors (15 spaces) for non-circular or complete halos
                if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                    // Incomplete circular halo: user will enter sectors (do nothing)
                } else {
                    // Complete halo or non-circular: auto-fill 15 spaces
                    candidate = candidate + '               ';
                }
            }
        }
        
        // Auto-fill trailing // for EE 08 after HO input (position 32 complete)
        if (eing.length === 32) {
            const ee = parseInt(eing.slice(20,22),10);
            if (ee === 8 && eing[30] === '8') {
                // EE 08: User just entered second digit of HO
                // Validate HO field (positions 31-32): must be both digits OR both slashes
                const ho1 = candidate[31];
                const ho2 = candidate[32];
                const digit = /[0-9]/;
                const bothDigits = digit.test(ho1) && digit.test(ho2);
                const bothSlashes = ho1 === '/' && ho2 === '/';
                
                if (bothDigits || bothSlashes) {
                    // Valid HO - auto-fill // for HU
                    candidate = candidate + '//';
                } else {
                    // Invalid HO mix like "1/" or "/1" - don't auto-fill, let validation handle backtrack
                }
            }
        }
        
        // Auto-fill sectors after 8HHHH is complete (position 34 complete)
        // Sectors are only needed for incomplete (V=1) circular halos
        // CRITICAL: For EE 09 and EE 10, 8HHHH is NOT complete at position 34 (HU validation needed at 35)
        if (eing.length === 34) {
            const v = parseInt(eing.slice(24,25),10);
            const ee = parseInt(eing.slice(20,22),10);
            
            // For EE 09 and EE 10, skip auto-fill - HU validation happens at position 35
            if (ee === 9 || ee === 10) {
            } else if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                // Incomplete circular halo: user will enter sectors (do nothing)
            } else {
                // Complete halo or non-circular: auto-fill 15 spaces
                candidate = candidate + '               ';
            }
        }
        
        // Handle space key in sector field to complete and fill remaining with spaces
        // Space is just a trigger, not added as a character
        if (eing.length >= 35 && eing.length < 50 && ch === ' ') {
            const v = parseInt(eing.slice(24,25),10);
            const ee = parseInt(eing.slice(20,22),10);
            
            if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                const sectorStart = 35;
                const posInSector = eing.length - sectorStart;
                

                // Only allow space at odd length (ends with letter)
                if (posInSector % 2 === 1) {
                    // Valid end position - fill rest with spaces to complete 15-char sector field
                    // Sector field is positions 35-49 (15 chars), remarks start at position 50
                    const spacesNeeded = (35 + 15) - eing.length;

                    candidate = eing + ' '.repeat(spacesNeeded);
                }
            }
        }
        
        const result = validateNumericProgress(candidate, observerCodes);
        
        const handleValidationResult = async (res) => {
            if (res.ok) {
                // Check if 8//// or GG was just auto-filled (comparing lengths)
                const oldLength = eing.length;
                eing = candidate;
                const newLength = eing.length;
                
                // If we jumped from position 6 to 28+ (after entering g), GG was auto-filled
                if (oldLength === 7 && newLength >= 29) {
                    autoFilledPositions.add(28);
                    autoFilledPositions.add(29);
                }
                
                // If we jumped from position 29 to 34 (added 5 chars), check if it's 8////
                if (oldLength === 29 && newLength === 35 && eing.slice(30, 35) === '////') {
                    // Track all 5 positions (30-34) as auto-filled
                    autoFilledPositions.add(30);
                    autoFilledPositions.add(31);
                    autoFilledPositions.add(32);
                    autoFilledPositions.add(33);
                    autoFilledPositions.add(34);
                }
                
                // If we jumped from position 29 to 31 (added '8'), track position 30
                if (oldLength === 29 && newLength === 30 && eing[30] === '8') {
                    autoFilledPositions.add(30);
                }
                
                // If we jumped from position 29 to 32 (added '8//'), track positions 30-32
                if (oldLength === 29 && newLength === 32 && eing.slice(30, 33) === '8//') {
                    autoFilledPositions.add(30); // '8'
                    autoFilledPositions.add(31); // '/'
                    autoFilledPositions.add(32); // '/'
                }
                
                // EE 08: If we jumped from position 32 to 35 (user entered 1 char + auto-filled '//'), track positions 33-34
                if (oldLength === 32 && newLength === 35) {
                    const ee = parseInt(eing.slice(20,22),10);
                    if (ee === 8 && eing.slice(33, 35) === '//') {
                        autoFilledPositions.add(33); // '/'
                        autoFilledPositions.add(34); // '/'
                        
                        // Now auto-fill sectors since 8HHHH is complete
                        const v = parseInt(eing.slice(24,25),10);
                        
                        if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                            // Incomplete circular halo: user will enter sectors (do nothing)
                        } else {
                            // Complete halo or non-circular: auto-fill 15 spaces
                            eing = eing + '               ';
                            input.value = eing;
                            renderNumericGuide(eing);
                        }
                    }
                }
                
                // Auto-fill sectors for EE 09/10 after successful HU validation at position 35
                const ee = parseInt(eing.slice(20,22),10);
                if ((ee === 9 || ee === 10) && newLength === 35 && oldLength === 34) {
                    // User just completed HU validation at position 35
                    const v = parseInt(eing.slice(24,25),10);
                    
                    if (v === 1 && CIRCULAR_HALOS.has(ee)) {
                        // Incomplete circular halo: user will enter sectors (do nothing)
                    } else {
                        // Complete halo or non-circular: auto-fill 15 spaces
                        eing = eing + '               ';
                    }
                }
                
                // Auto-fill trailing // for EE 08 after user enters HOHU (position 34 complete)
                if (ee === 8 && newLength === 34 && eing[30] === '8') {
                    // User just completed HOHU (positions 31-34), auto-fill trailing //
                    // But only if not already filled (check if position 30-34 is complete)
                    if (eing.length === 34) {
                        eing = eing; // Already complete at position 34, will get // added below
                    }
                }
                
                input.value = eing;
                errEl.style.display = 'none';
                renderNumericGuide(eing);
                
                // Auto-fill loop: keep auto-filling while next field has only one option
                let continueFilling = true;
                let loopCount = 0;
                while (continueFilling) {
                    loopCount++;
                    let nextFieldConstraints = getConstraintsForNumericInput(null, eing);
                    
                    // If it's a Promise, await it
                    if (nextFieldConstraints && typeof nextFieldConstraints.then === 'function') {nextFieldConstraints = await nextFieldConstraints;}
                    
                    
                    // Now check if there's exactly one option
                    if (nextFieldConstraints && nextFieldConstraints.length === 1) {
                        // Auto-fill this field
                        const autoFilledValue = nextFieldConstraints[0];const oldLength = eing.length;
                        eing = eing + autoFilledValue;
                        input.value = eing;
                        
                        // Track auto-filled positions
                        // GG is 2 digits (string indices 28-29), track both if auto-filled
                        // Only track if we actually auto-filled (jumped from 28 to 30)
                        if (autoFilledValue.length === 2 && oldLength === 28 && eing.length === 30) {
                            // This is GG field (2 digits at string indices 28-29)
                            autoFilledPositions.add(28);
                            autoFilledPositions.add(29);} else {
                            // Single character auto-fill
                            autoFilledPositions.add(eing.length - 1);
                        }
                        
                        renderNumericGuide(eing);
                        // Continue loop to check next field
                    } else {
                        continueFilling = false;
                    }
                }
            } else if (res.reset) {
                eing = '';
                input.value = '';
                errEl.style.display = 'none';
                renderNumericGuide(eing);
            } else if (res.backtrack) {
                // Remove specified number of characters when 2-digit field validation fails
                eing = eing.slice(0, -res.backtrack);
                input.value = eing;
                renderNumericGuide(eing);
            }
        };
        
        // Handle async Promise return (e.g., for g-field observer check)
        if (result && typeof result.then === 'function') {
            await result.then(handleValidationResult);
        } else {
            await handleValidationResult(result);
        }
        // ignore invalid by preventing default
        ev.preventDefault();
    } // End of handleKeydownEvent function

    document.getElementById('btn-add-obs-ok').addEventListener('click', async () => {
        try {
            const obs = parseNumericObservation(eing);
            if (!obs) {
                errEl.textContent = i18nStrings.observations.input_incomplete;
                errEl.style.display = 'block';
                return;
            }
            const resp = await fetch('/api/observations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(obs)
            });
            
            if (resp.status === 409) {
                // Duplicate observation
                errEl.textContent = i18nStrings.observations.error_observation_exists;
                errEl.style.display = 'block';
                return;
            }
            
            if (!resp.ok) throw new Error(i18nStrings.observations.error_adding);
            
            const addedObs = await resp.json();
            
            // Add to observations array and set dirty flag (Local Mode only)
            window.haloData.observations.push(addedObs);
            if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;
            saveHaloDataToSession();  // Sync to sessionStorage
            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
            
            // Trigger autosave
            await triggerAutosave();
            
            saveHandled = true; // Mark save as successful
            modal.hide();
            
            // Show success notification
            showNotification(`<strong>✓</strong> 1 ${i18nStrings.common.observation} ${i18nStrings.common.added}`);
            
            // Wait for modal to close, then ask if user wants to add another
            modalEl.addEventListener('hidden.bs.modal', async () => {
                modalEl.remove();
                
                // Ask if user wants to add another observation
                const addAnother = await showAddAnotherObservationDialog();
                if (addAnother) {
                    // User clicked Yes - show the add dialog again
                    await showAddObservationDialogNumeric();
                }
                // If user clicked No, do nothing (stay on current page)
            }, { once: true });
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
    });

    // Cleanup on modal close (only if save wasn't successful)
    let saveHandled = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!saveHandled) {
            modalEl.remove();
        }
    });
}

// Menu-based entry (Langeingabe) dialog
async function showAddObservationDialogMenu() {
    // Get config to check cloud mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    
    // Check if a file is loaded (Local Mode only - Cloud Mode has database always available)
    if (!isCloudMode && !window.haloData.isLoaded) {
        showWarningModal(i18nStrings.observations.no_file_loaded);
        return;
    }

    // Use the ObservationForm class for consistency
    const form = new ObservationForm();
    await form.initialize('add');
    
    form.show('add', null, async (newObs) => {
        // Observation saved callback
        try {
            // Add to observations array
            const resp = await fetch('/api/observations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newObs)
            });
            
            if (resp.status === 409) {
                // Duplicate observation
                showErrorDialog(i18nStrings.observations.error_observation_exists);
                return;
            }
            
            if (!resp.ok) {
                throw new Error(i18nStrings.observations.error_adding);
            }
            
            const addedObs = await resp.json();
            
            // Add to observations array and set dirty flag (Local Mode only)
            window.haloData.observations.push(addedObs);
            if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;
            saveHaloDataToSession();
            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
            
            // Trigger autosave
            await triggerAutosave();
            
            // Show success notification
            showNotification(`<strong>✓</strong> 1 ${i18nStrings.common.observation} ${i18nStrings.common.added}`);
            
            // Close the form modal first
            form.hideModal();
            
            // Wait for modal to close, then ask if user wants to add another
            form.modalElement.addEventListener('hidden.bs.modal', async () => {
                // Ask if user wants to add another observation
                const addAnother = await showAddAnotherObservationDialog();
                if (addAnother) {
                    // User clicked Yes - show the add dialog again
                    await showAddObservationDialogMenu();
                }
                // If user clicked No, do nothing (modal already closed, stay on current page)
            }, { once: true });
        } catch (e) {
            showErrorDialog(e.message);
        }
    }, () => {
        // Cancel callback - nothing to do
    });
}

// Validate sector field - shared validation logic for both entry modes
// Returns: { valid: true, cleaned: string } or { valid: false, error: string }
function validateSectorInput(value, deleteInvalid = false) {
    let cleaned = '';
    const used = new Set();
    
    for (let i = 0; i < value.length; i++) {
        const ch = value[i].toLowerCase();
        const posInCleaned = cleaned.length;
        const isLetterPos = (posInCleaned % 2 === 0);  // Letters at positions 0,2,4... separators at 1,3,5...
        
        if (ch === ' ') {
            // Space can end sector input if at separator position (after a letter)
            if (posInCleaned % 2 === 1) {
                // Valid completion - stop here
                return { valid: true, cleaned: cleaned };
            }
            // Invalid space position
            if (deleteInvalid) continue; // Skip it
            return { valid: false, error: 'Space only allowed after letter' };
        }
        
        if (isLetterPos) {
            // Even positions (0,2,4...): only letters a-h, each once
            if (!/[a-h]/.test(ch)) {
                if (deleteInvalid) continue;
                return { valid: false, error: 'Only letters a-h allowed' };
            }
            if (used.has(ch)) {
                if (deleteInvalid) continue;
                return { valid: false, error: `Letter '${ch}' already used` };
            }
            
            // If there was a separator before, validate succession rules
            if (cleaned.length >= 2) {
                const separator = cleaned[cleaned.length - 1];
                const prevLetter = cleaned[cleaned.length - 2];
                const letters = 'abcdefgh';
                const prevIdx = letters.indexOf(prevLetter);
                const currIdx = letters.indexOf(ch);
                const successorIdx = (prevIdx + 1) % 8;
                
                if (separator === '-') {
                    // Dash requires successor
                    if (currIdx !== successorIdx) {
                        if (deleteInvalid) continue;
                        return { valid: false, error: `After '${prevLetter}-' expected '${letters[successorIdx]}'` };
                    }
                } else if (separator === '/') {
                    // Slash requires non-successor
                    if (currIdx === successorIdx) {
                        if (deleteInvalid) continue;
                        return { valid: false, error: `After '${prevLetter}/' cannot use '${letters[successorIdx]}'` };
                    }
                }
            }
            
            cleaned += ch;
            used.add(ch);
        } else {
            // Odd positions (1,3,5...): only - or /
            if (ch !== '-' && ch !== '/') {
                if (deleteInvalid) continue;
                return { valid: false, error: 'Only - or / allowed as separator' };
            }
            cleaned += ch;
        }
    }
    
    // For live input validation: allow ending with separator (user is still typing)
    // The final check happens when submitting/validating the complete observation
    
    return { valid: true, cleaned: cleaned };
}

/**
 * Adapter for numeric input: parse input string and build context for calculateFieldConstraints()
 * Uses shared field-constraints.js logic (Decision #6: DRY Principle)
 */
function getConstraintsForNumericInput(fieldKey, inputString) {
    // If fieldKey is null, determine from position (for auto-fill)
    if (fieldKey === null && inputString.length >= 0) {
        // Map position to field key based on HALO format: KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH
        // Note: lowercase keys to match calculateFieldConstraints() expectations
        // Position 18 = C (upper cirrus), Position 19 = c (lower clouds)
        const positionToField = {
            0: 'kk', 1: 'kk', 2: 'o', 3: 'jj', 4: 'jj', 5: 'mm', 6: 'mm',
            7: 'tt', 8: 'tt', 9: 'g', 10: 'zz', 11: 'zz', 12: 'zz', 13: 'zz',
            14: 'd', 15: 'dd', 16: 'dd', 17: 'n', 18: 'C', 19: 'c',
            20: 'ee', 21: 'ee', 22: 'h', 23: 'f', 24: 'v', 25: 'f_type', 26: 'zz_precip', 27: 'zz_precip',
            28: 'gg', 29: 'gg', 30: '8', 31: 'ho', 32: 'ho', 33: 'ho', 34: 'ho',
            35: 'hu', 36: 'hu', 37: 'hu', 38: 'hu'
        };
        fieldKey = positionToField[inputString.length];
    }
    
    // Parse relevant fields from input string
    const context = {
        o: inputString.length >= 3 ? inputString[2] : undefined,
        d: inputString.length >= 15 ? (inputString[14] === '/' ? '-2' : inputString[14]) : undefined,
        n: inputString.length >= 18 ? inputString[17] : undefined,
        mm: inputString.length >= 7 ? inputString.slice(5, 7) : undefined,
        jj: inputString.length >= 5 ? inputString.slice(3, 5) : undefined,
        kk: inputString.length >= 2 ? inputString.slice(0, 2) : undefined,
        g: inputString.length >= 10 ? inputString[9] : undefined,
        ee: inputString.length >= 22 ? inputString.slice(20, 22) : undefined,
        v: inputString.length >= 25 ? inputString[24] : undefined
    };
    
    // Call shared constraint calculation
    const validValues = calculateFieldConstraints(fieldKey, context);
    
    // Handle async Promise return (for g-field observer check)
    if (validValues && typeof validValues.then === 'function') {
        return validValues;  // Return Promise as-is
    }
    
    // Convert -1 to '/' for numeric input mode (space/slash mean "not observed")
    if (validValues && Array.isArray(validValues)) {
        return validValues.map(v => v === '-1' ? '/' : v).filter(v => v !== '');
    }
    
    return validValues;
}

// Validate progressive numeric entry similar to Pascal Kurzeingabe
function validateNumericProgress(s, observerCodes) {
    const len = s.length;
    const digit = /[0-9]/;
    // 1-2 KK (00-99 or A? not enforced yet)
    if (len === 1) return { ok: /[A-Z0-9]/.test(s[0]) };
    if (len === 2) {
        const basic = /[0-9A-Z][0-9]/.test(s);
        if (!basic) return { ok: false };
        const code = s.slice(0,2).toUpperCase();
        if (observerCodes && !observerCodes.has(code)) {
            return { ok: false, reset: true };
        }
        return { ok: true };
    }
    // 3 O (1-5)
    if (len === 3) return { ok: digit.test(s[2]) && parseInt(s[2],10)>=1 && parseInt(s[2],10)<=5 };
    // 4-5 JJ
    if (len === 4) return { ok: digit.test(s[3]) };
    if (len === 5) return { ok: digit.test(s[4]) };
    // 6-7 MM (01-12)
    if (len === 6) return { ok: digit.test(s[5]) };
    if (len === 7) {
        const mm = parseInt(s.slice(5,7),10);
        return mm>=1 && mm<=12 ? { ok: true } : { ok: false, backtrack: 1 };
    }
    // 8-9 TT (01-31) ? validate against month
    if (len === 8) return { ok: digit.test(s[7]) };
    if (len === 9) {
        const mm = parseInt(s.slice(5,7),10);
        const tt = parseInt(s.slice(7,9),10);
        // TT validation - use constraints based on month
        const validValues = getConstraintsForNumericInput('TT', s.slice(0, 7));
        if (validValues) {
            // validValues contains string representations like '01', '02', ..., '31'
            const ttStr = s.slice(7,9);
            if (!validValues.includes(ttStr)) return { ok: false, backtrack: 1 };
            return { ok: true };
        }
        // Fallback to original validation if constraints not available
        if (tt < 1 || tt > 31) return { ok: false, backtrack: 1 };
        const daysInMonth = [0,31,29,31,30,31,30,31,31,30,31,30,31];
        return tt <= daysInMonth[mm] ? { ok: true } : { ok: false, backtrack: 1 };
    }
    // 10 g (0-2) - validate observer activity (async check)
    if (len === 10) {
        const char = s[9];
        if (!['0','1','2'].includes(char)) return { ok: false };
        
        // Check observer activity constraint (async API call)
        const validValuesPromise = getConstraintsForNumericInput('g', s.slice(0, 9));
        if (validValuesPromise && typeof validValuesPromise.then === 'function') {
            // Return a Promise that resolves with validation result
            return validValuesPromise.then(validValues => {
                if (validValues && validValues.length === 0) {
                    // Observer not active at this date
                    return { ok: false };
                }
                return { ok: true };
            });
        }
        
        // If not a Promise (fallback), check synchronously
        if (validValuesPromise && validValuesPromise.length === 0) {
            return { ok: false };
        }
        return { ok: true };
    }
    // 11-12 ZS (00-23) or '//'
    if (len === 11) return { ok: digit.test(s[10]) || s[10] === '/' };
    if (len === 12) {
        const zs = s.slice(10,12);
        if (zs === '//') return { ok: true };
        const v = parseInt(zs,10);
        return v>=0 && v<=23 ? { ok: true } : { ok: false, backtrack: 1 };
    }
    // 13-14 ZM (00-59) or '//'
    if (len === 13) return { ok: digit.test(s[12]) || s[12] === '/' };
    if (len === 14) {
        const zm = s.slice(12,14);
        if (zm === '//') return { ok: true };
        const v = parseInt(zm,10);
        return v>=0 && v<=59 ? { ok: true } : { ok: false, backtrack: 1 };
    }
    // 15 d (cirrus density) - use constraints
    if (len === 15) {
        const char = s[14];
        const validValues = getConstraintsForNumericInput('d', s.slice(0, 14));
        if (validValues && !validValues.includes(char)) return { ok: false };
        return { ok: true };
    }
    // 16-17 D (00-99) or '//'
    if (len === 16) return { ok: digit.test(s[15]) || s[15] === '/' };
    if (len === 17) { const d = s.slice(15,17); return { ok: d === '//' || (/^\d{2}$/.test(d)) }; }
    // 18 n (cloud cover) - use constraints
    if (len === 18) {
        const char = s[17];
        const validValues = getConstraintsForNumericInput('n', s.slice(0, 17));
        if (validValues && !validValues.includes(char)) return { ok: false };
        return { ok: true };
    }
    // 19 C (cirrus type upper) - use constraints
    if (len === 19) {
        const char = s[18];
        const validValues = getConstraintsForNumericInput('C', s.slice(0, 18));
        if (validValues && !validValues.includes(char)) return { ok: false };
        return { ok: true };
    }
    // 20 c (cirrus type lower) - use constraints
    if (len === 20) {
        const char = s[19];
        const validValues = getConstraintsForNumericInput('c', s.slice(0, 19));
        if (validValues && !validValues.includes(char)) return { ok: false };
        return { ok: true };
    }
    // 21-22 E (01-77 or 99)
    if (len === 21) return { ok: digit.test(s[20]) };
    if (len === 22) {
        const e = parseInt(s.slice(20,22),10);
        return (e>=1 && e<=77) || e===99 ? { ok: true } : { ok: false, backtrack: 1 };
    }
    // 23 H (0-3) or '/'
    if (len === 23) return { ok: ['0','1','2','3','/'].includes(s[22]) };
    // 24 F (0-5) or '/'
    if (len === 24) return { ok: ['0','1','2','3','4','5','/'].includes(s[23]) };
    // 25 V (1-2) or '/'
    if (len === 25) return { ok: ['1','2','/'].includes(s[24]) };
    // 26 f (weather front, digit or space)
    if (len === 26) return { ok: digit.test(s[25]) || s[25] === ' ' };
    // 27-28 zz (two digits) or '//' or '  '
    if (len === 27) return { ok: digit.test(s[26]) || s[26] === '/' || s[26] === ' ' };
    if (len === 28) {
        const zz = s.slice(26,28);
        return { ok: zz === '//' || zz === '  ' || /^\d{2}$/.test(zz) };
    }
    // 29-30 G (01-39, excluding 12-15 and 18)
    if (len === 29) return { ok: digit.test(s[28]) };
    if (len === 30) {
        const g = parseInt(s.slice(28,30),10);
        const invalidGG = [12, 13, 14, 15, 18];
        if (g < 1 || g > 39 || invalidGG.includes(g)) {
            return { ok: false, backtrack: 2 };
        }
        return { ok: true };
    }
    // 31-35 8HHHH sun pillar altitude (auto-filled based on EE)
    // EE 08: 8??// (user enters digits at 32-33, or '/' for not observed)
    // EE 09: 8//?? (user enters digits at 33-34, or '/' for not observed)  
    // EE 10: 8???? (user enters digits at 32-35, or '/' for not observed)
    // Other EE: 8///// (all auto-filled)
    if (len === 31) return { ok: s[30] === '8' };
    if (len >= 32 && len <= 35) {
        const ee = parseInt(s.slice(20,22),10);
        const char = s[len-1];
        if (ee === 8) {
            // 8??//: positions 32-33 are digits or '/', 34-35 are slashes
            if (len === 32) return { ok: digit.test(char) || char === '/' };
            if (len === 33) {
                // Validate HO field (positions 31-32): must be both digits OR both slashes
                const ho1 = s[31];
                const ho2 = s[32];
                const bothDigits = digit.test(ho1) && digit.test(ho2);
                const bothSlashes = ho1 === '/' && ho2 === '/';
                if (!bothDigits && !bothSlashes) {
                    // Invalid mix like "1/" or "/1" - backtrack 1 char to position 32, user will re-enter
                    return { ok: false, backtrack: 1 };
                }
                return { ok: true };
            }
            if (len === 34 || len === 35) return { ok: char === '/' };
        } else if (ee === 9) {
            // 8//HU: positions 31-32 are slashes (auto-filled), 33-34 are HU digits or '/'
            if (len === 32) return { ok: char === '/' };
            if (len === 33) return { ok: digit.test(char) || char === '/' };
            if (len === 34) return { ok: digit.test(char) || char === '/' };
            if (len === 35) {
                // Validate HU field (positions 33-34): must be both digits OR both slashes
                const hu1 = s[33];
                const hu2 = s[34];
                const bothDigits = digit.test(hu1) && digit.test(hu2);
                const bothSlashes = hu1 === '/' && hu2 === '/';
                if (!bothDigits && !bothSlashes) {
                    // Invalid mix like "1/" or "/1" - backtrack 1 char to position 34
                    return { ok: false, backtrack: 1 };
                }
                return { ok: true };
            }
        } else if (ee === 10) {
            // 8????: positions 32-35 are all digits or '/'
            if (len === 32) return { ok: digit.test(char) || char === '/' };
            if (len === 33) {
                // Validate HO field (positions 31-32): must be both digits OR both slashes
                const ho1 = s[31];
                const ho2 = s[32];
                const bothDigits = digit.test(ho1) && digit.test(ho2);
                const bothSlashes = ho1 === '/' && ho2 === '/';
                if (!bothDigits && !bothSlashes) {
                    // Invalid mix - backtrack 1 char to position 32
                    return { ok: false, backtrack: 1 };
                }
                return { ok: true };
            }
            if (len === 34) return { ok: digit.test(char) || char === '/' };
            if (len === 35) {
                // Validate HU field (positions 33-34): must be both digits OR both slashes
                const hu1 = s[33];
                const hu2 = s[34];
                const bothDigits = digit.test(hu1) && digit.test(hu2);
                const bothSlashes = hu1 === '/' && hu2 === '/';
                if (!bothDigits && !bothSlashes) {
                    // Invalid mix - backtrack 1 char to position 34
                    return { ok: false, backtrack: 1 };
                }
                return { ok: true };
            }
        } else {
            // 8/////: all slashes already auto-filled
            return { ok: char === '/' };
        }
    }
    // 36-50 Sectors (15 characters)
    // Only for incomplete (V=1) circular halos from set [1,7,12,31,32,33,34,35,36,40]
    // Otherwise auto-filled with 15 spaces
    if (len >= 36 && len <= 50) {
        const v = parseInt(s.slice(24,25),10);
        const ee = parseInt(s.slice(20,22),10);
        const char = s[len-1];
        

        
        if (v === 1 && CIRCULAR_HALOS.has(ee)) {
            // User enters sector notation using shared validator
            const sectorStart = 35;
            const sectorField = s.slice(sectorStart, len);// Use shared validation function
            const result = validateSectorInput(sectorField, false);
            
            if (!result.valid) {return { ok: false };
            }return { ok: true };
        } else {
            // Auto-filled spaces
            return { ok: char === ' ' };
        }
    }
    // Accept anything after for remarks
    return { ok: true };
}

// Parse numeric observation string into JSON payload
function parseNumericObservation(s) {
    if (s.length < 30) return null;
    
    // Helper function: only ' ' allowed (? -1), '/' only for d and 8HHHH (? -2)
    const toInt = (x, allowSlash = false) => {
        if (x === ' ' || x === '') return -1;  // Not observed/unknown
        if (x === '/') {
            if (!allowSlash) {
                throw new Error('/ ist nur bei d und 8HHHH erlaubt');
            }
            return -2;  // Observed but not present (only for d and 8HHHH)
        }
        return parseInt(x, 10);
    };
    
    const toInt2 = (x, allowSlash = false) => {
        if (x === '  ' || x === '') return -1;  // Not observed/unknown
        if (x === '//') {
            if (!allowSlash) {
                throw new Error('// ist nur bei 8HHHH erlaubt');
            }
            return -2;  // Observed but not present (only for 8HHHH)
        }
        return parseInt(x, 10);
    };
    
    const obs = {
        KK: parseInt(s.slice(0,2),10),
        O: parseInt(s.slice(2,3),10),
        JJ: parseInt(s.slice(3,5),10),
        MM: parseInt(s.slice(5,7),10),
        TT: parseInt(s.slice(7,9),10),
        g: parseInt(s.slice(9,10),10),
        ZS: toInt2(s.slice(10,12), false),  // No slash allowed
        ZM: toInt2(s.slice(12,14), false),  // No slash allowed
        d: toInt(s.slice(14,15), true),     // Slash allowed for d
        DD: toInt2(s.slice(15,17), false),  // No slash allowed
        N: toInt(s.slice(17,18), false),    // No slash allowed
        C: toInt(s.slice(18,19), false),    // No slash allowed
        c: toInt(s.slice(19,20), false),    // No slash allowed
        EE: parseInt(s.slice(20,22),10),
        H: toInt(s.slice(22,23), false),    // No slash allowed
        F: toInt(s.slice(23,24), false),    // No slash allowed
        V: toInt(s.slice(24,25), false),    // No slash allowed
        f: toInt(s.slice(25,26), false),    // No slash allowed
        zz: toInt2(s.slice(26,28), false),  // No slash allowed
        GG: parseInt(s.slice(28,30),10),
        HO: -1,
        HU: -1,
        sectors: '',
        remarks: ''
    };
    
    // Validation rules
    // If C=0 or N=9, d values 0,1,2 are invalid
    if ((obs.C === 0 || obs.N === 9) && [0, 1, 2].includes(obs.d)) {
        throw new Error(`Ung?ltiger d-Wert: ${obs.d}. Wenn C=0 oder N=9, sind nur d-Werte -1, -2, 4, 5, 6, 7 erlaubt.`);
    }
    
    // Automatic rules
    // C=0 ? d=-2 (no cirrus)
    if (obs.C === 0 && obs.d !== -2) {
        obs.d = -2;
    }
    
    // N=9 ? C=-1, d=-1
    if (obs.N === 9) {
        obs.C = -1;
        if (obs.d === -1) {
            // Keep -1
        } else if ([0, 1, 2].includes(obs.d)) {
            // Invalid values get set to -1
            obs.d = -1;
        }
        // Otherwise keep the valid value (4,5,6,7 or -2)
    }
    
    // Optional 8HHHH field
    if (s.length >= 35 && s[30] === '8') {
        const hoPart = s.slice(31,33);
        const huPart = s.slice(33,35);
        obs.HO = toInt2(hoPart, true);  // Slash allowed for 8HHHH
        obs.HU = toInt2(huPart, true);  // Slash allowed for 8HHHH
    }
    
    // EE !=8,10 ? HO = 0; EE !=9,10 ? HU = 0 (not relevant)
    if (obs.EE !== 8 && obs.EE !== 10) {
        obs.HO = 0;
    }
    if (obs.EE !== 9 && obs.EE !== 10) {
        obs.HU = 0;
    }
    
    // Remaining content: sectors (up to first space) and remark
    if (s.length > 35) {
        const rest = s.slice(35);
        obs.sectors = rest.split(' ')[0].slice(0,15);
        obs.remarks = rest.slice(obs.sectors.length).trim().slice(0,60);
    }
    return obs;
}



// Load internationalization strings
async function loadI18n(lang) {
    try {
        const response = await fetch(`/api/i18n/${lang}?v=${Date.now()}`);
        i18nStrings = await response.json();
        updatePageText();
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
                    .replace('{current}', i18nStrings.app.version)
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

// Update page text with current language
function updatePageText() {
    // Note: With server-side rendering, the page is already in the correct language
    // This function is now redundant since we reload the page on language switch
    // Keeping it for compatibility but it does nothing
    // The templates use {% if lang() == 'de' %}...{% endif %} for proper server-side rendering
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
    const menus = document.querySelectorAll('.menu-title');
    menus.forEach(menu => menu.classList.remove('active'));
}

// Highlight Info/Version menu (index 0) when version items are invoked
function highlightVersionMenu() {
    const menus = document.querySelectorAll('.menu-title');
    menus.forEach(menu => menu.classList.remove('active'));
    if (menus[0]) menus[0].classList.add('active');
}

// Highlight File menu (index 1) when file items are invoked
function highlightFileMenu() {
    const menus = document.querySelectorAll('.menu-title');
    menus.forEach(menu => menu.classList.remove('active'));
    if (menus[1]) menus[1].classList.add('active');
}

// Highlight Settings menu (index 6) when settings items are invoked
function highlightSettingsMenu() {
    const menus = document.querySelectorAll('.menu-title');
    // Remove active class from all menus
    menus.forEach(menu => menu.classList.remove('active'));
    // Add active class to Settings menu (index 6)
    if (menus[6]) menus[6].classList.add('active');
}

// Highlight Help menu (index 7) when help items are invoked
function highlightHelpMenu() {
    const menus = document.querySelectorAll('.menu-title');
    menus.forEach(menu => menu.classList.remove('active'));
    if (menus[7]) menus[7].classList.add('active');
}

// Show help
function showHelp() {
    // Prefer rich markdown help dialog over alerts
    showHelpDialog();
}

// Show Modify Observations dialog
async function showModifyObservationsDialog() {
    // Check if data is loaded on the server
    try {
        const response = await fetch('/api/observations?limit=1');
        if (!response.ok) {
            showWarningModal(   ta);
            return;
        }
        const data = await response.json();
        if (!data.total || data.total === 0) {
            showWarningModal(i18nStrings.messages.no_data);
            return;
        }
    } catch (error) {showWarningModal(i18nStrings.messages.no_data);
        return;
    }
    
    // Step 1: Ask user to select type (Einzelbeobachtungen or Beobachtungsgruppen)
    const modalHtml = `
        <div class="modal fade" id="modify-type-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.observations.modify_type_title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">${i18nStrings.observations.modify_type_question}</p>
                        <div class="form-check form-check-inline mb-0">
                            <input class="form-check-input" type="radio" name="modify_type" id="modify-single" value="single" checked>
                            <label class="form-check-label" for="modify-single">${i18nStrings.observations.modify_single}</label>
                        </div>
                        <div class="form-check form-check-inline mb-0">
                            <input class="form-check-input" type="radio" name="modify_type" id="modify-groups" value="groups">
                            <label class="form-check-label" for="modify-groups">${i18nStrings.observations.modify_groups}</label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-modify-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('modify-type-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    const btnOk = document.getElementById('btn-modify-ok');
    
    // Decision #033: consistent keyboard + cleanup
    setupModalKeyboard(modalEl, btnOk);
    setupModalCleanup(modalEl);
    
    modal.show();
    
    // Handle OK button
    btnOk.addEventListener('click', async () => {
        const selected = document.querySelector('input[name="modify_type"]:checked');
        const modifyType = selected ? selected.value : 'single';
        modal.hide();
        await showModifyFilterDialog(modifyType);
    });
}

// Show filter dialog for modify observations
async function showModifyFilterDialog(modifyType) {
    // Initialize filter dialog
    const filterDialog = new FilterDialog();
    await filterDialog.initialize();
    
    // Show filter dialog with callbacks
    filterDialog.show(
        (filterState) => {
            // onApply callback - filters have been applied

            
            if (modifyType === 'single') {
                showModifySingleObservations(filterState);
            } else {
                showModifyGroupObservations(filterState);
            }
        },
        () => {
            // onCancel callback - user cancelled

        }
    );
}

// Show single observations for modification (one by one)
async function showModifySingleObservations(filterState) {
    // Apply filters to get filtered observations
    const filteredObs = await applyFilterToObservations(filterState);
    
    if (filteredObs.length === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        return;
    }
    
    // Create ObservationForm ONCE and reuse for all navigation steps
    const form = new ObservationForm();
    await form.initialize('edit');
    
    // Show observations one by one in edit form
    let currentIndex = 0;
    
    const showObservationAt = async (index) => {
        if (index < 0) {
            index = 0;
        }
        if (index >= filteredObs.length) {
            // All observations processed - return to main menu
            window.navigateInternal('/');
            return;
        }
        
        currentIndex = index;
        const obs = filteredObs[currentIndex];
        
        // Find the index of this observation in the full observations array
        const obsIndex = window.haloData.observations ? window.haloData.observations.indexOf(obs) : -1;
        
        // Show observation form directly with populated fields (reuse form instance)
        // Store the original observation index for deletion
        let originalIndex = obsIndex;
        
        form.show('edit', obs, async (modifiedObs) => {
            // Delete the old observation and insert the modified one
            try {
                // Remove old observation from array using the stored index
                if (originalIndex >= 0 && originalIndex < window.haloData.observations.length) {
                    window.haloData.observations.splice(originalIndex, 1);
                }
                
                // First, delete the old observation from server
                const deleteResp = await fetch('/api/observations/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(obs)
                });
                
                // Now POST the modified observation
                const resp = await fetch('/api/observations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(modifiedObs)
                });
                
                if (resp.status === 409) {
                    throw new Error(i18nStrings.observations.error_observation_exists);
                }
                
                if (!resp.ok) throw new Error('Failed to save modified observation');
                
                const addedObs = await resp.json();
                
                // Reload observations from server to get correct sorted order
                const obsResponse = await fetch('/api/observations?limit=200000');
                if (obsResponse.ok) {
                    const data = await obsResponse.json();
                    window.haloData.observations = data.observations;
                }
                
                // Set dirty flag (Local Mode only)
                if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;
                updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
                
                // Trigger autosave
                await triggerAutosave();
                
                const successMsg = i18nStrings.messages.observation_modified;
                sessionStorage.setItem('pendingNotification', JSON.stringify({
                    message: '<strong>✓</strong> ' + successMsg,
                    type: 'success',
                    duration: 3000
                }));
                
                // Return to main menu
                window.navigateInternal('/');
            } catch (e) {showErrorDialog(i18nStrings.common.error + ': ' + e.message);
            }
        }, () => {
            // Cancel - return to main
            window.navigateInternal('/');
        }, currentIndex + 1, filteredObs.length, null, 
        () => {
            // Next button pressed - skip to next observation
            showObservationAt(currentIndex + 1);
        },
        () => {
            // Previous button pressed - go to previous observation
            showObservationAt(currentIndex - 1);
        },
        () => {
            // Cancel button - return to main
            window.navigateInternal('/');
        });
    };
    
    showObservationAt(0);
}

// Show group modification form - edit multiple observations at once
async function showModifyGroupObservations(filterState) {
    // Apply filters to get filtered observations
    const filteredObs = await applyFilterToObservations(filterState);
    
    if (filteredObs.length === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        return;
    }
    

    
    // Always show the menu-based modification form (regardless of current input mode)
    await showGroupModifyDialogMenu(filteredObs);
}

async function showGroupModifyDialogMenu(filteredObs) {
    // Load observer codes
    let observerCodes, observers, fixedObserver = null;
    try {
        const data = await loadObserverCodes();
        observerCodes = data.codeSet;
        observers = data.observers;
        
        // Load fixed observer configuration
        try {
            const configResp = await fetch('/api/config/fixed_observer');
            if (configResp.ok) {
                const config = await configResp.json();
                fixedObserver = config.observer || null;
            }
        } catch (e) {
            // Silently ignore - fixed observer is optional
        }
    } catch (e) {showWarningModal(i18nStrings.messages.error_loading_observers);
        return;
    }
    
    // Build observer options - NO pre-selection
    const observerOptions = observers.map(obs => {
        return `<option value="${obs.KK}">${obs.KK} - ${obs.VName} ${obs.NName}</option>`;
    }).join('');
    
    // Build year options (0-99: 80-99=1980-1999, 0-79=2000-2079)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const jj = (YEAR_MIN-1900 + i) % 100;  // 0-99
        const displayYear = jj < (YEAR_MIN-1900) ? 2000 + jj : 1900 + jj;
        return `<option value="${jj}">${displayYear}</option>`;
    }).join('');
    
    const modalHtml = `
        <div class="modal fade" id="modify-group-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content">
                    <div class="modal-header py-1">
                        <h6 class="modal-title mb-0">${i18nStrings.observations.modify_groups_title} (${filteredObs.length} ${i18nStrings.common.observations})</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body py-2">
                        <p class="text-muted small mb-2">${i18nStrings.observations.group_modify_info}</p>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label">KK - ${i18nStrings.fields.observer}</label>
                                <select class="form-select form-select-sm" id="group-kk" ${fixedObserver ? 'disabled' : ''}>
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${observerOptions}
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">O - ${i18nStrings.fields.object}</label>
                                <select class="form-select form-select-sm" id="group-o">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    <option value="1">1 - ${i18nStrings.object_types['1']}</option>
                                    <option value="2">2 - ${i18nStrings.object_types['2']}</option>
                                    <option value="3">3 - ${i18nStrings.object_types['3']}</option>
                                    <option value="4">4 - ${i18nStrings.object_types['4']}</option>
                                    <option value="5">5 - ${i18nStrings.object_types['5']}</option>
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">JJ - ${i18nStrings.fields.year}</label>
                                <select class="form-select form-select-sm" id="group-jj">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${yearOptions}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">MM - ${i18nStrings.fields.month}</label>
                                <select class="form-select form-select-sm" id="group-mm">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 12}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">TT - ${i18nStrings.fields.day}</label>
                                <select class="form-select form-select-sm" id="group-tt">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 31}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">g - ${i18nStrings.fields.observing_area}</label>
                                <select class="form-select form-select-sm" id="group-g">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    <option value="0">0 - ${i18nStrings.location_types['0']}</option>
                                    <option value="1">1 - ${i18nStrings.location_types['1']}</option>
                                    <option value="2">2 - ${i18nStrings.location_types['2']}</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">ZS - ${i18nStrings.fields.hour}</label>
                                <select class="form-select form-select-sm" id="group-zs">
                                    <option value="">--</option>
                                    ${Array.from({length: 24}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">ZM - ${i18nStrings.fields.minute}</label>
                                <select class="form-select form-select-sm" id="group-zm">
                                    <option value="">--</option>
                                    ${Array.from({length: 60}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">d - ${i18nStrings.fields.cirrus_density}</label>
                                <select class="form-select form-select-sm" id="group-d">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    <option value="0">0 - ${i18nStrings.cirrus_density['0']}</option>
                                    <option value="1">1 - ${i18nStrings.cirrus_density['1']}</option>
                                    <option value="2">2 - ${i18nStrings.cirrus_density['2']}</option>
                                    <option value="4">4 - ${i18nStrings.cirrus_density['4']}</option>
                                    <option value="5">5 - ${i18nStrings.cirrus_density['5']}</option>
                                    <option value="6">6 - ${i18nStrings.cirrus_density['6']}</option>
                                    <option value="7">7 - ${i18nStrings.cirrus_density['7']}</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">DD - ${i18nStrings.fields.duration}</label>
                                <select class="form-select form-select-sm" id="group-dd">
                                    <option value="">--</option>
                                    ${Array.from({length: 100}, (_, i) => `<option value="${i}">${i * 10} min</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">N - ${i18nStrings.fields.cloud_cover}</label>
                                <select class="form-select form-select-sm" id="group-n">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 10}, (_, i) => {
                                        const label = i18nStrings.cloud_cover[i.toString()];
                                        return `<option value="${i}">${i} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">C - ${i18nStrings.fields.cirrus_type}</label>
                                <select class="form-select form-select-sm" id="group-C">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 8}, (_, i) => {
                                        const label = i18nStrings.cirrus_types[i.toString()];
                                        return `<option value="${i}">${i} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">c - ${i18nStrings.fields.low_clouds}</label>
                                <select class="form-select form-select-sm" id="group-c">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 10}, (_, i) => {
                                        const label = i18nStrings.low_clouds[i.toString()];
                                        return `<option value="${i}">${i} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">EE - ${i18nStrings.fields.phenomenon}</label>
                                <select class="form-select form-select-sm" id="group-ee">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 77}, (_, i) => {
                                        const ee = i + 1;
                                        const label = i18nStrings.halo_types[ee.toString()];
                                        return `<option value="${ee}">${String(ee).padStart(2, '0')} - ${label}</option>`;
                                    }).join('')}
                                    <option value="99">99 - ${i18nStrings.halo_types['99']}</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">H - ${i18nStrings.fields.brightness}</label>
                                <select class="form-select form-select-sm" id="group-h">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 4}, (_, i) => {
                                        const label = i18nStrings.brightness[i.toString()];
                                        return `<option value="${i}">${i} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">F - ${i18nStrings.fields.color}</label>
                                <select class="form-select form-select-sm" id="group-f">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 6}, (_, i) => {
                                        const label = i18nStrings.color[i.toString()];
                                        return `<option value="${i}">${i} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">V - ${i18nStrings.fields.completeness}</label>
                                <select class="form-select form-select-sm" id="group-v">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    <option value="1">1 - ${i18nStrings.completeness['1']}</option>
                                    <option value="2">2 - ${i18nStrings.completeness['2']}</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">f - ${i18nStrings.fields.weather_front}</label>
                                <select class="form-select form-select-sm" id="group-wf">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 9}, (_, i) => {
                                        const label = i18nStrings.weather_front[i.toString()];
                                        return `<option value="${i}">${i} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">zz - ${i18nStrings.fields.precipitation}</label>
                                <select class="form-select form-select-sm" id="group-zz">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${Array.from({length: 99}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')} h</option>`).join('')}
                                    <option value="99">99</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">GG - ${i18nStrings.fields.region}</label>
                                <select class="form-select form-select-sm" id="group-gg">
                                    <option value="">${i18nStrings.fields.select}</option>
                                    ${[1,2,3,4,5,6,7,8,9,10,11,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39].map(gg => {
                                        const label = i18nStrings.geographic_regions[gg.toString()];
                                        return `<option value="${gg}">${String(gg).padStart(2, '0')} - ${label}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-md-6">
                                <div class="row g-1">
                                    <div class="col-6">
                                        <label class="form-label">8HO (obere Lichts?ule)</label>
                                        <select class="form-select form-select-sm" id="group-ho">
                                            <option value="">--</option>
                                            ${Array.from({length: 90}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}?</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label">HU (untere Lichts?ule)</label>
                                        <select class="form-select form-select-sm" id="group-hu">
                                            <option value="">--</option>
                                            ${Array.from({length: 90}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}?</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="col-12">
                                <label class="form-label">${i18nStrings.fields.sectors} (${i18nStrings.fields.max_15_chars})</label>
                                <input type="text" class="form-control form-control-sm" id="group-sectors" maxlength="15">
                            </div>
                            <div class="col-12">
                                <label class="form-label">${i18nStrings.fields.remarks} (${i18nStrings.fields.max_60_chars})</label>
                                <input type="text" class="form-control form-control-sm" id="group-remarks" maxlength="60">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-modify-group-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('modify-group-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    const okBtn = document.getElementById('btn-modify-group-ok');
    
    // Handle OK button
    okBtn.addEventListener('click', async () => {
        // Collect all filled fields
        const updates = {};
        
        const fieldMapping = {
            'group-kk': 'KK', 'group-o': 'O', 'group-jj': 'JJ', 'group-mm': 'MM', 'group-tt': 'TT',
            'group-g': 'g', 'group-zs': 'ZS', 'group-zm': 'ZM', 'group-d': 'd', 'group-dd': 'DD',
            'group-n': 'N', 'group-C': 'C', 'group-c': 'c', 'group-ee': 'EE', 'group-h': 'H',
            'group-f': 'F', 'group-v': 'V', 'group-wf': 'f', 'group-zz': 'zz', 'group-gg': 'GG',
            'group-ho': 'HO', 'group-hu': 'HU'
        };
        
        // Collect values from form fields
        for (const [fieldId, fieldName] of Object.entries(fieldMapping)) {
            const elem = document.getElementById(fieldId);
            if (elem && elem.value && elem.value !== '' && elem.value !== '-1') {
                updates[fieldName] = parseInt(elem.value);
            }
        }
        
        // Text fields
        const sectorsElem = document.getElementById('group-sectors');
        if (sectorsElem && sectorsElem.value) {
            updates['Sektoren'] = sectorsElem.value;
        }
        
        const remarksElem = document.getElementById('group-remarks');
        if (remarksElem && remarksElem.value) {
            updates['Bemerkungen'] = remarksElem.value;
        }
        
        // Check if at least one field was filled
        if (Object.keys(updates).length === 0) {
            showWarningModal(i18nStrings.messages.fill_at_least_one_field);
            return;
        }
        
        modal.hide();
        
        // Process bulk update
        await processBulkUpdate(filteredObs, updates);
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

async function processBulkUpdate(filteredObs, updates) {
    try {


        
        // For each observation: delete old, create modified, add back
        const modifiedObservations = [];
        
        for (const obs of filteredObs) {
            // Create modified observation by merging updates
            const modifiedObs = {...obs, ...updates};
            modifiedObservations.push({original: obs, modified: modifiedObs});
        }
        

        // Delete all original observations from server
        for (const {original} of modifiedObservations) {
            const deleteResp = await fetch('/api/observations/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(original)
            });
            
            if (!deleteResp.ok) {} else {

            }
        }
        

        // Add all modified observations
        for (const {modified} of modifiedObservations) {
            const addResp = await fetch('/api/observations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(modified)
            });
            
            if (addResp.status === 409) {
                console.warn('[BULK UPDATE] Duplicate observation, skipping:', modified);
            } else if (!addResp.ok) {} else {

            }
        }
        

        // Reload observations from server to get correct sorted order
        const obsResponse = await fetch('/api/observations?limit=200000');
        if (obsResponse.ok) {
            const data = await obsResponse.json();
            window.haloData.observations = data.observations;
            if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;

            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
        } else {}
        

        sessionStorage.setItem('pendingNotification', JSON.stringify({
            message: `<strong>✓</strong> ${filteredObs.length} ${i18nStrings.observations.bulk_modify_success}`,
            type: 'success',
            duration: 3000
        }));
        
        // Reload the page to refresh all displays
        window.location.reload();
        
    } catch (error) {showErrorDialog(`${i18nStrings.messages.bulk_update_failed}: ${error.message}`);
    }
}

// Show Delete Observations dialog (two-stage filters, then iterate)
async function showDeleteObservationsDialog() {
    // Check if data is loaded on the server
    try {
        const response = await fetch('/api/observations?limit=1');
        if (!response.ok) {
            showWarningModal(i18nStrings.messages.no_data);
            return;
        }
        const data = await response.json();
        if (!data.total || data.total === 0) {
            showWarningModal(i18nStrings.messages.no_data);
            return;
        }
    } catch (error) {showWarningModal(i18nStrings.messages.no_data);
        return;
    }

    // Use the existing two-stage filter dialog
    const filterDialog = new FilterDialog();
    await filterDialog.initialize();

    filterDialog.show(
        (filterState) => {
            // Apply and begin delete iteration
            showDeleteSingleObservations(filterState);
        },
        () => {
            // Cancel returns to main
            window.navigateInternal('/');
        }
    );
}

// Iterate observations and ask delete (Yes/No/Cancel). Default = No.
async function showDeleteSingleObservations(filterState) {
    const filteredObs = await applyFilterToObservations(filterState);

    if (filteredObs.length === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        return;
    }

    // Create ObservationForm ONCE and reuse for all navigation steps
    const form = new ObservationForm();
    await form.initialize('delete');

    let currentIndex = 0;

    const showNextObservation = async () => {
        if (currentIndex >= filteredObs.length) {
            window.navigateInternal('/');
            return;
        }

        const obs = filteredObs[currentIndex];
        const obsIndex = window.haloData.observations ? window.haloData.observations.indexOf(obs) : -1;

        form.show('delete', obs, null, null, currentIndex + 1, filteredObs.length, i18nStrings.observations.delete_question, async () => {
            // Yes -> delete
            try {
                // Remove from client array first if present
                if (obsIndex >= 0) {
                    window.haloData.observations.splice(obsIndex, 1);
                }

                // Delete on server
                const resp = await fetch('/api/observations/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(obs)
                });

                if (!resp.ok) {
                    throw new Error('Delete endpoint responded ' + resp.status);
                }

                if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;
                updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations ? window.haloData.observations.length : 0);
                
                // Save to sessionStorage to persist dirty flag
                if (window.saveHaloDataToSession) {
                    window.saveHaloDataToSession();
                }
                
                await triggerAutosave();

                // Store notification for display after navigation (toast must survive page change)
                const msg = `${i18nStrings.common.observation} ${i18nStrings.common.deleted}`;
                sessionStorage.setItem('pendingNotification', JSON.stringify({
                    message: `<strong>✓</strong> ${msg}`,
                    type: 'success',
                    duration: 3000
                }));
                
                // Return to main after deletion (critical operation - don't continue iterating)
                window.navigateInternal('/');
            } catch (e) {showErrorDialog((i18nStrings.common.error) + ': ' + e.message);
                window.navigateInternal('/');
            }
        }, () => {
            // No -> skip to next observation
            currentIndex += 1;
            showNextObservation();
        }, () => {
            // Cancel -> return to main
            window.navigateInternal('/');
        });
    };

    showNextObservation();
}

// Apply filter criteria to observations
async function applyFilterToObservations(filterState) {
    // Fetch all observations from server (supports auto-loaded files)
    let allObs = [];
    try {
        const response = await fetch('/api/observations?limit=200000');
        if (response.ok) {
            const data = await response.json();
            allObs = data.observations || [];
        }
    } catch (error) {return [];
    }
    
    return allObs.filter(obs => {
        // First filter criterion
        if (filterState.criterion1 === 'region' && filterState.value1 !== null) {}
        if (filterState.criterion1 === 'observer') {
            if (filterState.value1 !== null && obs.KK !== filterState.value1) return false;
        } else if (filterState.criterion1 === 'region') {
            if (filterState.value1 !== null && obs.GG !== filterState.value1) return false;
        }
        
        // Second filter criterion
        if (filterState.criterion2 === 'date') {
            if (filterState.value2) {
                // Only enforce fields that were selected (null means "any")
                if (filterState.value2.t !== null && obs.TT !== filterState.value2.t) return false;
                if (filterState.value2.m !== null && obs.MM !== filterState.value2.m) return false;
                if (filterState.value2.j !== null && obs.JJ !== filterState.value2.j) return false;
            }
        } else if (filterState.criterion2 === 'month') {
            if (filterState.value2 && (obs.MM !== filterState.value2.m || obs.JJ !== filterState.value2.j)) {
                return false;
            }
        } else if (filterState.criterion2 === 'year') {
            if (filterState.value2 !== null && obs.JJ !== filterState.value2) return false;
        } else if (filterState.criterion2 === 'halo-type') {
            if (filterState.value2 !== null && obs.EE !== filterState.value2) return false;
        }
        
        return true;
    });
}

// Show confirmation dialog asking if user wants to modify this observation
async function showModifyConfirmDialog(obs, currentNum, totalNum, callback) {
    
    // Format observation display
    const obsDisplay = formatObservationForDisplay(obs);
    
    const modalHtml = `
        <div class="modal fade" id="modify-confirm-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h6 class="modal-title">${i18nStrings.observations.modify_question} (${currentNum}/${totalNum})</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body py-2">
                        <div style="font-size: 14px; line-height: 1.6; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">${obsDisplay}</div>
                    </div>
                    <div class="modal-footer py-2">
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-modify-cancel">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-modify-no">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-danger btn-sm px-3" id="btn-modify-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('modify-confirm-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    let answered = false;
    
    document.getElementById('btn-modify-yes').addEventListener('click', () => {
        answered = true;
        modal.hide();
        callback(true);
    });
    
    document.getElementById('btn-modify-no').addEventListener('click', () => {
        answered = true;
        modal.hide();
        callback(false);
    });
    
    document.getElementById('btn-modify-cancel').addEventListener('click', () => {
        answered = true;
        modal.hide();
        callback(null); // null indicates cancel entire operation
    });
    
    // Handle ESC key to return to main menu
    const escHandler = (e) => {
        if (e.key === 'Escape' && !answered) {
            answered = true;
            modal.hide();
            callback(null);
            window.navigateInternal('/');
        }
    };
    document.addEventListener('keydown', escHandler);
    
    modalEl.addEventListener('hidden.bs.modal', () => {
        modalEl.remove();
        document.removeEventListener('keydown', escHandler);
        if (!answered) {
            callback(null);
            window.navigateInternal('/');
        }
    });
}

// Format observation for display in confirmation dialog (Men?eingabe format)
function formatObservationForDisplay(obs) {
    // Use the Men?eingabe (menu input) format with labeled fields
    let html = '';
    
    // Observer
    html += `<strong>${i18nStrings.fields.observer}:</strong> ${obs.KK}<br>`;
    
    // Object type
    const objectType = i18nStrings.object_types[obs.O];
    html += `<strong>${i18nStrings.fields.object}:</strong> ${obs.O} - ${objectType}<br>`;
    
    // Date
    const monthName = i18nStrings.months[obs.MM];
    html += `<strong>${i18nStrings.fields.year}:</strong> ${obs.JJ} `;
    html += `<strong>${i18nStrings.fields.month}:</strong> ${String(obs.MM).padStart(2, '0')} - ${monthName} `;
    html += `<strong>${i18nStrings.fields.day}:</strong> ${obs.TT}<br>`;
    
    // Location type (observing site)
    const locType = i18nStrings.location_types[obs.g];
    html += `<strong>${i18nStrings.fields.observing_area}:</strong> ${locType}<br>`;
    
    // Time
    const timeStr = (obs.ZS !== null && obs.ZS !== -1 && obs.ZS !== 99) ? String(obs.ZS).padStart(2, '0') : '--';
    const timeMin = (obs.ZM !== null && obs.ZM !== -1 && obs.ZM !== 99) ? String(obs.ZM).padStart(2, '0') : '--';
    html += `<strong>Zeit:</strong> ${timeStr}:${timeMin}<br>`;
    
    // Density
    if (obs.d !== null && obs.d !== -1) {
        html += `<strong>${i18nStrings.fields.cirrus_density}:</strong> ${i18nStrings.cirrus_density[obs.d]}<br>`;
    }
    
    // Duration (DD ? 10 = minutes)
    if (obs.DD !== null && obs.DD !== -1) {
        html += `<strong>${i18nStrings.fields.duration}:</strong> ${obs.DD * 10} min<br>`;
    }
    
    // Cirrus density
    if (obs.N !== null && obs.N !== -1) {
        const cirrusDens = i18nStrings.cirrus_density[obs.N];
        html += `<strong>${i18nStrings.fields.cirrus_density}:</strong> ${cirrusDens}<br>`;
    }
    
    // Cloud cover
    if (obs.C !== null && obs.C !== -1) {
        const cloudCover = i18nStrings.cloud_cover[obs.C];
        html += `<strong>${i18nStrings.fields.cloud_cover}:</strong> ${cloudCover}<br>`;
    }
    
    // Cirrus type
    if (obs.C !== null && obs.C !== -1) {
        const cirrusType = i18nStrings.cirrus_types[obs.C];
        html += `<strong>${i18nStrings.fields.cirrus_type}:</strong> ${cirrusType}<br>`;
    }
    
    // Halo phenomenon
    const haloType = i18nStrings.halo_types[obs.EE];
    html += `<strong>${i18nStrings.fields.phenomenon}:</strong> ${String(obs.EE).padStart(2, '0')} - ${haloType}<br>`;
    
    // Brightness
    if (obs.H !== null && obs.H !== -1) {
        const brightness = i18nStrings.brightness[obs.H];
        html += `<strong>${i18nStrings.fields.brightness}:</strong> ${brightness}<br>`;
    }
    
    // Color
    if (obs.F !== null && obs.F !== -1) {
        const color = i18nStrings.color[obs.F];
        html += `<strong>${i18nStrings.fields.color}:</strong> ${color}<br>`;
    }
    
    // Completeness
    if (obs.V !== null && obs.V !== -1) {
        const complete = i18nStrings.completeness[obs.V];
        html += `<strong>${i18nStrings.fields.completeness}:</strong> ${complete}<br>`;
    }
    
    // Weather front
    if (obs.f !== null && obs.f !== -1) {
        const front = i18nStrings.weather_front[obs.f];
        html += `<strong>Front:</strong> ${front}<br>`;
    }
    
    // Precipitation
    if (obs.zz !== null && obs.zz !== -1 && obs.zz !== 99) {
        html += `<strong>${i18nStrings.fields.precipitation}:</strong> ${obs.zz} mm<br>`;
    }
    
    // Geographic region
    const region = i18nStrings.geographic_regions[obs.GG];
    html += `<strong>${i18nStrings.fields.region}:</strong> ${String(obs.GG).padStart(2, '0')} - ${region}<br>`;
    
    // Sectors
    if (obs.sectors && obs.sectors.trim()) {
        html += `<strong>${i18nStrings.fields.sectors}:</strong> ${obs.sectors.trim()}<br>`;
    }
    
    // Remarks
    if (obs.remarks && obs.remarks.trim()) {
        html += `<strong>${i18nStrings.fields.remarks}:</strong> ${obs.remarks.trim()}<br>`;
    }
    
    return html;
}

// Show observation form for editing
async function showObservationFormForEdit(obs, currentNum, totalNum, onModified, onCancelled, obsIndex = null, onNext = null, onPrev = null) {
    const form = new ObservationForm();
    await form.initialize('edit');
    
    // Store the original observation index for deletion
    let originalIndex = obsIndex;
    if (originalIndex === null) {
        // Find index if not provided
        originalIndex = window.haloData.observations.indexOf(obs);
    }
    
    form.show('edit', obs, async (modifiedObs) => {
        // Delete the old observation and insert the modified one
        try {
            const logs = [];
            
            
            // Remove old observation from array using the stored index
            if (originalIndex >= 0 && originalIndex < window.haloData.observations.length) {
                const deleted = window.haloData.observations.splice(originalIndex, 1);

            } else {
                console.warn(...logs);
            }
            
            // Add modified observation to server (which will insert at correct position)
            
            // First, delete the old observation from server by passing original values
            const deleteResp = await fetch('/api/observations/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(obs)  // Send original observation to identify what to delete
            });
            
            if (deleteResp.ok) {
            }
            
            // Now POST the modified observation
            const resp = await fetch('/api/observations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modifiedObs)
            });
            
            
            if (resp.status === 409) {
                // Duplicate - this shouldn't happen in edit mode, but handle it
                throw new Error(i18nStrings.observations.error_observation_exists);
            }
            
            if (!resp.ok) throw new Error('Failed to save modified observation');
            
            const addedObs = await resp.json();
            
            // Reload observations from server to get correct sorted order
            const obsResponse = await fetch('/api/observations?limit=200000');
            if (obsResponse.ok) {
                const data = await obsResponse.json();
                window.haloData.observations = data.observations;
            }
            
            // Save logs to sessionStorage for later viewing
            sessionStorage.setItem('lastEditLogs', logs.join('\n'));

            
            // Set dirty flag (Local Mode only)
            if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;
            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
            
            // Trigger autosave
            await triggerAutosave();
            
            const successMsg = i18nStrings.messages.observation_modified;
            sessionStorage.setItem('pendingNotification', JSON.stringify({
                message: '<strong>✓</strong> ' + successMsg,
                type: 'success',
                duration: 3000
            }));
            
            if (onModified) onModified();
        } catch (e) {showErrorDialog(i18nStrings.common.error + ': ' + e.message);
        }
    }, () => {
        if (onCancelled) onCancelled();
    }, currentNum, totalNum, null, 
    onNext || (() => {
        // onYes callback - Next button: skip to next observation
        if (onCancelled) onCancelled();
    }),
    onPrev || (() => {
        // onNo callback - Previous button: go to previous observation  
        if (onCancelled) onCancelled();
    }),
    () => {
        // onCancelBtn callback - Cancel button: return to main
        if (onModified) onModified();
    });
}

// Show observation form for deletion (read-only display with Yes/No/Cancel)
async function showObservationFormForDelete(obs, currentNum, totalNum, onYes, onNo, onCancel) {
    const form = new ObservationForm();
    await form.initialize('delete');
    
    // Show the form in delete mode with custom title and buttons
    form.show('delete', obs, null, null, currentNum, totalNum, i18nStrings.observations.delete_question, onYes, onNo, onCancel);
}

// Show Display Observations dialog (filter then navigate)
async function showDisplayObservationsDialog() {
    // Show spinner while loading
    const loadingMessage = i18nStrings.messages.loading_observations;
    const spinnerInfo = showInfoModal(i18nStrings.common.loading, loadingMessage);
    
    try {
        // Get config to check cloud mode
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        
        // Only check for loaded data in Local Mode
        // In Cloud Mode, data is always in database
        if (!isCloudMode) {
            try {
                const response = await fetch('/api/observations?limit=1');
                if (!response.ok) {
                    spinnerInfo.modal.hide();
                    await showWarningModal(i18nStrings.messages.no_data);
                    return;
                }
                const data = await response.json();
                if (!data.total || data.total === 0) {
                    spinnerInfo.modal.hide();
                    await showWarningModal(i18nStrings.messages.no_data);
                    return;
                }
            } catch (error) {
                spinnerInfo.modal.hide();
                await showWarningModal(i18nStrings.messages.no_data);
                return;
            }
        }
        
        // Initialize filter dialog
        const filterDialog = new FilterDialog();
        await filterDialog.initialize();
        
        // Hide and immediately remove spinner (don't wait for hidden.bs.modal event)
        spinnerInfo.modal.hide();
        // Remove immediately to prevent re-showing when other modals close
        setTimeout(() => {
            if (spinnerInfo.modalEl && spinnerInfo.modalEl.parentNode) {
                spinnerInfo.modalEl.remove();
            }
        }, 100);
        
        // Show filter dialog with callbacks
        filterDialog.show(
        async (filterState) => {
            // onApply callback - filters have been applied
            // Check INPUT_MODE to decide display format
            try {
                const response = await fetch('/api/config/inputmode');
                const config = await response.json();
                
                if (config.mode === 'N') {
                    // Zahleneingaben - show compact list in modal
                    await showDisplayCompactList(filterState);
                } else {
                    // Men?eingaben - show detail view one-by-one
                    await showDisplaySingleObservations(filterState);
                }
            } catch (error) {
                // Default to detail view on error
                await showDisplaySingleObservations(filterState);
            }
        },
        () => {
            // onCancel callback - user cancelled
            // Hide spinner if still visible
            if (spinnerInfo.modal && spinnerInfo.modalEl) {
                spinnerInfo.modal.hide();
                if (spinnerInfo.modalEl.parentNode) {
                    spinnerInfo.modalEl.remove();
                }
            }
            
            // Force cleanup of any remaining modal backdrops
            setTimeout(() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(backdrop => backdrop.remove());
                
                // Reset body styles if needed
                if (document.querySelectorAll('.modal.show').length === 0) {
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                }
            }, 200);
        }
    );
    } catch (error) {
        // Hide spinner on error
        spinnerInfo.modal.hide();
        spinnerInfo.modalEl.remove();
        showErrorDialog(i18nStrings.messages.error_loading_data);
    }
}

// Show compact list of observations in modal (Kurzausgabe - number format)
async function showDisplayCompactList(filterState) {
    // Apply filters to get filtered observations
    const filteredObs = await applyFilterToObservations(filterState);
    
    if (filteredObs.length === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        return;
    }
    
    const pageSize = 50;
    let currentPage = 1;
    const maxPage = Math.ceil(filteredObs.length / pageSize);
    
    // Create modal
    const modalHtml = `
        <div class="modal fade" id="compact-list-modal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="true">
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h6 class="modal-title mb-0">${i18nStrings.observations.display_title}</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body px-3 py-0">
                        <div class="compact-header" style="background: #0d6efd; color: white; padding: 10px; border-bottom: 2px solid #0a58ca; margin-left: -1rem; margin-right: -1rem;">
                            <pre style="font-family: 'Courier New', Consolas, monospace; font-size: 14px; line-height: 1.4; margin: 0; color: white;">KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH ${i18nStrings.fields.sectors.padEnd(16)}${i18nStrings.fields.remarks}</pre>
                        </div>
                        <div class="compact-body" style="max-height: 60vh; overflow-y: auto; background: #f8f9fa; padding: 10px; margin-left: -1rem; margin-right: -1rem;">
                            <pre id="compact-list-content" style="font-family: 'Courier New', Consolas, monospace; font-size: 14px; line-height: 1.4; margin: 0;"></pre>
                        </div>
                        <div class="compact-navigation mt-3 d-flex justify-content-between align-items-center">
                            <div class="d-flex gap-2">
                                <button id="btn-first" class="btn btn-sm btn-secondary" title="${i18nStrings.common.pagination_first}">
                                    <i class="bi bi-chevron-bar-left"></i>
                                </button>
                                <button id="btn-prev" class="btn btn-sm btn-secondary" title="${i18nStrings.common.pagination_prev}">
                                    <i class="bi bi-chevron-left"></i>
                                </button>
                            </div>
                            <span id="page-info" class="text-muted"></span>
                            <div class="d-flex gap-2">
                                <button id="btn-next" class="btn btn-sm btn-secondary" title="${i18nStrings.common.pagination_next}">
                                    <i class="bi bi-chevron-right"></i>
                                </button>
                                <button id="btn-last" class="btn btn-sm btn-secondary" title="${i18nStrings.common.pagination_last}">
                                    <i class="bi bi-chevron-bar-right"></i>
                                </button>
                            </div>
                        </div>
                        <div class="text-center mt-2">
                            <small id="record-info" class="text-muted"></small>
                        </div>
                    </div>
                    <div class="modal-footer py-2">
                        <button type="button" class="btn btn-primary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('compact-list-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    // Display function
    const displayPage = () => {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, filteredObs.length);
        const pageData = filteredObs.slice(startIndex, endIndex);
        
        // Generate compact lines using kurzausgabe
        const lines = pageData.map(obs => kurzausgabe(obs));
        document.getElementById('compact-list-content').textContent = lines.join('\n');
        
        // Update page info
        document.getElementById('page-info').textContent = `${i18nStrings.common.page} ${currentPage} ${i18nStrings.common.of} ${maxPage}`;
        
        // Update record info
        document.getElementById('record-info').textContent = `${i18nStrings.common.row} ${startIndex + 1}-${endIndex} ${i18nStrings.common.of} ${filteredObs.length}`;
        
        // Update button states
        document.getElementById('btn-first').disabled = currentPage === 1;
        document.getElementById('btn-prev').disabled = currentPage === 1;
        document.getElementById('btn-next').disabled = currentPage === maxPage;
        document.getElementById('btn-last').disabled = currentPage === maxPage;
    };
    
    // Navigation handlers
    document.getElementById('btn-first').onclick = () => { currentPage = 1; displayPage(); };
    document.getElementById('btn-prev').onclick = () => { if (currentPage > 1) { currentPage--; displayPage(); } };
    document.getElementById('btn-next').onclick = () => { if (currentPage < maxPage) { currentPage++; displayPage(); } };
    document.getElementById('btn-last').onclick = () => { currentPage = maxPage; displayPage(); };
    
    // Close button
    const btnClose = modalEl.querySelector('[data-bs-dismiss="modal"]');
    
    // Decision #033: Use setupModalKeyboard for Enter key → OK button (closes modal)
    setupModalKeyboard(modalEl, btnClose);
    
    // Decision #033: Use setupModalCleanup for DOM cleanup + navigate home
    setupModalCleanup(modalEl);
    modalEl.addEventListener('hidden.bs.modal', () => {
        window.navigateInternal('/');
    }, { once: true });
    
    // Show modal and display first page
    modal.show();
    displayPage();
    
    // Focus close button after modal is shown
    modalEl.addEventListener('shown.bs.modal', () => {
        if (btnClose) btnClose.focus();
    });
}

// Kurzausgabe formatter (from observations.js)
function kurzausgabe(obs) {
    let first = '';
    
    // KK - observer code
    if (obs.KK < 100) {
        first += String(Math.floor(obs.KK / 10)) + String(obs.KK % 10);
    } else {
        first += String.fromCharCode(Math.floor(obs.KK / 10) + 55) + String(obs.KK % 10);
    }
    
    // O - object type
    first += String(obs.O);
    
    // JJ - year (2 digits)
    first += String(Math.floor(obs.JJ / 10)) + String(obs.JJ % 10);
    
    // MM - month
    first += String(Math.floor(obs.MM / 10)) + String(obs.MM % 10);
    
    // TT - day
    first += String(Math.floor(obs.TT / 10)) + String(obs.TT % 10);
    
    // g - observing site location (0-2)
    first += String(obs.g);
    
    // ZS - time start hour
    if (obs.ZS === null || obs.ZS === -1) {
        first += '//';
    } else {
        first += String(Math.floor(obs.ZS / 10)) + String(obs.ZS % 10);
    }
    
    // ZM - time start minute
    if (obs.ZM === null || obs.ZM === -1) {
        first += '//';
    } else {
        first += String(Math.floor(obs.ZM / 10)) + String(obs.ZM % 10);
    }
    
    // d - duration
    if (obs.d === null || obs.d === -1) {
        first += '/';
    } else {
        first += String(obs.d);
    }
    
    // DD - halo source
    if (obs.DD === null || obs.DD === -1) {
        first += '//';
    } else {
        first += String(Math.floor(obs.DD / 10)) + String(obs.DD % 10);
    }
    
    // N - sky coverage
    if (obs.N === null || obs.N === -1) {
        first += '/';
    } else {
        first += String(obs.N);
    }
    
    // C - cirrus type
    if (obs.C === null || obs.C === -1) {
        first += '/';
    } else {
        first += String(obs.C);
    }
    
    // c - low clouds
    if (obs.c === null || obs.c === -1) {
        first += '/';
    } else {
        first += String(obs.c);
    }
    
    // EE - halo type
    if (obs.EE === null || obs.EE === -1) {
        first += '//';
    } else {
        first += String(Math.floor(obs.EE / 10)) + String(obs.EE % 10);
    }
    
    // H - brightness
    if (obs.H === null || obs.H === -1) {
        first += '/';
    } else {
        first += String(obs.H);
    }
    
    // F - colour
    if (obs.F === null || obs.F === -1) {
        first += '/';
    } else {
        first += String(obs.F);
    }
    
    // V - completeness
    if (obs.V === null || obs.V === -1) {
        first += '/';
    } else {
        first += String(obs.V);
    }
    
    // f - weather phenomenon
    if (obs.f === null || obs.f === -1) {
        first += '/';
    } else {
        first += String(obs.f);
    }
    
    // zz - precipitation
    if (obs.zz === null || obs.zz === -1) {
        first += '//';
    } else if (obs.zz === 0) {
        first += '99';
    } else {
        first += String(Math.floor(obs.zz / 10)) + String(obs.zz % 10);
    }
    
    // GG - observing region
    if (obs.GG === null || obs.GG === -1) {
        first += '//';
    } else {
        first += String(Math.floor(obs.GG / 10)) + String(obs.GG % 10);
    }
    
    // Now add spaces after every 5 characters (up to position 35)
    let erg = '';
    for (let i = 0; i < first.length; i += 5) {
        const chunk = first.substring(i, i + 5);
        if (!chunk) break;
        erg += chunk;
        if (chunk.length === 5) erg += ' ';
    }
    
    // lp8 - light pillar field (8HHHH) - 5 characters
    let lp8 = obs.lp8 || '     ';
    erg += lp8.padEnd(5, ' ') + ' ';
    
    // Sectors - 15 characters
    let sectors = obs.sectors || '';
    sectors = sectors.trim().substring(0, 15).padEnd(15, ' ');
    erg += sectors + ' ';
    
    // Remarks
    if (obs.remarks) {
        erg += obs.remarks.trim();
    }
    
    return erg;
}

// Show single observations for display (one by one with navigation)
async function showDisplaySingleObservations(filterState) {
    // Apply filters to get filtered observations
    const filteredObs = await applyFilterToObservations(filterState);
    
    if (filteredObs.length === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        return;
    }
    
    // Create ObservationForm ONCE and reuse for all navigation steps
    const form = new ObservationForm();
    await form.initialize('view');
    
    let currentIndex = 0;
    
    const showNext = () => {
        if (currentIndex >= filteredObs.length) {
            window.navigateInternal('/');
            return;
        }
        
        const obs = filteredObs[currentIndex];
        form.show('view', obs, null, null, currentIndex + 1, filteredObs.length, null, () => {
            // Next button
            currentIndex++;
            showNext();
        }, () => {
            // Previous button
            if (currentIndex > 0) {
                currentIndex--;
                showNext();
            }
        }, () => {
            // Cancel/Close - return to main
            window.navigateInternal('/');
        });
    };
    
    showNext();
}

// Show observation form for viewing (read-only display with navigation)
async function showObservationFormForView(obs, currentNum, totalNum, onNext, onPrev, onClose) {
    const form = new ObservationForm();
    await form.initialize('view');
    
    // Show the form in view mode
    form.show('view', obs, null, null, currentNum, totalNum, null, onNext, onPrev, onClose);
}

// Show Active Observers setting dialog (Ja/Nein)
async function showActiveObserversDialog() {
    try {
        const response = await fetch('/api/config/active_observers');
        const config = await response.json();
        const enabled = !!config.enabled;

        const modalHtml = `
            <div class="modal fade" id="active-observers-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.settings.active_observers_question}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="active_observers" id="active-yes" value="1" ${enabled ? 'checked' : ''}>
                                <label class="form-check-label" for="active-yes">${i18nStrings.common.yes}</label>
                            </div>
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="active_observers" id="active-no" value="0" ${!enabled ? 'checked' : ''}>
                                <label class="form-check-label" for="active-no">${i18nStrings.common.no}</label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-active-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('active-observers-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        document.getElementById('btn-active-ok').addEventListener('click', async () => {
            const selected = document.querySelector('input[name="active_observers"]:checked');
            const newEnabled = selected ? selected.value === '1' : enabled;
            modal.hide();

            await fetch('/api/config/active_observers', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({enabled: newEnabled})
            });
        });

        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
    } catch (error) {}
}

// Startup file setting dialog
async function showStartupFileDialog() {
    try {
        // Load file list from data/ folder
        const fileListResponse = await fetch('/api/file/list');
        if (!fileListResponse.ok) throw new Error('Could not load file list');
        const fileListResult = await fileListResponse.json();
        const files = fileListResult.files || [];
        
        // Load current startup file configuration
        const response = await fetch('/api/config/startup_file');
        const config = await response.json();
        const currentFile = config.file_path || '';

        // Build file dropdown options with "Keine Datei laden" as first option
        const fileOptions = [
            `<option value="">${i18nStrings.settings.startup_file_no_file}</option>`,
            ...files.map(f => `<option value="${f}" ${f === currentFile ? 'selected' : ''}>${f}</option>`)
        ].join('');

        const modalHtml = `
            <div class="modal fade" id="startup-file-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.settings.startup_file_title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">${i18nStrings.settings.startup_file_question}</p>
                            <label class="form-label">${i18nStrings.settings.startup_file_select_label}</label>
                            <select class="form-select mb-2" id="startup-file-select">
                                ${fileOptions}
                            </select>
                            <p class="text-muted small mb-0">${i18nStrings.settings.startup_file_info}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-startup-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('startup-file-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Handle Enter key to submit
        modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-startup-ok').click();
            }
        });

        document.getElementById('btn-startup-ok').addEventListener('click', async () => {
            const selectedFile = document.getElementById('startup-file-select').value;
            modal.hide();

            // Save selection (empty string = no file)
            await fetch('/api/config/startup_file', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({file_path: selectedFile})
            });
            
            // Show success message
            if (selectedFile) {
                showNotification(`<strong>✓</strong> ${i18nStrings.settings.startup_file_changed}`);
            } else {
                showNotification(`<strong>✓</strong> ${i18nStrings.settings.startup_file_disabled}`);
            }
        });

        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
    } catch (error) {
        showErrorDialog(i18nStrings.messages.error_loading_file_list + ': ' + error.message);
    }
}

// Select observations (Selektieren)
async function showSelectDialog() {
    // Get config to check cloud mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    
    // Check if a file is loaded (Local Mode only - Cloud Mode has database always available)
    if (!isCloudMode && !window.haloData.fileName) {
        showWarningModal(i18nStrings.observations.no_file_loaded);
        return;
    }
    
    // Get current observations count
    const obsResp = await fetch('/api/observations?limit=1');
    const obsData = await obsResp.json();
    
    if (!obsData.observations || obsData.observations.length === 0) {
        showWarningModal(i18nStrings.messages.no_data);
        return;
    }

    // Load i18n data for filter options
    const i18nResp = await fetch(`/api/i18n/${currentLanguage}?v=${Date.now()}`);
    const i18n = await i18nResp.json();

    // Build filter options (same as in Auswertung)
    const filterOptions = [
        { value: '', text: i18nStrings.common.please_select },
        { value: 'JJ', text: i18nStrings.analysis_dialog.param_names.JJ },
        { value: 'MM', text: i18nStrings.analysis_dialog.param_names.MM },
        { value: 'TT', text: i18nStrings.analysis_dialog.param_names.TT },
        { value: 'ZZ', text: i18nStrings.analysis_dialog.param_names.ZZ },
        { value: 'SH', text: i18nStrings.analysis_dialog.param_names.SH },
        { value: 'KK', text: i18nStrings.analysis_dialog.param_names.KK },
        { value: 'GG', text: i18nStrings.analysis_dialog.param_names.GG },
        { value: 'O', text: i18nStrings.analysis_dialog.param_names.O },
        { value: 'EE', text: i18nStrings.analysis_dialog.param_names.EE },
        { value: 'DD', text: i18nStrings.analysis_dialog.param_names.DD },
        { value: 'C', text: i18nStrings.analysis_dialog.param_names.C },
        { value: 'H', text: i18nStrings.analysis_dialog.param_names.H },
        { value: 'F', text: i18nStrings.analysis_dialog.param_names.F },
        { value: 'V', text: i18nStrings.analysis_dialog.param_names.V }
    ];

    const filterOptionsHtml = filterOptions.map(opt => 
        `<option value="${opt.value}">${opt.text}</option>`
    ).join('');

    const modalHtml = `
        <div class="modal fade" id="select-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.observations.select_observations }</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Filter criterion -->
                        <div class="mb-3">
                            <label for="select-filter" class="form-label">${i18nStrings.observations.select_criterion}</label>
                            <select class="form-select" id="select-filter" required autofocus>
                                ${filterOptionsHtml}
                            </select>
                        </div>
                        
                        <!-- Filter value (shown after selection) -->
                        <div id="select-value-div" style="display: none;">
                            <div class="mb-3">
                                <label for="select-value" class="form-label">${i18nStrings.observations.select_filter_value}</label>
                                <select class="form-select" id="select-value">
                                    <!-- Will be populated by JavaScript -->
                                </select>
                            </div>
                        </div>

                        <!-- Special fields for Month (MM) - month and year -->
                        <div id="select-month-fields" style="display: none;">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label for="select-month" class="form-label">${i18nStrings.common.month}:</label>
                                    <select class="form-select" id="select-month">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label for="select-year" class="form-label">${i18nStrings.common.year}:</label>
                                    <select class="form-select" id="select-year">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Special fields for Day (TT) - day, month and year -->
                        <div id="select-day-fields" style="display: none;">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <label for="select-day" class="form-label">${i18nStrings.common.day}:</label>
                                    <select class="form-select" id="select-day">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label for="select-day-month" class="form-label">${i18nStrings.common.month}:</label>
                                    <select class="form-select" id="select-day-month">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label for="select-day-year" class="form-label">${i18nStrings.common.year}:</label>
                                    <select class="form-select" id="select-day-year">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Special fields for Time (ZZ) - start and end hour:minute -->
                        <div id="select-time-fields" style="display: none;">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">${i18nStrings.common.from}</label>
                                    <div class="row">
                                        <div class="col-6">
                                            <select class="form-select" id="select-time-from-hour">
                                                <!-- Will be populated by JavaScript -->
                                            </select>
                                        </div>
                                        <div class="col-6">
                                            <select class="form-select" id="select-time-from-minute">
                                                <!-- Will be populated by JavaScript -->
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">${i18nStrings.common.to}</label>
                                    <div class="row">
                                        <div class="col-6">
                                            <select class="form-select" id="select-time-to-hour">
                                                <!-- Will be populated by JavaScript -->
                                            </select>
                                        </div>
                                        <div class="col-6">
                                            <select class="form-select" id="select-time-to-minute">
                                                <!-- Will be populated by JavaScript -->
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Special fields for Solar Altitude (SH) - from/to and min/mean/max -->
                        <div id="select-sh-fields" style="display: none;">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label for="select-sh-from" class="form-label">${i18nStrings.common.from}</label>
                                    <select class="form-select" id="select-sh-from">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label for="select-sh-to" class="form-label">${i18nStrings.common.to}</label>
                                    <select class="form-select" id="select-sh-to">
                                        <!-- Will be populated by JavaScript -->
                                    </select>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">${i18nStrings.common.solar_altitude}</label><br>
                                <div class="form-check form-check-inline">
                                    <input class="form-check-input" type="radio" name="select-sh-time" id="select-sh-min" value="min">
                                    <label class="form-check-label" for="select-sh-min">
                                        ${i18nStrings.common.minimum}
                                    </label>
                                </div>
                                <div class="form-check form-check-inline">
                                    <input class="form-check-input" type="radio" name="select-sh-time" id="select-sh-mean" value="mean" checked>
                                    <label class="form-check-label" for="select-sh-mean">
                                        ${i18nStrings.common.mean}
                                    </label>
                                </div>
                                <div class="form-check form-check-inline">
                                    <input class="form-check-input" type="radio" name="select-sh-time" id="select-sh-max" value="max">
                                    <label class="form-check-label" for="select-sh-max">
                                        ${i18nStrings.common.maximum}
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Keep or Delete radio buttons -->
                        <div class="mb-3">
                            <label class="form-label">${i18nStrings.observations.select_action}</label><br>
                            <div class="form-check form-check-inline">
                                <input class="form-check-input" type="radio" name="select-action" id="select-keep" value="keep" checked>
                                <label class="form-check-label" for="select-keep">
                                    ${i18nStrings.observations.select_keep}
                                </label>
                            </div>
                            <div class="form-check form-check-inline">
                                <input class="form-check-input" type="radio" name="select-action" id="select-delete" value="delete">
                                <label class="form-check-label" for="select-delete">
                                    ${i18nStrings.observations.select_delete}
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-select-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('select-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    const selectFilter = document.getElementById('select-filter');
    const selectValueDiv = document.getElementById('select-value-div');
    const selectValue = document.getElementById('select-value');
    const btnOk = document.getElementById('btn-select-ok');

    // Reuse getParameterRange function from analysis.js
    function getParameterRange(paramCode) {
        function getMonthName(monthNum) {
            if (i18nStrings.months && typeof i18nStrings.months === 'object') {
                return i18nStrings.months[String(monthNum)];
            }
            const monthArray = i18nStrings.months;
            return monthArray[monthNum - 1];
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
                    hours.push({ value: i, display: `${i} Uhr` });
                }
                return hours;
            
            case 'SH':
                const altitudes = [];
                for (let i = -10; i <= 90; i++) {
                    altitudes.push({ value: i, display: String(i) + '?' });
                }
                return altitudes;
            
            case 'KK':
                // Load observers from API
                const observers = [];
                // Will be populated from server data
                return observers;
            
            case 'GG':
                const regionNumbers = [1,2,3,4,5,6,7,8,9,10,11,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39];
                return regionNumbers.map(gg => {
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
            
            case 'EE':
                const haloTypes = [];
                for (let i = 1; i <= 77; i++) {
                    const haloName = i18nStrings.halo_types[String(i)];
                    haloTypes.push({ value: i, display: `${String(i).padStart(2, '0')} - ${haloName}` });
                }
                haloTypes.push({ value: 99, display: `99 - ${i18nStrings.halo_types['99']}` });
                return haloTypes;
            
            case 'DD':
                const densities = [];
                densities.push({ value: 0, display: `0 - ${i18nStrings.cirrus_density['0']}` });
                densities.push({ value: 1, display: `1 - ${i18nStrings.cirrus_density['1']}` });
                densities.push({ value: 2, display: `2 - ${i18nStrings.cirrus_density['2']}` });
                densities.push({ value: 4, display: `4 - ${i18nStrings.cirrus_density['4']}` });
                densities.push({ value: 5, display: `5 - ${i18nStrings.cirrus_density['5']}` });
                densities.push({ value: 6, display: `6 - ${i18nStrings.cirrus_density['6']}` });
                densities.push({ value: 7, display: `7 - ${i18nStrings.cirrus_density['7']}` });
                return densities;
            
            case 'N':
                const coverages = [];
                for (let i = 0; i <= 9; i++) {
                    const coverageName = i18nStrings.cloud_cover[String(i)];
                    coverages.push({ value: i, display: `${i} - ${coverageName}` });
                }
                return coverages;
            
            case 'C':
                const cirrus = [];
                for (let i = 0; i <= 7; i++) {
                    const cirrusName = i18nStrings.cirrus_types[String(i)];
                    cirrus.push({ value: i, display: `${i} - ${cirrusName}` });
                }
                return cirrus;
            
            case 'H':
                const brightness = [];
                for (let i = 0; i <= 3; i++) {
                    const brightName = i18nStrings.brightness[String(i)];
                    brightness.push({ value: i, display: `${i} - ${brightName}` });
                }
                return brightness;
            
            case 'F':
                const colors = [];
                for (let i = 0; i <= 5; i++) {
                    const colorName = i18nStrings.color[String(i)];
                    colors.push({ value: i, display: `${i} - ${colorName}` });
                }
                return colors;
            
            case 'V':
                const completeness = [];
                for (let i = 1; i <= 2; i++) {
                    const complName = i18nStrings.completeness[String(i)];
                    completeness.push({ value: i, display: `${i} - ${complName}` });
                }
                return completeness;
            
            default:
                return [];
        }
    }

    // Handle filter selection change - populate value dropdown or show special fields
    selectFilter.addEventListener('change', async () => {
        const filterType = selectFilter.value;
        
        const selectMonthFields = document.getElementById('select-month-fields');
        const selectDayFields = document.getElementById('select-day-fields');
        const selectTimeFields = document.getElementById('select-time-fields');
        const selectShFields = document.getElementById('select-sh-fields');
        
        if (!filterType) {
            selectValueDiv.style.display = 'none';
            selectMonthFields.style.display = 'none';
            selectDayFields.style.display = 'none';
            selectTimeFields.style.display = 'none';
            selectShFields.style.display = 'none';
            return;
        }

        // Hide all special fields first
        selectValueDiv.style.display = 'none';
        selectMonthFields.style.display = 'none';
        selectDayFields.style.display = 'none';
        selectTimeFields.style.display = 'none';
        selectShFields.style.display = 'none';

        // Show appropriate fields based on filter type
        if (filterType === 'MM') {
            // Month selection - show month and year dropdowns
            selectMonthFields.style.display = 'block';
            const months = getParameterRange('MM');
            const years = getParameterRange('JJ');
            
            const selectMonth = document.getElementById('select-month');
            const selectYear = document.getElementById('select-year');
            
            selectMonth.innerHTML = '';
            months.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.display;
                selectMonth.appendChild(option);
            });
            
            selectYear.innerHTML = '';
            years.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.display;
                selectYear.appendChild(option);
            });
            
        } else if (filterType === 'TT') {
            // Day selection - show day, month and year dropdowns
            selectDayFields.style.display = 'block';
            const days = getParameterRange('TT');
            const months = getParameterRange('MM');
            const years = getParameterRange('JJ');
            
            const selectDay = document.getElementById('select-day');
            const selectDayMonth = document.getElementById('select-day-month');
            const selectDayYear = document.getElementById('select-day-year');
            
            // Function to update day dropdown based on selected month and year
            const updateDayDropdown = () => {
                const month = parseInt(selectDayMonth.value);
                const year = parseInt(selectDayYear.value);
                const currentDay = parseInt(selectDay.value) || 1;
                
                // Get days in month
                const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                let maxDay = daysInMonth[month - 1];
                
                // Check for leap year in February
                if (month === 2) {
                    const fullYear = year < (YEAR_MIN-1900) ? 2000 + year : 1900 + year;
                    if (fullYear % 4 === 0) {
                        maxDay = 29;
                    }
                }
                
                // Rebuild day dropdown with valid days only
                selectDay.innerHTML = '';
                for (let i = 1; i <= maxDay; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = String(i).padStart(2, '0');
                    selectDay.appendChild(option);
                }
                
                // Restore previous selection if valid, otherwise select last day
                if (currentDay <= maxDay) {
                    selectDay.value = currentDay;
                } else {
                    selectDay.value = maxDay;
                }
            };
            
            selectDay.innerHTML = '';
            days.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.display;
                selectDay.appendChild(option);
            });
            
            selectDayMonth.innerHTML = '';
            months.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.display;
                selectDayMonth.appendChild(option);
            });
            
            selectDayYear.innerHTML = '';
            years.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.display;
                selectDayYear.appendChild(option);
            });
            
            // Add change listeners to update day dropdown when month or year changes
            selectDayMonth.addEventListener('change', updateDayDropdown);
            selectDayYear.addEventListener('change', updateDayDropdown);
            
        } else if (filterType === 'ZZ') {
            // Time selection - show start and end hour:minute
            selectTimeFields.style.display = 'block';
            const selectTimeFromHour = document.getElementById('select-time-from-hour');
            const selectTimeToHour = document.getElementById('select-time-to-hour');
            const selectTimeFromMinute = document.getElementById('select-time-from-minute');
            const selectTimeToMinute = document.getElementById('select-time-to-minute');
            
            selectTimeFromHour.innerHTML = '';
            selectTimeToHour.innerHTML = '';
            for (let i = 0; i <= 23; i++) {
                const optFrom = document.createElement('option');
                optFrom.value = i;
                optFrom.textContent = String(i).padStart(2, '0');
                selectTimeFromHour.appendChild(optFrom);
                
                const optTo = document.createElement('option');
                optTo.value = i;
                optTo.textContent = String(i).padStart(2, '0');
                selectTimeToHour.appendChild(optTo);
            }
            
            selectTimeFromMinute.innerHTML = '';
            selectTimeToMinute.innerHTML = '';
            for (let i = 0; i <= 59; i++) {
                const optFrom = document.createElement('option');
                optFrom.value = i;
                optFrom.textContent = String(i).padStart(2, '0');
                selectTimeFromMinute.appendChild(optFrom);
                
                const optTo = document.createElement('option');
                optTo.value = i;
                optTo.textContent = String(i).padStart(2, '0');
                selectTimeToMinute.appendChild(optTo);
            }
            
        } else if (filterType === 'SH') {
            // Solar altitude - show from/to and min/mean/max radio buttons
            selectShFields.style.display = 'block';
            const altitudes = getParameterRange('SH');
            const selectShFrom = document.getElementById('select-sh-from');
            const selectShTo = document.getElementById('select-sh-to');
            
            selectShFrom.innerHTML = '';
            selectShTo.innerHTML = '';
            altitudes.forEach(item => {
                const optFrom = document.createElement('option');
                optFrom.value = item.value;
                optFrom.textContent = item.display;
                selectShFrom.appendChild(optFrom);
                
                const optTo = document.createElement('option');
                optTo.value = item.value;
                optTo.textContent = item.display;
                selectShTo.appendChild(optTo);
            });
            
            // Set "to" to last value
            if (altitudes.length > 0) {
                selectShTo.selectedIndex = altitudes.length - 1;
            }
            
        } else if (filterType === 'KK') {
            // Observer selection - fetch from API and populate dropdown
            selectValueDiv.style.display = 'block';
            
            try {
                const response = await fetch('/api/observers');
                const data = await response.json();
                const observers = data.observers || [];
                
                selectValue.innerHTML = '';
                observers.forEach(observer => {
                    const option = document.createElement('option');
                    option.value = observer.KK;
                    // Format: KK - VName NName
                    option.textContent = `${String(observer.KK).padStart(2, '0')} - ${observer.VName} ${observer.NName}`;
                    selectValue.appendChild(option);
                });
            } catch (error) {selectValue.innerHTML = '<option value="">Error loading observers</option>';
            }
            
        } else {
            // All other parameters - show simple value dropdown
            selectValueDiv.style.display = 'block';
            const range = getParameterRange(filterType);
            
            selectValue.innerHTML = '';
            range.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.display;
                selectValue.appendChild(option);
            });
        }
    });

    // Handle OK button
    btnOk.addEventListener('click', () => {
        const filterType = selectFilter.value;
        const action = document.querySelector('input[name="select-action"]:checked').value;

        if (!filterType) {
            showWarningModal(i18nStrings.observations.select_no_filter);
            return;
        }


        
        // Capture values based on filter type
        if (filterType === 'MM') {
            const month = document.getElementById('select-month').value;
            const year = document.getElementById('select-year').value;


            console.log('Display:', document.getElementById('select-month').options[document.getElementById('select-month').selectedIndex].text, 
                        document.getElementById('select-year').options[document.getElementById('select-year').selectedIndex].text);
        } else if (filterType === 'TT') {
            const day = document.getElementById('select-day').value;
            const month = document.getElementById('select-day-month').value;
            const year = document.getElementById('select-day-year').value;



            console.log('Display:', document.getElementById('select-day').options[document.getElementById('select-day').selectedIndex].text,
                        document.getElementById('select-day-month').options[document.getElementById('select-day-month').selectedIndex].text,
                        document.getElementById('select-day-year').options[document.getElementById('select-day-year').selectedIndex].text);
        } else if (filterType === 'ZZ') {
            const fromHour = document.getElementById('select-time-from-hour').value;
            const fromMinute = document.getElementById('select-time-from-minute').value;
            const toHour = document.getElementById('select-time-to-hour').value;
            const toMinute = document.getElementById('select-time-to-minute').value;


        } else if (filterType === 'SH') {
            const shFrom = document.getElementById('select-sh-from').value;
            const shTo = document.getElementById('select-sh-to').value;
            const shTime = document.querySelector('input[name="select-sh-time"]:checked').value;



        } else {
            const filterValue = selectValue.value;


        }
        
        // Check if current file has unsaved changes
        checkDirtyAndProceed(() => performSelection(filterType, action, modal));
    });
    
    async function checkDirtyAndProceed(callback) {
        try {
            const response = await fetch('/api/file/status');
            if (response.ok) {
                const status = await response.json();
                if (status.dirty) {
                    // File has unsaved changes - ask to save first
                    showConfirmDialog(
                        i18nStrings.messages.unsaved_changes_title,
                        i18nStrings.messages.unsaved_changes_message,
                        async () => {
                            // Save the file first
                            const saveResp = await fetch('/api/file/save', { method: 'POST' });
                            if (saveResp.ok) {
                                callback();
                            } else {
                                showWarningModal(i18nStrings.messages.save_failed);
                            }
                        },
                        () => {
                            // User chose not to save - still proceed
                            callback();
                        }
                    );
                    return;
                }
            }
            // No unsaved changes or status check failed - proceed
            callback();
        } catch (error) {// On error, proceed anyway
            callback();
        }
    }
    
    async function performSelection(filterType, action, modal) {
        // Create loading modal
        const loadingModal = document.createElement('div');
        loadingModal.className = 'modal fade';
        loadingModal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-body text-center py-4">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">${i18nStrings.messages.loading_spinner}</span>
                        </div>
                        <p class="mb-0">${i18nStrings.observations.select_processing}</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        const bsLoadingModal = new bootstrap.Modal(loadingModal, { backdrop: 'static', keyboard: false });
        
        try {
            // Show progress spinner
            bsLoadingModal.show();
            
            // Build filter parameters based on filter type
            let filterParams = {
                filter_type: filterType,
                action: action
            };
            
            if (filterType === 'MM') {
                filterParams.month = parseInt(document.getElementById('select-month').value);
                filterParams.year = parseInt(document.getElementById('select-year').value);
            } else if (filterType === 'TT') {
                filterParams.day = parseInt(document.getElementById('select-day').value);
                filterParams.month = parseInt(document.getElementById('select-day-month').value);
                filterParams.year = parseInt(document.getElementById('select-day-year').value);
            } else if (filterType === 'ZZ') {
                filterParams.from_hour = parseInt(document.getElementById('select-time-from-hour').value);
                filterParams.from_minute = parseInt(document.getElementById('select-time-from-minute').value);
                filterParams.to_hour = parseInt(document.getElementById('select-time-to-hour').value);
                filterParams.to_minute = parseInt(document.getElementById('select-time-to-minute').value);
            } else if (filterType === 'SH') {
                filterParams.from = parseInt(document.getElementById('select-sh-from').value);
                filterParams.to = parseInt(document.getElementById('select-sh-to').value);
                filterParams.sh_time = document.querySelector('input[name="select-sh-time"]:checked').value;
            } else {
                // Simple value filters (KK, GG, O, EE, DD, N, C, H, F, V)
                filterParams.value = parseInt(selectValue.value);
            }
            
            // Send to server for filtering
            const startTime = performance.now();
            const filterResponse = await fetch('/api/observations/filter', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(filterParams)
            });
            const elapsed = performance.now() - startTime;
            
            if (!filterResponse.ok) {
                const error = await filterResponse.json();
                showWarningModal(error.error);
                bsLoadingModal.hide();
                loadingModal.remove();
                return;
            }
            
            const filterResult = await filterResponse.json();
            const filteredObs = filterResult.filtered_observations || [];
            const keptCount = filterResult.kept_count || 0;
            const deletedCount = filterResult.deleted_count || 0;
            




            
            // Check if result is empty
            if (keptCount === 0) {
                const emptyMessage = i18nStrings.messages.empty_filter_result;
                showWarningModal(emptyMessage);
                bsLoadingModal.hide();
                loadingModal.remove();
                modal.hide();
                window.navigateInternal('/');
                return;
            }
            
            // Load filtered observations into server memory
            const replaceResponse = await fetch('/api/observations/replace', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({observations: filteredObs})
            });
            
            bsLoadingModal.hide();
            loadingModal.remove();
            
            if (!replaceResponse.ok) {
                const error = await replaceResponse.json();
                showWarningModal(error.error || 'Failed to load filtered observations');
                modal.hide();
                return;
            }
            
            // Update local data
            window.haloData.observations = filteredObs;
            if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;
            saveHaloDataToSession();
            
            // Trigger autosave
            await triggerAutosave();
            
            // Update UI
            updateFileInfoDisplay(window.haloData.fileName, keptCount);
            
            // Close modal
            modal.hide();
            
            // Store notification in sessionStorage for display on main page
            const message = i18nStrings.messages.selection_result
                .replace('{kept}', keptCount)
                .replace('{deleted}', deletedCount);
            sessionStorage.setItem('pendingNotification', JSON.stringify({
                message: `<strong>✓</strong> ${message}`,
                type: 'success',
                duration: 5000
            }));
            
            // Navigate back to main page
            window.navigateInternal('/');
            
        } catch (error) {
            bsLoadingModal.hide();
            loadingModal.remove();
            modal.hide();
            showWarningModal(error.message);
        }
    }

    // Handle ESC key
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modal.hide();
        }
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
        clearMenuHighlights();
        modalEl.remove();
    });
}

// Create new file
async function showNewFileDialog() {
    try {
        // Use File System Access API for native save dialog
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: i18nStrings.messages.new_file_default_name || 'neue_datei.csv',
            types: [{
                description: 'CSV Files',
                accept: {'text/csv': ['.csv']}
            }]
        });
        
        // Get chosen filename from fileHandle
        const filename = fileHandle.name;
        
        // Create empty file (no header, no content)
        const writable = await fileHandle.createWritable();
        await writable.write('');
        await writable.close();
        
        // Update application state (empty observations list)
        window.haloData.observations = [];
        window.haloData.fileName = filename;
        window.haloData.isLoaded = true;
        window.haloData.isDirty = false;
        saveHaloDataToSession();
        
        // Update file info in header
        updateFileInfoDisplay(filename, 0);
        
        showNotification(`<strong>✓</strong> ${i18nStrings.messages.new_file_created.replace('{0}', filename)}`, 'success');
    } catch (err) {
        if (err.name === 'AbortError') {
            // User cancelled the file picker
            return;
        }
        showErrorDialog(i18nStrings.common.error + ': ' + err.message);
    }
}

// Save file
async function saveFile() {
    try {
        const statusResponse = await fetch('/api/file/status');
        const status = await statusResponse.json();
        
        if (!status.filename) {
            showErrorDialog(i18nStrings.messages.no_file_loaded);
            return;
        }
        
        // Use File System Access API for native save dialog
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: status.filename,
                types: [{
                    description: 'CSV Files',
                    accept: {'text/csv': ['.csv']}
                }]
            });
            
            // Get chosen filename from fileHandle
            const newFilename = fileHandle.name;
            
            // Get file content from server
            const response = await fetch('/api/file/save', {method: 'POST'});
            
            if (response.ok) {
                const blob = await response.blob();
                
                // Write to selected file
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                window.haloData.isDirty = false;
                window.haloData.fileName = newFilename;
                updateFileInfoDisplay(newFilename, status.count);
                
                // Clean up autosave file
                await fetch('/api/file/cleanup_autosave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                showNotification(`<strong>✓</strong> ${newFilename} gespeichert`, 'success');
            } else {
                const result = await response.json();
                showErrorDialog(i18nStrings.common.error + ': ' + result.error);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // User cancelled the file picker
                return;
            }
            throw err;
        }
    } catch (error) {
        showErrorDialog(i18nStrings.common.error + ': ' + error.message);
    }
}

// Authentication modal for HALO server login
async function showAuthenticationModal(onSuccess, cloudServerUrl) {
    // Load observers, fixed observer, and saved password
    let observers = [];
    let fixedObserver = '';
    let savedPassword = '';
    let savedObserverKK = '';
    
    try {
        const [obsResponse, configResponse, passwordResponse] = await Promise.all([
            fetch('/api/observers'),
            fetch('/api/config/fixed_observer'),
            fetch('/api/config/upload_password')
        ]);
        
        if (obsResponse.ok) {
            const data = await obsResponse.json();
            observers = data.observers || [];
        }
        
        if (configResponse.ok) {
            const config = await configResponse.json();
            fixedObserver = config.observer || '';
        }
        
        if (passwordResponse.ok) {
            const passwordData = await passwordResponse.json();
            savedPassword = passwordData.password || '';
            savedObserverKK = passwordData.observer_kk || '';
        }
    } catch (error) {}
    
    const observerDisabled = fixedObserver ? 'disabled' : '';
    
    const modalHtml = `
        <div class="modal fade" id="auth-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-body">
                        <p>${i18nStrings.upload_download.upload_auth_message}</p>
                        <div class="mb-3">
                            <label for="auth-observer" class="form-label">${i18nStrings.upload_download.upload_auth_username}</label>
                            <select class="form-select" id="auth-observer" ${observerDisabled}></select>
                        </div>
                        <div class="mb-3">
                            <label for="auth-password" class="form-label">${i18nStrings.upload_download.upload_auth_password}</label>
                            <div class="position-relative">
                                <input type="password" class="form-control pe-5" id="auth-password" autocomplete="current-password" value="${savedPassword}">
                                <button class="btn position-absolute end-0 top-50 translate-middle-y border-0 bg-transparent" type="button" id="toggle-password" style="z-index: 10;">
                                    <i class="bi bi-eye text-secondary" id="password-icon"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-login">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalEl = document.createElement('div');
    modalEl.innerHTML = modalHtml;
    document.body.appendChild(modalEl.firstElementChild);
    
    const modal = new bootstrap.Modal(document.getElementById('auth-modal'));
    const observerSelect = document.getElementById('auth-observer');
    const passwordInput = document.getElementById('auth-password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordIcon = document.getElementById('password-icon');
    const loginBtn = document.getElementById('btn-login');
    
    // Populate observer dropdown
    // Add admin option first
    const adminOption = document.createElement('option');
    adminOption.value = 'admin';
    adminOption.textContent = 'Admin';
    observerSelect.appendChild(adminOption);
    
    observers.sort((a, b) => parseInt(a.KK) - parseInt(b.KK)).forEach(obs => {
        const option = document.createElement('option');
        option.value = obs.KK;
        // Preselect: savedObserverKK > fixedObserver > none
        const selected = obs.KK === (savedObserverKK || fixedObserver) ? 'selected' : '';
        option.selected = selected === 'selected';
        option.textContent = `${String(obs.KK).padStart(2, '0')} - ${obs.VName || ''} ${obs.NName || ''}`.trim();
        observerSelect.appendChild(option);
    });
    
    // Preselect admin if that was saved
    if (savedObserverKK === 'admin') {
        adminOption.selected = true;
    }
    
    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        
        // Toggle icon
        if (type === 'password') {
            passwordIcon.className = 'bi bi-eye';
        } else {
            passwordIcon.className = 'bi bi-eye-slash';
        }
    });
    
    // Focus password field when modal opens (since observer is pre-selected if fixed)
    document.getElementById('auth-modal').addEventListener('shown.bs.modal', () => {
        if (fixedObserver) {
            passwordInput.focus();
        } else {
            observerSelect.focus();
        }
    });
    
    // Handle Enter key in password field
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loginBtn.click();
        }
    });
    
    // Handle login button click
    loginBtn.addEventListener('click', async () => {
        const observerKK = observerSelect.value;
        const password = passwordInput.value;
        
        if (!observerKK || !password) {
            showErrorDialog(i18nStrings.observers.error_missing_required);
            return;
        }

        // Local Mode: No separate login call - credentials will be sent with upload/download request
        // Just collect credentials and pass to callback
        
        // Save password AND observer_kk to halo.cfg (obfuscated) for convenience
        try {
            await fetch('/api/config/upload_password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password, observer_kk: observerKK })
            });
        } catch (error) {}
        
        modal.hide();
        setTimeout(() => {
            const modalEl = document.getElementById('auth-modal');
            if (modalEl) modalEl.remove();
            onSuccess(observerKK, password);
        }, 300);
    });
    
    // Clean up when modal is closed
    document.getElementById('auth-modal').addEventListener('hidden.bs.modal', () => {
        setTimeout(() => {
            const modalEl = document.getElementById('auth-modal');
            if (modalEl) modalEl.remove();
        }, 300);
    });
    
    modal.show();
}

// Upload file to HALO server
async function showUploadDialog() {
    try {
        // Check if we're in cloud mode
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        const cloudServerUrl = config.cloud_server_url;
        
        // Check if there are unsaved changes
        const statusResponse = await fetch('/api/file/status');
        const status = await statusResponse.json();
        const isDirty = status.dirty || false;
        
        // Warn if unsaved changes exist
        if (isDirty) {
            showConfirmDialog(
                i18nStrings.messages.unsaved_changes_title,
                i18nStrings.messages.upload_warning_unsaved_changes,
                () => {
                    // User chose to continue despite unsaved changes
                    continueUpload(isCloudMode, cloudServerUrl, config.username);
                }
            );
        } else {
            // No unsaved changes, proceed directly
            continueUpload(isCloudMode, cloudServerUrl, config.username);
        }
    } catch (error) {
        showErrorDialog(i18nStrings.common.error + ': ' + error.message, () => {
            window.navigateInternal('/');
        });
    }
}

function continueUpload(isCloudMode, cloudServerUrl, username) {
    // Show combined upload dialog (includes auth fields in Local Mode)
    showUploadFileDialog(isCloudMode, cloudServerUrl);
}

// Upload: Combined dialog with auth fields (Local Mode only) + file selection + mode
async function showUploadFileDialog(isCloudMode, cloudServerUrl) {
    // Check if there are unsaved changes
    try {
        const statusResponse = await fetch('/api/file/status');
        if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (status.dirty) {
                // Ask user if they want to save first
                const save = await new Promise(resolve => {
                    showConfirmDialog(
                        i18nStrings.messages.unsaved_changes_title,
                        i18nStrings.messages.upload_warning_unsaved_changes,
                        (confirmed) => resolve(confirmed)
                    );
                });
                
                if (save === undefined) {
                    // User cancelled
                    return;
                } else if (save) {
                    // Save file first
                    await saveFile();
                }
                // If user said "No", continue without saving
            }
        }
    } catch (error) {
        console.error('Error checking file status:', error);
    }
    
    // Load data for Local Mode auth fields
    let observers = [];
    let fixedObserver = '';
    let savedPassword = '';
    let savedObserverKK = '';
    let startupFilePath = '';
    
    if (!isCloudMode) {
        try {
            const [obsResponse, configResponse, passwordResponse, startupResponse] = await Promise.all([
                fetch('/api/observers'),
                fetch('/api/config/fixed_observer'),
                fetch('/api/config/upload_password'),
                fetch('/api/config/startup_file')
            ]);
            
            if (obsResponse.ok) {
                const data = await obsResponse.json();
                observers = data.observers || [];
            }
            
            if (configResponse.ok) {
                const config = await configResponse.json();
                fixedObserver = config.observer || '';
            }
            
            if (passwordResponse.ok) {
                const passwordData = await passwordResponse.json();
                savedPassword = passwordData.password || '';
                savedObserverKK = passwordData.observer_kk || '';
            }
            
            if (startupResponse.ok) {
                const startupConfig = await startupResponse.json();
                if (startupConfig.enabled && startupConfig.file_path) {
                    startupFilePath = startupConfig.file_path;
                }
            }
        } catch (error) {}
    }
    
    const observerDisabled = fixedObserver ? 'disabled' : '';
    
    // Auth fields section (only visible in Local Mode)
    const authFieldsHtml = !isCloudMode ? `
        <div class="mb-3">
            <label for="upload-observer" class="form-label">${i18nStrings.upload_download.upload_auth_username}</label>
            <select class="form-select" id="upload-observer" ${observerDisabled}></select>
        </div>
        <div class="mb-3">
            <label for="upload-password" class="form-label">${i18nStrings.upload_download.upload_auth_password}</label>
            <div class="position-relative">
                <input type="password" class="form-control pe-5" id="upload-password" autocomplete="current-password" value="${savedPassword}">
                <button class="btn position-absolute end-0 top-50 translate-middle-y border-0 bg-transparent" type="button" id="toggle-upload-password" style="z-index: 10;">
                    <i class="bi bi-eye text-secondary" id="upload-password-icon"></i>
                </button>
            </div>
        </div>
    ` : '';
    
    // Create combined dialog
    const modalHtml = `
        <div class="modal fade" id="upload-file-modal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.upload_download.upload_title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${authFieldsHtml}
                        <div class="mb-3">
                            <label class="form-label">${i18nStrings.file.load}:</label>
                            ${startupFilePath ? `
                                <input type="text" class="form-control" value="${startupFilePath}" readonly style="background-color: #f8f9fa;">
                                <small class="text-muted">${i18nStrings.settings.startup_file_in_use}</small>
                            ` : `
                                <input type="file" class="form-control" id="upload-file-input" accept=".csv">
                            `}
                        </div>
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="radio" name="upload_mode" id="upload-add" value="add" checked>
                            <label class="form-check-label" for="upload-add">${i18nStrings.upload_download.upload_mode_add}</label>
                        </div>
                        <div class="form-check mb-0">
                            <input class="form-check-input" type="radio" name="upload_mode" id="upload-replace" value="replace">
                            <label class="form-check-label" for="upload-replace">${i18nStrings.upload_download.upload_mode_replace}</label>
                        </div>
                    </div>
                    <div class="modal-footer d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-upload-file">${i18nStrings.upload_download.upload_title}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('upload-file-modal');
    const modal = new bootstrap.Modal(modalEl);
    const fileInput = document.getElementById('upload-file-input');
    
    // Setup auth fields (Local Mode only)
    let observerKK = null;
    let password = null;
    
    if (!isCloudMode) {
        const observerSelect = document.getElementById('upload-observer');
        const passwordInput = document.getElementById('upload-password');
        const togglePasswordBtn = document.getElementById('toggle-upload-password');
        const passwordIcon = document.getElementById('upload-password-icon');
        
        // Populate observer dropdown
        const adminOption = document.createElement('option');
        adminOption.value = 'admin';
        adminOption.textContent = 'Admin';
        observerSelect.appendChild(adminOption);
        
        observers.sort((a, b) => parseInt(a.KK) - parseInt(b.KK)).forEach(obs => {
            const option = document.createElement('option');
            option.value = obs.KK;
            // Preselect: savedObserverKK > fixedObserver > none
            const selected = obs.KK === (savedObserverKK || fixedObserver) ? 'selected' : '';
            option.selected = selected === 'selected';
            option.textContent = `${String(obs.KK).padStart(2, '0')} - ${obs.VName} ${obs.NName}`.trim();
            observerSelect.appendChild(option);
        });
        
        // Preselect admin if that was saved
        if (savedObserverKK === 'admin') {
            adminOption.selected = true;
        }
        
        // Toggle password visibility
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            passwordIcon.className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
        });
        
        // Handle Enter key in password field
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-upload-file').click();
            }
        });
        
        // Load startup file settings (Local Mode only)        
        // Setup startup file UI (Local Mode only)
        if (startupFilePath) {
            // Startup file is already shown in the read-only form field above
            // No need for additional UI elements
            useStartupFile = true;
        } else {
            // File input is shown, setup its event handlers if it exists
            const fileInput = document.getElementById('upload-file-input');
            if (fileInput) {
                fileInput.addEventListener('change', () => {
                    useStartupFile = false;
                });
            }
        }
    }
    
    document.getElementById('btn-upload-file').addEventListener('click', async () => {
        // Get credentials from form (Local Mode only)
        if (!isCloudMode) {
            observerKK = document.getElementById('upload-observer').value;
            password = document.getElementById('upload-password').value;
            
            if (!observerKK || !password) {
                showErrorDialog(i18nStrings.observers.error_missing_required);
                return;
            }
            
            // Save password AND observer_kk to config for convenience
            try {
                await fetch('/api/config/upload_password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: password, observer_kk: observerKK })
                });
            } catch (error) {}
        }
        
        // Get the file (either from input or startup file)
        let uploadFile;
        if (startupFilePath) {
            // Use startup file - create a dummy File object with the path
            uploadFile = { name: startupFilePath.split(/[\\/]/).pop() };
        } else {
            // Get selected file from input
            const fileInput = document.getElementById('upload-file-input');
            if (!fileInput || !fileInput.files.length) {
                showErrorDialog(i18nStrings.messages.no_file_selected);
                return;
            }
            uploadFile = fileInput.files[0];
        }

        const uploadMode = document.querySelector('input[name="upload_mode"]:checked').value;
        
        // CLOSE upload modal FIRST
        modal.hide();
        setTimeout(() => modalEl.remove(), 300);
        
        // Show single spinner for entire operation (reading + uploading)
        const uploadSpinner = showInfoModal(i18nStrings.upload_download.upload_title, i18nStrings.upload_download.upload_progress);
        
        try {
            let text;
            if (startupFilePath) {
                // Read startup file content via dedicated API
                const response = await fetch('/api/file/read-startup');
                if (!response.ok) {
                    throw new Error(`Could not read startup file: ${response.statusText}`);
                }
                text = await response.text();
            } else {
                // Read selected file
                text = await uploadFile.text();
            }
            
            // Parse CSV to extract observations
            const lines = text.split('\n').filter(line => line.trim());
            const observations = lines.slice(1).map(line => {
                const parts = line.split(',');
                // Parse CSV fields into observation object
                return {
                    KK: parseInt(parts[0]) || -1,
                    O: parseInt(parts[1]) || -1,
                    JJ: parseInt(parts[2]) || -1,
                    MM: parseInt(parts[3]) || -1,
                    TT: parseInt(parts[4]) || -1,
                    g: parseInt(parts[5]) || -1,
                    ZS: parseInt(parts[6]) || -1,
                    ZM: parseInt(parts[7]) || -1,
                    d: parseInt(parts[8]) || -1,
                    DD: parseInt(parts[9]) || -1,
                    N: parseInt(parts[10]) || -1,
                    C: parseInt(parts[11]) || -1,
                    c: parseInt(parts[12]) || -1,
                    EE: parseInt(parts[13]) || -1,
                    H: parseInt(parts[14]) || -1,
                    F: parseInt(parts[15]) || -1,
                    V: parseInt(parts[16]) || -1,
                    f: parseInt(parts[17]) || -1,
                    zz: parseInt(parts[18]) || -1,
                    GG: parseInt(parts[19]) || -1,
                    sectors: parts[20] || '',
                    remarks: parts[21] || ''
                };
            });
            
            // Call cloud server DIRECTLY (both Local and Cloud Mode)
            const replaceMode = uploadMode === 'replace';
            const uploadUrl = isCloudMode ? '/api/file/upload' : `${cloudServerUrl}/api/file/upload`;
            
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    observerKK: observerKK,
                    password: password,
                    observations: observations,
                    use_session: isCloudMode,
                    replace_mode: replaceMode
                })
            });
            
            if (response.ok) {
                // Close spinner on success
                uploadSpinner.modal.hide();
                setTimeout(() => uploadSpinner.modalEl.remove(), 300);
                
                // Upload modal already closed - DON'T try to close it again
                
                const result = await response.json();
                
                // Build success message with details
                let message = `✓ ${result.count || 0} ${i18nStrings.common.observations} `;
                message += result.mode === 'replace' ? i18nStrings.upload_download.replaced : i18nStrings.upload_download.added;
                if (result.duplicates && result.duplicates > 0) {
                    message += ` (${result.duplicates} ${i18nStrings.upload_download.duplicates_skipped})`;
                }
                
                showNotification(message, 'success', 5000);
                
                // In Cloud Mode: No reload needed, data is already in database
                // In Local Mode: Not applicable (upload goes to cloud server, not local storage)
            } else {
                // Close spinner on error
                uploadSpinner.modal.hide();
                setTimeout(() => uploadSpinner.modalEl.remove(), 300);
                
                const error = await response.json();
                
                // Upload modal already closed - DON'T try to close it again
                // Translate error code to user-friendly message
                const errorKey = error.error || 'unknown_error';
                const errorMsg = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
                showErrorDialog(errorMsg);
            }
            
        } catch (error) {
            // Close spinner if request failed completely
            if (typeof uploadSpinner !== 'undefined' && uploadSpinner?.modal) {
                uploadSpinner.modal.hide();
                setTimeout(() => uploadSpinner.modalEl.remove(), 300);
            }
            
            // Upload modal already closed - DON'T try to close it again
            const errorMsg = i18nStrings.common.error;
            showErrorDialog(errorMsg + ': ' + error.message);
        }
    });
    
    modal.show();
}

// Download file from HALO server
async function showDownloadDialog() {
    // Detect cloud vs local mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    const cloudServerUrl = config.cloud_server_url;
    
    // Load data for Local Mode auth fields
    let observers = [];
    let fixedObserver = '';
    let savedPassword = '';
    let savedObserverKK = '';
    
    if (!isCloudMode) {
        try {
            const [obsResponse, configResp, passwordResp] = await Promise.all([
                fetch('/api/observers'),
                fetch('/api/config/fixed_observer'),
                fetch('/api/config/upload_password')
            ]);
            
            if (obsResponse.ok) {
                const data = await obsResponse.json();
                observers = data.observers || [];
            }
            
            if (configResp.ok) {
                const configData = await configResp.json();
                fixedObserver = configData.observer || '';
            }
            
            if (passwordResp.ok) {
                const passwordData = await passwordResp.json();
                savedPassword = passwordData.password || '';
                savedObserverKK = passwordData.observer_kk || '';
            }
        } catch (error) {}
    }
    
    const observerDisabled = fixedObserver ? 'disabled' : '';
    
    // Auth fields section (only visible in Local Mode)
    const authFieldsHtml = !isCloudMode ? `
        <div class="mb-3">
            <label for="download-observer" class="form-label">${i18nStrings.upload_download.upload_auth_username}</label>
            <select class="form-select" id="download-observer" ${observerDisabled}></select>
        </div>
        <div class="mb-3">
            <label for="download-password" class="form-label">${i18nStrings.upload_download.upload_auth_password}</label>
            <input type="password" class="form-control" id="download-password" autocomplete="new-password" value="${savedPassword}">
        </div>
    ` : '';
    
    // Scope selection section (always visible)
    const scopeFieldsHtml = `
        <div class="mb-3">
            <label class="form-label fw-bold">${i18nStrings.upload_download.download_scope_label}</label>
            <div class="d-flex gap-4">
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="downloadScope" id="scope-own" value="own" checked>
                    <label class="form-check-label" for="scope-own">
                        ${i18nStrings.upload_download.download_scope_own}
                    </label>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="downloadScope" id="scope-all" value="all">
                    <label class="form-check-label" for="scope-all">
                        ${i18nStrings.upload_download.download_scope_all}
                    </label>
                </div>
            </div>
        </div>
    `;
    
    // Create combined dialog
    const modalHtml = `
        <div class="modal fade" id="download-file-modal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.upload_download.download_title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${authFieldsHtml}
                        ${scopeFieldsHtml}
                    </div>
                    <div class="modal-footer d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-download-file">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('download-file-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    // Setup auth fields (Local Mode only)
    let observerKK = null;
    let password = null;
    let observerSelect = null;
    let passwordInput = null;
    
    if (!isCloudMode) {
        observerSelect = document.getElementById('download-observer');
        passwordInput = document.getElementById('download-password');
        
        // Load observers list
        // Populate observer dropdown - same logic as upload dialog
        const adminOption = document.createElement('option');
        adminOption.value = 'admin';
        adminOption.textContent = 'Admin';
        observerSelect.appendChild(adminOption);
        
        observers.sort((a, b) => parseInt(a.KK) - parseInt(b.KK)).forEach(obs => {
            const option = document.createElement('option');
            option.value = obs.KK;
            // Preselect: savedObserverKK > fixedObserver > none
            const selected = obs.KK === (savedObserverKK || fixedObserver) ? 'selected' : '';
            option.selected = selected === 'selected';
            option.textContent = `${String(obs.KK).padStart(2, '0')} - ${obs.VName || ''} ${obs.NName || ''}`.trim();
            observerSelect.appendChild(option);
        });
        
        // Preselect admin if that was saved
        if (savedObserverKK === 'admin') {
            adminOption.selected = true;
        }
        
        // Store values when changed
        observerSelect.addEventListener('change', () => {
            observerKK = observerSelect.value;
        });
        
        passwordInput.addEventListener('input', () => {
            password = passwordInput.value;
        });
        
        // Set initial values
        observerKK = observerSelect.value;
        password = passwordInput.value;
    }
    
    // Get download scope
    const getDownloadScope = () => {
        return document.getElementById('scope-all').checked;
    };
    
    // Download button handler
    document.getElementById('btn-download-file').addEventListener('click', async () => {
        const downloadAll = getDownloadScope();
        
        // Get current values from form (Local Mode only)
        if (!isCloudMode && observerSelect && passwordInput) {
            observerKK = observerSelect.value;
            password = passwordInput.value;
        }
        
        // Validation for Local Mode
        if (!isCloudMode) {
            if (!observerKK) {
                showErrorDialog(i18nStrings.upload_download.upload_auth_missing_observer);
                return;
            }
            
            if (!password) {
                showErrorDialog(i18nStrings.upload_download.upload_auth_missing_password);
                return;
            }
        }
        
        // Close dialog
        modal.hide();
        
        // Show spinner
        const spinner = showInfoModal(i18nStrings.upload_download.download_title, i18nStrings.upload_download.download_progress);
        
        // CRITICAL: Get file handle IMMEDIATELY to preserve user activation (both modes!)
        let fileHandle = null;
        const useFilePicker = 'showSaveFilePicker' in window;
        
        if (useFilePicker) {
            try {
                const defaultFilename = downloadAll ? 'halobeo.csv' : 'observations.csv';
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'CSV files',
                        accept: {'text/csv': ['.csv']},
                    }],
                });
            } catch (err) {
                if (err.name === 'AbortError') {
                    // User cancelled - hide spinner and exit completely
                    spinner.modal.hide();
                    setTimeout(() => spinner.modalEl.remove(), 300);
                    return;
                }
                // API error - will fall back to download method
                fileHandle = null;
            }
        }
        
        try {
            // Build request
            const downloadUrl = `${cloudServerUrl}/api/file/download`;
            const requestBody = isCloudMode 
                ? {
                    use_session: true,
                    observerKK: 'session',
                    download_all: downloadAll
                }
                : {
                    observerKK: observerKK,
                    password: password,
                    use_session: false,
                    download_all: downloadAll
                };
            
            const response = await fetch(downloadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Save credentials for convenience (Local Mode only)
                if (!isCloudMode) {
                    try {
                        const response = await fetch('/api/config/upload_password', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password: password, observer_kk: observerKK })
                        });
                    } catch (error) {
                        // Silent fail - not critical if settings save fails
                    }
                }
                
                // Handle file saving
                const csvContent = result.csv_content;
                const defaultFilename = result.is_admin && downloadAll
                    ? 'halobeo.csv'
                    : 'observations.csv';
                
                if (fileHandle) {
                    // File handle acquired - write directly (both Cloud and Local Mode)
                    try {
                        const writable = await fileHandle.createWritable();
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        await writable.write(blob);
                        await writable.close();
                        
                        // Hide spinner
                        spinner.modal.hide();
                        setTimeout(() => spinner.modalEl.remove(), 300);
                        
                        // Success notification
                        const successMessage = i18nStrings.upload_download.download_success.replace('{0}', result.count);
                        showNotification(successMessage, 'success');
                    } catch (err) {
                        // Fall back to download method
                        triggerFileSaveDialog(csvContent, defaultFilename, spinner);
                        
                        // Success notification
                        const successMessage = i18nStrings.upload_download.download_success.replace('{0}', result.count);
                        showNotification(successMessage, 'success');
                    }
                } else {
                    // Local Mode or Cloud Mode fallback - use standard method
                    triggerFileSaveDialog(csvContent, defaultFilename, spinner);
                    
                    // Success notification
                    const successMessage = i18nStrings.upload_download.download_success.replace('{0}', result.count);
                    showNotification(successMessage, 'success');
                }
            } else {
                // Hide spinner on error
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
                
                showErrorDialog(i18nStrings.common.error + ': ' + result.error);
            }
        } catch (error) {
            // Hide spinner
            spinner.modal.hide();
            setTimeout(() => spinner.modalEl.remove(), 300);
            
            // Check if it's a network error (server unreachable)
            if (error.message.includes('fetch') || error.name === 'TypeError') {
                const serverErrorMsg = i18nStrings.upload_download.server_unreachable_details.replace('{0}', cloudServerUrl);
                showErrorDialog(serverErrorMsg);
            } else {
                showErrorDialog(i18nStrings.common.error + ': ' + error.message);
            }
        }
    });
    
    // Show modal
    modal.show();
    
    // Cleanup on close
    modalEl.addEventListener('hidden.bs.modal', () => {
        modalEl.remove();
    });
}

function triggerFileSaveDialog(csvContent, defaultFilename, spinner = null) {
    // Create a Blob from CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Function to hide spinner after file operation
    const hideSpinnerAfterSave = () => {
        if (spinner) {
            spinner.modal.hide();
            setTimeout(() => spinner.modalEl.remove(), 300);
        }
    };
    
    // Try to use the modern File System Access API if available
    if ('showSaveFilePicker' in window) {
        window.showSaveFilePicker({
            suggestedName: defaultFilename,
            types: [{
                description: 'CSV files',
                accept: {'text/csv': ['.csv']},
            }],
        }).then(fileHandle => {
            return fileHandle.createWritable();
        }).then(writable => {
            writable.write(blob);
            return writable.close();
        }).then(() => {
            hideSpinnerAfterSave();
        }).catch(err => {
            if (err.name === 'AbortError') {
                // User cancelled - just hide spinner
                hideSpinnerAfterSave();
            } else {
                // API not supported or other error - fallback to download
                fallbackDownload(blob, defaultFilename);
                hideSpinnerAfterSave();
            }
        });
    } else {
        fallbackDownload(blob, defaultFilename);
        // Hide spinner immediately for fallback method since there's no user interaction
        hideSpinnerAfterSave();
    }
}

function fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    
    // Create temporary <a> element to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;  // Suggested filename
    link.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// ============================================================================
// Observer Upload/Download Functions
// ============================================================================

async function showObserverUploadDialog() {
    // Cloud Mode: Show file picker to select local halobeo.csv
    if (isCloudMode) {
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv';
        
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const { modal, modalEl } = showInfoModal(i18nStrings.upload_download.upload_title, i18nStrings.upload_download.upload_progress);
            
            try {
                // Read CSV file
                const text = await file.text();
                const lines = text.split('\n').filter(line => line.trim());
                
                // Parse CSV into array format (handle quoted fields properly)
                const observers = lines.map(line => {
                    const fields = [];
                    let current = '';
                    let inQuotes = false;
                    
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        
                        if (char === '"') {
                            if (inQuotes && line[i + 1] === '"') {
                                // Escaped quote
                                current += '"';
                                i++; // Skip next quote
                            } else {
                                // Toggle quote mode
                                inQuotes = !inQuotes;
                            }
                        } else if (char === ',' && !inQuotes) {
                            // Field separator (only outside quotes)
                            fields.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    // Add last field
                    fields.push(current.trim());
                    
                    return fields;
                });
                
                if (observers.length === 0) {
                    modal.hide();
                    setTimeout(() => modalEl.remove(), 300);
                    showErrorDialog(i18nStrings.messages.no_observer_data_to_upload);
                    return;
                }
                
                // Upload to server (session auth)
                const response = await fetch('/api/observers/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        observers: observers,
                        use_session: true
                    })
                });
                
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                
                if (response.ok) {
                    showNotification(i18nStrings.upload_download.upload_success_observer, 'success', 5000);
                } else {
                    const error = await response.json();
                    const errorKey = error.error || 'unknown_error';
                    const errorMsg = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
                    showErrorDialog(errorMsg);
                }
            } catch (error) {
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                console.error('Observer upload error:', error);
                showErrorDialog(i18nStrings.common.error + ': ' + error.message);
            }
        };
        
        // Trigger file picker
        fileInput.click();
        return;
    }
    
    // Local Mode: Ask for credentials to upload to cloud server
    const authModal = showAuthenticationModal(async (observerKK, password) => {
        const { modal, modalEl } = showInfoModal(i18nStrings.upload_download.upload_title, i18nStrings.upload_download.upload_progress);
        
        try {
            // Load current observers
            const observersResponse = await fetch('/api/observers?latest_only=false');
            const observersData = await observersResponse.json();
            const allObservers = observersData.observers || [];
            
            // Determine if admin
            const isAdmin = observerKK.toUpperCase() === 'ADMIN';
            
            // Filter observers by KK (unless admin)
            let observersToUpload;
            if (isAdmin) {
                observersToUpload = allObservers;
            } else {
                observersToUpload = allObservers.filter(obs => obs.KK === observerKK);
            }
            
            if (observersToUpload.length === 0) {
                // Close spinner on error
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                showErrorDialog(i18nStrings.messages.no_observer_data_to_upload);
                return;
            }
            
            // Convert objects to arrays (API expects array format)
            const observersArray = observersToUpload.map(obs => [
                obs.KK, obs.VName, obs.NName, obs.seit, obs.aktiv,
                obs.HbOrt, obs.GH, obs.HLG, obs.HLM, obs.HOW,
                obs.HBG, obs.HBM, obs.HNS, obs.NbOrt, obs.GN,
                obs.NLG, obs.NLM, obs.NOW, obs.NBG, obs.NBM, obs.NNS
            ]);
            
            // Get cloud server URL
            const configResponse = await fetch('/api/config');
            const config = await configResponse.json();
            const cloudServerUrl = config.cloud_server_url;
            
            // Call cloud server DIRECTLY (both Local and Cloud Mode)
            const uploadUrl = isCloudMode ? '/api/observers/upload' : `${cloudServerUrl}/api/observers/upload`;
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    observerKK: observerKK,
                    password: password,
                    observers: observersArray,
                    use_session: isCloudMode
                })
            });
            
            if (response.ok) {
                // Close spinner on success
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                
                const result = await response.json();
                showNotification(i18nStrings.upload_download.upload_success_observer, 'success', 5000);
            } else {
                // Close spinner on error
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                
                const error = await response.json();
                
                // Close auth modal AND wait for it to be fully closed
                const authModalInstance = bootstrap.Modal.getInstance(authModal);
                if (authModalInstance) {
                    authModalInstance.hide();
                    // Wait for modal to close before showing error
                    setTimeout(() => {
                        // Translate error code to user-friendly message
                        const errorKey = error.error || 'unknown_error';
                        const errorMsg = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
                        showErrorDialog(errorMsg);
                    }, 300);
                } else {
                    // If no modal found, show error immediately
                    const errorKey = error.error || 'unknown_error';
                    const errorMsg = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
                    showErrorDialog(errorMsg);
                }
            }
            
        } catch (error) {
            // Close spinner if request failed completely
            modal.hide();
            setTimeout(() => modalEl.remove(), 300);
            
            // Close auth modal first
            const authModalInstance = bootstrap.Modal.getInstance(authModal);
            if (authModalInstance) {
                authModalInstance.hide();
            }
            
            const errorMsg = i18nStrings.common.error;
            showErrorDialog(errorMsg + ': ' + error.message);
        }
    });
}

async function uploadObserversLocalMode(cloudServerUrl) {
    const uploadUrl = `${cloudServerUrl.replace(/\/$/, '')}/api/observers/upload`;
    // Local mode: show authentication dialog
    showAuthenticationModal(async (observerKK, password) => {
        let spinner = null;
        try {
            spinner = showInfoModal(i18nStrings.upload_download.upload_title, i18nStrings.upload_download.upload_progress);
            
            // Load current observers from app (ALL records, not just latest)
            const observersResponse = await fetch('/api/observers?latest_only=false');
            const observersData = await observersResponse.json();
            const allObservers = observersData.observers || [];
            
            // Determine if admin
            const isAdmin = observerKK.toUpperCase() === 'ADMIN';
            
            // Filter observers by KK (unless admin)
            let observersToUpload;
            if (isAdmin) {
                observersToUpload = allObservers;
            } else {
                observersToUpload = allObservers.filter(obs => obs.KK === observerKK);
            }
            
            if (observersToUpload.length === 0) {
                if (spinner) {
                    spinner.modal.hide();
                    setTimeout(() => spinner.modalEl.remove(), 300);
                }
                showErrorDialog(i18nStrings.common.error + ': ' + i18nStrings.messages.no_observer_data_to_upload);
                return;
            }
            
            // Convert objects to arrays (API expects array format)
            const observersArray = observersToUpload.map(obs => [
                obs.KK, obs.VName, obs.NName, obs.seit, obs.aktiv,
                obs.HbOrt, obs.GH, obs.HLG, obs.HLM, obs.HOW,
                obs.HBG, obs.HBM, obs.HNS, obs.NbOrt, obs.GN,
                obs.NLG, obs.NLM, obs.NOW, obs.NBG, obs.NBM, obs.NNS
            ]);
            
            // Upload to server
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    observerKK: observerKK,
                    password: password,
                    use_session: false,
                    observers: observersArray
                })
            });
            
            let result = null;
            if (response.ok) {
                result = await response.json();
            } else {
                try {
                    result = await response.json();
                } catch (e) {
                    result = null;
                }
            }
            
            // Hide spinner
            if (spinner) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
            }
            
            if (response.ok && result && result.success) {
                showNotification(i18nStrings.upload_download.upload_success_observer, 'success');
            } else if (!response.ok) {
                showErrorDialog(
                    i18nStrings.upload_download.server_unreachable_details.replace('{0}', uploadUrl),
                    () => { window.navigateInternal('/'); }
                );
            } else {
                const errorMessage = result && result.error ? result.error : i18nStrings.upload_download.server_unreachable;
                showErrorDialog(i18nStrings.common.error + ': ' + errorMessage);
            }
        } catch (error) {
            if (spinner) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
            }
            showErrorDialog(
                i18nStrings.upload_download.server_unreachable_details.replace('{0}', uploadUrl),
                () => { window.navigateInternal('/'); }
            );
        }
    }, cloudServerUrl);
}

async function showObserverDownloadDialog() {
    // Detect cloud vs local mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    const cloudServerUrl = config.cloud_server_url;
    
    // Load data for Local Mode auth fields
    let observers = [];
    let fixedObserver = '';
    let savedPassword = '';
    let savedObserverKK = '';
    
    if (!isCloudMode) {
        try {
            const [obsResponse, configResp, passwordResp] = await Promise.all([
                fetch('/api/observers'),
                fetch('/api/config/fixed_observer'),
                fetch('/api/config/upload_password')
            ]);
            
            if (obsResponse.ok) {
                const data = await obsResponse.json();
                observers = data.observers || [];
            }
            
            if (configResp.ok) {
                const configData = await configResp.json();
                fixedObserver = configData.observer || '';
            }
            
            if (passwordResp.ok) {
                const passwordData = await passwordResp.json();
                savedPassword = passwordData.password || '';
                savedObserverKK = passwordData.observer_kk || '';
            }
        } catch (error) {}
    }
    
    const observerDisabled = fixedObserver ? 'disabled' : '';
    
    // Auth fields section (only visible in Local Mode)
    const authFieldsHtml = !isCloudMode ? `
        <div class="mb-3">
            <label for="download-observer-observer" class="form-label">${i18nStrings.upload_download.upload_auth_username}</label>
            <select class="form-select" id="download-observer-observer" ${observerDisabled}></select>
        </div>
        <div class="mb-3">
            <label for="download-observer-password" class="form-label">${i18nStrings.upload_download.upload_auth_password}</label>
            <input type="password" class="form-control" id="download-observer-password" autocomplete="new-password" value="${savedPassword}">
        </div>
    ` : '';
    
    // Scope selection section (always visible)
    const scopeFieldsHtml = `
        <div class="mb-3">
            <label class="form-label fw-bold">${i18nStrings.upload_download.download_scope_label}</label>
            <div class="d-flex gap-4">
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="downloadObserverScope" id="scope-observer-own" value="own" checked>
                    <label class="form-check-label" for="scope-observer-own">
                        ${i18nStrings.upload_download.download_scope_own_observer}
                    </label>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="downloadObserverScope" id="scope-observer-all" value="all">
                    <label class="form-check-label" for="scope-observer-all">
                        ${i18nStrings.upload_download.download_scope_all_observer}
                    </label>
                </div>
            </div>
        </div>
    `;
    
    // Create combined dialog
    const modalHtml = `
        <div class="modal fade" id="download-observer-modal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${i18nStrings.upload_download.download_title_observer || i18nStrings.upload_download.download_title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${authFieldsHtml}
                        ${scopeFieldsHtml}
                    </div>
                    <div class="modal-footer d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-download-observer">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('download-observer-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    // Setup auth fields (Local Mode only)
    let observerKK = null;
    let password = null;
    let observerSelect = null;
    let passwordInput = null;
    
    if (!isCloudMode) {
        observerSelect = document.getElementById('download-observer-observer');
        passwordInput = document.getElementById('download-observer-password');
        
        // Populate observer dropdown
        const adminOption = document.createElement('option');
        adminOption.value = 'admin';
        adminOption.textContent = 'Admin';
        observerSelect.appendChild(adminOption);
        
        observers.sort((a, b) => parseInt(a.KK) - parseInt(b.KK)).forEach(obs => {
            const option = document.createElement('option');
            option.value = obs.KK;
            const selected = obs.KK === (savedObserverKK || fixedObserver) ? 'selected' : '';
            option.textContent = `${obs.KK} - ${obs.VName} ${obs.NName}`;
            if (selected) option.selected = true;
            observerSelect.appendChild(option);
        });
        
        // Prefill from fixed observer if set
        if (fixedObserver) {
            observerKK = fixedObserver;
        }
    }
    
    // Setup OK button handler
    const btnDownload = document.getElementById('btn-download-observer');
    btnDownload.addEventListener('click', async () => {
        // Get scope selection
        const scopeOwn = document.getElementById('scope-observer-own').checked;
        const downloadAll = !scopeOwn;
        
        // Get auth data (Local Mode)
        if (!isCloudMode) {
            observerKK = observerSelect.value;
            password = passwordInput.value;
            
            if (!observerKK || !password) {
                showErrorDialog(i18nStrings.upload_download.upload_auth_missing);
                return;
            }
            
            // Save password AND observer_kk to halo.cfg for convenience
            try {
                await fetch('/api/config/upload_password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: password, observer_kk: observerKK })
                });
            } catch (error) {
            }
        }
        
        // Close dialog
        modal.hide();
        setTimeout(() => modalEl.remove(), 300);
        
        // Trigger download
        if (isCloudMode) {
            await downloadObserversCloudMode(cloudServerUrl, downloadAll);
        } else {
            await downloadObserversLocalMode(cloudServerUrl, observerKK, password, downloadAll);
        }
    });
    
    // Show dialog
    modal.show();
}

async function downloadObserversCloudMode(cloudServerUrl, downloadAll = false) {
    const downloadUrl = `${cloudServerUrl.replace(/\/$/, '')}/api/observers/download`;
    let spinner = null;
    try {
        spinner = showInfoModal(i18nStrings.upload_download.download_title, i18nStrings.upload_download.download_progress);
        
        // Download from server with session authentication
        const response = await fetch(downloadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                use_session: true,
                download_all: downloadAll
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Trigger file save dialog - pass spinner so it can close it after save/cancel
            const csvContent = result.csv_content;
            const defaultFilename = 'halobeo.csv';
            triggerFileSaveDialog(csvContent, defaultFilename, spinner);
            
            // Note: Success notification shown immediately, but spinner stays until file dialog closes
        } else {
            // Close spinner on error
            if (spinner) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
            }
            
            // Show specific error message from server
            const errorKey = result.error || 'unknown_error';
            const errorMessage = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
            showErrorDialog(errorMessage);
        }
    } catch (error) {
        if (spinner) {
            spinner.modal.hide();
            setTimeout(() => spinner.modalEl.remove(), 300);
        }
        showErrorDialog(
            i18nStrings.upload_download.server_unreachable_details.replace('{0}', downloadUrl),
            () => { window.navigateInternal('/'); }
        );
    }
}

async function downloadObserversLocalMode(cloudServerUrl, observerKK, password, downloadAll = false) {
    const downloadUrl = `${cloudServerUrl.replace(/\/$/, '')}/api/observers/download`;
    let spinner = null;
    try {
        spinner = showInfoModal(i18nStrings.upload_download.download_title, i18nStrings.upload_download.download_progress);
        
        // Download from cloud server with password authentication
        const response = await fetch(downloadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                observerKK: observerKK,
                password: password,
                use_session: false,
                download_all: downloadAll
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Local Mode: Save directly to resources/halobeo.csv and reload into memory
            const csvContent = result.csv_content;
            
            // Save to server's resources/halobeo.csv
            const saveResponse = await fetch('/api/observers/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    csv_content: csvContent
                })
            });
            
            const saveResult = await saveResponse.json();
            
            // Close spinner
            if (spinner) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
            }
            
            if (saveResponse.ok && saveResult.success) {
                // Reload observers into memory
                await fetch('/api/observers/reload', { method: 'POST' });
                
                // Success notification
                showNotification(i18nStrings.upload_download.download_success_observer, 'success');
                
                // Refresh page if on observers page
                if (window.location.pathname === '/observers') {
                    window.location.reload();
                }
            } else {
                showErrorDialog(i18nStrings.common.error + ': ' + (saveResult.error || 'save_failed'));
            }
        } else {
            // Close spinner on error
            if (spinner) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
            }
            
            // Show specific error message from server
            const errorKey = result.error || 'unknown_error';
            const errorMessage = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
            showErrorDialog(errorMessage);
        }
    } catch (error) {
        if (spinner) {
            spinner.modal.hide();
            setTimeout(() => spinner.modalEl.remove(), 300);
        }
        console.error('Observer download error:', error);
        showErrorDialog(
            i18nStrings.upload_download.server_unreachable_details.replace('{0}', downloadUrl),
            () => { window.navigateInternal('/'); }
        );
    }
}

// Helper function - shows a toast message in top-right corner
function showMessage(text, type = 'info') {
    // Legacy function - delegate to standardized showNotification()
    showNotification(text, type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info');
}

// Auto-save helper function
async function triggerAutosave() {
    // Get config to check cloud mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    
    // Skip autosave in Cloud Mode - database saves immediately
    if (isCloudMode) {
        return;
    }
    
    try {
        const response = await fetch('/api/file/autosave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {

        } else {
            console.warn('[AUTOSAVE] Failed:', await response.text());
        }
    } catch (error) {}
}

// Check for autosave recovery on startup
async function checkAutosaveRecovery() {
    // Get config to check cloud mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    
    // Skip autosave recovery in Cloud Mode - database is the source of truth
    if (isCloudMode) {
        return;
    }
    
    try {
        // Skip autosave recovery if we already have observations loaded in memory
        if (window.haloData.isLoaded && window.haloData.observations.length > 0) {
            return;
        }
        
        // Skip if this is an active session (not a crash recovery)
        // The 'activeSession' flag is set when any page navigation happens during normal use
        const activeSession = sessionStorage.getItem('activeSession');
        if (activeSession === 'true') {
            return;
        }
        
        const response = await fetch('/api/file/check_autosave');
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.found) return;
        
        // Show recovery prompt
        const modalHtml = `
            <div class="modal fade" id="autosave-recovery-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.messages.autosave_recovery_title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>${i18nStrings.messages.autosave_recovery_message}</p>
                            <p><strong>${data.original_file}</strong></p>
                            <p>${i18nStrings.messages.autosave_recovery_prompt}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-dismiss-autosave">
                                ${i18nStrings.common.no}
                            </button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-restore-autosave">
                                ${i18nStrings.common.yes}
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('autosave-recovery-modal');
        const modal = new bootstrap.Modal(modalEl);
        
        // Handle "No" - delete the autosave file
        document.getElementById('btn-dismiss-autosave').addEventListener('click', async () => {
            try {
                await fetch('/api/file/cleanup_autosave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ temp_file: data.temp_file })
                });
            } catch (error) {}
            modal.hide();
        });
        
        document.getElementById('btn-restore-autosave').addEventListener('click', async () => {
            try {
                const restoreResp = await fetch('/api/file/restore_autosave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ temp_file: data.temp_file })
                });
                
                if (!restoreResp.ok) throw new Error('Restore failed');
                
                const result = await restoreResp.json();
                
                // Update local state
                window.haloData.observations = result.observations || [];
                window.haloData.fileName = result.filename;
                window.haloData.isLoaded = true;
                if (!window.haloConfig.cloud_mode) window.haloData.isDirty = true;  // Mark as dirty since restored from temp (Local Mode only)
                saveHaloDataToSession();  // Sync to sessionStorage
                
                updateFileInfoDisplay(result.filename, result.count);
                
                modal.hide();
                
                // Show success notification
                const message = `${result.count} ${i18nStrings.common.observations} ${i18nStrings.messages.loaded_from} "${result.filename}" ${i18nStrings.messages.loaded}`;
                showNotification(`<strong>✓</strong> ${message}`, 'success', 5000);
            } catch (error) {
                showErrorDialog(i18nStrings.messages.autosave_recovery_error + ': ' + error.message);
            }
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
        modal.show();
    } catch (error) {
        // Silently ignore - autosave check is optional and may fail if feature not enabled
        console.debug('[AUTOSAVE RECOVERY] Skipped:', error.message);
    }
}

// Show error dialog
// Backward compatibility wrapper - actual implementation in modal-manager.js
// function showErrorDialog(message) - defined in modal-manager.js

// Show info/success modal (simple non-dismissable spinner or message)
// Backward compatibility wrapper - actual implementation in modal-manager.js
// function showInfoModal(title, message) - defined in modal-manager.js

// Backward compatibility wrapper - actual implementation in modal-manager.js
// function showSuccessModal(title, message) - defined in modal-manager.js


// Load file dialog
async function showLoadFileDialog() {
    const isDirty = window.haloData.isDirty;
    const exists = !!window.haloData;
    let warningShown = false;
    
    // Check if current file has unsaved changes
    if (window.haloData && window.haloData.isDirty) {
        warningShown = true;
        const message = i18nStrings.messages.unsaved_changes_message;
        showConfirmDialog(
            i18nStrings.messages.unsaved_changes_title,
            message,
            () => continueLoadFile()
        );
        return;
    }
    
    continueLoadFile();
}

async function continueLoadFile() {

    
    // Use native file picker with webkitdirectory attribute workaround
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.CSV';
    
    // Detect when file picker is closed (either by selecting or canceling)
    // by monitoring window focus - when picker closes, focus returns to window
    let pickerOpened = false;
    window.addEventListener('focus', () => {
        if (pickerOpened) {
            // Clear menu highlights when picker closes without selecting a file
            setTimeout(() => {
                clearMenuHighlights();
            }, 100);
        }
    }, { once: true });
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Create loading modal
        const loadingModal = document.createElement('div');
        loadingModal.className = 'modal fade';
        loadingModal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-body text-center py-4">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">${i18nStrings.messages.loading_spinner}</span>
                        </div>
                        <p class="mb-0">${i18nStrings.messages.loading_file} "${file.name}" ...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        const bsModal = new bootstrap.Modal(loadingModal, { backdrop: 'static', keyboard: false });
        bsModal.show();
        
        try {
            // Clear previous data before loading new file
            window.haloData.observations = [];
            window.haloData.fileName = null;
            window.haloData.isLoaded = false;
            window.haloData.isDirty = false;
            
            // Upload file to server
            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await fetch('/api/file/load', {
                method: 'POST',
                body: formData
            });
            
            if (!uploadResponse.ok) throw new Error('Failed to upload file');
            
            // Get response data to check conversion flag
            const uploadResult = await uploadResponse.json();
            
            // Load observations into global store
            const obsResponse = await fetch('/api/observations?limit=200000');
            if (!obsResponse.ok) throw new Error('Failed to load observations');
            
            const data = await obsResponse.json();
            window.haloData.observations = data.observations;
            window.haloData.fileName = file.name;
            window.haloData.isLoaded = true;
            saveHaloDataToSession();  // Sync to sessionStorage
            
            // Update file info in header
            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
            
            // Hide loading modal
            bsModal.hide();
            
            // Wait for modal to be fully hidden, then remove backdrop and modal
            loadingModal.addEventListener('hidden.bs.modal', () => {
                // Remove backdrop explicitly
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
                loadingModal.remove();
            }, { once: true });
            
            // Fallback: force removal after timeout
            setTimeout(() => {
                if (document.body.contains(loadingModal)) {
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) backdrop.remove();
                    loadingModal.remove();
                }
            }, 500);
            
            // Show conversion modal if legacy format was converted
            if (uploadResult.converted) {
                showSuccessModal(
                    i18nStrings.upload_download.legacy_format_converted_title,
                    i18nStrings.upload_download.legacy_format_converted_message
                );
            }
            
            // Show success message
            showNotification(`<strong>✓</strong> ${window.haloData.observations.length} ${i18nStrings.common.observations} ${i18nStrings.messages.loaded_from} "${file.name}" ${i18nStrings.messages.loaded}`);
        } catch (error) {
            bsModal.hide();
            setTimeout(() => {
                loadingModal.remove();
            }, 300);
            showNotification(`<strong>✗</strong> ${i18nStrings.messages.error_loading}: ${error.message}`, 'danger', 5000);
        }
    });
    
    // Trigger native file picker

    pickerOpened = true;
    fileInput.click();

}

// Merge files - Datei -> Verbinden
async function showMergeFileDialog() {
    // Get config to check cloud mode
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    
    // Check if a file is loaded (Local Mode only - Cloud Mode doesn't support file merge)
    if (!isCloudMode && !window.haloData.fileName) {
        showWarningModal(i18nStrings.observations.no_file_loaded);
        return;
    }
    
    // Check if current file has unsaved changes
    if (window.haloData && window.haloData.isDirty) {
        const message = i18nStrings.messages.unsaved_changes_message;
        showConfirmDialog(
            i18nStrings.messages.unsaved_changes_title,
            message,
            () => continueMergeFile()
        );
        return;
    }
    
    continueMergeFile();
}

async function continueMergeFile() {
    // Use native file picker
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.CSV';
    
    // Detect when file picker is closed
    let pickerOpened = false;
    window.addEventListener('focus', () => {
        if (pickerOpened) {
            setTimeout(() => {
                clearMenuHighlights();
            }, 100);
        }
    }, { once: true });
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Create loading modal
        const loadingModal = document.createElement('div');
        loadingModal.className = 'modal fade';
        loadingModal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-body text-center py-4">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">${i18nStrings.messages.loading_spinner}</span>
                        </div>
                        <p class="mb-0">${i18nStrings.messages.merging_file} "${file.name}" ...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        const bsModal = new bootstrap.Modal(loadingModal, { backdrop: 'static', keyboard: false });
        bsModal.show();
        
        try {
            // Upload file to merge endpoint
            const formData = new FormData();
            formData.append('file', file);
            
            const mergeResponse = await fetch('/api/file/merge', {
                method: 'POST',
                body: formData
            });
            
            if (!mergeResponse.ok) {
                const errorData = await mergeResponse.json();
                throw new Error(errorData.error);
            }
            
            const result = await mergeResponse.json();
            
            // Reload observations into global store
            const obsResponse = await fetch('/api/observations?limit=200000');
            if (!obsResponse.ok) throw new Error('Failed to load observations');
            
            const data = await obsResponse.json();
            window.haloData.observations = data.observations;
            // Mark as dirty only if at least one observation was added (Local Mode only)
            const addedCount = result.added_count || 0;
            if (addedCount > 0 && !window.haloConfig.cloud_mode) {
                window.haloData.isDirty = true;
            }
            saveHaloDataToSession();
            
            // Update file info in header
            updateFileInfoDisplay(window.haloData.fileName, window.haloData.observations.length);
            
            // Hide loading modal
            bsModal.hide();
            setTimeout(() => loadingModal.remove(), 300);
            
            // Show success message with count of added observations
            // (addedCount already computed above)
            showNotification(`<strong>✓</strong> ${addedCount} ${i18nStrings.common.observations} ${i18nStrings.messages.added} "${file.name}"`);
        } catch (error) {
            bsModal.hide();
            setTimeout(() => loadingModal.remove(), 300);
            showNotification(`<strong>✗</strong> ${i18nStrings.messages.merge_error}: ${error.message}`, 'danger', 5000);
            document.body.appendChild(errorMsg);
            setTimeout(() => errorMsg.remove(), 5000);
        }
    });
    
    // Trigger the file picker
    pickerOpened = true;
    fileInput.click();
}

// Update file info display
function updateFileInfoDisplay(fileName, count) {
    const fileInfo = document.getElementById('file-info');
    const fileNameElem = document.getElementById('file-name');
    const obsCountElem = document.getElementById('obs-count');
    
    if (fileInfo && fileNameElem && obsCountElem) {
        if (window.haloConfig && window.haloConfig.cloud_mode) {
            // Cloud Mode: no files, show database indicator
            fileNameElem.textContent = i18nStrings.common.database;
        } else {
            const dirtyMarker = window.haloData.isDirty ? '*' : '';
            fileNameElem.textContent = dirtyMarker + (fileName || '');
        }
        obsCountElem.textContent = `${count} ${i18nStrings.common.observations}`;
        fileInfo.style.display = 'flex';
    }
}
window.updateFileInfoDisplay = updateFileInfoDisplay;

// Clear file info display
function clearFileInfoDisplay() {
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) {
        fileInfo.style.display = 'none';
    }
    // Clear global data
    window.haloData = {
        observations: [],
        fileName: null,
        isLoaded: false,
        isDirty: false
    };
}
window.clearFileInfoDisplay = clearFileInfoDisplay;

// Check if data is loaded on server and update display
async function checkAndDisplayFileInfo() {
    try {
        // Check file status from server
        const statusResponse = await fetch('/api/file/status');
        if (statusResponse.ok) {
            const status = await statusResponse.json();
            
            if (window.haloConfig && window.haloConfig.cloud_mode) {
                // Cloud Mode: always show database count (no filename needed)
                window.haloData.isLoaded = true;
                updateFileInfoDisplay(null, status.count);
            } else if (status.count > 0 && status.filename) {
                // Local Mode: data is loaded, update display and global state
                if (window.haloData.observations.length === 0) {
                    window.haloData.isLoaded = true;
                    window.haloData.fileName = status.filename;
                    window.haloData.observations = [];
                    saveHaloDataToSession();
                }
                updateFileInfoDisplay(status.filename, status.count);
                
                // Show notification if file was auto-loaded
                if (status.auto_loaded) {
                    showNotification(`<strong>✓</strong> ${status.filename} ${i18nStrings.messages.loaded} (${status.count} ${i18nStrings.observations.records_label})`);
                }
            } else {
                // No data loaded
                clearFileInfoDisplay();
            }
        } else {
            // No data loaded
            clearFileInfoDisplay();
        }
    } catch (error) {clearFileInfoDisplay();
    }
}

async function showSaveFileDialog() {
    await saveFile();
}

// Show warning modal with custom message
// Backward compatibility wrapper - actual implementation in modal-manager.js
// function showWarningModal(message) - defined in modal-manager.js

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

// Show Fixed Observer dialog
async function showFixedObserverDialog() {
    try {
        // Get current fixed observer setting
        const configResponse = await fetch('/api/config/fixed_observer');
        const config = await configResponse.json();
        const currentObserver = config.observer || '';
        
        // Get list of observers
        const obsResponse = await fetch('/api/observers/list');
        const obsData = await obsResponse.json();
        const observers = obsData.observers || [];
        
        // Build dropdown options
        let options = `<option value="">${i18nStrings.settings.no_fixed_observer}</option>`;
        observers.forEach(obs => {
            const selected = String(obs.KK) === String(currentObserver) ? 'selected' : '';
            options += `<option value="${obs.KK}" ${selected}>${obs.KK} - ${obs.VName} ${obs.NName}</option>`;
        });
        
        // Create Bootstrap modal
        const modalHtml = `
            <div class="modal fade" id="fixed-observer-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.settings.fixed_observer}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">${i18nStrings.settings.fixed_observer_question}</p>
                            <select class="form-select" id="fixed-observer-select">
                                ${options}
                            </select>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-fixed-observer-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('fixed-observer-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        document.getElementById('btn-fixed-observer-ok').addEventListener('click', async () => {
            const select = document.getElementById('fixed-observer-select');
            const newObserver = select.value;
            
            modal.hide();
            
            await fetch('/api/config/fixed_observer', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({observer: newObserver})
            });
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {}
}

// Show Datum (Date Default) dialog
async function showDatumDialog() {
    try {
        const response = await fetch('/api/config/datedefault');
        const config = await response.json();
        const currentSetting = config.mode || 'none';
        const currentMonth = config.month || 1;
        const currentYear = config.year || new Date().getFullYear();
        
        // Generate month options
        const monthOptions = [];
        for (let m = 1; m <= 12; m++) {
            const monthName = i18nStrings.months[m];
            monthOptions.push(`<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${monthName}</option>`);
        }
        
        // Generate year options (YEAR_MIN-YEAR_MAX)
        const yearOptions = [];
        for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
            yearOptions.push(`<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`);
        }
        
        // Create Bootstrap modal
        const modalHtml = `
            <div class="modal fade" id="datum-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.settings.date_setting_title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">${i18nStrings.settings.date_setting_question}</p>
                            <div class="row mb-2">
                                <div class="col-6">
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="datum" id="date-none" value="none" ${currentSetting === 'none' ? 'checked' : ''}>
                                        <label class="form-check-label" for="date-none">${i18nStrings.settings.date_none}</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="datum" id="date-current" value="current" ${currentSetting === 'current' ? 'checked' : ''}>
                                        <label class="form-check-label" for="date-current">${i18nStrings.settings.date_current_month}</label>
                                    </div>
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col-6">
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="datum" id="date-previous" value="previous" ${currentSetting === 'previous' ? 'checked' : ''}>
                                        <label class="form-check-label" for="date-previous">${i18nStrings.settings.date_previous_month}</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="datum" id="date-constant" value="constant" ${currentSetting === 'constant' ? 'checked' : ''}>
                                        <label class="form-check-label" for="date-constant">${i18nStrings.settings.date_constant_month}</label>
                                    </div>
                                </div>
                            </div>
                            <div id="constant-month-inputs" style="display: ${currentSetting === 'constant' ? 'block' : 'none'}; margin-left: 25px;">
                                <label class="form-label mb-2">${i18nStrings.settings.date_select_month}</label>
                                <div class="row g-2">
                                    <div class="col-7">
                                        <select class="form-select" id="constant-month">
                                            ${monthOptions.join('')}
                                        </select>
                                    </div>
                                    <div class="col-5">
                                        <select class="form-select" id="constant-year">
                                            ${yearOptions.join('')}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-datum-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('datum-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        // Show/hide constant month inputs based on selection
        const radioButtons = document.querySelectorAll('input[name="datum"]');
        const constantInputs = document.getElementById('constant-month-inputs');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', () => {
                constantInputs.style.display = radio.value === 'constant' ? 'block' : 'none';
            });
        });
        
        document.getElementById('btn-datum-ok').addEventListener('click', async () => {
            const selected = document.querySelector('input[name="datum"]:checked');
            const newMode = selected ? selected.value : 'none';
            const month = parseInt(document.getElementById('constant-month').value);
            const year = parseInt(document.getElementById('constant-year').value);
            
            modal.hide();
            
            await fetch('/api/config/datedefault', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({mode: newMode, month: month, year: year})
            });
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {}
}

// Show Eingabeart dialog
async function showEingabeartDialog() {
    try {
        const response = await fetch('/api/config/inputmode');
        const config = await response.json();
        const currentMode = config.mode;
        
        // Create Bootstrap modal
        const modalHtml = `
            <div class="modal fade" id="eingabeart-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.settings.input_mode_title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">${i18nStrings.settings.input_mode_question}</p>
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="eingabeart" id="mode-m" value="M" ${currentMode === 'M' ? 'checked' : ''}>
                                <label class="form-check-label" for="mode-m">${i18nStrings.settings.input_mode_menu}</label>
                            </div>
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="eingabeart" id="mode-n" value="N" ${currentMode === 'N' ? 'checked' : ''}>
                                <label class="form-check-label" for="mode-n">${i18nStrings.settings.input_mode_number}</label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-eingabeart-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('eingabeart-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        document.getElementById('btn-eingabeart-ok').addEventListener('click', async () => {
            const selected = document.querySelector('input[name="eingabeart"]:checked');
            const newMode = selected ? selected.value : 'Z';
            
            modal.hide();
            
            if (newMode !== currentMode) {
                await fetch('/api/config/inputmode', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({mode: newMode})
                });
                // Silent success: no confirmation dialogs
            }
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {}
}
// Show Ausgabeart (output format) dialog - NEW FEATURE
async function showAusgabeartDialog() {
    try {
        const response = await fetch('/api/config/outputmode');
        const config = await response.json();
        const currentMode = config.mode;
        
        // Create Bootstrap modal
        const modalHtml = `
            <div class="modal fade" id="ausgabeart-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.settings.output_type_title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">${i18nStrings.settings.output_type_question}</p>
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="ausgabeart" id="mode-h" value="H" ${currentMode === 'H' ? 'checked' : ''}>
                                <label class="form-check-label" for="mode-h">${i18nStrings.settings.output_type_html}</label>
                            </div>
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="ausgabeart" id="mode-p" value="P" ${currentMode === 'P' ? 'checked' : ''}>
                                <label class="form-check-label" for="mode-p">${i18nStrings.settings.output_type_pseudo}</label>
                            </div>
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="radio" name="ausgabeart" id="mode-m" value="M" ${currentMode === 'M' ? 'checked' : ''}>
                                <label class="form-check-label" for="mode-m">${i18nStrings.settings.output_type_markdown}</label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-ausgabeart-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('ausgabeart-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        document.getElementById('btn-ausgabeart-ok').addEventListener('click', async () => {
            const selected = document.querySelector('input[name="ausgabeart"]:checked');
            const newMode = selected ? selected.value : 'P';
            
            modal.hide();
            
            if (newMode !== currentMode) {
                await fetch('/api/config/outputmode', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({mode: newMode})
                });
                // Silent success: no confirmation dialogs
            }
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {}
}

// Show change password dialog (cloud mode only)
async function showChangePasswordDialog() {
    try {
        const i18n = i18nStrings.settings;
        
        // Check if user is admin
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        const isAdmin = config.is_admin || false;
        
        let modalHtml;
        
        if (isAdmin) {
            // Admin mode: Select user + password
            const observersResponse = await fetch('/api/observers/list');
            const observers = await observersResponse.json();
            
            const observerOptions = observers.map(obs => 
                `<option value="${obs.KK}">${obs.KK} - ${obs.VName} ${obs.NName}</option>`
            ).join('');
            
            modalHtml = `
                <div class="modal fade" id="change-password-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${i18n.change_password_admin_title}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">${i18n.select_user_label}</label>
                                    <select class="form-select" id="select-user">
                                        <option value="">${i18nStrings.common.please_select}</option>
                                        <option value="admin">${i18n.admin_user}</option>
                                        ${observerOptions}
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">${i18n.new_password_label}</label>
                                    <input type="password" class="form-control" id="new-password" autocomplete="new-password">
                                </div>
                                <div class="mb-3" id="confirm-password-group">
                                    <label class="form-label">${i18n.confirm_password_label}</label>
                                    <input type="password" class="form-control" id="confirm-password" autocomplete="new-password">
                                </div>
                                <div id="password-error" class="alert alert-danger d-none"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-change-password">${i18nStrings.common.ok}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Regular user mode: Current password required
            modalHtml = `
                <div class="modal fade" id="change-password-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${i18n.change_password_title}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">${i18n.current_password_label}</label>
                                    <input type="password" class="form-control" id="current-password" autocomplete="current-password">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">${i18n.new_password_label}</label>
                                    <input type="password" class="form-control" id="new-password" autocomplete="new-password">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">${i18n.confirm_password_label}</label>
                                    <input type="password" class="form-control" id="confirm-password" autocomplete="new-password">
                                </div>
                                <div id="password-error" class="alert alert-danger d-none"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-change-password">${i18nStrings.common.ok}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('change-password-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        const showError = (message) => {
            const errorDiv = document.getElementById('password-error');
            errorDiv.textContent = message;
            errorDiv.classList.remove('d-none');
        };
        
        if (isAdmin) {
            // Admin mode: Show/hide confirm password based on selection
            const selectUser = document.getElementById('select-user');
            const confirmGroup = document.getElementById('confirm-password-group');
            
            selectUser.addEventListener('change', () => {
                // Show confirm password only when admin selects themselves
                if (selectUser.value === 'admin') {
                    confirmGroup.style.display = 'block';
                } else {
                    confirmGroup.style.display = 'none';
                }
            });
            
            // Initially hide confirm password
            confirmGroup.style.display = 'none';
        }
        
        document.getElementById('btn-change-password').addEventListener('click', async () => {
            const newPassword = document.getElementById('new-password').value;
            
            if (isAdmin) {
                // Admin mode
                const selectedUser = document.getElementById('select-user').value;
                
                if (!selectedUser) {
                    showError(i18n.error_select_user);
                    return;
                }
                
                if (!newPassword) {
                    showError(i18nStrings.messages.filter_value_required);
                    return;
                }
                
                const validation = validatePassword(newPassword);
                if (!validation.valid) {
                    showError(i18n['error_' + validation.error]);
                    return;
                }
                
                // If admin selected, require confirmation
                if (selectedUser === 'admin') {
                    const confirmPassword = document.getElementById('confirm-password').value;
                    if (newPassword !== confirmPassword) {
                        showError(i18n.error_passwords_dont_match);
                        return;
                    }
                }
                
                try {
                    const configResponse = await fetch('/api/config');
                    const config = await configResponse.json();
                    const apiBase = config.cloud_mode ? '' : config.cloud_server_url;
                    if (!config.cloud_mode && !apiBase) {
                        showError(i18nStrings.messages.error_loading);
                        return;
                    }
                    const changeUrl = apiBase === '' ? '/api/change-password' : `${apiBase.replace(/\/$/, '')}/api/change-password`;
                    const response = await fetch(changeUrl, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            target_user: selectedUser,
                            new_password: newPassword,
                            admin_mode: true
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                        modal.hide();
                        const userName = selectedUser === 'admin' ? i18n.admin_user : selectedUser;
                        showNotification(i18n.success_password_set.replace('{user}', userName), 'success');
                    } else {
                        showError(result.error);
                    }
                } catch (error) {
                    showError(i18nStrings.messages.error_loading);
                }
                
            } else {
                // Regular user mode
                const currentPassword = document.getElementById('current-password').value;
                const confirmPassword = document.getElementById('confirm-password').value;
                
                if (!currentPassword || !newPassword || !confirmPassword) {
                    showError(i18nStrings.messages.filter_value_required);
                    return;
                }
                
                const validation = validatePassword(newPassword);
                if (!validation.valid) {
                    showError(i18n['error_' + validation.error]);
                    return;
                }
                
                if (newPassword !== confirmPassword) {
                    showError(i18n.error_passwords_dont_match);
                    return;
                }
                
                try {
                    const configResponse = await fetch('/api/config');
                    const config = await configResponse.json();
                    const apiBase = isCloudMode ? '' : config.cloud_server_url;
                    if (!isCloudMode && !apiBase) {
                        showError(i18nStrings.messages.error_loading);
                        return;
                    }
                    const changeUrl = apiBase === '' ? '/api/change-password' : `${apiBase.replace(/\/$/, '')}/api/change-password`;
                    const response = await fetch(changeUrl, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            current_password: currentPassword,
                            new_password: newPassword
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                        modal.hide();
                        showNotification(i18n.success_password_changed, 'success');
                    } else {
                        // Translate error key from backend (e.g., "error_current_password_wrong")
                        showError(i18n[result.error]);
                    }
                } catch (error) {
                    showError(i18nStrings.messages.error_loading);
                }
            }
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {}
}

// Show version information dialog
function showVersionDialog() {
    const v = i18nStrings.app.version_dialog;
    const versionNumber = i18nStrings.app.version;
    const versionDate = i18nStrings.app.version_date;
    const versionTitle = `${i18nStrings.app.title} ${versionNumber}`;

    const versionText = `<h4 class="text-center mb-4">${versionTitle}</h4>
           <p class="mb-2"><strong>${v.date_label}:</strong> ${versionDate}</p>
           <p class="mb-3"><strong>${v.author_label}:</strong> ${v.contact_name}</p>
           <hr class="my-3">
           <p class="mb-2">${v.description}</p>
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
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('version-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    modalEl.addEventListener('hidden.bs.modal', () => {
        clearMenuHighlights();
        modalEl.remove();
    });
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
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('whatsnew-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {
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
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('help-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        modalEl.addEventListener('hidden.bs.modal', () => {
            clearMenuHighlights();
            modalEl.remove();
        });
        
    } catch (error) {
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
    const modal = new bootstrap.Modal(modalEl);
    
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
    
    // Cleanup modal after close
    modalEl.addEventListener('hidden.bs.modal', () => {
        modalEl.remove();
    });
    
    modal.show();
}

// Show add observer dialog
async function showAddObserverDialog(formData = null) {
    // Ensure i18n is loaded
    if (!i18nStrings.observers) {
        await loadI18n(currentLanguage);
    }
    
    // Check for fixed observer
    let fixedObserver = '';
    try {
        const response = await fetch('/api/config/fixed_observer');
        const config = await response.json();
        fixedObserver = config.observer || '';
    } catch (error) {}
    
    // Build month options with names
    const monthOptions = Array.from({length: 12}, (_, i) => {
        const month = i + 1;
        const monthName = i18nStrings.months[month];
        return `<option value="${month}">${monthName}</option>`;
    }).join('');
    
    // Build year options (YEAR_MIN to YEAR_MAX)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        const yearShort = year % 100;
        return `<option value="${yearShort}">${year}</option>`;
    }).join('');
    
    // Build region options with real names (1-39)
    const regionOptions = Array.from({length: 39}, (_, i) => {
        const region = i + 1;
        const regionName = i18nStrings.geographic_regions[region];
        if (regionName) {
            return `<option value="${region}">${region} - ${regionName}</option>`;
        }
        return '';
    }).join('');
    
    // Build degree options (0-180 for longitude, 0-90 for latitude)
    const lonDegOptions = Array.from({length: 181}, (_, i) => 
        `<option value="${i}">${i}</option>`
    ).join('');
    
    const latDegOptions = Array.from({length: 91}, (_, i) => 
        `<option value="${i}">${i}</option>`
    ).join('');
    
    // Build minute options (0-59)
    const minOptions = Array.from({length: 60}, (_, i) => 
        `<option value="${i}">${i}</option>`
    ).join('');
    
    const kkDisabled = fixedObserver ? 'disabled' : '';
    
    const modalHtml = `
        <div class="modal fade" id="add-observer-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h6 class="modal-title mb-0">${i18nStrings.observers.add_title}</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body py-2">
                        <form id="observer-form">
                            <div class="row g-2">
                                <!-- KK, First Name, Last Name -->
                                <div class="col-md-2">
                                    <label class="form-label small mb-0">${i18nStrings.observers.kk_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="obs-kk" maxlength="2" pattern="[0-9]{2}" ${kkDisabled} required>
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label small mb-0">${i18nStrings.observers.first_name_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="obs-vname" maxlength="15" required>
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label small mb-0">${i18nStrings.observers.last_name_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="obs-nname" maxlength="15" required>
                                </div>
                                
                                <!-- Since (Month/Year) and Active -->
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_month_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="obs-seit-month" required>
                                        ${monthOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_year_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="obs-seit-year" required>
                                        ${yearOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.common.active} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="obs-active" required>
                                        <option value="1">${i18nStrings.common.yes}</option>
                                        <option value="0">${i18nStrings.common.no}</option>
                                    </select>
                                </div>
                                
                                <!-- Main Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.primary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.primary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="obs-hb-ort" maxlength="20" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="obs-gh" required>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Main Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="obs-hlg" required>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="obs-hlm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="obs-how" style="max-width: 70px;" required>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="obs-hbg" required>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="obs-hbm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="obs-hns" style="max-width: 70px;" required>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <!-- Secondary Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.secondary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.secondary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="obs-nb-ort" maxlength="20" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="obs-gn" required>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Secondary Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="obs-nlg" required>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="obs-nlm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="obs-now" style="max-width: 70px;" required>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="obs-nbg" required>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="obs-nbm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="obs-nns" style="max-width: 70px;" required>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div id="observer-error" class="text-danger mt-2" style="display:none; font-size: 12px;"></div>
                        </form>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-add-observer-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('add-observer-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    const errEl = document.getElementById('observer-error');
    
    // Focus KK input when modal is shown and restore form data if provided
    modalEl.addEventListener('shown.bs.modal', () => {
        // Pre-fill KK with fixed observer if set
        if (fixedObserver && !formData) {
            document.getElementById('obs-kk').value = fixedObserver;
        }
        
        if (formData) {
            // Restore form values
            document.getElementById('obs-kk').value = formData.KK || '';
            document.getElementById('obs-vname').value = formData.VName || '';
            document.getElementById('obs-nname').value = formData.NName || '';
            document.getElementById('obs-seit-month').value = formData.seit_month || '';
            document.getElementById('obs-seit-year').value = formData.seit_year || '';
            document.getElementById('obs-active').value = formData.active !== undefined ? formData.active : '';
            document.getElementById('obs-hb-ort').value = formData.HbOrt || '';
            document.getElementById('obs-gh').value = formData.GH || '';
            document.getElementById('obs-hlg').value = formData.HLG !== undefined ? formData.HLG : '';
            document.getElementById('obs-hlm').value = formData.HLM !== undefined ? formData.HLM : '';
            document.getElementById('obs-how').value = formData.HOW || 'O';
            document.getElementById('obs-hbg').value = formData.HBG !== undefined ? formData.HBG : '';
            document.getElementById('obs-hbm').value = formData.HBM !== undefined ? formData.HBM : '';
            document.getElementById('obs-hns').value = formData.HNS || 'N';
            document.getElementById('obs-nb-ort').value = formData.NbOrt || '';
            document.getElementById('obs-gn').value = formData.GN || '';
            document.getElementById('obs-nlg').value = formData.NLG !== undefined ? formData.NLG : '';
            document.getElementById('obs-nlm').value = formData.NLM !== undefined ? formData.NLM : '';
            document.getElementById('obs-now').value = formData.NOW || 'O';
            document.getElementById('obs-nbg').value = formData.NBG !== undefined ? formData.NBG : '';
            document.getElementById('obs-nbm').value = formData.NBM !== undefined ? formData.NBM : '';
            document.getElementById('obs-nns').value = formData.NNS || 'N';
        }
        
        // Focus first name if KK is disabled, otherwise focus KK
        if (fixedObserver) {
            document.getElementById('obs-vname').focus();
        } else {
            document.getElementById('obs-kk').focus();
        }
    });
    
    // Handle Enter key to submit
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            document.getElementById('btn-add-observer-ok').click();
        }
    });
    
    // Handle save button
    document.getElementById('btn-add-observer-ok').addEventListener('click', async () => {
        try {
            errEl.style.display = 'none';
            
            // Collect form data
            const observerData = {
                KK: document.getElementById('obs-kk').value.trim().padStart(2, '0'),
                VName: document.getElementById('obs-vname').value.trim(),
                NName: document.getElementById('obs-nname').value.trim(),
                seit_month: parseInt(document.getElementById('obs-seit-month').value),
                seit_year: parseInt(document.getElementById('obs-seit-year').value),
                active: parseInt(document.getElementById('obs-active').value),
                HbOrt: document.getElementById('obs-hb-ort').value.trim(),
                GH: document.getElementById('obs-gh').value.padStart(2, '0'),
                HLG: parseInt(document.getElementById('obs-hlg').value),
                HLM: parseInt(document.getElementById('obs-hlm').value),
                HOW: document.getElementById('obs-how').value,
                HBG: parseInt(document.getElementById('obs-hbg').value),
                HBM: parseInt(document.getElementById('obs-hbm').value),
                HNS: document.getElementById('obs-hns').value,
                NbOrt: document.getElementById('obs-nb-ort').value.trim(),
                GN: document.getElementById('obs-gn').value.padStart(2, '0'),
                NLG: parseInt(document.getElementById('obs-nlg').value),
                NLM: parseInt(document.getElementById('obs-nlm').value),
                NOW: document.getElementById('obs-now').value,
                NBG: parseInt(document.getElementById('obs-nbg').value),
                NBM: parseInt(document.getElementById('obs-nbm').value),
                NNS: document.getElementById('obs-nns').value
            };
            
            // Validate required fields
            if (!observerData.KK || !observerData.VName || !observerData.NName || 
                !observerData.HbOrt || !observerData.GH || !observerData.NbOrt || !observerData.GN) {
                // Store form data
                const formData = observerData;
                modal.hide();
                modalEl.addEventListener('hidden.bs.modal', () => {
                    modalEl.remove();
                    showErrorDialog(i18nStrings.observers.error_missing_required, () => {
                        showAddObserverDialog(formData);
                    });
                }, { once: true });
                return;
            }
            
            // Validate KK format
            if (!/^\d{2}$/.test(observerData.KK) || parseInt(observerData.KK) < 1 || parseInt(observerData.KK) > 99) {
                const formData = observerData;
                modal.hide();
                modalEl.addEventListener('hidden.bs.modal', () => {
                    modalEl.remove();
                    showErrorDialog(i18nStrings.observers.error_invalid_kk, () => {
                        showAddObserverDialog(formData);
                    });
                }, { once: true });
                return;
            }
            
            // Send to API
            const resp = await fetch('/api/observers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(observerData)
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                // Check for specific error messages
                const formData = observerData;
                if (result.error && result.error.includes('already exists')) {
                    // Show modal error for duplicate KK
                    modal.hide();
                    modalEl.addEventListener('hidden.bs.modal', () => {
                        modalEl.remove();
                        showErrorDialog(i18nStrings.observers.error_kk_exists, () => {
                            showAddObserverDialog(formData);
                        });
                    }, { once: true });
                } else {
                    modal.hide();
                    modalEl.addEventListener('hidden.bs.modal', () => {
                        modalEl.remove();
                        showErrorDialog(result.error, () => {
                            showAddObserverDialog(formData);
                        });
                    }, { once: true });
                }
                return;
            }
            
            // Success - close modal
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_added}`);
            
        } catch (e) {
            const formData = observerData;
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.remove();
                showErrorDialog(e.message, () => {
                    showAddObserverDialog(formData);
                });
            }, { once: true });
        }
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

// Delete Observer Dialog Functions
async function showDeleteObserverDialog() {
    
    // Check for fixed observer
    let fixedObserver = '';
    try {
        const response = await fetch('/api/config/fixed_observer');
        const config = await response.json();
        fixedObserver = config.observer || '';
    } catch (error) {}
    
    // Load observers first
    try {
        const resp = await fetch('/api/observers');
        const data = await resp.json();
        
        if (!data.observers || data.observers.length === 0) {
            showErrorDialog(i18nStrings.messages.error_loading_observers);
            return;
        }
        
        // If fixed observer is set, directly show confirm dialog for that observer
        if (fixedObserver) {
            const observer = data.observers.find(obs => obs.KK === fixedObserver);
            if (observer) {
                // Load all sites for this observer
                try {
                    const sitesResp = await fetch(`/api/observers/${fixedObserver}/sites`);
                    const sitesData = await sitesResp.json();
                    showDeleteObserverConfirmDialog(observer, sitesData.sites);
                    return;
                } catch (e) {
                    showErrorDialog(e.message);
                    return;
                }
            }
        }
        
        // Create observer options sorted by KK
        const observers = data.observers.sort((a, b) => a.KK.localeCompare(b.KK));
        const observerOptions = observers.map(obs => 
            `<option value="${obs.KK}">${obs.KK} ${obs.VName} ${obs.NName}</option>`
        ).join('');
        
        const modalHtml = `
            <div class="modal fade" id="select-delete-observer-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h5 class="modal-title">${i18nStrings.observers.delete_observer}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <label class="form-label">${i18nStrings.observers.select_observer_prompt}</label>
                            <select class="form-select" id="delete-observer-select" required>
                                ${observerOptions}
                            </select>
                        </div>
                        <div class="modal-footer py-1">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-select-delete-observer-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('select-delete-observer-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        // Handle OK button
        document.getElementById('btn-select-delete-observer-ok').addEventListener('click', async () => {
            const selectedKK = document.getElementById('delete-observer-select').value;
            if (!selectedKK) {
                return;
            }
            
            const selectedObserver = observers.find(obs => obs.KK === selectedKK);
            
            // Load all sites for this observer first
            try {
                const sitesResp = await fetch(`/api/observers/${selectedKK}/sites`);
                const sitesData = await sitesResp.json();
                
                // Now close modal and show confirm dialog
                modal.hide();
                modalEl.addEventListener('hidden.bs.modal', () => {
                    modalEl.remove();
                    showDeleteObserverConfirmDialog(selectedObserver, sitesData.sites);
                }, { once: true });
            } catch (e) {
                modal.hide();
                modalEl.addEventListener('hidden.bs.modal', () => {
                    modalEl.remove();
                    showErrorDialog(e.message);
                }, { once: true });
            }
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

async function showDeleteObserverConfirmDialog(observer, sites) {
    
    // Build table rows
    const tableRows = sites.map(site => {
        const yearNum = parseInt(site.seit_year);
        const fullYear = yearNum < (YEAR_MIN-1900) ? 2000 + yearNum : 1900 + yearNum;
        const monthName = i18nStrings.months[site.seit_month];
        const seitDisplay = `${String(site.seit_month).padStart(2, '0')}/${String(yearNum).padStart(2, '0')}`;
        const aktivDisplay = site.active === 1 ? i18nStrings.common.yes : i18nStrings.common.no;
        
        return `
            <tr>
                <td>${observer.KK}</td>
                <td>${observer.VName} ${observer.NName}</td>
                <td>${seitDisplay}</td>
                <td>${aktivDisplay}</td>
                <td>${site.HbOrt}</td>
                <td>${String(site.GH).padStart(2, '0')}</td>
                <td>${site.HLG}° ${site.HLM}' ${site.HOW} / ${site.HBG}° ${site.HBM}' ${site.HNS}</td>
                <td>${site.NbOrt}</td>
                <td>${String(site.GN).padStart(2, '0')}</td>
                <td>${site.NLG}° ${site.NLM}' ${site.NOW} / ${site.NBG}° ${site.NBM}' ${site.NNS}</td>
            </tr>`;
    }).join('');
    
    const modalHtml = `
        <div class="modal fade" id="delete-observer-confirm-modal" tabindex="-1">
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.delete_observer}: ${observer.KK} ${observer.VName} ${observer.NName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div style="max-height: 400px; overflow-y: auto;">
                            <table class="table table-sm table-striped table-hover" style="font-size: 0.85rem;">
                                <thead class="table-primary sticky-top">
                                    <tr>
                                        <th>${i18nStrings.observers.kk_label}</th>
                                        <th>${i18nStrings.observers.name_label}</th>
                                        <th>${i18nStrings.observers.since_year_label}</th>
                                        <th>${i18nStrings.common.active}</th>
                                        <th>${i18nStrings.observers.primary_site_label}</th>
                                        <th>${i18nStrings.observers.region_label}</th>
                                        <th>${i18nStrings.observers.coordinates_label}</th>
                                        <th>${i18nStrings.observers.secondary_site_label}</th>
                                        <th>${i18nStrings.observers.region_label}</th>
                                        <th>${i18nStrings.observers.coordinates_label}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-delete-observer-no">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-delete-observer-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('delete-observer-confirm-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    // Handle Enter key - same as "No" button
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-delete-observer-no').click();
        }
    });
    
    // Handle "No" button - close dialog
    document.getElementById('btn-delete-observer-no').addEventListener('click', () => {
        modal.hide();
    });
    
    // Handle "Yes" button - delete observer
    document.getElementById('btn-delete-observer-yes').addEventListener('click', async () => {
        try {
            const resp = await fetch('/api/observers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ KK: observer.KK })
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                showErrorDialog(result.error);
                return;
            }
            
            // Success
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_deleted}`);
            
            // Return to main page after 2 seconds
            setTimeout(() => {
                window.navigateInternal('/');
            }, 2000);
            
        } catch (e) {
            showErrorDialog(e.message);
        }
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

// Edit Observer Dialog Functions
async function showEditObserverDialog() {

    // Check for fixed observer
    let fixedObserver = '';
    try {
        const response = await fetch('/api/config/fixed_observer');
        const config = await response.json();
        fixedObserver = config.observer || '';
    } catch (error) {}
    
    // Load observers first
    try {
        const resp = await fetch('/api/observers');
        const data = await resp.json();
        
        if (!data.observers || data.observers.length === 0) {
            showErrorDialog(i18nStrings.messages.error_loading_observers);
            return;
        }
        
        // If fixed observer is set, directly show edit dialog for that observer
        if (fixedObserver) {
            const observer = data.observers.find(obs => obs.KK === fixedObserver);
            if (observer) {
                showEditTypeDialog(observer);
                return;
            }
        }
        
        // Create observer options sorted by KK
        const observers = data.observers.sort((a, b) => a.KK.localeCompare(b.KK));
        const observerOptions = observers.map(obs => 
            `<option value="${obs.KK}">${obs.KK} ${obs.VName} ${obs.NName}</option>`
        ).join('');
        
        const modalHtml = `
            <div class="modal fade" id="select-observer-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h5 class="modal-title">${i18nStrings.messages.select_observer}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <label class="form-label">${i18nStrings.observers.select_observer_prompt}</label>
                            <select class="form-select" id="observer-select" required>
                                ${observerOptions}
                            </select>
                        </div>
                        <div class="modal-footer py-1">
                            <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-select-observer-ok">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('select-observer-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        // Handle OK button
        document.getElementById('btn-select-observer-ok').addEventListener('click', () => {
            const selectedKK = document.getElementById('observer-select').value;
            if (!selectedKK) {
                return;
            }
            
            const selectedObserver = observers.find(obs => obs.KK === selectedKK);
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.remove();
                showEditTypeDialog(selectedObserver);
            });
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

function showEditTypeDialog(observer) {
    
    const modalHtml = `
        <div class="modal fade" id="edit-type-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_title}: ${observer.KK} ${observer.VName} ${observer.NName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">${i18nStrings.observers.modify_what_title}</p>
                        <div class="d-grid gap-2">
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="editType" id="radio-edit-base" value="base" checked>
                                <label class="form-check-label" for="radio-edit-base">
                                    ${i18nStrings.observers.modify_base_data}
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="editType" id="radio-add-site" value="add-site">
                                <label class="form-check-label" for="radio-add-site">
                                    ${i18nStrings.observers.modify_add_site}
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="editType" id="radio-edit-site" value="edit-site">
                                <label class="form-check-label" for="radio-edit-site">
                                    ${i18nStrings.observers.modify_edit_site}
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="editType" id="radio-delete-site" value="delete-site">
                                <label class="form-check-label" for="radio-delete-site">
                                    ${i18nStrings.observers.modify_delete_site}
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-edit-type-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('edit-type-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    // Handle OK button
    document.getElementById('btn-edit-type-ok').addEventListener('click', () => {
        const selectedType = document.querySelector('input[name="editType"]:checked').value;
        modal.hide();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            if (selectedType === 'base') {
                showEditBaseDataDialog(observer);
            } else if (selectedType === 'add-site') {
                showAddSiteDialog(observer);
            } else if (selectedType === 'edit-site') {
                showEditSiteDialog(observer);
            } else if (selectedType === 'delete-site') {
                showDeleteSiteDialog(observer);
            }
        });
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

function showEditBaseDataDialog(observer) {
    
    const modalHtml = `
        <div class="modal fade" id="edit-base-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.edit_base_title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-base-form">
                            <div class="row g-2">
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.kk_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="edit-kk" value="${observer.KK}" maxlength="2" required readonly style="background-color: #f0f0f0;">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.first_name_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="edit-vname" value="${observer.VName}" maxlength="15" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.last_name_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="edit-nname" value="${observer.NName}" maxlength="15" required>
                                </div>
                            </div>
                            <div id="edit-base-error" class="text-danger mt-2" style="display:none; font-size: 12px;"></div>
                        </form>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-edit-base-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('edit-base-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    const errEl = document.getElementById('edit-base-error');
    
    // Handle save button
    document.getElementById('btn-edit-base-ok').addEventListener('click', async () => {
        try {
            errEl.style.display = 'none';
            
            // Collect form data (only editable base data)
            const updatedData = {
                VName: document.getElementById('edit-vname').value.trim(),
                NName: document.getElementById('edit-nname').value.trim()
            };
            
            // Validate required fields
            if (!updatedData.VName || !updatedData.NName) {
                errEl.textContent = i18nStrings.observers.error_missing_required;
                errEl.style.display = 'block';
                return;
            }
            
            // Send to API
            const resp = await fetch(`/api/observers/${observer.KK}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                errEl.textContent = result.error;
                errEl.style.display = 'block';
                return;
            }
            
            // Success - close modal
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_updated}`);
            
            // Reload the page if we're on the observers page
            setTimeout(() => {
                if (window.location.pathname === '/observers') {
                    window.location.reload();
                }
            }, 1500);
            
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

/**
 * Observer Site Management Functions
 * Functions for adding, editing, and deleting observation sites
 */

// Add new observation site
async function showAddSiteDialog(observer) {
    
    // Generate month options
    const monthOptions = Object.keys(i18nStrings.months).map(m => {
        const monthNum = parseInt(m);
        const monthName = i18nStrings.months[m];
        return `<option value="${monthNum}">${monthName}</option>`;
    }).join('');
    
    // Generate year options (YEAR_MIN-YEAR_MAX)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
    }).join('');
    
    // Generate region options
    const regionOptions = Object.keys(i18nStrings.geographic_regions).map(regionNum => {
        const regionName = i18nStrings.geographic_regions[regionNum];
        if (regionName) {
            return `<option value="${regionNum.padStart(2, '0')}">${regionNum.padStart(2, '0')} - ${regionName}</option>`;
        }
        return '';
    }).filter(opt => opt).join('');
    
    // Generate coordinate options
    const latDegOptions = Array.from({length: 91}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const lonDegOptions = Array.from({length: 181}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const minOptions = Array.from({length: 60}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    
    const modalHtml = `
        <div class="modal fade" id="add-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_add_site}: ${observer.KK} ${observer.VName} ${observer.NName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="add-site-form">
                            <div class="row g-2">
                                <!-- Since (Month/Year) and Active -->
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_month_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="site-seit-month" required>
                                        <option value="">--</option>
                                        ${monthOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_year_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="site-seit-year" required>
                                        <option value="">--</option>
                                        ${yearOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.common.active} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="site-active" required>
                                        <option value="1">${i18nStrings.common.yes}</option>
                                        <option value="0">${i18nStrings.common.no}</option>
                                    </select>
                                </div>
                                
                                <!-- Main Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.primary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.primary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="site-hb-ort" maxlength="20" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="site-gh" required>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Main Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="site-hlg" required>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="site-hlm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="site-how" style="max-width: 70px;" required>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="site-hbg" required>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="site-hbm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="site-hns" style="max-width: 70px;" required>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <!-- Secondary Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.secondary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.secondary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="site-nb-ort" maxlength="20" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="site-gn" required>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Secondary Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="site-nlg" required>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="site-nlm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="site-now" style="max-width: 70px;" required>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="site-nbg" required>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="site-nbm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="site-nns" style="max-width: 70px;" required>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div id="site-error" class="text-danger mt-2" style="display:none; font-size: 12px;"></div>
                        </form>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-add-site-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('add-site-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    const errEl = document.getElementById('site-error');
    
    // Handle Enter key
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            document.getElementById('btn-add-site-ok').click();
        }
    });
    
    // Handle save
    document.getElementById('btn-add-site-ok').addEventListener('click', async () => {
        try {
            errEl.style.display = 'none';
            
            // Collect form data
            const siteData = {
                KK: observer.KK,
                VName: observer.VName,
                NName: observer.NName,
                seit_month: parseInt(document.getElementById('site-seit-month').value),
                seit_year: parseInt(document.getElementById('site-seit-year').value),
                active: parseInt(document.getElementById('site-active').value),
                HbOrt: document.getElementById('site-hb-ort').value.trim(),
                GH: document.getElementById('site-gh').value.padStart(2, '0'),
                HLG: parseInt(document.getElementById('site-hlg').value),
                HLM: parseInt(document.getElementById('site-hlm').value),
                HOW: document.getElementById('site-how').value,
                HBG: parseInt(document.getElementById('site-hbg').value),
                HBM: parseInt(document.getElementById('site-hbm').value),
                HNS: document.getElementById('site-hns').value,
                NbOrt: document.getElementById('site-nb-ort').value.trim(),
                GN: document.getElementById('site-gn').value.padStart(2, '0'),
                NLG: parseInt(document.getElementById('site-nlg').value),
                NLM: parseInt(document.getElementById('site-nlm').value),
                NOW: document.getElementById('site-now').value,
                NBG: parseInt(document.getElementById('site-nbg').value),
                NBM: parseInt(document.getElementById('site-nbm').value),
                NNS: document.getElementById('site-nns').value
            };
            
            // Validate
            if (!siteData.seit_month || !siteData.seit_year || !siteData.HbOrt || !siteData.GH || !siteData.NbOrt || !siteData.GN) {
                errEl.textContent = i18nStrings.observers.error_missing_required;
                errEl.style.display = 'block';
                return;
            }
            
            // Send to API
            const resp = await fetch(`/api/observers/${observer.KK}/sites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(siteData)
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                errEl.textContent = result.error;
                errEl.style.display = 'block';
                return;
            }
            
            // Success
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_site_added}`);
            
            setTimeout(() => {
                if (window.location.pathname === '/observers') {
                    window.location.reload();
                }
            }, 1500);
            
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

// Edit existing observation site
async function showEditSiteDialog(observer) {
    
    // Load all sites for this observer
    try {
        const resp = await fetch(`/api/observers/${observer.KK}/sites`);
        const data = await resp.json();
        
        if (!data.sites || data.sites.length === 0) {
            showErrorDialog(i18nStrings.observers.error_no_sites);
            return;
        }
        
        // Show first site with confirmation dialog (read-only)
        showEditSiteConfirmDialog(observer, data.sites, 0);
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

async function showEditSiteConfirmDialog(observer, sites, currentIndex) {
    const site = sites[currentIndex];
    
    // Generate month options
    const monthOptions = Object.keys(i18nStrings.months).map(m => {
        const monthNum = parseInt(m);
        const monthName = i18nStrings.months[m];
        return `<option value="${monthNum}">${monthName}</option>`;
    }).join('');
    
    // Generate year options (YEAR_MIN-YEAR_MAX)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
    }).join('');
    
    // Generate region options
    const regionOptions = Object.keys(i18nStrings.geographic_regions).map(regionNum => {
        const regionName = i18nStrings.geographic_regions[regionNum];
        if (regionName) {
            return `<option value="${regionNum.padStart(2, '0')}">${regionNum.padStart(2, '0')} - ${regionName}</option>`;
        }
        return '';
    }).filter(opt => opt).join('');
    
    // Generate coordinate options
    const latDegOptions = Array.from({length: 91}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const lonDegOptions = Array.from({length: 181}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const minOptions = Array.from({length: 60}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    
    const modalHtml = `
        <div class="modal fade" id="edit-site-confirm-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_edit_site}: ${observer.KK} ${observer.VName} ${observer.NName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-2">${i18nStrings.observers.modify_edit_question}</p>
                        <form id="edit-site-confirm-form">
                            <div class="row g-2">
                                <!-- Since (Month/Year) and Active -->
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_month_label}</label>
                                    <select class="form-select form-select-sm" id="confirm-edit-site-seit-month" disabled>
                                        <option value="">--</option>
                                        ${monthOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_year_label}</label>
                                    <select class="form-select form-select-sm" id="confirm-edit-site-seit-year" disabled>
                                        <option value="">--</option>
                                        ${yearOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.common.active}</label>
                                    <select class="form-select form-select-sm" id="confirm-edit-site-active" disabled>
                                        <option value="1">${i18nStrings.common.yes}</option>
                                        <option value="0">${i18nStrings.common.no}</option>
                                    </select>
                                </div>
                                
                                <!-- Main Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.primary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.primary_site_label}</label>
                                    <input type="text" class="form-control form-control-sm" id="confirm-edit-site-hb-ort" maxlength="20" disabled>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label}</label>
                                    <select class="form-select form-select-sm" id="confirm-edit-site-gh" disabled>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Main Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="confirm-edit-site-hlg" disabled>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="confirm-edit-site-hlm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="confirm-edit-site-how" style="max-width: 70px;" disabled>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="confirm-edit-site-hbg" disabled>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="confirm-edit-site-hbm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="confirm-edit-site-hns" style="max-width: 70px;" disabled>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <!-- Secondary Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.secondary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.secondary_site_label}</label>
                                    <input type="text" class="form-control form-control-sm" id="confirm-edit-site-nb-ort" maxlength="20" disabled>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label}</label>
                                    <select class="form-select form-select-sm" id="confirm-edit-site-gn" disabled>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Secondary Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="confirm-edit-site-nlg" disabled>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="confirm-edit-site-nlm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="confirm-edit-site-now" style="max-width: 70px;" disabled>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="confirm-edit-site-nbg" disabled>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="confirm-edit-site-nbm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="confirm-edit-site-nns" style="max-width: 70px;" disabled>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </form>
                        <p class="text-muted small mt-2">${i18nStrings.observers.delete_site_info.replace('{0}', currentIndex + 1).replace('{1}', sites.length)}</p>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-edit-site-no">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-edit-site-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('edit-site-confirm-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    // Convert 2-digit year to 4-digit year
    const yearNum = parseInt(site.seit_year);
    const fullYear = yearNum < (YEAR_MIN-1900) ? 2000 + yearNum : 1900 + yearNum;
    
    // Pre-fill form with existing values (disabled)
    document.getElementById('confirm-edit-site-seit-month').value = site.seit_month;
    document.getElementById('confirm-edit-site-seit-year').value = fullYear;
    document.getElementById('confirm-edit-site-active').value = site.active;
    document.getElementById('confirm-edit-site-hb-ort').value = site.HbOrt;
    document.getElementById('confirm-edit-site-gh').value = String(site.GH).padStart(2, '0');
    document.getElementById('confirm-edit-site-hlg').value = site.HLG;
    document.getElementById('confirm-edit-site-hlm').value = site.HLM;
    document.getElementById('confirm-edit-site-how').value = site.HOW;
    document.getElementById('confirm-edit-site-hbg').value = site.HBG;
    document.getElementById('confirm-edit-site-hbm').value = site.HBM;
    document.getElementById('confirm-edit-site-hns').value = site.HNS;
    document.getElementById('confirm-edit-site-nb-ort').value = site.NbOrt;
    document.getElementById('confirm-edit-site-gn').value = String(site.GN).padStart(2, '0');
    document.getElementById('confirm-edit-site-nlg').value = site.NLG;
    document.getElementById('confirm-edit-site-nlm').value = site.NLM;
    document.getElementById('confirm-edit-site-now').value = site.NOW;
    document.getElementById('confirm-edit-site-nbg').value = site.NBG;
    document.getElementById('confirm-edit-site-nbm').value = site.NBM;
    document.getElementById('confirm-edit-site-nns').value = site.NNS;
    
    modal.show();
    
    // Handle Enter key - same as "No" button
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-edit-site-no').click();
        }
    });
    
    // Handle "No" button - show next site or close
    document.getElementById('btn-edit-site-no').addEventListener('click', () => {
        modal.hide();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            if (currentIndex < sites.length - 1) {
                // Show next site
                showEditSiteConfirmDialog(observer, sites, currentIndex + 1);
            }
        });
    });
    
    // Handle "Yes" button - show editable form
    document.getElementById('btn-edit-site-yes').addEventListener('click', () => {
        modal.hide();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            showEditSiteFormDialog(observer, sites, currentIndex);
        });
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

async function showEditSiteFormDialog(observer, sites, currentIndex) {
    const site = sites[currentIndex];
    
    // Generate month options
    const monthOptions = Object.keys(i18nStrings.months).map(m => {
        const monthNum = parseInt(m);
        const monthName = i18nStrings.months[m];
        return `<option value="${monthNum}">${monthName}</option>`;
    }).join('');
    
    // Generate year options (YEAR_MIN-YEAR_MAX)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
    }).join('');
    
    // Generate region options
    const regionOptions = Object.keys(i18nStrings.geographic_regions).map(regionNum => {
        const regionName = i18nStrings.geographic_regions[regionNum];
        if (regionName) {
            return `<option value="${regionNum.padStart(2, '0')}">${regionNum.padStart(2, '0')} - ${regionName}</option>`;
        }
        return '';
    }).filter(opt => opt).join('');
    
    // Generate coordinate options
    const latDegOptions = Array.from({length: 91}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const lonDegOptions = Array.from({length: 181}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const minOptions = Array.from({length: 60}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    
    const modalHtml = `
        <div class="modal fade" id="edit-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_edit_site}: ${observer.KK} ${observer.VName} ${observer.NName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-site-form">
                            <div class="row g-2">
                                <!-- Since (Month/Year) and Active -->
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_month_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="edit-site-seit-month" required>
                                        <option value="">--</option>
                                        ${monthOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_year_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="edit-site-seit-year" required>
                                        <option value="">--</option>
                                        ${yearOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.common.active} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="edit-site-active" required>
                                        <option value="1">${i18nStrings.common.yes}</option>
                                        <option value="0">${i18nStrings.common.no}</option>
                                    </select>
                                </div>
                                
                                <!-- Main Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.primary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.primary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="edit-site-hb-ort" maxlength="20" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="edit-site-gh" required>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Main Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="edit-site-hlg" required>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="edit-site-hlm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="edit-site-how" style="max-width: 70px;" required>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="edit-site-hbg" required>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="edit-site-hbm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="edit-site-hns" style="max-width: 70px;" required>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <!-- Secondary Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.secondary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.secondary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="edit-site-nb-ort" maxlength="20" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="edit-site-gn" required>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Secondary Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="edit-site-nlg" required>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="edit-site-nlm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="edit-site-now" style="max-width: 70px;" required>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="edit-site-nbg" required>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="edit-site-nbm" required>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="edit-site-nns" style="max-width: 70px;" required>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div id="edit-site-error" class="text-danger mt-2" style="display:none; font-size: 12px;"></div>
                        </form>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-edit-site-ok">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('edit-site-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    // Convert 2-digit year to 4-digit year
    const yearNum = parseInt(site.seit_year);
    const fullYear = yearNum < (YEAR_MIN-1900) ? 2000 + yearNum : 1900 + yearNum;
    
    // Pad GH and GN to 2 digits for select matching
    const ghPadded = String(site.GH).padStart(2, '0');
    const gnPadded = String(site.GN).padStart(2, '0');
    
    // Pre-fill form with existing values
    document.getElementById('edit-site-seit-month').value = String(site.seit_month);
    document.getElementById('edit-site-seit-year').value = String(fullYear);
    document.getElementById('edit-site-active').value = String(site.active);
    document.getElementById('edit-site-hb-ort').value = site.HbOrt;
    document.getElementById('edit-site-gh').value = ghPadded;
    document.getElementById('edit-site-hlg').value = String(site.HLG);
    document.getElementById('edit-site-hlm').value = String(site.HLM);
    document.getElementById('edit-site-how').value = site.HOW;
    document.getElementById('edit-site-hbg').value = String(site.HBG);
    document.getElementById('edit-site-hbm').value = String(site.HBM);
    document.getElementById('edit-site-hns').value = site.HNS;
    document.getElementById('edit-site-nb-ort').value = site.NbOrt;
    document.getElementById('edit-site-gn').value = gnPadded;
    document.getElementById('edit-site-nlg').value = String(site.NLG);
    document.getElementById('edit-site-nlm').value = String(site.NLM);
    document.getElementById('edit-site-now').value = site.NOW;
    document.getElementById('edit-site-nbg').value = String(site.NBG);
    document.getElementById('edit-site-nbm').value = String(site.NBM);
    document.getElementById('edit-site-nns').value = site.NNS;
    
    modal.show();
    
    const errEl = document.getElementById('edit-site-error');
    
    // Handle Enter key
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            document.getElementById('btn-edit-site-ok').click();
        }
    });
    
    // Store original seit for identifying the record
    const originalSeit = site.seit;
    
    // Handle save
    document.getElementById('btn-edit-site-ok').addEventListener('click', async () => {
        try {
            errEl.style.display = 'none';
            
            // Collect form data
            const yearValue = parseInt(document.getElementById('edit-site-seit-year').value);
            const siteData = {
                KK: observer.KK,
                VName: observer.VName,
                NName: observer.NName,
                seit_month: parseInt(document.getElementById('edit-site-seit-month').value),
                seit_year: yearValue % 100,  // Convert 4-digit to 2-digit year
                active: parseInt(document.getElementById('edit-site-active').value),
                HbOrt: document.getElementById('edit-site-hb-ort').value.trim(),
                GH: document.getElementById('edit-site-gh').value.padStart(2, '0'),
                HLG: parseInt(document.getElementById('edit-site-hlg').value),
                HLM: parseInt(document.getElementById('edit-site-hlm').value),
                HOW: document.getElementById('edit-site-how').value,
                HBG: parseInt(document.getElementById('edit-site-hbg').value),
                HBM: parseInt(document.getElementById('edit-site-hbm').value),
                HNS: document.getElementById('edit-site-hns').value,
                NbOrt: document.getElementById('edit-site-nb-ort').value.trim(),
                GN: document.getElementById('edit-site-gn').value.padStart(2, '0'),
                NLG: parseInt(document.getElementById('edit-site-nlg').value),
                NLM: parseInt(document.getElementById('edit-site-nlm').value),
                NOW: document.getElementById('edit-site-now').value,
                NBG: parseInt(document.getElementById('edit-site-nbg').value),
                NBM: parseInt(document.getElementById('edit-site-nbm').value),
                NNS: document.getElementById('edit-site-nns').value
            };
            
            // Validate
            if (!siteData.seit_month || !siteData.seit_year || !siteData.HbOrt || !siteData.GH || !siteData.NbOrt || !siteData.GN) {
                errEl.textContent = i18nStrings.observers.error_missing_required;
                errEl.style.display = 'block';
                return;
            }
            
            // Send to API - include originalSeit in body
            const resp = await fetch(`/api/observers/${observer.KK}/sites`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...siteData, originalSeit })
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                errEl.textContent = result.error;
                errEl.style.display = 'block';
                return;
            }
            
            // Success
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_site_updated}`);
            
            setTimeout(() => {
                if (window.location.pathname === '/observers') {
                    window.location.reload();
                }
            }, 1500);
            
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

// Delete observation site
async function showDeleteSiteDialog(observer) {
    
    // Load all sites for this observer
    try {
        const resp = await fetch(`/api/observers/${observer.KK}/sites`);
        const data = await resp.json();
        
        if (!data.sites || data.sites.length === 0) {
            showErrorDialog(i18nStrings.observers.error_no_sites);
            return;
        }
        
        if (data.sites.length === 1) {
            showErrorDialog(i18nStrings.observers.error_last_site);
            return;
        }
        
        // Show first site with form dialog directly
        showDeleteSiteConfirmDialog(observer, data.sites, 0);
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

async function showDeleteSiteConfirmDialog(observer, sites, currentIndex = 0) {
    const site = sites[currentIndex];
    
    // Generate month options
    const monthOptions = Object.keys(i18nStrings.months).map(m => {
        const monthNum = parseInt(m);
        const monthName = i18nStrings.months[m];
        return `<option value="${monthNum}">${monthName}</option>`;
    }).join('');
    
    // Generate year options (YEAR_MIN-YEAR_MAX)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
    }).join('');
    
    // Generate region options
    const regionOptions = Object.keys(i18nStrings.geographic_regions).map(regionNum => {
        const regionName = i18nStrings.geographic_regions[regionNum];
        if (regionName) {
            return `<option value="${regionNum.padStart(2, '0')}">${regionNum.padStart(2, '0')} - ${regionName}</option>`;
        }
        return '';
    }).filter(opt => opt).join('');
    
    // Generate coordinate options
    const latDegOptions = Array.from({length: 91}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const lonDegOptions = Array.from({length: 181}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const minOptions = Array.from({length: 60}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    
    const modalHtml = `
        <div class="modal fade" id="delete-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_delete_site}: ${observer.KK} ${observer.VName} ${observer.NName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="delete-site-form">
                            <div class="row g-2">
                                <!-- Since (Month/Year) and Active -->
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_month_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="delete-site-seit-month" disabled>
                                        <option value="">--</option>
                                        ${monthOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_year_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="delete-site-seit-year" disabled>
                                        <option value="">--</option>
                                        ${yearOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.common.active} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="delete-site-active" disabled>
                                        <option value="1">${i18nStrings.common.yes}</option>
                                        <option value="0">${i18nStrings.common.no}</option>
                                    </select>
                                </div>
                                
                                <!-- Main Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.primary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.primary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="delete-site-hb-ort" maxlength="20" disabled>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="delete-site-gh" disabled>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Main Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="delete-site-hlg" disabled>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="delete-site-hlm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="delete-site-how" style="max-width: 70px;" disabled>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="delete-site-hbg" disabled>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="delete-site-hbm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="delete-site-hns" style="max-width: 70px;" disabled>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <!-- Secondary Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.secondary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.secondary_site_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="delete-site-nb-ort" maxlength="20" disabled>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label} <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-sm" id="delete-site-gn" disabled>
                                        <option value="">--</option>
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Secondary Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="delete-site-nlg" disabled>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="delete-site-nlm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="delete-site-now" style="max-width: 70px;" disabled>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label} <span class="text-danger">*</span></label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="delete-site-nbg" disabled>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">?</span>
                                        <select class="form-select" id="delete-site-nbm" disabled>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="delete-site-nns" style="max-width: 70px;" disabled>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-delete-site-no">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-delete-site-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('delete-site-modal');
    const modal = new bootstrap.Modal(modalEl);
    
    // Convert 2-digit year to 4-digit for display
    const yearNum = parseInt(site.seit_year);
    const fullYear = yearNum < (YEAR_MIN-1900) ? 2000 + yearNum : 1900 + yearNum;
    
    // Pre-fill form with existing values (disabled)
    document.getElementById('delete-site-seit-month').value = site.seit_month;
    document.getElementById('delete-site-seit-year').value = fullYear;
    document.getElementById('delete-site-active').value = site.active;
    document.getElementById('delete-site-hb-ort').value = site.HbOrt;
    document.getElementById('delete-site-gh').value = String(site.GH).padStart(2, '0');
    document.getElementById('delete-site-hlg').value = site.HLG;
    document.getElementById('delete-site-hlm').value = site.HLM;
    document.getElementById('delete-site-how').value = site.HOW;
    document.getElementById('delete-site-hbg').value = site.HBG;
    document.getElementById('delete-site-hbm').value = site.HBM;
    document.getElementById('delete-site-hns').value = site.HNS;
    document.getElementById('delete-site-nb-ort').value = site.NbOrt;
    document.getElementById('delete-site-gn').value = String(site.GN).padStart(2, '0');
    document.getElementById('delete-site-nlg').value = site.NLG;
    document.getElementById('delete-site-nlm').value = site.NLM;
    document.getElementById('delete-site-now').value = site.NOW;
    document.getElementById('delete-site-nbg').value = site.NBG;
    document.getElementById('delete-site-nbm').value = site.NBM;
    document.getElementById('delete-site-nns').value = site.NNS;
    
    modal.show();
    
    // Handle Enter key - same as "No" button
    modalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-delete-site-no').click();
        }
    });
    
    // Handle "No" button - show next site or close
    document.getElementById('btn-delete-site-no').addEventListener('click', () => {
        modal.hide();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            if (currentIndex < sites.length - 1) {
                // Show next site
                showDeleteSiteConfirmDialog(observer, sites, currentIndex + 1);
            }
        });
    });
    
    // Handle "Yes" button - delete the site
    document.getElementById('btn-delete-site-yes').addEventListener('click', async () => {
        try {
            const resp = await fetch(`/api/observers/${observer.KK}/sites`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seit: site.seit })
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                showErrorDialog(result.error);
                return;
            }
            
            // Success
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_site_deleted}`);
            
            setTimeout(() => {
                if (window.location.pathname === '/observers') {
                    window.location.reload();
                }
            }, 1500);
            
        } catch (e) {
            showErrorDialog(e.message);
        }
    });
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}

