/**
 * Observer display and filter functionality
 */

let allObservers = [];
let filteredObservers = [];
let observersList = [];
let regionsList = [];
let currentPage = 1;
let filterApplied = false; // Flag to distinguish Apply from Cancel/X/ESC
const pageSize = 50;  // Show 50 observers per page

// Show filter dialog on page load
document.addEventListener('DOMContentLoaded', () => {
    (async () => {
        await window.waitForI18n();
        await loadDropdownData();
        showFilterDialog();
    })();
    
    // Set up event listeners
    document.getElementById('filter-type').addEventListener('change', handleFilterTypeChange);
    document.getElementById('apply-filter').addEventListener('click', applyFilter);
    document.getElementById('cancel-filter').addEventListener('click', () => {
        const m = bootstrap.Modal.getInstance(document.getElementById('filter-dialog'));
        if (m) m.hide();
    });
    
    // Decision #034: Filter value change listeners for OK button state
    document.getElementById('filter-select-kk').addEventListener('change', updateFilterOkState);
    document.getElementById('filter-input-site').addEventListener('input', updateFilterOkState);
    document.getElementById('filter-select-region').addEventListener('change', updateFilterOkState);
    
    // Pagination event listeners
    document.getElementById('btn-first-page').addEventListener('click', () => goToPage(1));
    document.getElementById('btn-prev-page').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('btn-next-page').addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('btn-last-page').addEventListener('click', () => {
        const maxPage = Math.ceil(filteredObservers.length / pageSize);
        goToPage(maxPage);
    });
    
    // ESC key to return to main menu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Check if any modal is currently shown
            const openModals = document.querySelectorAll('.modal.show');
            if (openModals.length === 0) {
                // No modals open - exit to main page
                e.preventDefault();
                e.stopPropagation();
                window.navigateInternal('/');
            }
            // If modal is open, let Bootstrap handle ESC to close it
        }
    });
});

/**
 * Load dropdown data for filters
 */
async function loadDropdownData() {
    try {
        // Load observers list
        const obsResponse = await fetch('/api/observers/list');
        const obsData = await obsResponse.json();
        observersList = obsData.observers;
        
        // Load regions list
        const regResponse = await fetch('/api/observers/regions');
        const regData = await regResponse.json();
        regionsList = regData.regions;
        
        populateDropdowns();
    } catch (error) {
        console.error('Error loading dropdown data:', error);
    }
}

/**
 * Populate dropdown menus with data
 */
function populateDropdowns() {
    // Populate observers dropdown
    const kkSelect = document.getElementById('filter-select-kk');
    kkSelect.innerHTML = `<option value="">${i18nStrings.messages.select_prompt}</option>`;
    observersList.forEach(obs => {
        // Skip observers with missing data
        if (!obs.KK || !obs.VName || !obs.NName) {
            return;
        }
        const option = document.createElement('option');
        option.value = obs.KK;
        option.textContent = `${obs.KK} - ${obs.VName} ${obs.NName}`.trim();
        kkSelect.appendChild(option);
    });
    
    // Populate regions dropdown
    const regionSelect = document.getElementById('filter-select-region');
    regionSelect.innerHTML = `<option value="">${i18nStrings.messages.select_prompt}</option>`;
    regionsList.forEach(region => {
        const option = document.createElement('option');
        option.value = region.number;
        option.textContent = `GG ${region.number} - ${region.name}`;
        regionSelect.appendChild(option);
    });
}

/**
 * Show filter dialog
 */
