// ============================================================================
// OBSERVER MANAGEMENT — Add, Edit, Delete observers and sites
// ============================================================================
// Extracted from main.js — Observer CRUD dialogs + site form helpers
//
// Functions:
//   showAddObserverDialog()
//   showDeleteObserverDialog()
//   showDeleteObserverConfirmDialog()
//   showEditObserverDialog()
//   showEditTypeDialog()
//   showEditBaseDataDialog()
//   generateSiteFormOptions()
//   generateSiteFormFields()
//   populateSiteForm()
//   collectSiteFormData()
//   showAddSiteDialog()
//   showEditSiteDialog()
//   showEditSiteConfirmDialog()
//   showEditSiteFormDialog()
//   showDeleteSiteDialog()
//   showDeleteSiteConfirmDialog()
//
// Dependencies (from main.js globals):
//   i18nStrings, currentLanguage, observerData, isCloudMode
//   GEOGRAPHIC_REGIONS, YEAR_MIN, YEAR_MAX
//   window.haloData, window.haloConfig
//   showNotification(), loadObserverCodes(), validatePassword()
//
// Dependencies (from other modules):
//   escapeHtml, showWarningModal, showErrorDialog, showConfirmDialog,
//   setupModalKeyboard, setupModalCleanup (modal-utils.js)
//   calculateFieldConstraints (field-constraints.js)
// ============================================================================


