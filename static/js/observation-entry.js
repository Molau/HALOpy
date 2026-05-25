// ============================================================================
// OBSERVATION ENTRY — Numeric (Kurzeingabe) and Menu (Langeingabe) modes
// ============================================================================
// Extracted from main.js — Observation add/entry dialogs
//
// Functions:
//   showAddAnotherObservationDialog()
//   showAddObservationDialog()
//   showAddObservationDialogNumeric()
//   showAddObservationDialogMenu()
//   validateSectorInput()
//   getConstraintsForNumericInput()
//   validateNumericProgress()
//   parseNumericObservation()
//
// Dependencies (from main.js globals):
//   i18nStrings, currentLanguage, observerData, isCloudMode
//   VALID_HALO_TYPES, COMBINED_HALO_TYPES, CIRCULAR_HALOS
//   PILLAR_HEIGHT_VALUES, ALL_PILLAR_HEIGHT_VALUES
//   window.haloData, window.haloConfig
//   getDateDefault(), loadObserverCodes(), triggerAutosave(),
//   refreshFileStatus(), showNotification()
//
// Dependencies (from other modules):
//   ObservationForm (observation-form.js)
//   calculateFieldConstraints (field-constraints.js)
//   showWarningModal, showErrorDialog, showConfirmDialog,
//   setupModalKeyboard, setupModalCleanup (modal-utils.js)
// ============================================================================


// Show dialog asking if user wants to add another observation
// Returns: Promise<'yes'|'like_previous'|'no'>
//   'yes'           - add another observation (empty form)
//   'like_previous' - add another, pre-filling fields from last observation
//   'no'            - don't add another
function showAddAnotherObservationDialog(includeLikePrevious = false) {
    return new Promise((resolve) => {
        // Add delay before creating modal to allow previous modal's backdrop to disappear
        setTimeout(() => {
            const likePreviousButtonHtml = includeLikePrevious
                ? `<button type="button" class="btn btn-primary btn-sm px-3" id="btn-like-previous">${i18nStrings.observations.add_another_like_previous}</button>`
                : '';
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
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-yes">${i18nStrings.common.yes}</button>
                            ${likePreviousButtonHtml}
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('add-another-modal');
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        
        let resolved = false;

        const btnLikePrevious = modalEl.querySelector('#btn-like-previous');
        if (btnLikePrevious) {
            // "Like previous" button (default) - add another with pre-filled fields
            btnLikePrevious.addEventListener('click', () => {
                if (!resolved) {
                    resolved = true;
                    modal.hide();
                    resolve('like_previous');
                }
            });
        }

        // Yes button - add another (empty)
        modalEl.querySelector('#btn-yes').addEventListener('click', () => {
            if (!resolved) {
                resolved = true;
                modal.hide();
                resolve('yes');
            }
        });
        
        // No button - don't add another
        modalEl.querySelector('#btn-no').addEventListener('click', () => {
            if (!resolved) {
                resolved = true;
                modal.hide();
                resolve('no');
            }
        });
        
        // Cleanup on modal hidden
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!resolved) {
                // ESC or backdrop click - treat as No
                resolved = true;
                resolve('no');
            }
            modalEl.remove();
        });
        
        modal.show();
        setupModalKeyboard(modalEl, btnLikePrevious || modalEl.querySelector('#btn-yes'));
        }, 300); // 300ms delay to let previous modal backdrop fully disappear
    });
}

