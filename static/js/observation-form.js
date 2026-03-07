/**
 * Modular Observation Form Component (Menüeingabe)
 * Reusable observation form for add and modify operations
 */

class ObservationForm {
    constructor() {
        this.modalElement = null;
        this.modal = null;
        this.observers = [];
        this.fixedObserver = '';
        this.fields = {};
        this.onSave = null;
        this.onCancel = null;
        this.mode = 'add'; // 'add' or 'edit'
        this.originalObservation = null;
        this.saved = false;
        this.skipped = false;
        this.destroyed = false; // Track if form has been destroyed
        // Field constraints: Store current valid value ranges for dependent fields
        this.fieldConstraints = {
            d: [],      // Valid values for cirrus density
            n: [],      // Valid values for cloud cover
            C: [],      // Valid values for cirrus cover (upper)
            c: [],      // Valid values for cirrus cover (lower)
            g: [],      // Valid values for observing site
            GG: null,   // Current observing site code (single value)
            TT: [],     // Valid values for day
            HO: [],     // Valid values for upper light pillar
            HU: [],     // Valid values for lower light pillar
            sectors: [] // Valid state for sectors (empty array = inactive, ['any'] = active)
        };
    }
    
    async initialize(mode = 'add') {
        await this.loadObservers();
        await this.loadFixedObserver();
        // Only load dateDefault for 'add' mode (not needed for edit/delete/view)
        if (mode === 'add') {
            await this.loadDateDefault();
        }
    }
    
    async loadObservers() {
        try {
            const data = await loadObserverCodes();
            this.observers = data.observers;
        } catch (e) {
            console.error('Error loading observers:', e);
        }
    }
    
    async loadFixedObserver() {
        try {
            const response = await fetch('/api/config/fixed_observer');
            const config = await response.json();
            this.fixedObserver = config.observer || '';
        } catch (e) {
            // Silently ignore - error can occur when multiple forms are created rapidly
            // This is not a critical error, just means fixed observer won't be enforced
        }
    }
    
    async loadDateDefault() {
        try {
            // Use the helper function from main.js
            const dateDefault = await getDateDefault();
            if (dateDefault) {
                this.dateDefault = dateDefault;
            }
        } catch (e) {
            // Silently ignore - dateDefault only needed for 'add' mode
            // Error can occur when previous modal is still cleaning up
        }
    }
    
    /**
     * Show the observation form
     * @param {string} mode - 'add', 'edit', 'delete', or 'view'
     * @param {object|null} observation - Existing observation data for edit/delete/view mode
     * @param {function} onSaveCallback - Called when observation is saved (add/edit) or null for delete/view
     * @param {function} onCancelCallback - Called when form is cancelled/skipped or null for delete/view
     * @param {number} currentNum - Current observation number (for edit/delete/view mode)
     * @param {number} totalNum - Total observations (for edit/delete/view mode)
     * @param {string} customTitle - Custom title for delete mode
     * @param {function} onYes - Called when Yes is clicked (delete mode) or Next (view mode)
     * @param {function} onNo - Called when No is clicked (delete mode) or Previous (view mode)
     * @param {function} onCancelBtn - Called when Cancel is clicked (delete/view mode)
     */
    show(mode, observation, onSaveCallback, onCancelCallback, currentNum = null, totalNum = null, customTitle = null, onYes = null, onNo = null, onCancelBtn = null) {
        this.mode = mode;
        this.originalObservation = observation;
        this.onSave = onSaveCallback;
        this.onCancel = onCancelCallback;
        this.currentNum = currentNum;
        this.totalNum = totalNum;
        this.customTitle = customTitle;
        this.onYes = onYes;
        this.onNo = onNo;
        this.onCancelBtn = onCancelBtn;
        this.isEditingMode = false; // Track if user has entered editing mode
        this.navigating = false; // Track if user is navigating (Next/Prev in view mode)
        this.noButtonPressed = false; // Track if No button was pressed (delete mode)
        this.saved = false; // Reset for reuse
        this.skipped = false; // Reset for reuse
        this.destroyed = false; // Reset for reuse (may have been set by previous hidden.bs.modal)
        
        this.createModalHTML();
        this.setupEventListeners();
        
        if ((mode === 'edit' || mode === 'delete' || mode === 'view') && observation) {
            this.populateFields(observation);
            // In edit/delete/view mode: Don't apply dependencies - just display the existing values
            setTimeout(() => {
                // ONLY disable all fields in edit/delete/view mode - user must click "Yes" to edit
                this.disableAllFields();
            }, 0);
        } else if (mode === 'add') {
            // Pre-fill fields for new observations
            setTimeout(() => {
                // Pre-fill date fields
                if (this.dateDefault) {
                    if (this.fields.mm) {
                        // Convert "01" to 1 for dropdown value matching
                        this.fields.mm.value = parseInt(this.dateDefault.mm, 10);
                    }
                    if (this.fields.jj) {
                        this.fields.jj.value = this.dateDefault.jj;
                    }
                }
                
                // Pre-fill fixed observer if set
                if (this.fixedObserver && this.fields.kk) {
                    this.fields.kk.value = this.fixedObserver;
                }
                
                // Apply initial dependencies for pre-filled values
                // O-Trigger: sets d, and cascades to N, C, c
                this.manageFieldDependencies('o');
                // KK/MM/JJ-Trigger: sets g, cascades to GG
                this.manageFieldDependencies('kk');
                this.manageFieldDependencies('mm');
                // EE-Trigger: sets HO, HU, sectors
                this.manageFieldDependencies('ee');
            }, 0);
        }
        
        this.modal = new bootstrap.Modal(this.modalElement, { backdrop: 'static' });
        this.modal.show();
        
        // Decision #033: consistent Enter key handling via setupModalKeyboard()
        // Determine which button Enter should trigger based on mode
        let confirmBtn = null;
        if (this.mode === 'view') {
            confirmBtn = document.getElementById('btn-obs-form-next');
        } else if (this.mode === 'delete') {
            // Delete mode: Enter triggers Cancel (the primary/default button)
            confirmBtn = document.getElementById('btn-obs-form-cancel');
        } else if (this.mode === 'edit') {
            // Edit mode: Enter triggers Yes (confirm modification)
            confirmBtn = document.getElementById('btn-obs-form-yes');
        } else if (this.mode === 'add') {
            confirmBtn = document.getElementById('btn-obs-form-ok');
        }
        setupModalKeyboard(this.modalElement, confirmBtn);
    }
    