async function showFilterDialog() {
    // Load fixed observer setting
    let fixedObserver = '';
    try {
        const configResponse = await fetch('/api/config/setting?key=FIXED_OBSERVER');
        const config = await configResponse.json();
        fixedObserver = config.value || '';
    } catch (e) {
        console.error('Error loading fixed observer:', e);
    }
    
    const filterDialogEl = document.getElementById('filter-dialog');
    const modal = new bootstrap.Modal(filterDialogEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup
    setupModalKeyboard(filterDialogEl, document.getElementById('apply-filter'));

    // Navigate home when filter dialog is dismissed (X, Cancel, ESC)
    // but not when filter was applied successfully
    filterDialogEl.addEventListener('hidden.bs.modal', () => {
        if (!filterApplied) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(filterDialogEl);
    
    const filterTypeSelect = document.getElementById('filter-type');
    const kkSelect = document.getElementById('filter-select-kk');
    const applyFilterBtn = document.getElementById('apply-filter');
    
    // If fixed observer is set, pre-select and disable (in Cloud Mode: allow changing)
    if (fixedObserver) {
        // Set filter type to KK
        filterTypeSelect.value = 'kk';
        // In Cloud Mode: pre-select but allow changing observer
        filterTypeSelect.disabled = !window.isCloudMode;
        
        // Show KK dropdown
        handleFilterTypeChange();
        
        // Set observer value (disable only in Local Mode)
        kkSelect.value = fixedObserver;
        kkSelect.disabled = !window.isCloudMode;
    } else {
        // Reset filter
        filterTypeSelect.value = 'none';
        filterTypeSelect.disabled = false;
        kkSelect.disabled = false;
        handleFilterTypeChange();
    }
    
    // Decision #034: OK disabled until filter value selected (when filter type requires it)
    updateFilterOkState();
}

/**
 * Handle filter type change
 */
function handleFilterTypeChange() {
    const filterType = document.getElementById('filter-type').value;
    const filterInput = document.getElementById('filter-input');
    const kkSelect = document.getElementById('filter-select-kk');
    const siteInput = document.getElementById('filter-input-site');
    const regionSelect = document.getElementById('filter-select-region');
    
    // Hide all inputs
    kkSelect.style.display = 'none';
    siteInput.style.display = 'none';
    regionSelect.style.display = 'none';
    
    if (filterType === 'none') {
        filterInput.style.display = 'none';
    } else {
        filterInput.style.display = 'block';
        
        if (filterType === 'kk') {
            kkSelect.style.display = 'block';
        } else if (filterType === 'site') {
            siteInput.style.display = 'block';
        } else if (filterType === 'region') {
            regionSelect.style.display = 'block';
        }
    }
    
    // Decision #034: Update OK button state when filter type changes
    updateFilterOkState();
}

/**
 * Decision #034: OK disabled until filter value is selected (when filter type requires it)
 */
function updateFilterOkState() {
    const filterType = document.getElementById('filter-type').value;
    const applyFilterBtn = document.getElementById('apply-filter');
    
    if (filterType === 'none') {
        applyFilterBtn.disabled = false;
        return;
    }
    
    let hasValue = false;
    if (filterType === 'kk') {
        hasValue = !!document.getElementById('filter-select-kk').value;
    } else if (filterType === 'site') {
        hasValue = !!document.getElementById('filter-input-site').value.trim();
    } else if (filterType === 'region') {
        hasValue = !!document.getElementById('filter-select-region').value;
    }
    
    applyFilterBtn.disabled = !hasValue;
}

/**
 * Apply filter and load observers
 */
async function applyFilter() {
    const filterType = document.getElementById('filter-type').value;
    let filterValue = '';
    
    if (filterType === 'kk') {
        filterValue = document.getElementById('filter-select-kk').value;
    } else if (filterType === 'site') {
        filterValue = document.getElementById('filter-input-site').value.trim();
    } else if (filterType === 'region') {
        filterValue = document.getElementById('filter-select-region').value;
    }
    
    // Validate
    if (filterType !== 'none' && !filterValue) {
        showWarning(i18nStrings.observers.warning_select_value);
        return;
    }
    
    // Get latest-only checkbox state
    const latestOnly = document.getElementById('show-latest-only').checked;
    
    // Close dialog
    filterApplied = true;
    const modal = bootstrap.Modal.getInstance(document.getElementById('filter-dialog'));
    document.activeElement?.blur();
    modal.hide();
    
    // Load observers
    await loadObservers(filterType, filterValue, latestOnly);
}

/**
 * Load observers with filter
 */
async function loadObservers(filterType, filterValue, latestOnly) {
    try {
        const url = `/api/observers?filter_type=${filterType}&filter_value=${encodeURIComponent(filterValue)}&latest_only=${latestOnly}`;
        const response = await fetch(url);
        const data = await response.json();
        
        filteredObservers = data.observers;
        currentPage = 1;  // Reset to first page
        displayObservers();

    } catch (error) {
        console.error('Error loading observers:', error);
        showWarning(i18nStrings.observers.loading_error);
    }
}

/**
 * Go to specific page
 */
function goToPage(page) {
    const maxPage = Math.ceil(filteredObservers.length / pageSize);
    if (page < 1 || page > maxPage) return;
    
    currentPage = page;
    displayObservers();
}

/**
 * Display observers in modal table
 */
function displayObservers() {
    if (filteredObservers.length === 0) {
        showWarningModal(i18nStrings.messages.no_observers);
        return;
    }
        
    // Build table rows
    let rows = '';
    filteredObservers.forEach(obs => {
        // Format coordinates
        const hCoords = `${obs.HLG}° ${obs.HLM}' ${obs.HOW} / ${obs.HBG}° ${obs.HBM}' ${obs.HNS}`;
        const nCoords = `${obs.NLG}° ${obs.NLM}' ${obs.NOW} / ${obs.NBG}° ${obs.NBM}' ${obs.NNS}`;
        
        // Format GG with two digits
        const ghFormatted = String(obs.GH).padStart(2, '0');
        const gnFormatted = String(obs.GN).padStart(2, '0');
        
        rows += `
            <tr>
                <td>${obs.KK}</td>
                <td>${escapeHtml(obs.VName)} ${escapeHtml(obs.NName)}</td>
                <td>${obs.seit}</td>
                <td>${obs.aktiv === '1' ? i18nStrings.common.yes : i18nStrings.common.no}</td>
                <td>${escapeHtml(obs.HbOrt)}</td>
                <td>${ghFormatted}</td>
                <td style="font-size: 0.9em;">${hCoords}</td>
                <td>${escapeHtml(obs.NbOrt)}</td>
                <td>${gnFormatted}</td>
                <td style="font-size: 0.9em;">${nCoords}</td>
            </tr>
        `;
    });
    
    const modalHtml = `
        <div class="modal fade" id="observers-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-xl">
                <div class="modal-content">
                    <div class="modal-header py-1">
                        <h6 class="modal-title mb-0">${(i18nStrings.observers.title)} (${filteredObservers.length})</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body py-2" style="max-height: 70vh; overflow-y: auto;">
                        <table class="table table-sm table-hover table-striped">
                            <thead class="table-light sticky-top">
                                <tr>
                                    <th>KK</th>
                                    <th>${(i18nStrings.observers.name_label)}</th>
                                    <th>${(i18nStrings.observers.since_label)}</th>
                                    <th>${(i18nStrings.common.active)}</th>
                                    <th>${(i18nStrings.observers.primary_site_label)}</th>
                                    <th>GH</th>
                                    <th>${(i18nStrings.observers.coordinates_label)}</th>
                                    <th>${(i18nStrings.observers.secondary_site_label)}</th>
                                    <th>GN</th>
                                    <th>${(i18nStrings.observers.coordinates_label)}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-primary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove any existing modal
    const existingModal = document.getElementById('observers-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to document
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modalEl = document.getElementById('observers-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup
    setupModalKeyboard(modalEl, modalEl.querySelector('.btn-primary'));
    setupModalCleanup(modalEl);
    
    // Return to main page after modal is closed
    modalEl.addEventListener('hidden.bs.modal', () => {
        window.navigateInternal('/');
    }, { once: true });
}

/**
 * Show warning message
 */
function showWarning(message) {
    const alertHtml = `
        <div class="alert alert-warning alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle-fill"></i> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    const container = document.querySelector('.modal-body');
    const existing = container.querySelector('.alert');
    if (existing) existing.remove();
    
    container.insertAdjacentHTML('afterbegin', alertHtml);
    
    setTimeout(() => {
        const alert = container.querySelector('.alert');
        if (alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }
    }, 5000);
}
