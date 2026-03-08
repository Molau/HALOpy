// ============================================================================
// SETTINGS DIALOGS — All settings/configuration dialogs
// ============================================================================
// Extracted from main.js — Settings menu dialogs
//
// Functions:
//   showActiveObserversDialog()
//   showStartupFileDialog()
//   showFixedObserverDialog()
//   showDatumDialog()
//   showEingabeartDialog()
//   showAusgabeartDialog()
//   showChangePasswordDialog()
//
// Dependencies (from main.js globals):
//   i18nStrings, currentLanguage, observerData
//   window.haloData, window.haloConfig
//   showNotification(), loadObserverCodes(), validatePassword()
//   clearMenuHighlights()
//
// Dependencies (from other modules):
//   escapeHtml, showWarningModal, showErrorDialog, showConfirmDialog,
//   setupModalKeyboard, setupModalCleanup (modal-utils.js)
// ============================================================================


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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();

        // Decision #033: Keyboard handling + cleanup
        setupModalKeyboard(modalEl, document.getElementById('btn-active-ok'));
        setupModalCleanup(modalEl);

        // clearMenuHighlights on close (settings menu)
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights());

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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();

        setupModalKeyboard(modalEl, document.getElementById('btn-startup-ok'));

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

        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
    } catch (error) {
        showErrorDialog(i18nStrings.messages.error_loading_file_list + ': ' + error.message);
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
            options += `<option value="${obs.KK}" ${selected}>${obs.KK} - ${escapeHtml(obs.VName)} ${escapeHtml(obs.NName)}</option>`;
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        // Decision #033: Keyboard handling + cleanup
        setupModalKeyboard(modalEl, document.getElementById('btn-fixed-observer-ok'));
        setupModalCleanup(modalEl);
        
        document.getElementById('btn-fixed-observer-ok').addEventListener('click', async () => {
            const select = document.getElementById('fixed-observer-select');
            const newObserver = select.value;

            const response = await fetch('/api/config/fixed_observer', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({observer: newObserver})
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const errMsg = data.error || i18nStrings.messages.error_saving;
                showErrorDialog(errMsg);
                return;
            }

            modal.hide();
        });
        
        // clearMenuHighlights on close (settings menu)
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights());
        
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        setupModalKeyboard(modalEl, document.getElementById('btn-datum-ok'));
        
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
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({mode: newMode, month: month, year: year})
            });
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
        
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        setupModalKeyboard(modalEl, document.getElementById('btn-eingabeart-ok'));
        
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
        
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
        
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        setupModalKeyboard(modalEl, document.getElementById('btn-ausgabeart-ok'));
        
        document.getElementById('btn-ausgabeart-ok').addEventListener('click', async () => {
            const selected = document.querySelector('input[name="ausgabeart"]:checked');
            const newMode = selected ? selected.value : 'P';
            
            modal.hide();
            
            if (newMode !== currentMode) {
                await fetch('/api/config/outputmode', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({mode: newMode})
                });
                // Silent success: no confirmation dialogs
            }
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
        
    } catch (error) {}
}

// Show change password dialog (cloud mode only)
window.showChangePasswordDialog = async function showChangePasswordDialog() {
    try {
        const i18n = i18nStrings.settings;
        if (!i18n) {
            throw new Error('Missing i18nStrings.settings');
        }
        
        // Check if user is admin
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        const isAdmin = config.is_admin || false;
        
        let modalHtml;
        
        if (isAdmin) {
            // Admin mode: Select user + password
            const observersResponse = await fetch('/api/observers/list');
            const observersPayload = await observersResponse.json();
            const observers = Array.isArray(observersPayload)
                ? observersPayload
                : (observersPayload && Array.isArray(observersPayload.observers) ? observersPayload.observers : []);
            
            const observerOptions = observers.map(obs => 
                `<option value="${obs.KK}">${obs.KK} - ${escapeHtml(obs.VName)} ${escapeHtml(obs.NName)}</option>`
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        setupModalKeyboard(modalEl, document.getElementById('btn-change-password'));
        
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
                    showError(i18nStrings.messages.target_user_password_required);
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
                        method: 'PUT',
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
                        const userName = selectedUser === 'admin' ? i18n.admin_user : escapeHtml(selectedUser);
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
                    showError(i18nStrings.messages.current_new_password_required);
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
                    const apiBase = config.cloud_mode ? '' : config.cloud_server_url;
                    if (!config.cloud_mode && !apiBase) {
                        showError(i18nStrings.messages.error_loading);
                        return;
                    }
                    const changeUrl = apiBase === '' ? '/api/change-password' : `${apiBase.replace(/\/$/, '')}/api/change-password`;
                    const response = await fetch(changeUrl, {
                        method: 'PUT',
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
        
        modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });
        setupModalCleanup(modalEl);
        
    } catch (error) {
        console.error('showChangePasswordDialog failed:', error);
        if (typeof showErrorDialog === 'function') {
            showErrorDialog(i18nStrings.messages.error_loading);
        }
    }
};
