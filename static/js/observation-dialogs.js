// ============================================================================
// OBSERVATION DIALOGS — Display, Modify, Delete, Select
// ============================================================================
// Extracted from main.js — Observation CRUD dialogs and selection
//
// Functions:
//   showModifyObservationsDialog()
//   showModifyFilterDialog()
//   showModifySingleObservations()
//   showModifyGroupObservations()
//   showGroupModifyDialogMenu()
//   processBulkUpdate()
//   showDeleteObservationsDialog()
//   showDeleteSingleObservations()
//   applyFilterToObservations()
//   formatObservationForDisplay()
//   showObservationFormForEdit()
//   showObservationFormForDelete()
//   showDisplayObservationsDialog()
//   showDisplayCompactList()
//   kurzausgabe()
//   showDisplaySingleObservations()
//   showObservationFormForView()
//   showSelectDialog()
//
// Dependencies (from main.js globals):
//   i18nStrings, currentLanguage, observerData, isCloudMode
//   VALID_HALO_TYPES, CIRCULAR_HALOS, COMBINED_HALO_TYPES
//   PILLAR_HEIGHT_VALUES, ALL_PILLAR_HEIGHT_VALUES
//   window.haloData, window.haloConfig
//   triggerAutosave(), refreshFileStatus(), showNotification()
//   clearMenuHighlights(), highlightMenu()
//
// Dependencies (from other modules):
//   ObservationForm (observation-form.js)
//   FilterDialog (filter-dialog.js)
//   escapeHtml, showWarningModal, showErrorDialog, showConfirmDialog,
//   setupModalKeyboard, setupModalCleanup (modal-utils.js)
// ============================================================================