// Show add observer dialog
async function showAddObserverDialog(formData = null) {
    // Ensure i18n is loaded
    if (!i18nStrings.observers) {
        await loadI18n(currentLanguage);
    }
    
    // Check for fixed observer
    let fixedObserver = '';
    try {
        const response = await fetch('/api/config/setting?key=FIXED_OBSERVER');
        const config = await response.json();
        fixedObserver = config.value || '';
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
        return `<option value="${year}">${year}</option>`;
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
                                        <span class="input-group-text">°</span>
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
                                        <span class="input-group-text">°</span>
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
                                        <span class="input-group-text">°</span>
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
                                        <span class="input-group-text">°</span>
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
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-add-observer-ok" disabled>${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('add-observer-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    const errEl = document.getElementById('observer-error');
    const okBtn = document.getElementById('btn-add-observer-ok');
    
    // Check required fields - OK button only enabled when all filled
    const checkRequired = () => {
        const allFilled = 
            document.getElementById('obs-kk').value.trim() !== '' &&
            document.getElementById('obs-vname').value.trim() !== '' &&
            document.getElementById('obs-nname').value.trim() !== '' &&
            document.getElementById('obs-hb-ort').value.trim() !== '' &&
            document.getElementById('obs-gh').value !== '' &&
            document.getElementById('obs-nb-ort').value.trim() !== '' &&
            document.getElementById('obs-gn').value !== '';
        okBtn.disabled = !allFilled;
    };
    
    // Attach listeners for required text inputs (input event for real-time feedback)
    ['obs-kk', 'obs-vname', 'obs-nname', 'obs-hb-ort', 'obs-nb-ort'].forEach(id => {
        document.getElementById(id).addEventListener('input', checkRequired);
    });
    // Attach listeners for required selects (change event)
    ['obs-gh', 'obs-gn'].forEach(id => {
        document.getElementById(id).addEventListener('change', checkRequired);
    });
    
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
        
        // Enable OK button if form data was restored with all required fields
        checkRequired();
    });
    
    // Decision #033: Enter key triggers OK, excludes TEXTAREA and SELECT
    setupModalKeyboard(modalEl, document.getElementById('btn-add-observer-ok'));

    // Navigate home when dismissed via X or Cancel (not via OK)
    let addOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!addOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });
    
    // Handle save button
    document.getElementById('btn-add-observer-ok').addEventListener('click', async () => {
        addOkClicked = true;
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
                if (result.error && result.error.includes('observer_code_exists')) {
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
            clearMenuHighlights();
            
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
    
    setupModalCleanup(modalEl);
}

// Delete Observer Dialog Functions
async function showDeleteObserverDialog() {
    
    // Check for fixed observer
    let fixedObserver = '';
    try {
        const response = await fetch('/api/config/setting?key=FIXED_OBSERVER');
        const config = await response.json();
        fixedObserver = config.value || '';
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
            `<option value="${obs.KK}">${obs.KK} ${escapeHtml(obs.VName)} ${escapeHtml(obs.NName)}</option>`
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        // Decision #033: Keyboard handling + cleanup
        setupModalKeyboard(modalEl, document.getElementById('btn-select-delete-observer-ok'));

        // Navigate home when dismissed via X or Cancel (not via OK)
        let deleteSelectOkClicked = false;
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!deleteSelectOkClicked) {
                window.navigateInternal('/');
            }
        }, { once: true });

        setupModalCleanup(modalEl);
        
        // Handle OK button
        document.getElementById('btn-select-delete-observer-ok').addEventListener('click', async () => {
            deleteSelectOkClicked = true;
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
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

async function showDeleteObserverConfirmDialog(observer, sites) {
    
    // Build table rows
    const tableRows = sites.map(site => {
        const yearNum = parseInt(site.seit_year);
        const monthName = i18nStrings.months[site.seit_month];
        const seitDisplay = `${String(site.seit_month).padStart(2, '0')}/${String(yearNum % 100).padStart(2, '0')}`;
        const aktivDisplay = site.active === 1 ? i18nStrings.common.yes : i18nStrings.common.no;
        
        return `
            <tr>
                <td>${observer.KK}</td>
                <td>${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</td>
                <td>${seitDisplay}</td>
                <td>${aktivDisplay}</td>
                <td>${escapeHtml(site.HbOrt)}</td>
                <td>${String(site.GH).padStart(2, '0')}</td>
                <td>${site.HLG}° ${site.HLM}' ${site.HOW} / ${site.HBG}° ${site.HBM}' ${site.HNS}</td>
                <td>${escapeHtml(site.NbOrt)}</td>
                <td>${String(site.GN).padStart(2, '0')}</td>
                <td>${site.NLG}° ${site.NLM}' ${site.NOW} / ${site.NBG}° ${site.NBM}' ${site.NNS}</td>
            </tr>`;
    }).join('');
    
    const modalHtml = `
        <div class="modal fade" id="delete-observer-confirm-modal" tabindex="-1">
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.delete_observer}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup (Enter → No = safe, destructive dialog)
    setupModalKeyboard(modalEl, document.getElementById('btn-delete-observer-no'));

    // Navigate home when dismissed via X or No (not via Yes-success)
    let deleteConfirmOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!deleteConfirmOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
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
            deleteConfirmOkClicked = true;
            modal.hide();
            
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
}

// Edit Observer Dialog Functions
async function showEditObserverDialog() {

    // Check for fixed observer
    let fixedObserver = '';
    try {
        const response = await fetch('/api/config/setting?key=FIXED_OBSERVER');
        const config = await response.json();
        fixedObserver = config.value || '';
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
            `<option value="${obs.KK}">${obs.KK} ${escapeHtml(obs.VName)} ${escapeHtml(obs.NName)}</option>`
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();
        
        // Decision #033: Keyboard handling + cleanup
        setupModalKeyboard(modalEl, document.getElementById('btn-select-observer-ok'));

        // Navigate home when dismissed via X or Cancel (not via OK)
        let editSelectOkClicked = false;
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!editSelectOkClicked) {
                window.navigateInternal('/');
            }
        }, { once: true });

        setupModalCleanup(modalEl);
        
        // Handle OK button
        document.getElementById('btn-select-observer-ok').addEventListener('click', () => {
            editSelectOkClicked = true;
            const selectedKK = document.getElementById('observer-select').value;
            if (!selectedKK) {
                return;
            }
            
            const selectedObserver = observers.find(obs => obs.KK === selectedKK);
            document.activeElement?.blur();
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.remove();
                showEditTypeDialog(selectedObserver);
            });
        });
        
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
                        <h5 class="modal-title">${i18nStrings.observers.modify_title}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup
    setupModalKeyboard(modalEl, document.getElementById('btn-edit-type-ok'));

    // Navigate home when dismissed via X or Cancel (not via OK)
    let editTypeOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!editTypeOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    // Handle OK button
    document.getElementById('btn-edit-type-ok').addEventListener('click', () => {
        editTypeOkClicked = true;
        const selectedType = document.querySelector('input[name="editType"]:checked').value;
        document.activeElement?.blur();
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
}

function showEditBaseDataDialog(observer) {
    
    const modalHtml = `
        <div class="modal fade" id="edit-base-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
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
                                    <input type="text" class="form-control form-control-sm" id="edit-vname" value="${escapeHtml(observer.VName)}" maxlength="15" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.last_name_label} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control form-control-sm" id="edit-nname" value="${escapeHtml(observer.NName)}" maxlength="15" required>
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup
    setupModalKeyboard(modalEl, document.getElementById('btn-edit-base-ok'));

    // Navigate home when dismissed via X or Cancel (not via OK)
    let editBaseOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!editBaseOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    const errEl = document.getElementById('edit-base-error');
    
    // Handle save button
    document.getElementById('btn-edit-base-ok').addEventListener('click', async () => {
        editBaseOkClicked = true;
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
                errEl.textContent = i18nStrings.observers['error_' + result.error];
                errEl.style.display = 'block';
                return;
            }
            
            // Success - close modal
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_updated}`);
            clearMenuHighlights();
            
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
}

/**
 * Observer Site Management Functions
 * Functions for adding, editing, and deleting observation sites
 */

// Generate option lists for observer site forms (shared across all site dialogs)
function generateSiteFormOptions() {
    const monthOptions = Array.from({length: 12}, (_, i) => {
        const monthNum = i + 1;
        const monthName = i18nStrings.months[monthNum];
        return `<option value="${monthNum}">${monthName}</option>`;
    }).join('');
    
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
    }).join('');
    
    const regionOptions = Object.keys(i18nStrings.geographic_regions).map(regionNum => {
        const regionName = i18nStrings.geographic_regions[regionNum];
        if (regionName) {
            return `<option value="${regionNum.padStart(2, '0')}">${regionNum.padStart(2, '0')} - ${regionName}</option>`;
        }
        return '';
    }).filter(opt => opt).join('');
    
    const latDegOptions = Array.from({length: 91}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const lonDegOptions = Array.from({length: 181}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const minOptions = Array.from({length: 60}, (_, i) => `<option value="${i}">${i}</option>`).join('');
    
    return { monthOptions, yearOptions, regionOptions, latDegOptions, lonDegOptions, minOptions };
}

// Generate observer site form fields HTML
// prefix: ID prefix for all fields (e.g. 'site-', 'edit-site-')
// disabled: true for read-only display (confirm/delete dialogs)
// showRequired: true to show * markers on labels
function generateSiteFormFields(prefix, options, { disabled = false, showRequired = true } = {}) {
    const d = disabled ? ' disabled' : '';
    const r = disabled ? '' : ' required';
    const req = showRequired ? ' <span class="text-danger">*</span>' : '';
    const empty = disabled ? '<option value="">--</option>' : '';
    const { monthOptions, yearOptions, regionOptions, latDegOptions, lonDegOptions, minOptions } = options;
    
    return `<div class="row g-2">
                                <!-- Since (Month/Year) and Active -->
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_month_label}${req}</label>
                                    <select class="form-select form-select-sm" id="${prefix}seit-month"${r}${d}>
                                        ${empty}
                                        ${monthOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.since_year_label}${req}</label>
                                    <select class="form-select form-select-sm" id="${prefix}seit-year"${r}${d}>
                                        ${empty}
                                        ${yearOptions}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.common.active}${req}</label>
                                    <select class="form-select form-select-sm" id="${prefix}active"${r}${d}>
                                        <option value="1">${i18nStrings.common.yes}</option>
                                        <option value="0">${i18nStrings.common.no}</option>
                                    </select>
                                </div>
                                
                                <!-- Main Observation Site -->
                                <div class="col-12 mt-2">
                                    <h6 class="mb-1">${i18nStrings.observers.primary_site_label}</h6>
                                </div>
                                <div class="col-md-8">
                                    <label class="form-label small mb-0">${i18nStrings.observers.primary_site_label}${req}</label>
                                    <input type="text" class="form-control form-control-sm" id="${prefix}hb-ort" maxlength="20"${r}${d}>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label}${req}</label>
                                    <select class="form-select form-select-sm" id="${prefix}gh"${r}${d}>
                                        ${empty}
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Main Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label}${req}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="${prefix}hlg"${r}${d}>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">°</span>
                                        <select class="form-select" id="${prefix}hlm"${r}${d}>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="${prefix}how" style="max-width: 70px;"${r}${d}>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label}${req}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="${prefix}hbg"${r}${d}>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">°</span>
                                        <select class="form-select" id="${prefix}hbm"${r}${d}>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="${prefix}hns" style="max-width: 70px;"${r}${d}>
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
                                    <label class="form-label small mb-0">${i18nStrings.observers.secondary_site_label}${req}</label>
                                    <input type="text" class="form-control form-control-sm" id="${prefix}nb-ort" maxlength="20"${r}${d}>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">${i18nStrings.observers.region_label}${req}</label>
                                    <select class="form-select form-select-sm" id="${prefix}gn"${r}${d}>
                                        ${empty}
                                        ${regionOptions}
                                    </select>
                                </div>
                                
                                <!-- Secondary Site Coordinates -->
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.longitude_label}${req}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="${prefix}nlg"${r}${d}>
                                            ${lonDegOptions}
                                        </select>
                                        <span class="input-group-text">°</span>
                                        <select class="form-select" id="${prefix}nlm"${r}${d}>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="${prefix}now" style="max-width: 70px;"${r}${d}>
                                            <option value="O">O</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">${i18nStrings.observers.latitude_label}${req}</label>
                                    <div class="input-group input-group-sm">
                                        <select class="form-select" id="${prefix}nbg"${r}${d}>
                                            ${latDegOptions}
                                        </select>
                                        <span class="input-group-text">°</span>
                                        <select class="form-select" id="${prefix}nbm"${r}${d}>
                                            ${minOptions}
                                        </select>
                                        <span class="input-group-text">'</span>
                                        <select class="form-select" id="${prefix}nns" style="max-width: 70px;"${r}${d}>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>
                            </div>`;
}

// Populate a site form with data from a site object
function populateSiteForm(prefix, site) {
    const yearNum = parseInt(site.seit_year);
    
    document.getElementById(`${prefix}seit-month`).value = site.seit_month;
    document.getElementById(`${prefix}seit-year`).value = yearNum;
    document.getElementById(`${prefix}active`).value = site.active;
    document.getElementById(`${prefix}hb-ort`).value = site.HbOrt;
    document.getElementById(`${prefix}gh`).value = String(site.GH).padStart(2, '0');
    document.getElementById(`${prefix}hlg`).value = site.HLG;
    document.getElementById(`${prefix}hlm`).value = site.HLM;
    document.getElementById(`${prefix}how`).value = site.HOW;
    document.getElementById(`${prefix}hbg`).value = site.HBG;
    document.getElementById(`${prefix}hbm`).value = site.HBM;
    document.getElementById(`${prefix}hns`).value = site.HNS;
    document.getElementById(`${prefix}nb-ort`).value = site.NbOrt;
    document.getElementById(`${prefix}gn`).value = String(site.GN).padStart(2, '0');
    document.getElementById(`${prefix}nlg`).value = site.NLG;
    document.getElementById(`${prefix}nlm`).value = site.NLM;
    document.getElementById(`${prefix}now`).value = site.NOW;
    document.getElementById(`${prefix}nbg`).value = site.NBG;
    document.getElementById(`${prefix}nbm`).value = site.NBM;
    document.getElementById(`${prefix}nns`).value = site.NNS;
}

// Collect site form data into an object
function collectSiteFormData(prefix, observer) {
    return {
        KK: observer.KK,
        VName: observer.VName,
        NName: observer.NName,
        seit_month: parseInt(document.getElementById(`${prefix}seit-month`).value),
        seit_year: parseInt(document.getElementById(`${prefix}seit-year`).value),
        active: parseInt(document.getElementById(`${prefix}active`).value),
        HbOrt: document.getElementById(`${prefix}hb-ort`).value.trim(),
        GH: document.getElementById(`${prefix}gh`).value.padStart(2, '0'),
        HLG: parseInt(document.getElementById(`${prefix}hlg`).value),
        HLM: parseInt(document.getElementById(`${prefix}hlm`).value),
        HOW: document.getElementById(`${prefix}how`).value,
        HBG: parseInt(document.getElementById(`${prefix}hbg`).value),
        HBM: parseInt(document.getElementById(`${prefix}hbm`).value),
        HNS: document.getElementById(`${prefix}hns`).value,
        NbOrt: document.getElementById(`${prefix}nb-ort`).value.trim(),
        GN: document.getElementById(`${prefix}gn`).value.padStart(2, '0'),
        NLG: parseInt(document.getElementById(`${prefix}nlg`).value),
        NLM: parseInt(document.getElementById(`${prefix}nlm`).value),
        NOW: document.getElementById(`${prefix}now`).value,
        NBG: parseInt(document.getElementById(`${prefix}nbg`).value),
        NBM: parseInt(document.getElementById(`${prefix}nbm`).value),
        NNS: document.getElementById(`${prefix}nns`).value
    };
}

// Add new observation site
async function showAddSiteDialog(observer) {
    const options = generateSiteFormOptions();
    
    const modalHtml = `
        <div class="modal fade" id="add-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_add_site}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="add-site-form">
                            ${generateSiteFormFields('site-', options, { disabled: false, showRequired: true })}
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    const errEl = document.getElementById('site-error');
    
    // Decision #033: Keyboard handling + cleanup
    setupModalKeyboard(modalEl, document.getElementById('btn-add-site-ok'));

    // Navigate home when dismissed via X or Cancel (not via OK)
    let addSiteOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!addSiteOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    const btnAddSiteOk = document.getElementById('btn-add-site-ok');
    
    // Decision #034: OK disabled until mandatory fields filled
    const mandatorySelects = ['site-seit-month', 'site-seit-year', 'site-gh', 'site-gn'];
    const mandatoryInputs = ['site-hb-ort', 'site-nb-ort'];
    
    function updateAddSiteOkState() {
        const selectsFilled = mandatorySelects.every(id => document.getElementById(id).value);
        const inputsFilled = mandatoryInputs.every(id => document.getElementById(id).value.trim());
        btnAddSiteOk.disabled = !(selectsFilled && inputsFilled);
    }
    
    mandatorySelects.forEach(id => document.getElementById(id).addEventListener('change', updateAddSiteOkState));
    mandatoryInputs.forEach(id => document.getElementById(id).addEventListener('input', updateAddSiteOkState));
    btnAddSiteOk.disabled = true;
    
    // Handle save
    document.getElementById('btn-add-site-ok').addEventListener('click', async () => {
        addSiteOkClicked = true;
        try {
            errEl.style.display = 'none';
            
            // Collect form data
            const siteData = collectSiteFormData('site-', observer);
            
            // Validate
            if (!siteData.seit_month || !siteData.seit_year || !siteData.HbOrt || !siteData.GH || !siteData.NbOrt || !siteData.GN) {
                errEl.textContent = i18nStrings.observers.error_missing_required;
                errEl.style.display = 'block';
                return;
            }
            
            // Send to API
            const resp = await fetch(`/api/observers/${observer.KK}/sites`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(siteData)
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                errEl.textContent = i18nStrings.observers['error_' + result.error];
                errEl.style.display = 'block';
                return;
            }
            
            // Success
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_site_added}`);
            clearMenuHighlights();
            
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
    const options = generateSiteFormOptions();
    
    const modalHtml = `
        <div class="modal fade" id="edit-site-confirm-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_edit_site}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-2">${i18nStrings.observers.modify_edit_question}</p>
                        <form id="edit-site-confirm-form">
                            ${generateSiteFormFields('confirm-edit-site-', options, { disabled: true, showRequired: false })}
                        </form>
                        <p class="text-muted small mt-2" id="edit-site-confirm-counter">${i18nStrings.observers.delete_site_info.replace('{0}', currentIndex + 1).replace('{1}', sites.length)}</p>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-edit-site-no">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-edit-site-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('edit-site-confirm-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    const renderCurrentSite = () => {
        const site = sites[currentIndex];
        populateSiteForm('confirm-edit-site-', site);

        const counterEl = document.getElementById('edit-site-confirm-counter');
        if (counterEl) {
            counterEl.textContent = i18nStrings.observers.delete_site_info
                .replace('{0}', currentIndex + 1)
                .replace('{1}', sites.length);
        }
    };

    // Pre-fill form with existing values (disabled)
    renderCurrentSite();
    
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup (Enter → Yes = edit this site)
    setupModalKeyboard(modalEl, document.getElementById('btn-edit-site-yes'));

    // Navigate home when dismissed via X or Cancel
    let editSiteConfirmOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!editSiteConfirmOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    // Handle "No" button - show next site or close
    document.getElementById('btn-edit-site-no').addEventListener('click', () => {
        if (currentIndex < sites.length - 1) {
            currentIndex += 1;
            renderCurrentSite();
            return;
        }
        modal.hide();
    });
    
    // Handle "Yes" button - show editable form
    document.getElementById('btn-edit-site-yes').addEventListener('click', () => {
        editSiteConfirmOkClicked = true;
        modal.hide();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            showEditSiteFormDialog(observer, sites, currentIndex);
        });
    });
}

