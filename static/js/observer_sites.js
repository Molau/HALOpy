/**
 * Observer Site Management Functions
 * Functions for adding, editing, and deleting observation sites
 */

// Add new observation site
async function showAddSiteDialog(observer) {
    
    // Generate month options
    const monthOptions = Object.keys(months).map(m => {
        const monthNum = parseInt(m);
        const monthName = months[m];
        return `<option value="${monthNum}">${monthName}</option>`;
    }).join('');
    
    // Generate year options (YEAR_MIN-YEAR_MAX)
    const yearOptions = Array.from({length: 100}, (_, i) => {
        const year = YEAR_MIN + i;
        return `<option value="${year}">${year}</option>`;
    }).join('');
    
    // Generate region options
    const regionOptions = Object.keys(regions).map(regionNum => {
        const regionName = regions[regionNum];
        if (regionName) {
            return `<option value="${regionNum.padStart(2, '0')}">${regionNum} - ${regionName}</option>`;
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
                        <h5 class="modal-title">${i18nStrings.observers.modify_add_site}: ${escapeHtml(observer.KK)} ${escapeHtml(observer.VName)} ${escapeHtml(observer.NName)}</h5>
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
                                        <span class="input-group-text">°</span>
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
                                        <span class="input-group-text">°</span>
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
                                        <span class="input-group-text">°</span>
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
                                        <span class="input-group-text">°</span>
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: setupModalKeyboard for Enter key → OK button
    setupModalKeyboard(modalEl, document.getElementById('btn-add-site-ok'));
    
    const errEl = document.getElementById('site-error');
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
            // (Mandatory fields are enforced by disabled OK button - Decision #034)
            
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
        
        // Show first site with confirmation dialog
        showEditSiteConfirmDialog(observer, data.sites, 0);
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

function showEditSiteConfirmDialog(observer, sites, currentIndex) {
    
    const site = sites[currentIndex];
    
    const modalHtml = `
        <div class="modal fade" id="confirm-edit-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_edit_site}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-2">${i18nStrings.observers.modify_edit_question}</p>
                        <table class="table table-sm table-bordered">
                            <tr><td><strong>${i18nStrings.observers.since_label}:</strong></td><td>${i18nStrings.months[site.seit_month]} ${site.seit_year}</td></tr>
                            <tr><td><strong>${i18nStrings.common.active}:</strong></td><td>${site.active === 1 ? i18nStrings.common.yes : i18nStrings.common.no}</td></tr>
                            <tr><td><strong>${i18nStrings.observers.primary_site_label}:</strong></td><td>${escapeHtml(site.HbOrt)} (GG ${site.GH})</td></tr>
                            <tr><td><strong>${i18nStrings.observers.secondary_site_label}:</strong></td><td>${escapeHtml(site.NbOrt)} (GG ${site.GN})</td></tr>
                        </table>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-confirm-edit-site">${i18nStrings.common.yes}</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('confirm-edit-site-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: setupModalKeyboard for Enter key → Yes button
    setupModalKeyboard(modalEl, document.getElementById('btn-confirm-edit-site'));
    
    document.getElementById('btn-confirm-edit-site').addEventListener('click', () => {
        modal.hide();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            showEditSiteFormDialog(observer, site);
        });
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
        
        // Show first site with delete confirmation
        showDeleteSiteConfirmDialog(observer, data.sites, 0);
        
    } catch (e) {
        showErrorDialog(e.message);
    }
}

function showDeleteSiteConfirmDialog(observer, sites, currentIndex) {
    
    const site = sites[currentIndex];
    
    const modalHtml = `
        <div class="modal fade" id="confirm-delete-site-modal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${i18nStrings.observers.modify_delete_site}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-2">${i18nStrings.observers.delete_site_question}</p>
                        <table class="table table-sm table-bordered">
                            <tr><td><strong>${i18nStrings.observers.since_label}:</strong></td><td>${i18nStrings.months[site.seit_month]} ${site.seit_year}</td></tr>
                            <tr><td><strong>${i18nStrings.common.active}:</strong></td><td>${site.active === 1 ? i18nStrings.common.yes : i18nStrings.common.no}</td></tr>
                            <tr><td><strong>${i18nStrings.observers.primary_site_label}:</strong></td><td>${escapeHtml(site.HbOrt)} (GG ${site.GH})</td></tr>
                            <tr><td><strong>${i18nStrings.observers.secondary_site_label}:</strong></td><td>${escapeHtml(site.NbOrt)} (GG ${site.GN})</td></tr>
                        </table>
                        <p class="text-muted small">${i18nStrings.observers.delete_site_info}</p>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.no}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" id="btn-delete-site">${i18nStrings.common.yes}</button>
                        ${currentIndex < sites.length - 1 ? `<button type="button" class="btn btn-secondary btn-sm px-3" id="btn-next-site">${i18nStrings.common.next}</button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('confirm-delete-site-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    
    // Decision #033: setupModalKeyboard for Enter key → Delete button
    setupModalKeyboard(modalEl, document.getElementById('btn-delete-site'));
    
    // Handle delete
    document.getElementById('btn-delete-site').addEventListener('click', async () => {
        try {
            const resp = await fetch(`/api/observers/${observer.KK}/sites/${site.seit}`, {
                method: 'DELETE'
            });
            
            const result = await resp.json();
            
            if (!resp.ok) {
                showErrorDialog(result.error);
                return;
            }
            
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.remove();
                // Show success and reload
                showNotification(`<strong>✓</strong> ${i18nStrings.observers.success_site_deleted}`);
                
                setTimeout(() => {
                    if (window.location.pathname === '/observers') {
                        window.location.reload();
                    }
                }, 1500);
            });
        } catch (e) {
            showErrorDialog(e.message);
        }
    });
    
    // Handle next
    if (currentIndex < sites.length - 1) {
        document.getElementById('btn-next-site').addEventListener('click', () => {
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                modalEl.remove();
                showDeleteSiteConfirmDialog(observer, sites, currentIndex + 1);
            });
        });
    }
    
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
}