// Add Observation dialog entry point
async function showAddObservationDialog() {
    try {
        const modeResp = await fetch('/api/config/setting?key=INPUT_MODE');
        const modeData = await modeResp.json();
        const mode = modeData.value;
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
        const configResponse = await fetch('/api/config/setting?key=FIXED_OBSERVER');
        const config = await configResponse.json();
        fixedObserver = config.value || '';
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
                        <div id="obs-guide-box" class="border rounded mb-2" style="font-family: var(--bs-font-monospace, monospace); white-space: pre; background: #f8f9fa; padding: 4px 6px; font-size: 14px; color: #000; cursor: text; overflow-x: auto;"><div id="obs-guide-header" style="margin: 0; padding: 0; line-height: 1.4;">${i18nStrings.observations.input_pattern}</div><div id="obs-guide-entered" style="margin: 0; padding: 0; line-height: 1.4;"></div><div id="obs-guide-remarks" style="margin: 0; padding: 0; line-height: 1.4; display: none;"></div><div id="obs-guide-caret" style="color:#0d6efd; margin: 0; padding: 0; line-height: 1.4;"></div></div>
                        <input id="obs-code-input" class="form-control form-control-sm py-1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" style="opacity: 0; height: 0; padding: 0; margin: 0; border: none; font-family: var(--bs-font-monospace, monospace); font-size: 14px;" size="110" placeholder="KKOJJMMTTgZZZZdDDNCcEEHFVfzzGG...">
                        <div id="obs-code-error" class="text-danger mt-1" style="display:none; font-size: 12px;"></div>
                        <div id="obs-numeric-photo-section" class="d-none mt-2">
                            <label class="form-label">${i18nStrings.observations.photos_heading}</label>
                            <div class="obs-photo-strip" id="obs-numeric-photo-strip"></div>
                        </div>
                        <div id="obs-numeric-photo-caption-section" class="d-none mt-2">
                            <label class="form-label" for="obs-numeric-photo-caption">${i18nStrings.observations.photo_caption_label}</label>
                            <textarea class="form-control form-control-sm" id="obs-numeric-photo-caption" rows="2" placeholder="${escapeHtml(i18nStrings.observations.photo_caption_placeholder)}" disabled></textarea>
                        </div>
                    </div>
                    <div class="modal-footer py-1">
                        <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-numeric-photo-upload" disabled>${i18nStrings.observations.photo_upload}</button>
                        <input type="file" id="obs-numeric-photo-upload-input" accept="image/*" multiple class="d-none">
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();
    setupModalKeyboard(modalEl, document.getElementById('btn-add-obs-ok'));

    const input = document.getElementById('obs-code-input');
    const errEl = document.getElementById('obs-code-error');

    // ── Photo upload state (numeric dialog) ──────────────────────────────────
    const photoSectionEl = document.getElementById('obs-numeric-photo-section');
    const photoStripEl = document.getElementById('obs-numeric-photo-strip');
    const photoCaptionSectionEl = document.getElementById('obs-numeric-photo-caption-section');
    const photoCaptionEl = document.getElementById('obs-numeric-photo-caption');
    const photoUploadBtn = document.getElementById('btn-numeric-photo-upload');
    const photoUploadInput = document.getElementById('obs-numeric-photo-upload-input');

    let numericPhotoItems = [];
    let numericPendingPhotos = [];      // { key, kk, jj, mm, tt }
    let numericPhotoCaptionDirty = false;
    let numericPhotoCaptionLoading = false;
    let numericPhotoCaptionSavePromise = null;
    let numericLastPhotoContextKey = null;
    let numericPhotoRequestToken = 0;

    // Returns the photo context (kk/jj/mm/tt) when all four are present in eing,
    // i.e. when eing.length >= 9 (positions 0-8 = KK OO JJ MM TT).
    function getNumericPhotoContext() {
        if (eing.length < 9) return null;
        const kk = parseInt(eing.slice(0, 2), 10);
        const jj2 = parseInt(eing.slice(3, 5), 10); // 2-digit year
        const mm = parseInt(eing.slice(5, 7), 10);
        const tt = parseInt(eing.slice(7, 9), 10);
        if (!Number.isInteger(kk) || kk < 1) return null;
        if (!Number.isInteger(jj2) || jj2 < 0) return null;
        if (!Number.isInteger(mm) || mm < 1 || mm > 12) return null;
        if (!Number.isInteger(tt) || tt < 1 || tt > 31) return null;
        // Convert 2-digit year to 4-digit (same logic as parseNumericObservation)
        const jj4 = jj2 >= 86 ? 1900 + jj2 : 2000 + jj2;
        return { kk, jj: jj4, mm, tt };
    }

    function updateNumericPhotoButtonState() {
        if (!photoUploadBtn) return;
        photoUploadBtn.disabled = (getNumericPhotoContext() === null);
    }

    function renderNumericPhotoGallery() {
        if (!photoSectionEl || !photoStripEl) return;
        if (!Array.isArray(numericPhotoItems) || numericPhotoItems.length === 0) {
            photoSectionEl.classList.add('d-none');
            photoStripEl.innerHTML = '';
            updateNumericPhotoCaptionUi();
            return;
        }
        photoSectionEl.classList.remove('d-none');
        photoStripEl.innerHTML = numericPhotoItems.map((photo, index) => {
            const altTemplate = i18nStrings.observations.photo_alt;
            const alt = altTemplate.replace('{index}', String(index + 1));
            return `<button type="button" class="obs-photo-thumb-btn" data-photo-index="${index}" aria-label="${escapeHtml(alt)}">
                        <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(alt)}" class="obs-photo-thumb-img">
                    </button>`;
        }).join('');
        // Click thumbnail → open viewer via ObservationForm viewer (standalone)
        photoStripEl.querySelectorAll('.obs-photo-thumb-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openNumericPhotoViewer(parseInt(btn.dataset.photoIndex, 10));
            });
        });
        updateNumericPhotoCaptionUi();
    }

    function updateNumericPhotoCaptionUi() {
        if (!photoCaptionSectionEl || !photoCaptionEl) return;
        const hasPhotos = Array.isArray(numericPhotoItems) && numericPhotoItems.length > 0;
        if (!hasPhotos) {
            photoCaptionSectionEl.classList.add('d-none');
            photoCaptionEl.disabled = true;
            return;
        }
        photoCaptionSectionEl.classList.remove('d-none');
        photoCaptionEl.disabled = false;
    }

    function setNumericPhotoCaptionValue(caption) {
        numericPhotoCaptionLoading = true;
        numericPhotoCaptionDirty = false;
        if (photoCaptionEl) photoCaptionEl.value = caption || '';
        numericPhotoCaptionLoading = false;
        updateNumericPhotoCaptionUi();
    }

    async function loadNumericPhotos(kk, jj, mm, tt) {
        const requestToken = ++numericPhotoRequestToken;
        try {
            const params = new URLSearchParams({
                kk: String(kk), jj: String(jj), mm: String(mm), tt: String(tt)
            });
            const response = await fetch(`/api/observations/photos?${params.toString()}`);
            if (!response.ok) throw new Error('photo_list_failed');
            const data = await response.json();
            if (requestToken !== numericPhotoRequestToken) return; // stale
            numericPhotoItems = Array.isArray(data.photos) ? data.photos : [];
            setNumericPhotoCaptionValue(typeof data.caption === 'string' ? data.caption : '');
            renderNumericPhotoGallery();
        } catch (e) {
            if (requestToken === numericPhotoRequestToken) {
                numericPhotoItems = [];
                renderNumericPhotoGallery();
            }
        }
    }

    async function updateNumericAutoPhotoPreview() {
        const ctx = getNumericPhotoContext();
        if (!ctx) {
            numericLastPhotoContextKey = null;
            numericPhotoItems = [];
            renderNumericPhotoGallery();
            return;
        }
        const ctxKey = `${ctx.kk}-${ctx.jj}-${ctx.mm}-${ctx.tt}`;
        if (ctxKey === numericLastPhotoContextKey) return;

        // Move any pending photos from old prefix to new prefix
        if (numericPendingPhotos.length > 0) {
            const pfx = (c) => `${String(c.jj).padStart(4,'0')}/${String(c.mm).padStart(2,'0')}/${String(c.tt).padStart(2,'0')}/kk${String(c.kk).padStart(2,'0')}`;
            const newPrefix = pfx(ctx);
            const movedPrefixes = new Set();
            for (const item of numericPendingPhotos) {
                const oldPrefix = pfx(item);
                if (oldPrefix !== newPrefix && !movedPrefixes.has(oldPrefix)) {
                    movedPrefixes.add(oldPrefix);
                    try {
                        const resp = await fetch('/api/observations/photos/move-prefix', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ from_prefix: oldPrefix, to_prefix: newPrefix }),
                        });
                        if (resp.ok) {
                            for (const p of numericPendingPhotos) {
                                if (pfx(p) === oldPrefix) {
                                    p.key = newPrefix + p.key.slice(oldPrefix.length);
                                    p.kk = ctx.kk; p.jj = ctx.jj; p.mm = ctx.mm; p.tt = ctx.tt;
                                }
                            }
                        }
                    } catch (e) { /* best effort */ }
                }
            }
        }

        numericLastPhotoContextKey = ctxKey;
        await loadNumericPhotos(ctx.kk, ctx.jj, ctx.mm, ctx.tt);
    }

    async function uploadNumericPhotos(files) {
        const ctx = getNumericPhotoContext();
        if (!ctx) {
            showErrorDialog(i18nStrings.observations.photo_upload_select_context);
            return;
        }
        const { kk, jj, mm, tt } = ctx;
        const formData = new FormData();
        formData.append('kk', String(kk));
        formData.append('jj', String(jj));
        formData.append('mm', String(mm));
        formData.append('tt', String(tt));
        files.forEach(f => formData.append('photos', f));

        if (photoUploadBtn) photoUploadBtn.disabled = true;
        const spinner = showInfoModal(
            i18nStrings.upload_download.upload_title,
            i18nStrings.upload_download.upload_progress
        );
        try {
            const response = await fetch('/api/observations/photos/add', {
                method: 'POST',
                body: formData,
            });
            let payload = {};
            try { payload = await response.json(); } catch (e) {}
            if (!response.ok) {
                const errMap = {
                    too_many_files: i18nStrings.observations.photo_upload_too_many_files,
                    invalid_file_type: i18nStrings.observations.photo_upload_invalid_file_type,
                    file_too_large: i18nStrings.observations.photo_upload_file_too_large,
                };
                showErrorDialog(errMap[payload?.error] || i18nStrings.observations.photo_upload_error);
                return;
            }
            const uploaded = Array.isArray(payload?.uploaded) ? payload.uploaded : [];
            uploaded.forEach(item => {
                if (item?.key) numericPendingPhotos.push({ key: item.key, kk, jj, mm, tt });
            });
            showNotification(i18nStrings.observations.photo_upload_success);
            await loadNumericPhotos(kk, jj, mm, tt);
        } catch (e) {
            showErrorDialog(i18nStrings.observations.photo_upload_error);
        } finally {
            if (spinner?.modal) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl?.remove(), 300);
            }
            updateNumericPhotoButtonState();
        }
    }

    async function persistNumericPhotoCaption() {
        if (!numericPhotoCaptionDirty) {
            if (numericPhotoCaptionSavePromise) await numericPhotoCaptionSavePromise;
            return;
        }
        const ctx = getNumericPhotoContext();
        if (!ctx || !Array.isArray(numericPhotoItems) || numericPhotoItems.length === 0) {
            numericPhotoCaptionDirty = false;
            return;
        }
        const caption = photoCaptionEl ? photoCaptionEl.value : '';
        const savePromise = fetch('/api/observations/photos/caption', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kk: ctx.kk, jj: ctx.jj, mm: ctx.mm, tt: ctx.tt, caption }),
        }).then(async response => {
            let payload = {};
            try { payload = await response.json(); } catch (e) {}
            if (!response.ok) throw new Error(payload?.error || 'photo_caption_save_failed');
            setNumericPhotoCaptionValue(typeof payload?.caption === 'string' ? payload.caption : caption);
        }).finally(() => {
            if (numericPhotoCaptionSavePromise === savePromise) numericPhotoCaptionSavePromise = null;
        });
        numericPhotoCaptionSavePromise = savePromise;
        await savePromise;
    }

    async function flushNumericPhotoCaptionSave() {
        if (numericPhotoCaptionDirty) {
            await persistNumericPhotoCaption();
            return;
        }
        if (numericPhotoCaptionSavePromise) await numericPhotoCaptionSavePromise;
    }

    async function cleanupNumericUnsavedPhotos() {
        if (numericPendingPhotos.length === 0) return;
        const pending = [...numericPendingPhotos];
        numericPendingPhotos = [];
        for (const item of pending) {
            try {
                await fetch('/api/observations/photos/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: item.key, kk: item.kk, jj: item.jj, mm: item.mm, tt: item.tt }),
                    keepalive: true
                });
            } catch (e) { /* best effort */ }
        }
    }

    function openNumericPhotoViewer(startIndex = 0) {
        if (!Array.isArray(numericPhotoItems) || numericPhotoItems.length === 0) return;
        const safeStart = Math.max(0, Math.min(startIndex, numericPhotoItems.length - 1));
        const modalId = `numeric-photo-modal-${Date.now()}`;
        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-xl">
                    <div class="modal-content">
                        <div class="modal-header py-1">
                            <h6 class="modal-title" id="${modalId}-title"></h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body py-2 text-center">
                            <img id="${modalId}-img" class="obs-photo-viewer-img" src="" alt="">
                        </div>
                        <div class="modal-footer py-1">
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="${modalId}-prev">${i18nStrings.common.previous}</button>
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="${modalId}-next">${i18nStrings.common.next}</button>
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="${modalId}-download">${i18nStrings.common.download}</button>
                            <button type="button" class="btn btn-secondary btn-sm px-3" id="${modalId}-delete">${i18nStrings.observations.photo_delete}</button>
                            <button type="button" class="btn btn-primary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const viewerEl = document.getElementById(modalId);
        const titleEl = document.getElementById(`${modalId}-title`);
        const imgEl = document.getElementById(`${modalId}-img`);
        const prevBtn = document.getElementById(`${modalId}-prev`);
        const nextBtn = document.getElementById(`${modalId}-next`);
        const downloadBtn = document.getElementById(`${modalId}-download`);
        const deleteBtn = document.getElementById(`${modalId}-delete`);
        const viewerModal = new bootstrap.Modal(viewerEl, { backdrop: 'static' });
        let currentIndex = safeStart;

        const renderViewer = () => {
            const current = numericPhotoItems[currentIndex];
            if (!current) { viewerModal.hide(); return; }
            const titleTpl = i18nStrings.observations.photo_viewer_title;
            titleEl.textContent = titleTpl
                .replace('{current}', String(currentIndex + 1))
                .replace('{total}', String(numericPhotoItems.length));
            imgEl.src = current.full_url || current.url;
            imgEl.alt = current.name || '';
            prevBtn.disabled = currentIndex === 0;
            nextBtn.disabled = currentIndex === numericPhotoItems.length - 1;
        };
        prevBtn.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderViewer(); } });
        nextBtn.addEventListener('click', () => { if (currentIndex < numericPhotoItems.length - 1) { currentIndex++; renderViewer(); } });
        downloadBtn.addEventListener('click', () => {
            const current = numericPhotoItems[currentIndex];
            if (current) {
                const a = document.createElement('a');
                a.href = current.full_url || current.url;
                a.download = current.name || 'photo';
                a.click();
            }
        });
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const current = numericPhotoItems[currentIndex];
                if (!current) return;
                const ctx = getNumericPhotoContext();
                if (!ctx) return;
                try {
                    const resp = await fetch('/api/observations/photos/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: current.key, kk: ctx.kk, jj: ctx.jj, mm: ctx.mm, tt: ctx.tt }),
                    });
                    if (!resp.ok) { showErrorDialog(i18nStrings.observations.photo_upload_error); return; }
                    // Remove from pending list too
                    const idx = numericPendingPhotos.findIndex(p => p.key === current.key);
                    if (idx !== -1) numericPendingPhotos.splice(idx, 1);
                    await loadNumericPhotos(ctx.kk, ctx.jj, ctx.mm, ctx.tt);
                    if (numericPhotoItems.length === 0) { viewerModal.hide(); return; }
                    currentIndex = Math.min(currentIndex, numericPhotoItems.length - 1);
                    renderViewer();
                } catch (e) {
                    showErrorDialog(i18nStrings.observations.photo_upload_error);
                }
            });
        }
        viewerEl.addEventListener('hidden.bs.modal', () => viewerEl.remove());
        viewerModal.show();
        renderViewer();
    }

    // Upload button and file input event handlers
    photoUploadBtn.addEventListener('click', () => {
        if (getNumericPhotoContext() === null) {
            showErrorDialog(i18nStrings.observations.photo_upload_select_context);
            return;
        }
        photoUploadInput.click();
    });
    photoUploadInput.addEventListener('change', async () => {
        const files = Array.from(photoUploadInput.files || []);
        if (files.length > 0) await uploadNumericPhotos(files);
        photoUploadInput.value = '';
    });

    if (photoCaptionEl) {
        photoCaptionEl.addEventListener('input', () => {
            if (!numericPhotoCaptionLoading) numericPhotoCaptionDirty = true;
        });
        photoCaptionEl.addEventListener('blur', async () => {
            if (!numericPhotoCaptionDirty) return;
            try { await persistNumericPhotoCaption(); }
            catch (e) { showErrorDialog(i18nStrings.observations.photo_caption_save_error); }
        });
    }
    // ── End photo upload state ────────────────────────────────────────────────


    // Mobile keyboards may inject replacement text/autocorrect snippets.
    // Keep the hidden numeric input strictly literal.
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    let eing = fixedObserver ? String(fixedObserver).padStart(2, '0') : '';  // Pre-fill with fixed observer KK
    
    // If date default is available, append MM and JJ after KK and O (positions 2-3)
    if (dateDefault && eing.length >= 4) {
        // Keep KK (2 chars) + O (1 char) + JJ (2 chars) + MM (2 chars)
        const jj2 = String(parseInt(dateDefault.jj) % 100).padStart(2, '0');
        eing = eing.substring(0, 3) + jj2 + dateDefault.mm + eing.substring(5);
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
        // Check rendered elements
        const caretEl = document.getElementById('obs-guide-caret');
        const enteredEl = document.getElementById('obs-guide-entered');
    });

    // Restore focus when returning to the tab/window or clicking inside the modal
    window.addEventListener('focus', ensureNumericInputFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    modalEl.addEventListener('mousedown', ensureNumericInputFocus);
    
    // Tap on guide box focuses input (important for mobile - direct user action triggers keyboard)
    const guideBox = document.getElementById('obs-guide-box');
    if (guideBox) {
        guideBox.addEventListener('click', () => { input.focus(); });
    }
    
    // Restore focus when clicking anywhere in the document (handles clicks outside modal)
    const handleDocumentClick = (e) => {
        // Only refocus if the modal is still visible and click wasn't on a button that closes the modal
        if (document.body.contains(input) && !e.target.closest('.btn-close, #btn-add-obs-ok, #btn-add-obs-cancel, #btn-numeric-photo-upload, #obs-numeric-photo-upload-input, .obs-photo-thumb-btn, .obs-photo-viewer-img')) {
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

    // Enter handling is centralized via setupModalKeyboard(modalEl, okButton)

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
        
        // Update photo upload button state and auto-preview after each key event
        updateNumericPhotoButtonState();
        await updateNumericAutoPhotoPreview();
        
        // Process next item in queue if any
        if (inputQueue.length > 0) {
            processInputQueue();
        }
    }

    // Flag to track whether keydown already handled the event (prevents double processing)
    let keydownHandledLastEvent = false;

    // Queue-based keydown handler to prevent race conditions
    input.addEventListener('keydown', (ev) => {
        // On mobile virtual keyboards, keydown often has key='Unidentified' or 'Process'
        // In that case, skip keydown and let the 'input' event handler below process it
        if (ev.key === 'Unidentified' || ev.key === 'Process') {
            keydownHandledLastEvent = false;
            return;  // Will be handled by 'input' event listener
        }
        keydownHandledLastEvent = true;
        // Add to queue and process sequentially
        inputQueue.push(ev);
        processInputQueue();
    });
    
    // Mobile fallback: virtual keyboards may not fire usable keydown events.
    // The 'input' event fires AFTER the value has changed, so we compare with 'eing'.
    input.addEventListener('input', (e) => {
        // Skip if keydown already handled this event (desktop browsers)
        if (keydownHandledLastEvent) {
            keydownHandledLastEvent = false;
            // On desktop, keydown already updated 'eing' and set input.value.
            // But the browser also applied the keystroke to input.value, so reset it.
            input.value = eing;
            return;
        }

        // Ignore mobile replacement/composition events (auto-correct/prediction),
        // otherwise spaces in f/zz can be replaced by unexpected digits.
        if (e.inputType === 'insertReplacementText' || e.inputType === 'insertCompositionText') {
            input.value = eing;
            return;
        }
        
        const newVal = input.value;

        // Prefer the actual inserted text from InputEvent when available.
        // This is more robust on mobile than diffing full value snapshots.
        if (typeof e.data === 'string' && e.data.length > 0) {
            input.value = eing;
            for (const ch of e.data) {
                const syntheticEv = {
                    key: ch,
                    preventDefault: () => {},
                    stopPropagation: () => {}
                };
                inputQueue.push(syntheticEv);
            }
            processInputQueue();
            return;
        }
        
        if (newVal.length > eing.length) {
            // Characters were added - process each new character
            const added = newVal.slice(eing.length);
            // Reset input to current eing (we'll re-add via simulated keydown)
            input.value = eing;
            for (const ch of added) {
                const syntheticEv = {
                    key: ch,
                    preventDefault: () => {},
                    stopPropagation: () => {}
                };
                inputQueue.push(syntheticEv);
            }
            processInputQueue();
        } else if (newVal.length < eing.length) {
            // Characters were deleted - simulate backspace(s)
            const deletedCount = eing.length - newVal.length;
            input.value = eing;
            for (let i = 0; i < deletedCount; i++) {
                const syntheticEv = {
                    key: 'Backspace',
                    preventDefault: () => {},
                    stopPropagation: () => {}
                };
                inputQueue.push(syntheticEv);
            }
            processInputQueue();
        }
        // If same length, nothing to do (could be selection change)
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
            // Auto-fill JJ (2-digit for eing format) and MM
            const jj2 = String(parseInt(dateDefault.jj) % 100).padStart(2, '0');
            candidate = candidate + jj2 + dateDefault.mm;
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
                        } else if (res.backtrack) {
                            eing = candidate.slice(0, -res.backtrack);
                            input.value = eing;
                            renderNumericGuide(eing);
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
                // Use candidate (which includes the rejected char) as base, not eing
                eing = candidate.slice(0, -res.backtrack);
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

    let isSubmittingObservation = false;

    document.getElementById('btn-add-obs-ok').addEventListener('click', async () => {
        if (isSubmittingObservation) {
            return;
        }
        isSubmittingObservation = true;
        try {
            // Flush any pending caption save before submitting
            await flushNumericPhotoCaptionSave();

            const obs = parseNumericObservation(eing);
            if (!obs) {
                errEl.textContent = i18nStrings.observations.input_incomplete;
                errEl.style.display = 'block';
                isSubmittingObservation = false;
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
                isSubmittingObservation = false;
                return;
            }
            
            if (!resp.ok) throw new Error(i18nStrings.observations.error_adding);
            
            const result = await resp.json();
            
            // Sync state from server (count, dirty flag, display)
            await refreshFileStatus();
            
            // Trigger autosave
            await triggerAutosave();
            
            saveHandled = true; // Mark save as successful
            numericPendingPhotos = []; // Photos are now tied to the saved observation
            modal.hide();
            
            // Show success notification
            showNotification(`<strong>✓</strong> 1 ${i18nStrings.common.observation} ${i18nStrings.common.added}`);
            
            // Wait for modal to close, then ask if user wants to add another
            modalEl.addEventListener('hidden.bs.modal', async () => {
                modalEl.remove();
                
                // Ask if user wants to add another observation
                const addAnother = await showAddAnotherObservationDialog(false);
                if (addAnother === 'yes') {
                    // User clicked Yes - show the add dialog again
                    await showAddObservationDialogNumeric();
                } else {
                    clearMenuHighlights();
                }
            }, { once: true });
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
            isSubmittingObservation = false;
        }
    });

    // Cleanup on modal close (only if save wasn't successful)
    let saveHandled = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (!saveHandled) {
            // Delete any pending (unsaved) uploaded photos
            cleanupNumericUnsavedPhotos();
            modalEl.remove();
            clearMenuHighlights();
        }
    });
}

// Menu-based entry (Langeingabe) dialog
async function showAddObservationDialogMenu(prefillData = null) {
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
    if (prefillData) {
        form.prefillObservation = prefillData;
    }
    
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
            
            const result = await resp.json();
            
            // Sync state from server (count, dirty flag, display)
            await refreshFileStatus();
            
            // Trigger autosave
            await triggerAutosave();
            
            // Show success notification
            showNotification(`<strong>✓</strong> 1 ${i18nStrings.common.observation} ${i18nStrings.common.added}`);
            
            // Close the form modal first
            form.hideModal();
            
            // Wait for modal to close, then ask if user wants to add another
            form.modalElement.addEventListener('hidden.bs.modal', async () => {
                // Ask if user wants to add another observation
                const addAnother = await showAddAnotherObservationDialog(true);
                if (addAnother === 'yes') {
                    // User clicked Yes - show the add dialog again (empty)
                    await showAddObservationDialogMenu(null);
                } else if (addAnother === 'like_previous') {
                    // User clicked "Wie vorheriges Halo" - show the add dialog with pre-filled fields
                    await showAddObservationDialogMenu(newObs);
                } else {
                    clearMenuHighlights();
                }
            }, { once: true });
        } catch (e) {
            showErrorDialog(e.message);
        }
    }, () => {
        // Cancel callback
        clearMenuHighlights();
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
    // 27-28 zz (two digits 00-36) or '//' or '  '
    if (len === 27) return { ok: digit.test(s[26]) || s[26] === '/' || s[26] === ' ' };
    if (len === 28) {
        const zz = s.slice(26,28);
        if (zz === '//' || zz === '  ') return { ok: true };
        if (/^\d{2}$/.test(zz)) {
            const zzVal = parseInt(zz, 10);
            if (zzVal > 36) return { ok: false, backtrack: 2 };
            return { ok: true };
        }
        return { ok: false, backtrack: 2 };
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
            return allowSlash ? -2 : -1;  // -2 = observed but not present (d, 8HHHH), -1 = not specified
        }
        return parseInt(x, 10);
    };
    
    const toInt2 = (x, allowSlash = false) => {
        if (x === '  ' || x === '') return -1;  // Not observed/unknown
        if (x === '//') {
            return allowSlash ? -2 : -1;  // -2 = observed but not present (8HHHH), -1 = not specified
        }
        return parseInt(x, 10);
    };

    // zz has distinct semantics: spaces = not observed, // = no precipitation (99)
    const toPrecipInt2 = (x) => {
        if (x === '  ' || x === '') return -1;
        if (x === '//') return 99;
        return parseInt(x, 10);
    };
    
    const obs = {
        KK: parseInt(s.slice(0,2),10),
        O: parseInt(s.slice(2,3),10),
        JJ: (() => { const jjRaw = parseInt(s.slice(3,5),10); return jjRaw < (YEAR_MIN - 1900) ? 2000 + jjRaw : 1900 + jjRaw; })(),
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
        zz: toPrecipInt2(s.slice(26,28)),  // '//' = 99 (no precipitation), '  ' = -1
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