    /**
     * Helper method to hide the modal without aria-hidden warnings
     * Removes focus from any focused element inside the modal before hiding
     */
    hideModal() {
        // Remove focus from any element inside the modal to prevent aria-hidden warnings
        if (document.activeElement && this.modalElement.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        this.modal.hide();
    }
    
    createModalHTML() {

        
        // Remove existing modal if any
        const existing = document.getElementById('observation-form-modal');
        if (existing) {
            existing.remove();
        }
        
        let title;
        if (this.customTitle) {
            title = this.customTitle;
        } else if (this.mode === 'edit') {
            title = i18nStrings.observations.modify_question;
        } else if (this.mode === 'delete') {
            title = i18nStrings.observations.delete_question;
        } else if (this.mode === 'view') {
            title = i18nStrings.observations.display_title;
        } else {
            title = i18nStrings.observations.add_observation;
        }
        
        const titleWithCounter = (this.mode === 'edit' || this.mode === 'delete' || this.mode === 'view') && this.currentNum && this.totalNum
            ? `${title} (${this.currentNum}/${this.totalNum})`
            : title;
        
        // Build observer options
        const observerOptions = this.observers.map(obs => {
            const selected = obs.KK === this.fixedObserver ? 'selected' : '';
            return `<option value="${obs.KK}" ${selected}>${obs.KK} - ${escapeHtml(obs.VName || '')} ${escapeHtml(obs.NName || '')}</option>`;
        }).join('');
        
        // Build year options (4-digit: 1980-2079)
        const yearOptions = Array.from({length: YEAR_MAX - YEAR_MIN + 1}, (_, i) => {
            const year = YEAR_MIN + i;
            return `<option value="${year}">${year}</option>`;
        }).join('');
        
        const modalHtml = `
            <div class="modal fade" id="observation-form-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div class="modal-header py-1">
                            <h6 class="modal-title">${titleWithCounter}</h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body py-2">
                            <div class="row g-2">
                                ${this.buildFormFields(observerOptions, yearOptions)}
                            </div>
                            <div class="alert alert-danger mt-2" id="obs-form-error" style="display:none;"></div>
                        </div>
                        <div class="modal-footer py-1">
                            ${this.mode === 'view' ? `
                                <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-obs-form-prev" ${this.currentNum === 1 ? 'disabled' : ''}>${i18nStrings.common.previous}</button>
                                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-obs-form-next" ${this.currentNum === this.totalNum ? 'disabled' : ''}>${i18nStrings.common.next}</button>
                            ` : ''}
                            ${this.mode === 'edit' ? `
                                <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-obs-form-prev" ${this.currentNum === 1 ? 'disabled' : ''}>${i18nStrings.common.previous}</button>
                                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                                <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-obs-form-next" ${this.currentNum === this.totalNum ? 'disabled' : ''}>${i18nStrings.common.next}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-obs-form-yes">${i18nStrings.common.yes}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-obs-form-ok" style="display:none;" disabled>${i18nStrings.common.ok}</button>
                            ` : ''}
                            ${this.mode === 'delete' ? `
                                <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-obs-form-prev" ${this.currentNum === 1 ? 'disabled' : ''}>${i18nStrings.common.previous}</button>
                                <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-obs-form-next" ${this.currentNum === this.totalNum ? 'disabled' : ''}>${i18nStrings.common.next}</button>
                                <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-obs-form-yes">${i18nStrings.common.yes}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-obs-form-cancel" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-obs-form-ok" style="display:none;" disabled>${i18nStrings.common.ok}</button>
                            ` : ''}
                            ${this.mode === 'add' ? `
                                <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-obs-form-ok" disabled>${i18nStrings.common.ok}</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modalElement = document.getElementById('observation-form-modal');
    }
    
    buildFormFields(observerOptions, yearOptions) {
        const kkDisabled = this.fixedObserver ? 'disabled' : '';
        return `
            <div class="col-md-6">
                <label class="form-label">KK - ${i18nStrings.fields.observer} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-kk" ${kkDisabled} required>
                    <option value="">${i18nStrings.fields.select}</option>
                    ${observerOptions}
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label">O - ${i18nStrings.fields.object} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-o" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    <option value="1">1 - ${i18nStrings.object_types['1']}</option>
                    <option value="2">2 - ${i18nStrings.object_types['2']}</option>
                    <option value="3">3 - ${i18nStrings.object_types['3']}</option>
                    <option value="4">4 - ${i18nStrings.object_types['4']}</option>
                    <option value="5">5 - ${i18nStrings.object_types['5']}</option>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">JJ - ${i18nStrings.fields.year} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-jj" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    ${yearOptions}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">MM - ${i18nStrings.fields.month} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-mm" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 12}, (_, i) => {
                        const monthNum = i + 1;
                        const monthName = i18nStrings.months[monthNum];
                        return `<option value="${monthNum}">${String(monthNum).padStart(2, '0')} - ${monthName}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">TT - ${this.buildConstraintIndicator(i18nStrings.fields.day, 'MM', 'TT')} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-tt" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 31}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">g - ${this.buildConstraintIndicator(i18nStrings.fields.observing_area, ['KK', 'MM', 'JJ'], 'g')} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-g" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    <option value="0">0 - ${i18nStrings.location_types['0']}</option>
                    <option value="1">1 - ${i18nStrings.location_types['1']}</option>
                    <option value="2">2 - ${i18nStrings.location_types['2']}</option>
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label">ZS - ${i18nStrings.fields.hour}</label>
                <select class="form-select form-select-sm" id="form-zs">
                    <option value="">--</option>
                    ${Array.from({length: 24}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label">ZM - ${i18nStrings.fields.minute}</label>
                <select class="form-select form-select-sm" id="form-zm">
                    <option value="">--</option>
                    ${Array.from({length: 60}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">d - ${this.buildConstraintIndicator(i18nStrings.fields.cirrus_density, 'O', 'd')}</label>
                <select class="form-select form-select-sm" id="form-d">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    <option value="0">0 - ${i18nStrings.cirrus_density['0']}</option>
                    <option value="1">1 - ${i18nStrings.cirrus_density['1'] }</option>
                    <option value="2">2 - ${i18nStrings.cirrus_density['2']}</option>
                    <option value="4">4 - ${i18nStrings.cirrus_density['4']}</option>
                    <option value="5">5 - ${i18nStrings.cirrus_density['5']}</option>
                    <option value="6">6 - ${i18nStrings.cirrus_density['6']}</option>
                    <option value="7">7 - ${i18nStrings.cirrus_density['7']}</option>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">DD - ${i18nStrings.fields.duration}</label>
                <select class="form-select form-select-sm" id="form-dd">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 100}, (_, i) => `<option value="${i}">${i * 10} min</option>`).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">N - ${this.buildConstraintIndicator(i18nStrings.fields.cloud_cover, 'd', 'n')}</label>
                <select class="form-select form-select-sm" id="form-n">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 10}, (_, i) => {
                        const label = i18nStrings.cloud_cover[i.toString()];
                        return `<option value="${i}">${i} - ${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">C - ${this.buildConstraintIndicator(i18nStrings.fields.cirrus_type, 'N', 'C')}</label>
                <select class="form-select form-select-sm" id="form-C">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 8}, (_, i) => {
                        const label = i18nStrings.cirrus_types[i.toString()];
                        return `<option value="${i}">${i} - ${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">c - ${this.buildConstraintIndicator(i18nStrings.fields.low_clouds, 'N', 'c')}</label>
                <select class="form-select form-select-sm" id="form-c">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 10}, (_, i) => {
                        const label = i18nStrings.low_clouds[i.toString()];
                        return `<option value="${i}">${i} - ${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">EE - ${i18nStrings.fields.phenomenon} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-ee" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    ${this.buildHaloTypeOptions()}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">H - ${i18nStrings.fields.brightness}</label>
                <select class="form-select form-select-sm" id="form-h">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 4}, (_, i) => {
                        const label = i18nStrings.brightness[i.toString()];
                        return `<option value="${i}">${i} - ${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">F - ${i18nStrings.fields.color}</label>
                <select class="form-select form-select-sm" id="form-F">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 6}, (_, i) => {
                        const label = i18nStrings.color[i.toString()];
                        return `<option value="${i}">${i} - ${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">V - ${i18nStrings.fields.completeness}</label>
                <select class="form-select form-select-sm" id="form-v">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    <option value="1">1 - ${i18nStrings.completeness['1']}</option>
                    <option value="2">2 - ${i18nStrings.completeness['2']}</option>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">f - ${i18nStrings.fields.weather_front}</label>
                <select class="form-select form-select-sm" id="form-weather_front">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 9}, (_, i) => {
                        const label = i18nStrings.weather_front[i.toString()];
                        return `<option value="${i}">${i} - ${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">zz - ${i18nStrings.fields.precipitation}</label>
                <select class="form-select form-select-sm" id="form-zz">
                    <option value="-1">${i18nStrings.fields.select}</option>
                    ${Array.from({length: 99}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
                    <option value="99">99</option>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">GG - ${this.buildConstraintIndicator(i18nStrings.fields.region, 'g', 'GG')} <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="form-gg" required>
                    <option value="">${i18nStrings.fields.select}</option>
                    ${this.buildRegionOptions()}
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label">8HHHH</label>
                <div class="row g-1">
                    <div class="col-6">
                        <label class="form-label small">HO - ${this.buildConstraintIndicator(i18nStrings.fields.ho, 'EE', 'HO')}</label>
                        <select class="form-select form-select-sm" id="form-ho">
                            <option value="-1">${i18nStrings.fields.select}</option>
                            <option value="0">//</option>
                            ${Array.from({length: 90}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label small">HU - ${this.buildConstraintIndicator(i18nStrings.fields.hu, 'EE', 'HU')}</label>
                        <select class="form-select form-select-sm" id="form-hu">
                            <option value="-1">${i18nStrings.fields.select}</option>
                            <option value="0">//</option>
                            ${Array.from({length: 90}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            <div class="col-12">
                <label class="form-label">${this.buildConstraintIndicator(i18nStrings.fields.sectors, ['EE', 'V'], 'sectors')}</label>
                <input type="text" class="form-control form-control-sm" id="form-sectors" maxlength="15">
            </div>
            <div class="col-12">
                <label class="form-label">${i18nStrings.observations.attributes_label}</label>
                <div class="row">
                    <div class="col-12">
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" id="form-attr-star">
                            <label class="form-check-label" for="form-attr-star">${i18nStrings.observations.attribute_star}</label>
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" id="form-attr-ka">
                            <label class="form-check-label" for="form-attr-ka">${i18nStrings.observations.attribute_ka}</label>
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" id="form-attr-ke">
                            <label class="form-check-label" for="form-attr-ke">${i18nStrings.observations.attribute_ke}</label>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" id="form-attr-ub">
                            <label class="form-check-label" for="form-attr-ub">${i18nStrings.observations.attribute_ub}</label>
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" id="form-attr-uh">
                            <label class="form-check-label" for="form-attr-uh">${i18nStrings.observations.attribute_uh}</label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-12">
                <label class="form-label">${i18nStrings.fields.remarks}</label>
                <input type="text" class="form-control form-control-sm" id="form-remarks" maxlength="60">
            </div>
        `;
    }
    
    buildHaloTypeOptions() {
        let html = '';
        for (let i = 1; i <= 77; i++) {
            const label = i18nStrings.halo_types[i.toString()];
            html += `<option value="${i}">${String(i).padStart(2, '0')} - ${label}</option>`;
        }
        html += `<option value="99">99 - ${i18nStrings.halo_types['99']}</option>`;
        return html;
    }
    
    buildRegionOptions() {
        return GEOGRAPHIC_REGIONS.map(gg => {
            const label = i18nStrings.geographic_regions[gg.toString()];
            return `<option value="${gg}">${String(gg).padStart(2, '0')} - ${label}</option>`;
        }).join('');
    }

    /**
     * Build constraint indicator HTML for a field that might be restricted
     * Wraps the field label in a span that becomes italic when constrained
     * @param {string} fieldLabel - The label text to display (e.g., "Himmelsbedeckung")
     * @param {string|Array} triggerFields - The trigger field(s) that constrain this field
     * @param {string} fieldKey - Internal field key for constraint tracking (d, n, C, c, g, gg, tt, ho, hu, sectors)
     * @returns {string} - HTML string with constraint indicator and tooltip
     */
    buildConstraintIndicator(fieldLabel, triggerFields, fieldKey = '') {
        // Fail fast if required i18n data is missing (Decision #015)
        if (!triggerFields) {
            console.error('buildConstraintIndicator: triggerFields missing for field:', fieldKey);
            throw new Error(`Cannot build constraint indicator for ${fieldKey}: triggerFields missing`);
        }

        // Normalize to array
        const triggers = Array.isArray(triggerFields) ? triggerFields : [triggerFields];
        
        // Get labels for all trigger fields
        const triggerLabels = triggers.map(t => i18nStrings.field_constraints.triggers[t] || t);
                
        // Build tooltip text with all triggers (with HTML support)
        let tooltipText;
        if (triggerLabels.length === 1) {
            tooltipText = i18nStrings.field_constraints.restricted_by.replace('{triggerField}', triggerLabels[0]);

        } else {
            // Join multiple triggers with ", " and use i18n conjunction before the last one
            const conjunction = ' ' + i18nStrings.common.and + ' ';
            const joinedLabels = triggerLabels.slice(0, -1).join(', ') + conjunction + triggerLabels[triggerLabels.length - 1];

            // CRITICAL: Use {triggerField} (singular) not {triggerFields} - template uses same placeholder for both cases
            tooltipText = i18nStrings.field_constraints.restricted_by.replace('{triggerField}', joinedLabels);

        }
        
        return `<span class="constraint-indicator" data-constraint-field="${fieldKey}">${fieldLabel}<span class="tooltip-text">${tooltipText}</span></span>`;
    }

    /**
     * Update constraint indicators when dependencies change
     * Shows field labels in italic when constrained
     * 
     * Field dependency map:
     * - d: constrained by O
     * - n: constrained by d (transitively by O)
     * - C: constrained by N (transitively by d, O)
     * - c: constrained by N (transitively by d, O)
     * - g: constrained by KK, MM, JJ (combined trigger)
     * - gg: constrained by g
     * - tt: constrained by MM
     * - ho: constrained by EE
     * - hu: constrained by EE
     * - sectors: constrained by EE and V (combined trigger)
     */
    
    // Central field dependency management for all interdependent fields
    // Implements forward-only dependencies (no backward/circular dependencies)
    // Trigger fields: O, d, N, KK, g, MM, EE
    // Rule: Fields can only affect subsequent fields, never previous ones
    async manageFieldDependencies(triggerField) {

        
        // Helper: Enable/disable specific option values and disable field if only one option
        const setOptionStates = (field, opts, enabledValues) => {
            opts.forEach(opt => {
                const val = opt.value;
                opt.disabled = !enabledValues.includes(val);
            });
            
            // Disable field if only one option available (user has no choice)
            // This includes cases where only '-1' (not observed) or '' (empty) is available
            if (enabledValues.length === 1) {
                field.disabled = true;
            } else {
                // Re-enable field if more than one option
                // But respect fixed observer setting for KK field
                if (field.id === 'form-kk' && this.fixedObserver) {
                    field.disabled = true;
                } else if (field.id === 'form-gg') {
                    // GG is special - disabled state is managed by g-trigger logic
                    // Don't enable here
                } else {
                    field.disabled = false;
                }
            }
            this.updatePlaceholderText(field);
        };
        
        // Helper: Enable all options
        const enableAllOptions = (opts) => {
            opts.forEach(opt => opt.disabled = false);
        };
        
        // Apply rules based on which field triggered the change
        if (triggerField === 'o') {
            // O (Object) → d (using shared constraint logic)
            const oValue = this.fields.o.value;
            const o = oValue === '' ? -1 : parseInt(oValue);
            
            const dOpts = Array.from(this.fields.d.options);
            const oldDValue = this.fields.d.value;
            
            // Use shared calculateFieldConstraints function
            const context = { o: oValue };
            const dValid = calculateFieldConstraints('d', context);
            
            // Special case: O=5 forces N, C, c to -1
            if (o === 5) {
                const nOpts = Array.from(this.fields.n.options);
                const cUpOpts = Array.from(this.fields.C.options);
                const cLowOpts = Array.from(this.fields.c.options);
                
                setOptionStates(this.fields.n, nOpts, ['-1']);
                setOptionStates(this.fields.C, cUpOpts, ['-1']);
                setOptionStates(this.fields.c, cLowOpts, ['-1']);
                
                this.fields.n.value = '-1';
                this.fields.C.value = '-1';
                this.fields.c.value = '-1';
                
                this.fieldConstraints.n = ['-1'];
                this.fieldConstraints.C = ['-1'];
                this.fieldConstraints.c = ['-1'];
            }
            
            // Apply d constraints
            setOptionStates(this.fields.d, dOpts, dValid);
            this.fieldConstraints.d = dValid;
            
            // If current d value is not valid, set to first valid value
            if (!dValid.includes(oldDValue)) {
                this.fields.d.value = dValid[0];
            }
            
            // ALWAYS trigger d dependencies (recursive cascade)
            this.manageFieldDependencies('d');
        } else if (triggerField === 'd') {
            // d (Cirrus Density) → N (using shared constraint logic)
            const dValue = this.fields.d.value;
            
            const nOpts = Array.from(this.fields.n.options);
            const oldNValue = this.fields.n.value;
            
            // Use shared calculateFieldConstraints function
            const context = { d: dValue };
            const nValid = calculateFieldConstraints('n', context);
            
            setOptionStates(this.fields.n, nOpts, nValid);
            this.fieldConstraints.n = nValid;
            
            // If current N value is not valid, set to first valid value
            if (!nValid.includes(oldNValue)) {
                this.fields.n.value = nValid[0];
            }
            
            // ALWAYS trigger N dependencies (recursive cascade)
            this.manageFieldDependencies('n');
        } else if (triggerField === 'n') {
            // N (Cloud Cover) → C, c (using shared constraint logic)
            const nValue = this.fields.n.value;
            const dValue = this.fields.d.value;  // Also pass d for d=7 special case
            
            const cUpOpts = Array.from(this.fields.C.options);
            const cLowOpts = Array.from(this.fields.c.options);
            const oldCValue = this.fields.C.value;
            const oldcValue = this.fields.c.value;
            
            // Use shared calculateFieldConstraints function
            const context = { n: nValue, d: dValue };
            const cUpValid = calculateFieldConstraints('C', context);
            const cLowValid = calculateFieldConstraints('c', context);
            
            setOptionStates(this.fields.C, cUpOpts, cUpValid);
            setOptionStates(this.fields.c, cLowOpts, cLowValid);
            
            this.fieldConstraints.C = cUpValid;
            this.fieldConstraints.c = cLowValid;
            
            // If current values are not valid, set to first valid value
            if (!cUpValid.includes(oldCValue)) {
                this.fields.C.value = cUpValid[0];
            }
            if (!cLowValid.includes(oldcValue)) {
                this.fields.c.value = cLowValid[0];
            }
            // N-Trigger ends here (C and c have no further dependencies)
        } else if (triggerField === 'kk' || triggerField === 'mm' || triggerField === 'jj') {

            // KK/MM/JJ combined trigger
            // Combined trigger: KK, MM, JJ → g
            // Rule: MM=-1 OR JJ=-1 OR KK=-1 → g=-1
            //       MM>-1 AND JJ>-1 AND KK>-1 → g=-1..2
            
            // Step 1: If MM triggered, update TT (days in month) using shared constraint logic
            if (triggerField === 'mm') {
                const mmValue = this.fields.mm.value;
                const jjValue = this.fields.jj.value;
                
                const ttOpts = Array.from(this.fields.tt.options);
                const oldTTValue = this.fields.tt.value;
                
                // Use shared calculateFieldConstraints function
                const context = { mm: mmValue, jj: jjValue };
                let ttValid = calculateFieldConstraints('TT', context);
                
                // Convert '01', '02' format to '1', '2' for menu mode (without leading zeros)
                if (ttValid && ttValid.length > 0) {
                    ttValid = ttValid.map(v => v === '' ? '' : parseInt(v).toString());
                }
                
                setOptionStates(this.fields.tt, ttOpts, ttValid);
                this.fieldConstraints.TT = ttValid;
                
                if (!ttValid.includes(oldTTValue)) {
                    this.fields.tt.value = ttValid[0];
                }
            }
            
            // Step 2: If JJ triggered and MM=2, recalculate February days
            if (triggerField === 'jj') {
                const mmValue = this.fields.mm.value;
                if (mmValue !== '' && parseInt(mmValue) === 2) {
                    // Re-trigger MM logic to update TT
                    this.manageFieldDependencies('mm');
                    // Don't continue to g logic here, let MM trigger handle it
                    return;
                }
            }
            
            // Step 3: Evaluate KK, MM, JJ → g
            const kkValue = this.fields.kk.value;
            const jjValue = this.fields.jj.value;
            const mmValue = this.fields.mm.value;
            
            const kk = kkValue === '' ? -1 : parseInt(kkValue);
            const jj = jjValue === '' ? -1 : parseInt(jjValue);
            const mm = mmValue === '' ? -1 : parseInt(mmValue);
            
            const gOpts = Array.from(this.fields.g.options);
            const oldGValue = this.fields.g.value;

            let gValid;
            if (mm === -1 || jj === -1 || kk === -1) {
                // Any of MM, JJ, KK not set: g must be -1
                gValid = [''];
                
                setOptionStates(this.fields.g, gOpts, gValid);
                this.fieldConstraints.g = gValid;

                // If current g value is not valid, set to first valid value and trigger g
                if (!gValid.includes(oldGValue)) {
                    this.fields.g.value = gValid[0];
                    this.manageFieldDependencies('g');
                } else {
                    this.manageFieldDependencies('g');
                }
            } else {
                // MM>-1 AND JJ>-1 AND KK>-1: Check if observer was active at this date
                
                // Async check for observer activity
                fetch(`/api/observers/${kk}/active?mm=${mm}&jj=${jj}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.active) {
                            // Observer was active: g can be -1..2
                            gValid = ['', '0', '1', '2'];
                        } else {
                            // Observer was not active: g must be -1
                            gValid = [''];
                        }
                        
                        setOptionStates(this.fields.g, gOpts, gValid);
                        this.fieldConstraints.g = gValid;
                        
                        // If current g value is not valid, set to first valid value and trigger g
                        if (!gValid.includes(oldGValue)) {
                            this.fields.g.value = gValid[0];
                            this.manageFieldDependencies('g');
                        } else {
                            this.manageFieldDependencies('g');
                        }
                        
                        // CRITICAL: Update constraint indicators AFTER async operation completes
                        this.updateConstraintIndicatorsForField('g');
                    })
                    .catch(error => {
                        // On error, allow g to be set (fail-open)
                        gValid = ['', '0', '1', '2'];
                        setOptionStates(this.fields.g, gOpts, gValid);
                        this.fieldConstraints.g = gValid;
                    });
            }
        } else if (triggerField === 'g') {
            // g (Location Type) → GG
            // Rules: g=-1 → GG=-1 | g=0 → GG=HBOrt | g=1 → GG=all regions | g=2 → GG=NBOrt
            // NOTE: This trigger is also called by KK when KK/JJ/MM change (via manageFieldDependencies('g'))
            const gValue = this.fields.g.value;
            const g = gValue === '' ? -1 : parseInt(gValue);
            
            
            const ggOpts = Array.from(this.fields.gg.options);
            
            if (g === 0) {
                // g=0 (Hauptbeobachtungsort): GG = HBOrt (auto-filled from observer)
                
                const kk = this.fields.kk.value;
                const jj = this.fields.jj.value ? parseInt(this.fields.jj.value) : null;
                const mm = this.fields.mm.value ? parseInt(this.fields.mm.value) : null;
                
                if (kk) {
                    // Fetch observer data
                    try {
                        let url = `/api/observers?kk=${kk}`;
                        if (jj && mm) {
                            url += `&jj=${jj}&mm=${mm}`;
                        }
                        const resp = await fetch(url);
                        
                        // Check if form was destroyed while fetching
                        if (this.destroyed) return;
                        
                        if (resp.ok) {
                            const data = await resp.json();
                            if (data.observer && data.observer.GH) {
                                const gg = parseInt(data.observer.GH);  // Parse to int to remove leading zero
                                // GG constrained to single value (HBOrt)
                                setOptionStates(this.fields.gg, ggOpts, [gg.toString()]);
                                this.fields.gg.value = gg;
                                this.fieldConstraints.GG = [gg.toString()];
                            } else {
                                setOptionStates(this.fields.gg, ggOpts, ['']);
                                this.fields.gg.value = '';
                                this.fieldConstraints.GG = [''];
                            }
                        }
                    } catch (e) {
                        // Ignore errors if form was destroyed
                        if (!this.destroyed) {
                            console.error('Error fetching GG:', e);
                        }
                    }
                } else {
                    setOptionStates(this.fields.gg, ggOpts, ['']);
                    this.fields.gg.value = '';
                    this.fieldConstraints.GG = [''];
                }
            } else if (g === 2) {
                // g=2 (Nebenbeobachtungsort): GG = NBOrt (auto-filled from observer)
                
                const kk = this.fields.kk.value;
                const jj = this.fields.jj.value ? parseInt(this.fields.jj.value) : null;
                const mm = this.fields.mm.value ? parseInt(this.fields.mm.value) : null;
                
                if (kk) {
                    // Fetch observer data
                    try {
                        let url = `/api/observers?kk=${kk}`;
                        if (jj && mm) {
                            url += `&jj=${jj}&mm=${mm}`;
                        }
                        const resp = await fetch(url);
                        
                        // Check if form was destroyed while fetching
                        if (this.destroyed) return;
                        
                        if (resp.ok) {
                            const data = await resp.json();
                            if (data.observer && data.observer.GN) {
                                const gg = parseInt(data.observer.GN);  // Parse to int to remove leading zero
                                // GG constrained to single value (NBOrt)
                                setOptionStates(this.fields.gg, ggOpts, [gg.toString()]);
                                this.fields.gg.value = gg;
                                this.fieldConstraints.GG = [gg.toString()];
                            } else {
                                setOptionStates(this.fields.gg, ggOpts, ['']);
                                this.fields.gg.value = '';
                                this.fieldConstraints.GG = [''];
                            }
                        }
                    } catch (e) {
                        // Ignore errors if form was destroyed
                        if (!this.destroyed) {
                            console.error('Error fetching GG:', e);
                        }
                    }
                } else {
                    setOptionStates(this.fields.gg, ggOpts, ['']);
                    this.fields.gg.value = '';
                    this.fieldConstraints.GG = [''];
                }
            } else if (g === 1) {
                // g=1 (Auswärtsbeobachtung): GG = all available regions (manual entry)
                enableAllOptions(ggOpts);
                this.fields.gg.disabled = false;  // Enable field for manual entry
                this.updatePlaceholderText(this.fields.gg);
                // Don't overwrite GG if editing
                if (!this.originalObservation) {
                    this.fields.gg.value = '';
                }
                this.fieldConstraints.GG = null;  // All values allowed
            } else {
                // g=-1 (not set): GG=-1 (only empty option)
                setOptionStates(this.fields.gg, ggOpts, ['']);
                this.fields.gg.value = '';
                this.fieldConstraints.GG = [''];
            }
        } else if (triggerField === 'ee' || triggerField === 'v') {
            // EE/V combined trigger
            // EE (Phenomenon) → HO, HU
            // EE + V → Sectors
            
            const ee = this.fields.ee.value === '' ? -1 : parseInt(this.fields.ee.value);
            const v = this.fields.v.value === '' ? -1 : parseInt(this.fields.v.value);
            
            
            // Step 1: Set HO/HU based on EE only (only if EE triggered)
            if (triggerField === 'ee') {
                const hoOpts = Array.from(this.fields.ho.options);
                const huOpts = Array.from(this.fields.hu.options);
                const oldHOValue = this.fields.ho.value;
                const oldHUValue = this.fields.hu.value;
                
                if (ee === 8) {
                    // EE=8 (Obere Lichtsäule): HO = -1, 1..90, HU = 0
                    setOptionStates(this.fields.ho, hoOpts, PILLAR_HEIGHT_VALUES);
                    setOptionStates(this.fields.hu, huOpts, ['0']);
                    
                    this.fieldConstraints.HO = PILLAR_HEIGHT_VALUES;
                    this.fieldConstraints.HU = ['0'];
                    
                    // Check if current values are valid
                    if (!PILLAR_HEIGHT_VALUES.includes(oldHOValue)) {
                        this.fields.ho.value = PILLAR_HEIGHT_VALUES[0]; // -1
                    }
                    this.fields.hu.value = '0';
                } else if (ee === 9) {
                    // EE=9 (Untere Lichtsäule): HO = 0, HU = -1, 1..90
                    setOptionStates(this.fields.ho, hoOpts, ['0']);
                    setOptionStates(this.fields.hu, huOpts, PILLAR_HEIGHT_VALUES);
                    
                    this.fieldConstraints.HO = ['0'];
                    this.fieldConstraints.HU = PILLAR_HEIGHT_VALUES;
                    
                    this.fields.ho.value = '0';
                    if (!PILLAR_HEIGHT_VALUES.includes(oldHUValue)) {
                        this.fields.hu.value = PILLAR_HEIGHT_VALUES[0]; // -1
                    }
                } else if (ee === 10) {
                    // EE=10 (both light pillars): HO = -1, 1..90, HU = -1, 1..90
                    setOptionStates(this.fields.ho, hoOpts, PILLAR_HEIGHT_VALUES);
                    setOptionStates(this.fields.hu, huOpts, PILLAR_HEIGHT_VALUES);
                    
                    this.fieldConstraints.HO = PILLAR_HEIGHT_VALUES;
                    this.fieldConstraints.HU = PILLAR_HEIGHT_VALUES;
                    
                    // Check if current values are valid
                    if (!PILLAR_HEIGHT_VALUES.includes(oldHOValue)) {
                        this.fields.ho.value = PILLAR_HEIGHT_VALUES[0]; // -1
                    }
                    if (!PILLAR_HEIGHT_VALUES.includes(oldHUValue)) {
                        this.fields.hu.value = PILLAR_HEIGHT_VALUES[0]; // -1
                    }
                } else {
                    // All other EE values (including -1 and circular halos): HO/HU irrelevant
                    setOptionStates(this.fields.ho, hoOpts, ['-1']);
                    setOptionStates(this.fields.hu, huOpts, ['-1']);
                    
                    this.fieldConstraints.HO = ['-1'];
                    this.fieldConstraints.HU = ['-1'];
                    
                    this.fields.ho.value = '-1';
                    this.fields.hu.value = '-1';
                }
            }
            
            // Step 2: Set Sectors based on EE and V (always run for both triggers)
            
            if (ee === -1 || !CIRCULAR_HALOS.has(ee)) {
                // EE=-1 or not a circular halo: Sectors inactive
                this.fieldConstraints.sectors = [];
                this.fields.sectors.value = '';
                this.fields.sectors.disabled = true;
            } else if (CIRCULAR_HALOS.has(ee)) {
                // EE is circular halo: Check V value
                
                if (v === 1) {
                    // V=1 (incomplete): Sectors active
                    this.fieldConstraints.sectors = ['any'];
                    this.fields.sectors.disabled = false;
                    // Keep existing sector value
                } else {
                    // V=0, 2, or not set: Sectors inactive
                    this.fieldConstraints.sectors = [];
                    this.fields.sectors.value = '';
                    this.fields.sectors.disabled = true;
                }
            }
            
        }
        
        // Update all constraint indicators
        this.updateConstraintIndicators();
    }
    
    /**
     * Update constraint indicator for a single field (for async operations)
     * Field is constrained when NOT ALL values are available
     * (i.e., at least one value is disabled/missing from allowed set)
     */
    updateConstraintIndicatorsForField(fieldKey) {

        const indicator = document.querySelector(`[data-constraint-field="${fieldKey}"]`);

        if (indicator) {
            const constraints = this.fieldConstraints[fieldKey];

            
            // Find the corresponding SELECT element to count total possible values
            const selectEl = document.getElementById(`form-${fieldKey}`);
            if (selectEl) {
                // Total options minus "Select" placeholder option (value='')
                const totalOptions = Array.from(selectEl.options).filter(opt => opt.value !== '').length;
                const allowedCount = Array.isArray(constraints) ? constraints.length : 0;

                
                // Field is constrained if fewer values are allowed than total possible
                const isConstrained = allowedCount > 0 && allowedCount < totalOptions;
                
                if (isConstrained) {

                    indicator.classList.add('constrained');
                } else {

                    indicator.classList.remove('constrained');
                }
            }
        }
    }
    
    /**
     * Update all constraint indicators based on current field constraints
     * Field is constrained when NOT ALL values are available
     * (i.e., at least one value is disabled/missing from allowed set)
     */
    updateConstraintIndicators() {


        
        // Field keys and their corresponding HTML element IDs
        const fieldMap = {
            'd': 'form-d',
            'n': 'form-n',
            'C': 'form-C',
            'c': 'form-c',
            'TT': 'form-tt',
            'g': 'form-g',
            'GG': 'form-gg',
            'HO': 'form-ho',
            'HU': 'form-hu',
            'sectors': 'form-sectors'
        };
        
        // For each field, check if it's constrained and update .constrained class
        for (const [fieldKey, elementId] of Object.entries(fieldMap)) {
            const indicator = document.querySelector(`[data-constraint-field="${fieldKey}"]`);
            if (indicator) {
                const constraints = this.fieldConstraints[fieldKey];
                const selectEl = document.getElementById(elementId);
                
                let isConstrained = false;
                
                if (fieldKey === 'sectors') {
                    // Special handling for sectors (text input, not select)
                    // Sectors: ['any'] = active (can be filled) = NOT constrained (normal input)
                    // Sectors: [] = inactive (disabled) = constrained to empty
                    isConstrained = !(Array.isArray(constraints) && constraints.length > 0);
                } else if (selectEl && selectEl.options) {
                    // For SELECT elements: count total possible values
                    const totalOptions = Array.from(selectEl.options).filter(opt => opt.value !== '').length;
                    const allowedCount = Array.isArray(constraints) ? constraints.length : 0;
                    isConstrained = allowedCount > 0 && allowedCount < totalOptions;
                }
                
                if (isConstrained) {
                    indicator.classList.add('constrained');
                } else {
                    indicator.classList.remove('constrained');
                }
            }
        }
    }
    
    setupEventListeners() {
        // Get all field references
        this.fields = {
            kk: document.getElementById('form-kk'),
            o: document.getElementById('form-o'),
            jj: document.getElementById('form-jj'),
            mm: document.getElementById('form-mm'),
            tt: document.getElementById('form-tt'),
            g: document.getElementById('form-g'),
            zs: document.getElementById('form-zs'),
            zm: document.getElementById('form-zm'),
            d: document.getElementById('form-d'),
            dd: document.getElementById('form-dd'),
            n: document.getElementById('form-n'),
            C: document.getElementById('form-C'),
            c: document.getElementById('form-c'),
            ee: document.getElementById('form-ee'),
            h: document.getElementById('form-h'),
            F: document.getElementById('form-F'),
            v: document.getElementById('form-v'),
            f: document.getElementById('form-weather_front'),
            zz: document.getElementById('form-zz'),
            gg: document.getElementById('form-gg'),
            ho: document.getElementById('form-ho'),
            hu: document.getElementById('form-hu'),
            sectors: document.getElementById('form-sectors'),
            remarks: document.getElementById('form-remarks'),
            // Attribute checkboxes
            attrStar: document.getElementById('form-attr-star'),
            attrKA: document.getElementById('form-attr-ka'),
            attrKE: document.getElementById('form-attr-ke'),
            attrUB: document.getElementById('form-attr-ub'),
            attrUH: document.getElementById('form-attr-uh')
        };
        
        const errEl = document.getElementById('obs-form-error');
        const okBtn = document.getElementById('btn-obs-form-ok');
        
        // Check required fields
        const checkRequired = () => {
            const required = ['kk', 'o', 'jj', 'mm', 'tt', 'g', 'ee', 'gg'];
            const allFilled = required.every(key => this.fields[key].value !== '');
            if (okBtn) {
                okBtn.disabled = !allFilled;
            }
        };
        
        // Delegate to class method
        const manageFieldDependencies = (triggerField) => {
            this.manageFieldDependencies(triggerField);
        };
        
        // Attach event listeners for trigger fields only (forward dependencies)
        // Trigger fields: O, d, N, KK, g, MM, EE
        this.fields.o.addEventListener('change', () => {
            manageFieldDependencies('o');
            checkRequired();
        });
        this.fields.d.addEventListener('change', () => {
            manageFieldDependencies('d');
        });
        this.fields.n.addEventListener('change', () => {
            manageFieldDependencies('n');
        });
        this.fields.kk.addEventListener('change', () => {
            manageFieldDependencies('kk');
            checkRequired();
        });
        this.fields.g.addEventListener('change', () => {
            manageFieldDependencies('g');
            checkRequired();
        });
        this.fields.jj.addEventListener('change', () => {
            manageFieldDependencies('jj');
            checkRequired();
        });
        this.fields.mm.addEventListener('change', () => {
            manageFieldDependencies('mm');
            checkRequired();
        });
        this.fields.tt.addEventListener('change', () => {
            checkRequired();
        });
        this.fields.ee.addEventListener('change', () => {
            manageFieldDependencies('ee');
            checkRequired();
        });
        this.fields.gg.addEventListener('change', () => {
            manageFieldDependencies('ee');
            checkRequired();
        });
        this.fields.v.addEventListener('change', () => {
            manageFieldDependencies('v');
        });
        
        // Sectors field: validate sector notation on change
        this.fields.sectors.addEventListener('change', () => {
            if (this.fields.sectors.value) {
                const result = validateSectorInput(this.fields.sectors.value, false);
                if (!result.valid) {
                    // Invalid input: clear the field silently (no error dialog)
                    this.fields.sectors.value = '';
                } else {
                    // Valid: auto-clean the input
                    this.fields.sectors.value = result.cleaned;
                }
            }
        });
        
        // Sectors field: Enter key moves to remarks field
        this.fields.sectors.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Validate input first (same logic as change event)
                if (this.fields.sectors.value) {
                    const result = validateSectorInput(this.fields.sectors.value, false);
                    if (result.valid) {
                        // Valid input: clean and jump to remarks
                        this.fields.sectors.value = result.cleaned;
                        this.fields.remarks.focus();
                    }
                    // Invalid: do nothing - stay in sectors field, value will be cleared on next change event
                }
            }
        });
        
        // Note: 8HHHH field management moved to manageFieldDependencies() function
        
        // Required field listeners
        ['kk', 'o', 'jj', 'mm', 'tt', 'g', 'ee', 'gg'].forEach(key => {
            this.fields[key].addEventListener('change', checkRequired);
        });
        
        // Yes button handler - enable editing (edit mode) or trigger delete (delete mode)
        const yesBtn = document.getElementById('btn-obs-form-yes');
        if (yesBtn) {
            yesBtn.addEventListener('click', async () => {
                if (this.mode === 'delete') {
                    // In delete mode, Yes means confirm deletion
                    // Don't hide modal yet - let the callback handle it after async operation
                    if (this.onYes) {
                        await this.onYes();
                    }
                    this.hideModal();
                } else {
                    // In edit mode, Yes means enable editing
                    this.isEditingMode = true;
                    this.enableAllFields();
                    
                    // Apply field constraints based on current values
                    // (same triggers as 'add' mode but for existing data)
                    this.manageFieldDependencies('o');
                    this.manageFieldDependencies('d');
                    this.manageFieldDependencies('n');
                    this.manageFieldDependencies('kk');
                    this.manageFieldDependencies('mm');
                    this.manageFieldDependencies('ee');
                    this.manageFieldDependencies('v');
                    
                    // Hide Yes button and Previous/Next buttons
                    yesBtn.style.display = 'none';
                    const noBtn = document.getElementById('btn-obs-form-no');
                    if (noBtn) noBtn.style.display = 'none';
                    
                    const prevBtn = document.getElementById('btn-obs-form-prev');
                    if (prevBtn) prevBtn.style.display = 'none';
                    
                    const nextBtn = document.getElementById('btn-obs-form-next');
                    if (nextBtn) nextBtn.style.display = 'none';
                    
                    // Show OK button
                    if (okBtn) {
                        okBtn.style.display = 'block';
                        okBtn.textContent = i18nStrings.common.ok;
                        okBtn.className = 'btn btn-primary btn-sm px-3';
                        checkRequired();
                    }
                }
            });
        }
        
        // No button handler - skip this observation (both edit and delete modes)
        const noBtn = document.getElementById('btn-obs-form-no');
        if (noBtn) {
            noBtn.addEventListener('click', () => {
                if (this.mode === 'delete') {
                    // In delete mode, No means skip to next
                    this.noButtonPressed = true; // Prevent cancel callback
                    this.hideModal();
                    if (this.onNo) {
                        this.onNo();
                    }
                } else {
                    // In edit mode, No means skip this observation
                    this.skipped = true;
                    this.hideModal();
                    if (this.onCancel) {
                        this.onCancel();
                    }
                }
            });
            
            // Enter key handling moved to show() via setupModalKeyboard() (Decision #033)
        }
        
        // View mode navigation buttons
        const nextBtn = document.getElementById('btn-obs-form-next');
        const prevBtn = document.getElementById('btn-obs-form-prev');
        const okViewBtn = document.getElementById('btn-obs-form-ok-view');
        
        // Next button - works in view, edit, and delete modes
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.navigating = true;
                this.hideModal();
                if (this.mode === 'view' && this.onYes) {
                    this.onYes(); // Next in view mode
                } else if (this.mode === 'delete' && this.onNo) {
                    this.onNo(); // Next in delete mode = skip (NOT delete!)
                } else if (this.mode === 'edit' && this.onYes) {
                    this.onYes(); // Next in edit mode = skip to next
                }
            });
            
            // Enter key handled by setupModalKeyboard() in show() (Decision #033)
        }
        
        // OK button in view mode should close and return to main (like ESC/Cancel)
        if (okViewBtn && this.mode === 'view') {
            okViewBtn.addEventListener('click', () => {
                this.hideModal();
                // Don't set navigating - let the hidden handler call onCancelBtn
            });
        }
        
        // Previous button - works in view, edit, and delete modes
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.navigating = true;
                this.hideModal();
                if (this.mode === 'view' && this.onNo) {
                    this.onNo(); // Previous in view mode
                } else if ((this.mode === 'edit' || this.mode === 'delete') && this.onNo) {
                    this.onNo(); // Previous in edit/delete mode
                }
            });
        }
        
        // OK button handler (only exists in add mode initially)
        if (okBtn) {
            okBtn.addEventListener('click', async () => {
                try {
                    const obs = this.getFormData();
                    
                    if (this.onSave) {
                        await this.onSave(obs);
                    }
                    
                    // Sync haloData to sessionStorage after save
                    if (window.saveHaloDataToSession) {
                        window.saveHaloDataToSession();
                    }
                    
                    this.saved = true;
                    this.hideModal();
                } catch (e) {
                    errEl.textContent = e.message;
                    errEl.style.display = 'block';
                }
            });
        }
        
        // Clean up on modal hidden
        const currentModalElement = this.modalElement; // Capture reference for closure
        this.modalElement.addEventListener('hidden.bs.modal', () => {
            // If show() was called again, this.modalElement points to the NEW modal.
            // In that case, skip cleanup to avoid interfering with the new modal.
            if (this.modalElement !== currentModalElement) {
                currentModalElement.remove();
                return;
            }
            if (!this.saved && !this.skipped && !this.navigating && !this.noButtonPressed) {
                // User cancelled (ESC or Cancel button)
                if (this.mode === 'delete' && this.onCancelBtn) {
                    // Delete mode with custom cancel handler
                    this.onCancelBtn();
                } else if (this.mode === 'view' && this.onCancelBtn) {
                    // View mode with custom cancel handler
                    this.onCancelBtn();
                } else {
                    // Edit/Add mode - return to main page
                    // But preserve file state in sessionStorage first
                    if (window.haloData && window.haloData.isLoaded) {
                        // Reset isDirty since user didn't save any changes in the form
                        window.haloData.isDirty = false;
                        sessionStorage.setItem('haloData', JSON.stringify(window.haloData));
                    }
                    window.navigateInternal('/');
                }
            }
            this.destroyed = true; // Mark as destroyed to prevent async operations
            currentModalElement.remove();
        });
        
        // Initial check of required fields (important for pre-filled forms in add mode)
        checkRequired();
    }
    
    /**
     * Update the placeholder text of a select field's first option.
     * Disabled fields show "--", enabled fields show "-- Bitte wählen --" (localized).
     */
    updatePlaceholderText(field) {
        if (!field || field.tagName !== 'SELECT') return;
        const firstOpt = field.options[0];
        if (!firstOpt) return;
        // Only update placeholder options (value is '' or '-1')
        if (firstOpt.value !== '' && firstOpt.value !== '-1') return;
        firstOpt.textContent = field.disabled ? '--' : i18nStrings.fields.select;
    }

    disableAllFields() {
        Object.values(this.fields).forEach(field => {
            if (field) {
                field.disabled = true;
                this.updatePlaceholderText(field);
            }
        });
    }
    
    enableAllFields() {
        // Enable fields that are NOT constrained by dependencies
        // This method is called when user clicks "Yes" to edit an observation
        
        // Helper: Check if field has active constraints
        const isConstrained = (fieldKey) => {
            const constraints = this.fieldConstraints[fieldKey];
            if (fieldKey === 'sectors') {
                // Sectors: empty array = constrained (disabled)
                return !(Array.isArray(constraints) && constraints.length > 0);
            } else {
                // Other fields: check if only one option available (constrained to single value)
                return Array.isArray(constraints) && constraints.length === 1;
            }
        };
        
        // Field key mapping (internal key → element ID)
        const fieldKeyMap = {
            'd': 'form-d',
            'n': 'form-n',
            'C': 'form-C',
            'c': 'form-c',
            'TT': 'form-tt',
            'g': 'form-g',
            'GG': 'form-gg',
            'HO': 'form-ho',
            'HU': 'form-hu',
            'sectors': 'form-sectors'
        };
        
        // Enable all fields EXCEPT those that are constrained
        Object.values(this.fields).forEach(field => {
            if (!field) return;
            
            // Find constraint key for this field
            const constraintKey = Object.keys(fieldKeyMap).find(key => fieldKeyMap[key] === field.id);
            
            // Special handling for KK (fixed observer)
            if (field.id === 'form-kk') {
                if (!this.fixedObserver) {
                    field.disabled = false;
                }
                this.updatePlaceholderText(field);
                return;
            }
            
            // Special handling for GG (depends on g value)
            if (field.id === 'form-gg') {
                const g = parseInt(this.fields.g.value);
                if (g !== 0 && g !== 2) {
                    field.disabled = false;
                }
                this.updatePlaceholderText(field);
                return;
            }
            
            // For constrained fields, check if they should remain disabled
            if (constraintKey && isConstrained(constraintKey)) {
                // Field is constrained to single value or disabled - keep it disabled
                field.disabled = true;
            } else {
                // Field is not constrained - enable it
                field.disabled = false;
            }
            this.updatePlaceholderText(field);
        });
    }
    
    populateFields(obs) {
        // Populate all fields with observation data
        // Convert KK to 2-digit string with leading zero to match option values
        this.fields.kk.value = obs.KK !== undefined && obs.KK !== null && obs.KK !== '' ? String(obs.KK).padStart(2, '0') : '';
        this.fields.o.value = obs.O || '';
        // Year: obs['JJ'] is 4-digit, dropdown values are 4-digit
        if (obs.JJ !== undefined && obs.JJ !== null && obs.JJ !== '') {
            const jj = parseInt(obs.JJ);
            this.fields.jj.value = jj;  // Use JJ directly (4-digit)
        } else {
            this.fields.jj.value = '';
        }
        this.fields.mm.value = obs.MM || '';
        this.fields.tt.value = obs.TT || '';
        // g can be 0 (valid for primary site), so check explicitly for null/undefined
        this.fields.g.value = (obs.g !== undefined && obs.g !== null) ? obs.g : '';
        this.fields.zs.value = obs.ZS !== -1 && obs.ZS !== null ? obs.ZS : '';
        this.fields.zm.value = obs.ZM !== -1 && obs.ZM !== null ? obs.ZM : '';
        this.fields.d.value = obs.d !== -1 && obs.d !== null ? obs.d : '-1';
        this.fields.dd.value = obs.DD !== -1 && obs.DD !== null ? obs.DD : '-1';
        this.fields.n.value = obs.N !== -1 && obs.N !== null ? obs.N : '-1';
        this.fields.C.value = obs.C !== -1 && obs.C !== null ? obs.C : '-1';
        this.fields.c.value = obs.c !== -1 && obs.c !== null ? obs.c : '-1';
        this.fields.ee.value = obs.EE || '';
        this.fields.h.value = obs.H !== -1 && obs.H !== null ? obs.H : '-1';
        this.fields.F.value = obs.F !== -1 && obs.F !== null ? obs.F : '-1';
        this.fields.v.value = obs.V !== -1 && obs.V !== null ? obs.V : '-1';
        this.fields.f.value = obs.f !== -1 && obs.f !== null ? obs.f : '-1';
        this.fields.zz.value = obs.zz !== -1 && obs.zz !== 99 && obs.zz !== null ? obs.zz : (obs.zz === 99 ? '99' : '-1');
        // GG can be 0 (valid region code), so check explicitly for null/undefined
        this.fields.gg.value = (obs.GG !== undefined && obs.GG !== null) ? obs.GG : '';
        this.fields.ho.value = obs.HO !== -1 && obs.HO !== 0 && obs.HO !== null ? obs.HO : (obs.HO === 0 ? '0' : '-1');
        this.fields.hu.value = obs.HU !== -1 && obs.HU !== 0 && obs.HU !== null ? obs.HU : (obs.HU === 0 ? '0' : '-1');
        this.fields.sectors.value = obs.sectors || '';
        this.fields.remarks.value = obs.remarks || '';
        
        // Parse and set attributes from remarks
        if (obs.remarks) {
            this.parseAttributesFromRemarks(obs.remarks);
        }
        
        // Field values are populated from observation
        // Constraints/dependencies are applied by manageFieldDependencies() after this method returns
    }
    
    getFormData() {
        // Validate required fields
        if (!this.fields.kk.value || this.fields.kk.value === '') {
            throw new Error('Observer code (KK) is required');
        }
        
        const kk = parseInt(this.fields.kk.value);
        if (isNaN(kk)) {
            throw new Error('Invalid observer code (KK)');
        }
        
        // Year: dropdown value is 4-digit, use directly
        let jj = parseInt(this.fields.jj.value);
        
        return {
            KK: kk,
            O: parseInt(this.fields.o.value),
            JJ: jj,
            MM: parseInt(this.fields.mm.value),
            TT: parseInt(this.fields.tt.value),
            g: parseInt(this.fields.g.value),
            GG: parseInt(this.fields.gg.value),
            ZS: this.fields.zs.value ? parseInt(this.fields.zs.value) : -1,
            ZM: this.fields.zm.value ? parseInt(this.fields.zm.value) : -1,
            DD: this.fields.dd.value && this.fields.dd.value !== '-1' ? parseInt(this.fields.dd.value) : -1,
            d: this.fields.d.value && this.fields.d.value !== '-1' ? parseInt(this.fields.d.value) : -1,
            N: this.fields.n.value && this.fields.n.value !== '-1' ? parseInt(this.fields.n.value) : -1,
            C: this.fields.C.value && this.fields.C.value !== '-1' ? parseInt(this.fields.C.value) : -1,
            c: this.fields.c.value && this.fields.c.value !== '-1' ? parseInt(this.fields.c.value) : -1,
            EE: parseInt(this.fields.ee.value),
            H: this.fields.h.value && this.fields.h.value !== '-1' ? parseInt(this.fields.h.value) : -1,
            F: this.fields.F.value && this.fields.F.value !== '-1' ? parseInt(this.fields.F.value) : -1,
            V: this.fields.v.value && this.fields.v.value !== '-1' ? parseInt(this.fields.v.value) : -1,
            f: this.fields.f.value && this.fields.f.value !== '-1' ? parseInt(this.fields.f.value) : -1,
            zz: this.fields.zz.value && this.fields.zz.value !== '-1' ? parseInt(this.fields.zz.value) : -1,
            HO: this.fields.ho.value && this.fields.ho.value !== '-1' ? parseInt(this.fields.ho.value) : -1,
            HU: this.fields.hu.value && this.fields.hu.value !== '-1' ? parseInt(this.fields.hu.value) : -1,
            sectors: this.fields.sectors.value || '',
            remarks: this.buildRemarksWithAttributes()
        };
    }
    
    /**
     * Get current constraint for a dependent field
     * @param {string} fieldName - Name of the dependent field (d, n, C, c, g, GG, TT, HO, HU, sectors)
     * @returns {Array|string|null} - Array of valid values, single value (GG), or null if not constrained
     */
    getFieldConstraint(fieldName) {
        return this.fieldConstraints[fieldName];
    }
    
    /**
     * Check if a field is currently constrained (has limited valid values)
     * @param {string} fieldName - Name of the field to check
     * @returns {boolean} - true if field is constrained, false otherwise
     */
    isFieldConstrained(fieldName) {
        const constraint = this.fieldConstraints[fieldName];
        if (Array.isArray(constraint)) {
            return constraint.length > 0;
        }
        return constraint !== null && constraint !== undefined;
    }
    
    /**
     * Check if a value is valid for a constrained field
     * @param {string} fieldName - Name of the field
     * @param {string|number} value - Value to check
     * @returns {boolean} - true if value is valid, false otherwise
     */
    isValueValid(fieldName, value) {
        const constraint = this.fieldConstraints[fieldName];
        if (fieldName === 'sectors') {
            // Sectors: [] = inactive, ['any'] = active
            return constraint.length > 0;
        } else if (fieldName === 'GG') {
            // GG: Single value or null
            return constraint !== null;
        } else if (Array.isArray(constraint)) {
            // All other fields: Array of valid values
            return constraint.includes(String(value));
        }
        return false;
    }
    
    /**
     * Build remarks text with attributes from checkboxes
     * @returns {string} Combined remarks text
     */
    buildRemarksWithAttributes() {
        let remarks = this.fields.remarks.value || '';
        const attributes = [];
        
        // Check which attributes are selected
        if (this.fields.attrStar && this.fields.attrStar.checked) {
            attributes.push('*');
        }
        if (this.fields.attrKA && this.fields.attrKA.checked) {
            attributes.push('kA');
        }
        if (this.fields.attrKE && this.fields.attrKE.checked) {
            attributes.push('kE');
        }
        if (this.fields.attrUB && this.fields.attrUB.checked) {
            attributes.push('UB');
        }
        if (this.fields.attrUH && this.fields.attrUH.checked) {
            attributes.push('UH');
        }
        
        // If we have attributes, append them to remarks
        if (attributes.length > 0) {
            const attributeText = attributes.join('; ');
            if (remarks) {
                remarks += '; ' + attributeText;
            } else {
                remarks = attributeText;
            }
        }
        
        return remarks;
    }
    
    /**
     * Parse attributes from remarks text and set checkboxes
     * @param {string} remarks - Remarks text to parse
     */
    parseAttributesFromRemarks(remarks) {
        if (!remarks || !this.fields.attrStar) {
            return;
        }
        
        // Reset all checkboxes first
        this.fields.attrStar.checked = false;
        this.fields.attrKA.checked = false;
        this.fields.attrKE.checked = false;
        this.fields.attrUB.checked = false;
        this.fields.attrUH.checked = false;
        
        // Check for attribute patterns with word boundaries (space, comma, semicolon, start/end of string)
        const boundaryPattern = '(^|[\\s,;]){attr}([\\s,;]|$)';
        
        // Check for each attribute with word boundaries (case-insensitive)
        if (remarks.includes('*')) {
            this.fields.attrStar.checked = true;
        }
        if (new RegExp(boundaryPattern.replace('{attr}', 'ka'), 'i').test(remarks)) {
            this.fields.attrKA.checked = true;
        }
        if (new RegExp(boundaryPattern.replace('{attr}', 'ke'), 'i').test(remarks)) {
            this.fields.attrKE.checked = true;
        }
        if (new RegExp(boundaryPattern.replace('{attr}', 'ub'), 'i').test(remarks)) {
            this.fields.attrUB.checked = true;
        }
        if (new RegExp(boundaryPattern.replace('{attr}', 'uh'), 'i').test(remarks)) {
            this.fields.attrUH.checked = true;
        }
        
        // Clean up the remarks text by removing the attribute patterns with word boundaries
        let cleanedRemarks = remarks;
        
        // Remove attribute patterns (case-insensitive, with word boundaries)
        cleanedRemarks = cleanedRemarks.replace(new RegExp('(^|[\\s,;])\\*([\\s,;]|$)', 'gi'), '$1$2');
        cleanedRemarks = cleanedRemarks.replace(new RegExp('(^|[\\s,;])ka([\\s,;]|$)', 'gi'), '$1$2');
        cleanedRemarks = cleanedRemarks.replace(new RegExp('(^|[\\s,;])ke([\\s,;]|$)', 'gi'), '$1$2');
        cleanedRemarks = cleanedRemarks.replace(new RegExp('(^|[\\s,;])ub([\\s,;]|$)', 'gi'), '$1$2');
        cleanedRemarks = cleanedRemarks.replace(new RegExp('(^|[\\s,;])uh([\\s,;]|$)', 'gi'), '$1$2');
        
        // Clean up extra semicolons and spaces
        cleanedRemarks = cleanedRemarks.replace(/^[;,\s]+|[;,\s]+$/g, ''); // trim
        cleanedRemarks = cleanedRemarks.replace(/[;,\s]+/g, ' '); // normalize spaces
        
        // Set the cleaned remarks back to the field
        this.fields.remarks.value = cleanedRemarks;
    }
}

// Make it globally available
window.ObservationForm = ObservationForm;