async function showEditSiteFormDialog(observer, sites, currentIndex) {
    const site = sites[currentIndex];
    const options = generateSiteFormOptions();
    
    const modalHtml = `
        <div class="modal fade" id="edit-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_edit_site}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-site-form">
                            ${generateSiteFormFields('edit-site-', options, { disabled: false, showRequired: true })}
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    // Pre-fill form with existing values
    populateSiteForm('edit-site-', site);
    
    modal.show();
    
    const errEl = document.getElementById('edit-site-error');
    
    // Decision #033: Keyboard handling + cleanup
    setupModalKeyboard(modalEl, document.getElementById('btn-edit-site-ok'));

    // Navigate home when dismissed via X or Cancel
    let editSiteFormOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!editSiteFormOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    // Store original seit for identifying the record
    const originalSeit = site.seit;
    
    // Handle save
    document.getElementById('btn-edit-site-ok').addEventListener('click', async () => {
        editSiteFormOkClicked = true;
        try {
            errEl.style.display = 'none';
            
            // Collect form data
            const siteData = collectSiteFormData('edit-site-', observer);
            siteData.seit_year = siteData.seit_year % 100;  // Convert 4-digit to 2-digit year
            
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
                errEl.textContent = i18nStrings.observers['error_' + result.error];
                errEl.style.display = 'block';
                return;
            }
            
            // Success
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
            
            // Show success message
            showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_site_updated}`);
            clearMenuHighlights();
            
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
    const options = generateSiteFormOptions();
    
    const modalHtml = `
        <div class="modal fade" id="delete-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_delete_site}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="delete-site-form">
                            ${generateSiteFormFields('delete-site-', options, { disabled: true, showRequired: true })}
                        </form>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-delete-site-no">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-delete-site-yes">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('delete-site-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    const renderCurrentSite = () => {
        const site = sites[currentIndex];
        populateSiteForm('delete-site-', site);
    };

    // Pre-fill form with existing values (disabled)
    renderCurrentSite();
    
    modal.show();
    
    // Decision #033: Keyboard handling + cleanup (Enter → No = safe, destructive dialog)
    setupModalKeyboard(modalEl, document.getElementById('btn-delete-site-no'));

    // Navigate home when dismissed via X or Cancel
    let deleteSiteOkClicked = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!deleteSiteOkClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    // Handle "No" button - show next site or close
    document.getElementById('btn-delete-site-no').addEventListener('click', () => {
        if (currentIndex < sites.length - 1) {
            currentIndex += 1;
            renderCurrentSite();
            return;
        }
        modal.hide();
    });
    
    // Handle "Yes" button - delete the site
    document.getElementById('btn-delete-site-yes').addEventListener('click', async () => {
        deleteSiteOkClicked = true;
        try {
            const site = sites[currentIndex];
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
            clearMenuHighlights();
            
            setTimeout(() => {
                if (window.location.pathname === '/observers') {
                    window.location.reload();
                }
            }, 1500);
            
        } catch (e) {
            showErrorDialog(e.message);
        }
    });
}

