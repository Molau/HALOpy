/**
 * Modular Filter Dialog Component
 * Reusable filter dialog for observations selection
 * Used by: display observations, modify observations, delete observations
 */

class FilterDialog {
    constructor() {
        this.modalElement = null;
        this.modal = null;
        this.observersData = null;
        
        // Filter state
        this.filterCriterion1 = 'none';
        this.filterValue1 = null;
        this.filterCriterion2 = 'none';
        this.filterValue2 = null;
        
        // Callbacks
        this.onApply = null;
        this.onCancel = null;
    }
    
    async initialize() {
        await this.loadObserversData();
    }
    
    async loadObserversData() {
        try {

            const response = await fetch('/api/observers');

            if (response.ok) {
                const data = await response.json();

                this.observersData = data.observers || [];

                if (this.observersData.length > 0) {

                }
            }
        } catch (error) {
            console.warn('Could not load observers:', error);
        }
    }
    
    /**
     * Show the filter dialog
     * @param {Function} onApplyCallback - Called when filters are applied (filterState) => void
     * @param {Function} onCancelCallback - Called when dialog is cancelled
     */
    async show(onApplyCallback, onCancelCallback) {
        // Wait for i18nStrings to be loaded (from main.js)
        await window.waitForI18n();
        
        this.onApply = onApplyCallback;
        this.onCancel = onCancelCallback;
        
        // Load fixed observer setting
        let fixedObserver = '';
        try {
            const configResponse = await fetch('/api/config/fixed_observer');
            const config = await configResponse.json();
            fixedObserver = config.observer || '';
        } catch (e) {
            console.error('Error loading fixed observer:', e);
        }
        
        this.createModalHTML();
        this.setupEventListeners();
        this.updateText();
        
        // Apply fixed observer if set
        if (fixedObserver) {
            const filter1Criterion = document.getElementById('filter-criterion-1');
            filter1Criterion.value = 'observer';
            filter1Criterion.disabled = true;
            
            // Trigger change to show observer dropdown
            this.handleFilter1Change();
            
            // Set and disable observer dropdown
            const filter1Select = document.getElementById('filter-1-select');
            filter1Select.value = fixedObserver;
            filter1Select.disabled = true;
        }
        
        this.modal = new bootstrap.Modal(this.modalElement, { backdrop: 'static' });
        this.modal.show();
        
        // Decision #033: Use standard keyboard handling
        const btnApply = document.getElementById('btn-apply-filter');
        setupModalKeyboard(this.modalElement, btnApply);
    }
    