// Ask if user wants to perform another operation (modify/delete).
// Default button is Yes (primary) since the user still needs to select the observation.
function showAnotherOperationDialog(title, message) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const modalHtml = `
            <div class="modal fade" id="another-operation-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h6 class="modal-title mb-0">${title}</h6>
                        </div>
                        <div class="modal-body py-3">
                            <p class="mb-0">${message}</p>
                        </div>
                        <div class="modal-footer py-2">
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-another-no">${i18nStrings.common.no}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-another-yes">${i18nStrings.common.yes}</button>
                        </div>
                    </div>
                </div>
            </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modalEl = document.getElementById('another-operation-modal');
            const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

            let resolved = false;

            const btnYes = modalEl.querySelector('#btn-another-yes');

            btnYes.addEventListener('click', () => {
                if (!resolved) {
                    resolved = true;
                    modal.hide();
                    resolve(true);
                }
            });

            modalEl.querySelector('#btn-another-no').addEventListener('click', () => {
                if (!resolved) {
                    resolved = true;
                    modal.hide();
                    resolve(false);
                }
            });

            modalEl.addEventListener('hidden.bs.modal', () => {
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
                modalEl.remove();
            });

            modal.show();
            setupModalKeyboard(modalEl, btnYes);
        }, 300);
    });
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    const btnOk = document.getElementById('btn-modify-ok');
    let okClicked = false;
    
    // Decision #033: consistent keyboard + cleanup
    setupModalKeyboard(modalEl, btnOk);

    // Navigate home when dismissed (X, Cancel, ESC) but not when OK was clicked
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!okClicked) {
            window.navigateInternal('/');
        }
    }, { once: true });

    setupModalCleanup(modalEl);
    
    modal.show();
    
    // Handle OK button
    btnOk.addEventListener('click', async () => {
        okClicked = true;
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
            window.navigateInternal('/');
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
    let isFormShown = false;

    const onSave = async (modifiedObs) => {
            const obs = filteredObs[currentIndex];
            // Delete the old observation and insert the modified one
            try {
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
                
                const result = await resp.json();
                
                // Sync state from server (count, dirty flag, display)
                await refreshFileStatus();
                
                // Trigger autosave
                await triggerAutosave();
                
                const successMsg = i18nStrings.messages.observation_modified;
                showNotification('<strong>✓</strong> ' + successMsg);
                
                // After form closes, ask if user wants to modify another observation
                form.modalElement.addEventListener('hidden.bs.modal', async () => {
                    const another = await showAnotherOperationDialog(
                        i18nStrings.observations.modify_another_title,
                        i18nStrings.observations.modify_another_message
                    );
                    if (another) {
                        showModifyObservationsDialog();
                    } else {
                        window.navigateInternal('/');
                    }
                }, { once: true });
            } catch (e) {showErrorDialog(i18nStrings.common.error + ': ' + e.message);
            }
    };

    const onNext = () => {
        currentIndex += 1;
        showObservationAt(currentIndex);
    };

    const onPrev = () => {
        currentIndex -= 1;
        showObservationAt(currentIndex);
    };

    const onCancel = () => {
        window.navigateInternal('/');
    };

    const showObservationAt = async (index) => {
        if (index < 0) {
            index = 0;
        }
        if (index >= filteredObs.length) {
            // All observations processed - return to main menu
            form.navigating = true;
            form.hideModal();
            window.navigateInternal('/');
            return;
        }

        currentIndex = index;
        const obs = filteredObs[currentIndex];

        if (!isFormShown) {
            form.show('edit', obs, onSave, onCancel, currentIndex + 1, filteredObs.length, null, onNext, onPrev, onCancel);
            isFormShown = true;
        } else {
            form.navigateTo(obs, currentIndex + 1, filteredObs.length);
        }
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
    // Load observers and fixed observer configuration
    let fixedObserver = null;
    let observerOptions = '';
    try {
        // Load fixed observer in parallel with observers
        const [observers, configResp] = await Promise.all([
            fetchObserversDeduped(),
            fetch('/api/config/setting?key=FIXED_OBSERVER').then(r => r.ok ? r.json() : {}).catch(() => ({}))
        ]);
        fixedObserver = configResp.value || null;

        observerOptions = observers.map(obs => {
            const kk = String(obs.kk).padStart(2, '0');
            const selected = (fixedObserver && String(obs.kk) === String(fixedObserver)) ? ' selected' : '';
            return `<option value="${obs.kk}"${selected}>${kk} - ${escapeHtml(obs.vname)} ${escapeHtml(obs.nname)}</option>`;
        }).join('');
    } catch (e) {showWarningModal(i18nStrings.messages.error_loading_observers);
        return;
    }
    
    // Build year options (4-digit: 1980-2079)
    const yearOptions = Array.from({length: YEAR_MAX - YEAR_MIN + 1}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
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
                                    <option value="99">//</option>
                                    ${Array.from({length: 37}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')} h</option>`).join('')}
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
                                        <label class="form-label">${i18nStrings.fields.ho_label}</label>
                                        <select class="form-select form-select-sm" id="group-ho">
                                            <option value="">--</option>
                                            ${Array.from({length: 90}, (_, i) => `<option value="${i+1}">${String(i+1).padStart(2, '0')}?</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label">${i18nStrings.fields.hu_label}</label>
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    const okBtn = document.getElementById('btn-modify-group-ok');
    let okClicked = false;
    setupModalKeyboard(modalEl, okBtn);

    // Cancel/Close should return to main and clear active menu highlight.
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!okClicked) {
            clearMenuHighlights();
            window.navigateInternal('/');
            return;
        }
        modalEl.remove();
    });

    modal.show();
    
    // Handle OK button
    okBtn.addEventListener('click', async () => {
        okClicked = true;
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
        

        // Sync state from server (count, dirty flag, display)
        await refreshFileStatus();
        

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
    let isFormShown = false;

    const showNextObservation = async () => {
        if (currentIndex >= filteredObs.length) {
            form.navigating = true;
            form.hideModal();
            window.navigateInternal('/');
            return;
        }

        const obs = filteredObs[currentIndex];

        if (!isFormShown) {
            form.show('delete', obs, null, null, currentIndex + 1, filteredObs.length, i18nStrings.observations.delete_question, async () => {
            // Yes -> check SHOW_WARNINGS before deleting
            let deletePayload = { ...obs, delete_photos: false };
            let showWarnings = true;
            try {
                const warnResp = await fetch('/api/config/setting?key=SHOW_WARNINGS');
                const warnData = await warnResp.json();
                showWarnings = warnData.value !== false;
            } catch (e) {}

            if (showWarnings) {
                let deletePhotosForced = false;
                let hasPhotos = false;
                try {
                    const policyResp = await fetch('/api/observations/delete/photo-policy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(obs)
                    });
                    if (policyResp.ok) {
                        const policyData = await policyResp.json();
                        deletePhotosForced = !!policyData.force_delete_photos;
                        hasPhotos = !!policyData.has_photos;
                    }
                } catch (e) {}

                // Show confirmation dialog with "don't warn again" checkbox
                const confirmId = 'confirm-delete-' + Date.now();
                const noId = confirmId + '-no';
                const yesId = confirmId + '-yes';
                const checkId = confirmId + '-check';
                const photoCheckId = confirmId + '-photo-check';
                const photoCheckHtml = hasPhotos ? `
                           <div class="form-check mt-2">
                               <input class="form-check-input" type="checkbox" id="${photoCheckId}" ${deletePhotosForced ? 'checked disabled' : ''}>
                               <label class="form-check-label" for="${photoCheckId}">${deletePhotosForced ? i18nStrings.observations.delete_include_photos_forced : i18nStrings.observations.delete_include_photos}</label>
                           </div>` : '';
                const footer = createModalButton(i18nStrings.common.no, 'primary', { id: noId, dismiss: true }) +
                               createModalButton(i18nStrings.common.yes, 'secondary', { id: yesId });
                const { modal: confirmModal, modalEl: confirmEl } = showSimpleModal({
                    title: i18nStrings.common.warning,
                    body: `<p>${i18nStrings.observations.delete_confirm_warning}</p>${photoCheckHtml}
                           <div class="form-check mt-2">
                               <input class="form-check-input" type="checkbox" id="${checkId}">
                               <label class="form-check-label" for="${checkId}">${i18nStrings.common.dont_warn_again}</label>
                           </div>`,
                    footer
                });
                let confirmed = false;
                let deletePhotos = deletePhotosForced;
                const dontWarnCheckbox = document.getElementById(checkId);
                const deletePhotosCheckbox = hasPhotos ? document.getElementById(photoCheckId) : null;
                document.getElementById(yesId).addEventListener('click', () => {
                    if (deletePhotosCheckbox) {
                        deletePhotos = deletePhotosCheckbox.checked;
                    }
                    confirmed = true;
                    confirmModal.hide();
                });
                setupModalKeyboard(confirmEl, { defaultButtonId: noId, enterButtonId: noId });
                await new Promise(resolve => {
                    confirmEl.addEventListener('hide.bs.modal', () => {
                        // Save "don't warn again" preference if checked (regardless of Yes/No)
                        if (dontWarnCheckbox?.checked) {
                            fetch('/api/config/setting', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ key: 'SHOW_WARNINGS', value: false })
                            });
                        }
                    }, { once: true });
                    confirmEl.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
                });
                if (!confirmed) return;
                deletePayload = { ...obs, delete_photos: deletePhotos };
            }

            try {
                // Delete on server
                const resp = await fetch('/api/observations/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deletePayload)
                });

                if (!resp.ok) {
                    throw new Error('Delete endpoint responded ' + resp.status);
                }

                const result = await resp.json();
                
                // Sync state from server (count, dirty flag, display)
                await refreshFileStatus();
                
                await triggerAutosave();

                const msg = `${i18nStrings.common.observation} ${i18nStrings.common.deleted}`;
                showNotification(`<strong>✓</strong> ${msg}`);
                
                // Prevent form's hidden handler from calling cancel
                form.saved = true;
                
                // After form closes, ask if user wants to delete another observation
                form.modalElement.addEventListener('hidden.bs.modal', async () => {
                    const another = await showAnotherOperationDialog(
                        i18nStrings.observations.delete_another_title,
                        i18nStrings.observations.delete_another_message
                    );
                    if (another) {
                        showDeleteObservationsDialog();
                    } else {
                        window.navigateInternal('/');
                    }
                }, { once: true });
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
            isFormShown = true;
        } else {
            form.navigateTo(obs, currentIndex + 1, filteredObs.length);
        }
    };

    showNextObservation();
}

// Apply filter criteria to observations
async function applyFilterToObservations(filterState) {
    // Use server-side filtering for performance (SQL in cloud mode, Python in local mode)
    try {
        const response = await fetch('/api/observations/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                criterion1: filterState.criterion1 || null,
                value1: filterState.value1 !== undefined ? filterState.value1 : null,
                criterion2: filterState.criterion2 || null,
                value2: filterState.value2 !== undefined ? filterState.value2 : null
            })
        });
        if (response.ok) {
            const data = await response.json();
            return data.observations || [];
        }
        return [];
    } catch (error) {
        return [];
    }
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
        html += `<strong>${i18nStrings.fields.sectors}:</strong> ${escapeHtml(obs.sectors.trim())}<br>`;
    }
    
    // Remarks
    if (obs.remarks && obs.remarks.trim()) {
        html += `<strong>${i18nStrings.fields.remarks}:</strong> ${escapeHtml(obs.remarks.trim())}<br>`;
    }
    
    return html;
}

// Show observation form for editing
async function showObservationFormForEdit(obs, currentNum, totalNum, onModified, onCancelled, obsIndex = null, onNext = null, onPrev = null) {
    const form = new ObservationForm();
    await form.initialize('edit');
    
    form.show('edit', obs, async (modifiedObs) => {
        // Delete the old observation and insert the modified one
        try {
            const logs = [];
            
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
            
            const result = await resp.json();
            
            // Save logs to sessionStorage for later viewing
            sessionStorage.setItem('lastEditLogs', logs.join('\n'));
            
            // Sync state from server (count, dirty flag, display)
            await refreshFileStatus();
            
            // Trigger autosave
            await triggerAutosave();
            
            const successMsg = i18nStrings.messages.observation_modified;
            sessionStorage.setItem('pendingNotification', JSON.stringify({
                message: '<strong>?</strong> ' + successMsg,
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
    try {
        // Get config to check cloud mode
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        
        // Only check for loaded data in Local Mode
        // In Cloud Mode, data is always in database
        if (!isCloudMode) {
            try {
                const statusResponse = await fetch('/api/file/status');
                if (!statusResponse.ok) {
                    await showWarningModal(i18nStrings.messages.no_data);
                    clearMenuHighlights();
                    return;
                }

                const status = await statusResponse.json();
                if (!status.filename) {
                    await showWarningModal(i18nStrings.observations.no_file_loaded);
                    clearMenuHighlights();
                    return;
                }

                if (!status.count || status.count === 0) {
                    await showWarningModal(i18nStrings.messages.no_data);
                    clearMenuHighlights();
                    return;
                }
            } catch (error) {
                await showWarningModal(i18nStrings.messages.no_data);
                clearMenuHighlights();
                return;
            }
        }

        // Initialize filter dialog (allowObserverChange: Cloud Mode users can select different observer)
        const filterDialog = new FilterDialog({ allowObserverChange: true });
        await filterDialog.initialize();
        
        // Show filter dialog with callbacks
        filterDialog.show(
        async (filterState) => {
            // onApply callback - filters have been applied
            // Check INPUT_MODE to decide display format
            try {
                const response = await fetch('/api/config/setting?key=INPUT_MODE');
                const config = await response.json();
                
                if (config.value === 'N') {
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
            clearMenuHighlights();
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
        showErrorDialog(i18nStrings.messages.error_loading_data);
        clearMenuHighlights();
    }
}

// Show compact list of observations in modal (Kurzausgabe - number format)
async function showDisplayCompactList(filterState) {
    const pageSize = 50;
    let currentPage = 1;
    let totalCount = 0;
    let maxPage = 1;

    // Build search params from filterState
    function buildSearchParams(page) {
        return {
            criterion1: filterState.criterion1 || null,
            value1: filterState.value1 !== undefined ? filterState.value1 : null,
            criterion2: filterState.criterion2 || null,
            value2: filterState.value2 !== undefined ? filterState.value2 : null,
            limit: pageSize,
            offset: (page - 1) * pageSize
        };
    }

    // Fetch a single page from the server
    async function fetchPage(page) {
        const response = await fetch('/api/observations/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildSearchParams(page))
        });
        if (!response.ok) return { observations: [], total: 0 };
        return await response.json();
    }

    // First page fetch to get total count
    const firstResult = await fetchPage(1);
    totalCount = firstResult.total || 0;

    if (totalCount === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        clearMenuHighlights();
        return;
    }

    maxPage = Math.ceil(totalCount / pageSize);
    let currentPageData = firstResult.observations || [];
    
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    // Display function (uses already-fetched currentPageData)
    const displayPage = () => {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + currentPageData.length, totalCount);
        
        // Generate compact lines using kurzausgabe
        const lines = currentPageData.map(obs => kurzausgabe(obs));
        document.getElementById('compact-list-content').textContent = lines.join('\n');
        
        // Update page info
        document.getElementById('page-info').textContent = `${i18nStrings.common.page} ${currentPage} ${i18nStrings.common.of} ${maxPage}`;
        
        // Update record info
        document.getElementById('record-info').textContent = `${i18nStrings.common.row} ${startIndex + 1}-${endIndex} ${i18nStrings.common.of} ${totalCount}`;
        
        // Update button states
        document.getElementById('btn-first').disabled = currentPage === 1;
        document.getElementById('btn-prev').disabled = currentPage === 1;
        document.getElementById('btn-next').disabled = currentPage === maxPage;
        document.getElementById('btn-last').disabled = currentPage === maxPage;
    };
    
    // Close button (OK)
    const btnClose = modalEl.querySelector('.modal-footer [data-bs-dismiss="modal"]');

    // Navigation handlers - fetch page from server, then display
    const goToPage = async (page) => {
        if (page < 1 || page > maxPage || page === currentPage) return;
        currentPage = page;
        const result = await fetchPage(page);
        currentPageData = result.observations || [];
        displayPage();
        btnClose.focus();
    };

    document.getElementById('btn-first').onclick = () => goToPage(1);
    document.getElementById('btn-prev').onclick = () => goToPage(currentPage - 1);
    document.getElementById('btn-next').onclick = () => goToPage(currentPage + 1);
    document.getElementById('btn-last').onclick = () => goToPage(maxPage);
    
    // Decision #033: Use setupModalKeyboard for Enter key ? OK button (closes modal)
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

// Kurzausgabe formatter - Direct 1:1 translation from H_BEOBNG.PAS lines 200-308
function kurzausgabe(obs) {
    // For web display: Monitor=True, Expo=False, sep1=0, sep2=32 (space)
    // Build the first six 5-char blocks without separators, then insert spaces.
    let first = '';
    const addBlockSpaces = (s) => {
        let out = '';
        for (let i = 0; i < s.length; i += 5) {
            const chunk = s.substring(i, i + 5);
            if (!chunk) break;
            out += chunk;
            if (chunk.length === 5) out += ' ';
        }
        return out;
    };
    
    // KK - observer code
    if (obs.KK < 100) {
        first += String(Math.floor(obs.KK / 10)) + String(obs.KK % 10);
    } else {
        first += String.fromCharCode(Math.floor(obs.KK / 10) + 55) + String(obs.KK % 10);
    }
    
    // O - object type
    first += String(obs.O);
    
    // JJ - year (2 digits for eing format)
    const jj2 = parseInt(obs.JJ) % 100;
    first += String(Math.floor(jj2 / 10)) + String(jj2 % 10);
    
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
    
    // d - origin/density (1 digit)
    if (obs.d === null || obs.d === -1) {
        first += '/';
    } else {
        first += String(obs.d);
    }
    
    // DD - duration (2 digits)
    if (obs.DD === null || obs.DD === -1) {
        first += '//';
    } else {
        first += String(Math.floor(obs.DD / 10)) + String(obs.DD % 10);
    }
    
    // N - cloud cover
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
    
    // EE - halo type (2 digits)
    first += String(Math.floor(obs.EE / 10)) + String(obs.EE % 10);
    
    // H - brightness
    if (obs.H === null || obs.H === -1) {
        first += '/';
    } else {
        first += String(obs.H);
    }
    
    // F - color
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
    
    // f - weather front (space if -1, not '/')
    if (obs.f === null || obs.f === -1) {
        first += ' ';
    } else {
        first += String(obs.f);
    }
    
    // zz - precipitation
    if (obs.zz === null || obs.zz === -1) {
        first += '  ';
    } else if (obs.zz === 99) {
        first += '//';
    } else {
        first += String(Math.floor(obs.zz / 10)) + String(obs.zz % 10);
    }
    
    // GG - geographic region (1-39)
    first += String(Math.floor(obs.GG / 10)) + String(obs.GG % 10);

    // Now insert spaces after every 5 characters for the first blocks
    let erg = addBlockSpaces(first);
    
    // 8HHHH - light pillar heights (Pascal lines 271-290)
    if (obs.EE === 8) {
        // Upper light pillar only
        if (obs.HO === null || obs.HO === -1) {
            erg += '8  //';  // HO not observed
        } else if (obs.HO === 0) {
            erg += '8  //';  // HO not relevant
        } else {
            erg += '8' + String(Math.floor(obs.HO / 10)) + String(obs.HO % 10) + '//';
        }
    } else if (obs.EE === 9) {
        // Lower light pillar only
        if (obs.HU === null || obs.HU === -1) {
            erg += '8//  ';  // HU not observed
        } else if (obs.HU === 0) {
            erg += '8//  ';  // HU not relevant
        } else {
            erg += '8//' + String(Math.floor(obs.HU / 10)) + String(obs.HU % 10);
        }
    } else if (obs.EE === 10) {
        // Both upper and lower light pillars
        erg += '8';
        if (obs.HO === null || obs.HO === -1 || obs.HO === 0) {
            erg += '  ';  // HO not observed or not relevant
        } else {
            erg += String(Math.floor(obs.HO / 10)) + String(obs.HO % 10);
        }
        if (obs.HU === null || obs.HU === -1 || obs.HU === 0) {
            erg += '  ';  // HU not observed or not relevant
        } else {
            erg += String(Math.floor(obs.HU / 10)) + String(obs.HU % 10);
        }
    } else {
        // No light pillar - always show 8//// (group identifier 8 + no data)
        erg += '8////';
    }
    
    // Separator after 8HHHH block
    erg += ' ';
    
    // Sectors - always exactly 15 chars (pad with spaces if shorter)
    let sectors = obs.sectors || '';
    // Trim and then pad to exactly 15 chars
    sectors = sectors.trim().substring(0, 15).padEnd(15, ' ');
    erg += sectors;
    
    // Separator before remarks
    erg += ' ';
    
    // Remarks - rest of line
    if (obs.remarks) {
        erg += obs.remarks.trim();
    }
    
    return erg;
}

// Show single observations for display (one by one with navigation)
async function showDisplaySingleObservations(filterState) {
    const bufferSize = 50;
    let buffer = [];        // current page of observations
    let bufferOffset = 0;   // global offset of first element in buffer
    let totalCount = 0;
    let currentIndex = 0;   // global index of current observation

    // Fetch a chunk of observations from the server
    async function fetchChunk(offset) {
        const response = await fetch('/api/observations/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                criterion1: filterState.criterion1 || null,
                value1: filterState.value1 !== undefined ? filterState.value1 : null,
                criterion2: filterState.criterion2 || null,
                value2: filterState.value2 !== undefined ? filterState.value2 : null,
                limit: bufferSize,
                offset: offset
            })
        });
        if (!response.ok) return { observations: [], total: 0 };
        return await response.json();
    }

    // Get observation at global index, fetching new chunk if needed
    async function getObservation(index) {
        if (index < bufferOffset || index >= bufferOffset + buffer.length) {
            // Need to fetch a new chunk containing this index
            const newOffset = Math.floor(index / bufferSize) * bufferSize;
            const result = await fetchChunk(newOffset);
            buffer = result.observations || [];
            bufferOffset = newOffset;
            totalCount = result.total || totalCount;
        }
        return buffer[index - bufferOffset];
    }

    // Initial fetch
    const firstResult = await fetchChunk(0);
    totalCount = firstResult.total || 0;
    buffer = firstResult.observations || [];
    bufferOffset = 0;

    if (totalCount === 0) {
        await showWarningModal(i18nStrings.messages.no_observations);
        clearMenuHighlights();
        return;
    }
    
    // Create ObservationForm ONCE and reuse for all navigation steps
    const form = new ObservationForm();
    await form.initialize('view');
    
    let isFormShown = false;

    const showNext = async () => {
        if (currentIndex >= totalCount) {
            form.navigating = true;
            form.hideModal();
            window.navigateInternal('/');
            return;
        }
        
        const obs = await getObservation(currentIndex);

        if (!isFormShown) {
            form.show('view', obs, null, null, currentIndex + 1, totalCount, null, () => {
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
            isFormShown = true;
        } else {
            form.navigateTo(obs, currentIndex + 1, totalCount);
        }
    };
    
    await showNext();
}

// Show observation form for viewing (read-only display with navigation)
async function showObservationFormForView(obs, currentNum, totalNum, onNext, onPrev, onClose) {
    const form = new ObservationForm();
    await form.initialize('view');
    
    // Show the form in view mode
    form.show('view', obs, null, null, currentNum, totalNum, null, onNext, onPrev, onClose);
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();

    const selectFilter = document.getElementById('select-filter');
    const selectValueDiv = document.getElementById('select-value-div');
    const selectValue = document.getElementById('select-value');
    const btnOk = document.getElementById('btn-select-ok');

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
                    // year from dropdown is already 4-digit
                    if (year % 4 === 0) {
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
            // Observer selection - use global dropdown population
            selectValueDiv.style.display = 'block';
            
            try {
                const observers = await fetchObserversDeduped();
                selectValue.innerHTML = '';
                observers.forEach(obs => {
                    const option = document.createElement('option');
                    option.value = obs.kk;
                    option.textContent = `${String(obs.kk).padStart(2, '0')} - ${escapeHtml(obs.vname)} ${escapeHtml(obs.nname)}`;
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
        } else if (filterType === 'TT') {
            const day = document.getElementById('select-day').value;
            const month = document.getElementById('select-day-month').value;
            const year = document.getElementById('select-day-year').value;
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
        checkDirtyAndProceed(() => performSelection(filterType, action, modal), modal);
    });
    
    async function checkDirtyAndProceed(callback, modal) {
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
                            // Cancel: close the select dialog too
                            if (modal) modal.hide();
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

        // Decision #033: setupModalCleanup for DOM cleanup
        setupModalCleanup(loadingModal);
        
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
                return;
            }
            
            const filterResult = await filterResponse.json();
            const keptCount = filterResult.kept_count || 0;
            const deletedCount = filterResult.deleted_count || 0;
            
            // Check if result is empty
            if (keptCount === 0) {
                const emptyMessage = i18nStrings.messages.empty_filter_result;
                showWarningModal(emptyMessage);
                bsLoadingModal.hide();
                modal.hide();
                window.navigateInternal('/');
                return;
            }
            
            bsLoadingModal.hide();
            
            // Sync state from server (count, dirty flag, display)
            await refreshFileStatus();
            
            // Trigger autosave
            await triggerAutosave();
            
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
            modal.hide();
            showWarningModal(error.message);
        }
    }

    // Decision #033: setupModalKeyboard for Enter key → OK button
    setupModalKeyboard(modalEl, btnOk);

    // clearMenuHighlights when modal closes
    modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });

    // Decision #033: setupModalCleanup for DOM cleanup
    setupModalCleanup(modalEl);
}