    createModalHTML() {
        // Remove existing modal if any
        const existing = document.getElementById('filter-dialog');
        if (existing) {
            existing.remove();
        }
        
        const modalHtml = `
            <div class="modal fade" id="filter-dialog" tabindex="-1" aria-labelledby="filterDialogLabel">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="filterDialogLabel">${i18nStrings.filter_dialog.title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="filter-form">
                                <div class="filter-group mb-3">
                                    <label class="form-label">1. ${i18nStrings.filter_dialog.question_1}</label>
                                    <select id="filter-criterion-1" class="form-select">
                                        <option value="none">${i18nStrings.filter_dialog.no_criterion}</option>
                                        <option value="observer">${i18nStrings.common.observer}</option>
                                        <option value="region">${i18nStrings.filter_dialog.region}</option>
                                    </select>
                                    <div id="filter-1-input" style="display:none;" class="mt-2">
                                        <select id="filter-1-select" class="form-select"></select>
                                    </div>
                                </div>
                                <div class="filter-group">
                                    <label class="form-label">2. ${i18nStrings.filter_dialog.question_2}</label>
                                    <select id="filter-criterion-2" class="form-select">
                                        <option value="none">${i18nStrings.filter_dialog.no_criterion}</option>
                                        <option value="date">${i18nStrings.filter_dialog.date}</option>
                                        <option value="halo-type">${i18nStrings.filter_dialog.halo_type}</option>
                                    </select>
                                    <div id="filter-2-input" style="display:none;" class="mt-2">
                                        <div id="filter-2-date-selects" style="display:none; gap:0.5rem;">
                                            <select id="filter-2-day" class="form-select" style="flex: 1; min-width: 0;"></select>
                                            <select id="filter-2-month" class="form-select" style="flex: 1; min-width: 0;"></select>
                                            <select id="filter-2-year" class="form-select" style="flex: 1; min-width: 0;"></select>
                                        </div>
                                        <select id="filter-2-select" class="form-select" style="display:none;"></select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer py-2">
                            <button type="button" id="btn-cancel-filter" class="btn btn-secondary btn-sm px-3">${i18nStrings.common.cancel}</button>
                            <button type="button" id="btn-apply-filter" class="btn btn-primary btn-sm px-3">
                                <span id="apply-spinner" class="spinner-border spinner-border-sm me-1" role="status" style="display:none;"></span>
                                ${i18nStrings.common.ok}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modalElement = document.getElementById('filter-dialog');
    }
    
    setupEventListeners() {
        const filterCriterion1Select = document.getElementById('filter-criterion-1');
        const filterCriterion2Select = document.getElementById('filter-criterion-2');
        const filter2Value = document.getElementById('filter-2-value');
        const btnApply = document.getElementById('btn-apply-filter');
        const btnCancel = document.getElementById('btn-cancel-filter');
        
        filterCriterion1Select.addEventListener('change', () => this.handleFilter1Change());
        filterCriterion2Select.addEventListener('change', () => this.handleFilter2Change());
        
        // Enter/ESC key handling via setupModalKeyboard() in show() (Decision #033)
        
        btnApply.addEventListener('click', () => this.applyFilters());
        btnCancel.addEventListener('click', () => {
            this.modal.hide();
        });
        
        // Clean up on modal hidden (ESC, X button, Cancel button, or after Apply)
        this.modalElement.addEventListener('hidden.bs.modal', () => {
            // Call pending callback if exists (Apply was clicked)
            if (this.pendingCallback && this.onApply) {
                const callbackPromise = this.onApply(this.pendingCallback);
                this.pendingCallback = null;
                
                // If callback returns a Promise, handle errors
                if (callbackPromise && typeof callbackPromise.then === 'function') {
                    callbackPromise.catch(err => console.error('Filter callback error:', err));
                }
            } else if (this.onCancel) {
                // No pending callback = dialog was cancelled (ESC, X, Cancel button)
                this.onCancel();
            }
            
            this.modalElement.remove();
        });
    }
    
    updateText() {
        if (!i18nStrings) return;
                
        document.getElementById('filterDialogLabel').textContent = i18nStrings.filter_dialog.title;
        
        const filter1Label = document.querySelector('#filter-criterion-1').previousElementSibling;
        if (filter1Label) filter1Label.textContent = '1. ' + i18nStrings.filter_dialog.question_1;
        
        const filter1Select = document.getElementById('filter-criterion-1');
        filter1Select.options[0].textContent = i18nStrings.filter_dialog.no_criterion;
        filter1Select.options[1].textContent = i18nStrings.common.observer;
        filter1Select.options[2].textContent = i18nStrings.filter_dialog.region;
        
        const filter2Label = document.querySelector('#filter-criterion-2').previousElementSibling;
        if (filter2Label) filter2Label.textContent = '2. ' + i18nStrings.filter_dialog.question_2;
        
        const filter2Select = document.getElementById('filter-criterion-2');
        filter2Select.options[0].textContent = i18nStrings.filter_dialog.no_criterion;
        filter2Select.options[1].textContent = i18nStrings.filter_dialog.date;
        filter2Select.options[2].textContent = i18nStrings.filter_dialog.halo_type;
        
        document.getElementById('btn-cancel-filter').textContent = i18nStrings.common.cancel;
        const applyBtn = document.getElementById('btn-apply-filter');
        applyBtn.childNodes[applyBtn.childNodes.length - 1].textContent = i18nStrings.common.ok;
    }
    
    handleFilter1Change() {
        const value = document.getElementById('filter-criterion-1').value;
        const filter1Input = document.getElementById('filter-1-input');
        const filter1SelectElem = document.getElementById('filter-1-select');
        
        if (value === 'none') {
            filter1Input.style.display = 'none';
        } else if (value === 'observer') {
            filter1Input.style.display = 'block';
            filter1SelectElem.style.display = 'block';
            this.populateObserverSelect();
            setTimeout(() => filter1SelectElem.focus(), 50);
        } else if (value === 'region') {
            filter1Input.style.display = 'block';
            filter1SelectElem.style.display = 'block';
            this.populateRegionSelectForFilter1();
            setTimeout(() => filter1SelectElem.focus(), 50);
        }
    }
    
    handleFilter2Change() {
        const value = document.getElementById('filter-criterion-2').value;
        const filter2Input = document.getElementById('filter-2-input');
        const filter2DateSelects = document.getElementById('filter-2-date-selects');
        const filter2SelectElem = document.getElementById('filter-2-select');
        
        if (value === 'none') {
            filter2Input.style.display = 'none';
            filter2DateSelects.style.display = 'none';
            filter2SelectElem.style.display = 'none';
        } else if (value === 'date') {
            filter2Input.style.display = 'block';
            filter2DateSelects.style.display = 'flex';
            filter2SelectElem.style.display = 'none';
            this.populateDateSelects();
            setTimeout(() => document.getElementById('filter-2-day').focus(), 50);
        } else if (value === 'halo-type') {
            filter2Input.style.display = 'block';
            filter2DateSelects.style.display = 'none';
            filter2SelectElem.style.display = 'block';
            this.populateHaloTypeSelect();
            setTimeout(() => filter2SelectElem.focus(), 50);
        }
    }
    
    populateDateSelects() {
        // Populate day dropdown
        const daySelect = document.getElementById('filter-2-day');
        daySelect.innerHTML = '';
        
        const dayPlaceholder = document.createElement('option');
        dayPlaceholder.value = '';
        dayPlaceholder.textContent = i18nStrings.fields.any;
        daySelect.appendChild(dayPlaceholder);
        
        for (let day = 1; day <= 31; day++) {
            const option = document.createElement('option');
            option.value = String(day).padStart(2, '0');
            option.textContent = String(day).padStart(2, '0');
            daySelect.appendChild(option);
        }
        
        // Populate month dropdown
        const monthSelect = document.getElementById('filter-2-month');
        monthSelect.innerHTML = '';
        
        const monthPlaceholder = document.createElement('option');
        monthPlaceholder.value = '';
        monthPlaceholder.textContent = i18nStrings.fields.any;
        monthSelect.appendChild(monthPlaceholder);
        
        for (let month = 1; month <= 12; month++) {
            const option = document.createElement('option');
            option.value = String(month).padStart(2, '0');
            option.textContent = `${String(month).padStart(2, '0')} - ${i18nStrings.months[String(month)]}`;
            monthSelect.appendChild(option);
        }
        
        // Populate year dropdown
        const yearSelect = document.getElementById('filter-2-year');
        yearSelect.innerHTML = '';
        
        const yearPlaceholder = document.createElement('option');
        yearPlaceholder.value = '';
        yearPlaceholder.textContent = i18nStrings.fields.any;
        yearSelect.appendChild(yearPlaceholder);
        
        for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
            const option = document.createElement('option');
            const yearStr = String(year);
            option.value = yearStr.substring(2); // 2-digit year
            option.textContent = yearStr; // Display full 4-digit year
            yearSelect.appendChild(option);
        }
    }
    
    populateObserverSelect() {
        const filter1SelectElem = document.getElementById('filter-1-select');
        filter1SelectElem.innerHTML = '';
        
        let observers = [];
        
        if (this.observersData && Array.isArray(this.observersData)) {

            observers = this.observersData.map(obs => {

                return {
                    kk: parseInt(obs.KK || obs.kk),
                    name: `${obs.VName || ''} ${obs.NName || ''}`.trim()
                };
            }).sort((a,b) => a.kk - b.kk);
        } else if (window.haloData && window.haloData.observers) {

            observers = window.haloData.observers.map(obs => ({
                kk: parseInt(obs.KK || obs.kk),
                name: `${obs.VName || ''} ${obs.NName || ''}`.trim()
            })).sort((a,b) => a.kk - b.kk);
        } else {

        }
        
        observers.forEach(obs => {
            const option = document.createElement('option');
            option.value = obs.kk;
            option.textContent = `${String(obs.kk).padStart(2, '0')} - ${obs.name}`;
            filter1SelectElem.appendChild(option);
        });
    }
    
    populateRegionSelectForFilter1() {
        const filter1SelectElem = document.getElementById('filter-1-select');
        filter1SelectElem.innerHTML = '';
        
        for (let i = 1; i <= 39; i++) {
            const regionName = i18nStrings.geographic_regions[String(i)];
            if (regionName && regionName.trim()) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${String(i).padStart(2, '0')} - ${regionName}`;
                filter1SelectElem.appendChild(option);
            }
        }
    }
    
    populateHaloTypeSelect() {
        const filter2SelectElem = document.getElementById('filter-2-select');
        filter2SelectElem.innerHTML = '';
        
        for (let i = 1; i <= 99; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${String(i).padStart(2, '0')} - ${i18nStrings.halo_types[i] || i18nStrings.common.unknown}`;
            filter2SelectElem.appendChild(option);
        }
    }
    
    applyFilters() {
        const filterCriterion1Select = document.getElementById('filter-criterion-1');
        const filterCriterion2Select = document.getElementById('filter-criterion-2');
        const filter1SelectElem = document.getElementById('filter-1-select');
        const filter2SelectElem = document.getElementById('filter-2-select');
        
        this.filterCriterion1 = filterCriterion1Select.value;
        this.filterCriterion2 = filterCriterion2Select.value;
        
        // Validate filter 1
        if (this.filterCriterion1 !== 'none') {
            if (!filter1SelectElem.value || filter1SelectElem.value === '') {
                this.showWarning(i18nStrings.messages.filter_value_required);
                return;
            }
        }
        
        // Validate filter 2
        if (this.filterCriterion2 !== 'none') {
            if (this.filterCriterion2 === 'date') {
                // For date, at least one field must be selected
                const dayValue = document.getElementById('filter-2-day').value;
                const monthValue = document.getElementById('filter-2-month').value;
                const yearValue = document.getElementById('filter-2-year').value;
                
                if (!dayValue && !monthValue && !yearValue) {
                    this.showWarning(i18nStrings.messages.filter_value_required);
                    return;
                }
            } else if (this.filterCriterion2 === 'halo-type') {
                if (!filter2SelectElem.value || filter2SelectElem.value === '') {
                    this.showWarning(i18nStrings.messages.filter_value_required);
                    return;
                }
            }
        }
        
        // Get filter values
        if (this.filterCriterion1 === 'observer') {
            this.filterValue1 = parseInt(filter1SelectElem.value) || null;
        } else if (this.filterCriterion1 === 'region') {
            this.filterValue1 = parseInt(filter1SelectElem.value) || null;
        } else {
            this.filterValue1 = null;
        }
        
        if (this.filterCriterion2 === 'date') {
            // Read all three date fields
            const dayValue = document.getElementById('filter-2-day').value;
            const monthValue = document.getElementById('filter-2-month').value;
            const yearValue = document.getElementById('filter-2-year').value;
            
            this.filterValue2 = {
                t: dayValue ? parseInt(dayValue) : null,
                m: monthValue ? parseInt(monthValue) : null,
                j: yearValue ? parseInt(yearValue) : null
            };
        } else if (this.filterCriterion2 === 'halo-type') {
            this.filterValue2 = parseInt(filter2SelectElem.value) || null;
        } else {
            this.filterValue2 = null;
        }
        
        // Store callback info for execution after modal is hidden
        this.pendingCallback = {
            criterion1: this.filterCriterion1,
            value1: this.filterValue1,
            criterion2: this.filterCriterion2,
            value2: this.filterValue2
        };
        
        // Hide modal - callback will be called in hidden.bs.modal handler
        this.modal.hide();
    }
    
    showWarning(message) {
        showNotification(message, 'warning', 5000);
    }
}

// Make it globally available
window.FilterDialog = FilterDialog;
