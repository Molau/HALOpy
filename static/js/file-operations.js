// ============================================================================
// FILE OPERATIONS — New, Load, Save, Merge, Upload, Download, Autosave
// ============================================================================
// Extracted from main.js — All file and transfer operations
//
// Functions:
//   showNewFileDialog()
//   saveFile()
//   showAuthenticationModal()
//   showUploadDialog()
//   continueUpload()
//   showUploadFileDialog()
//   showDownloadDialog()
//   triggerFileSaveDialog()
//   fallbackDownload()
//   showObserverUploadDialog()
//   uploadObserversLocalMode()
//   showObserverDownloadDialog()
//   downloadObserversCloudMode()
//   downloadObserversLocalMode()
//   triggerAutosave()
//   checkAutosaveRecovery()
//   showLoadFileDialog()
//   continueLoadFile()
//   showMergeFileDialog()
//   continueMergeFile()
//   updateFileInfoDisplay()      [also window.updateFileInfoDisplay]
//   clearFileInfoDisplay()       [also window.clearFileInfoDisplay]
//   checkAndDisplayFileInfo()
//   showSaveFileDialog()
//
// Dependencies (from main.js globals):
//   i18nStrings, currentLanguage, observerData, isCloudMode
//   window.haloData, window.haloConfig
//   refreshFileStatus(), showNotification(), loadObserverCodes()
//   clearMenuHighlights(), highlightMenu()
//   saveHaloDataToSession(), validatePassword()
//
// Dependencies (from other modules):
//   escapeHtml, showWarningModal, showErrorDialog, showConfirmDialog,
//   showInfoModal, setupModalKeyboard, setupModalCleanup (modal-utils.js)
// ============================================================================


// Create new file
async function showNewFileDialog() {
    try {
        // Use File System Access API for native save dialog
        const fileHandle = await window.showSaveFilePicker({
            // || is a safeguard for File System API, not an i18n fallback
            suggestedName: i18nStrings.messages.new_file_default_name || 'neue_datei.csv',
            types: [{
                description: 'CSV Files',
                accept: {'text/csv': ['.csv']}
            }]
        });
        
        // Get chosen filename from fileHandle
        const filename = fileHandle.name;
        
        // Tell server to create the new file (writes CSV header, sets up state)
        const resp = await fetch('/api/file/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        
        if (!resp.ok) {
            const err = await resp.json();
            showErrorDialog(i18nStrings.common.error + ': ' + (err.error || 'Unknown error'));
            return;
        }
        await finishNewFile(fileHandle, filename);
    } catch (err) {
        if (err.name === 'AbortError') {
            // User cancelled the file picker
            return;
        }
        showErrorDialog(i18nStrings.common.error + ': ' + err.message);
    } finally {
        clearMenuHighlights();
    }
}

async function finishNewFile(fileHandle, filename) {
    // Get the server-created file content (header only) and write to local file
    const saveResp = await fetch('/api/file/save', { method: 'POST' });
    if (saveResp.ok) {
        const blob = await saveResp.blob();
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }
    
    // Update application state (empty observations list)
    // Sync state from server (count=0, dirty=false)
    await refreshFileStatus();
    
    showNotification(`<strong>✓</strong> ${i18nStrings.messages.new_file_created.replace('{0}', escapeHtml(filename))}`, 'success');
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
                
                // Sync state from server (dirty=false after save)
                await refreshFileStatus();
                window.haloData.fileName = newFilename;
                
                // Clean up autosave file
                await fetch('/api/file/cleanup_autosave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                showNotification(`<strong>✓</strong> ${escapeHtml(i18nStrings.messages.file_saved.replace('{filename}', newFilename))}`, 'success');
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
    } finally {
        clearMenuHighlights();
    }
}

// Authentication modal for HALO server login
async function showAuthenticationModal(onSuccess, cloudServerUrl) {
    // Load observers, fixed observer, and saved observer_kk
    let observers = [];
    let fixedObserver = '';
    let savedObserverKK = '';
    
    try {
        const [obsResponse, configResponse, kkResponse] = await Promise.all([
            fetch('/api/observers'),
            fetch('/api/config/fixed_observer'),
            fetch('/api/config/upload_observer_kk')
        ]);
        
        if (obsResponse.ok) {
            const data = await obsResponse.json();
            observers = data.observers || [];
        }
        
        if (configResponse.ok) {
            const config = await configResponse.json();
            fixedObserver = config.observer || '';
        }
        
        if (kkResponse.ok) {
            const kkData = await kkResponse.json();
            savedObserverKK = kkData.observer_kk || '';
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
                                <input type="password" class="form-control pe-5" id="auth-password" autocomplete="current-password">
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
    
    const modal = new bootstrap.Modal(document.getElementById('auth-modal'), { backdrop: 'static' });
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
        
        // Save observer_kk to halo.cfg for convenience
        try {
            await fetch('/api/config/upload_observer_kk', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ observer_kk: observerKK })
            });
        } catch (error) {}
        
        modal.hide();
        setTimeout(() => {
            const modalEl = document.getElementById('auth-modal');
            if (modalEl) modalEl.remove();
            onSuccess(observerKK, password);
        }, 300);
    });
    
    setupModalCleanup(document.getElementById('auth-modal'));
    
    modal.show();
    setupModalKeyboard(document.getElementById('auth-modal'), loginBtn);
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
    } finally {
        clearMenuHighlights();
    }
}

function continueUpload(isCloudMode, cloudServerUrl, username) {
    // Show combined upload dialog (includes auth fields in Local Mode)
    showUploadFileDialog(isCloudMode, cloudServerUrl);
}

// Upload: Combined dialog with auth fields (Local Mode only) + file selection + mode
async function showUploadFileDialog(isCloudMode, cloudServerUrl) {
    // Dirty check already handled in showUploadDialog() - no need to check again here
    
    // Load data for Local Mode auth fields
    let observers = [];
    let fixedObserver = '';
    let savedObserverKK = '';
    let startupFilePath = '';
    
    if (!isCloudMode) {
        try {
            const [obsResponse, configResponse, kkResponse, startupResponse] = await Promise.all([
                fetch('/api/observers'),
                fetch('/api/config/fixed_observer'),
                fetch('/api/config/upload_observer_kk'),
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
            
            if (kkResponse.ok) {
                const kkData = await kkResponse.json();
                savedObserverKK = kkData.observer_kk || '';
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
                <input type="password" class="form-control pe-5" id="upload-password" autocomplete="current-password">
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
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
            
            // Save observer_kk to config for convenience
            try {
                await fetch('/api/config/upload_observer_kk', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ observer_kk: observerKK })
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
        
        // Replace mode: warn that all existing observations will be deleted
        if (uploadMode === 'replace') {
            modal.hide();
            const confirmId = 'confirm-replace-' + Date.now();
            const noId = confirmId + '-no';
            const yesId = confirmId + '-yes';
            const footer = createModalButton(i18nStrings.common.no, 'primary', { id: noId, dismiss: true }) +
                           createModalButton(i18nStrings.common.yes, 'secondary', { id: yesId });
            const { modal: confirmModal, modalEl: confirmEl } = showSimpleModal({
                title: i18nStrings.common.warning,
                body: `<p>${i18nStrings.upload_download.upload_replace_warning}</p>`,
                footer
            });
            let confirmed = false;
            document.getElementById(yesId).addEventListener('click', () => {
                confirmed = true;
                confirmModal.hide();
            });
            await new Promise(resolve => {
                confirmEl.addEventListener('hidden.bs.modal', resolve, { once: true });
            });
            if (!confirmed) return;
        } else {
            // CLOSE upload modal FIRST (setupModalCleanup handles DOM removal)
            modal.hide();
        }
        
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
            
            // Send raw CSV text to backend for parsing (Decision: CSV parsing belongs in backend)
            const replaceMode = uploadMode === 'replace';
            const uploadUrl = isCloudMode ? '/api/file/upload' : `${cloudServerUrl}/api/file/upload`;
            
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    observerKK: observerKK,
                    password: password,
                    csv_text: text,
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
                let message;
                if (result.count === 0 && result.duplicates > 0) {
                    // All observations already exist on server
                    message = i18nStrings.upload_download.all_duplicates
                        .replace('{0}', result.duplicates);
                    showNotification(message, 'success', 5000);
                } else {
                    message = `✓ ${result.count || 0} ${i18nStrings.common.observations} `;
                    message += result.mode === 'replace' ? i18nStrings.upload_download.replaced : i18nStrings.upload_download.added;
                    if (result.duplicates && result.duplicates > 0) {
                        message += ` (${result.duplicates} ${i18nStrings.upload_download.duplicates_skipped})`;
                    }
                    showNotification(message, 'success', 5000);
                }
                
                // In Cloud Mode: No reload needed, data is already in database
                // In Local Mode: Not applicable (upload goes to cloud server, not local storage)
            } else {
                // Close spinner on error
                uploadSpinner.modal.hide();
                setTimeout(() => uploadSpinner.modalEl.remove(), 300);
                
                const error = await response.json();
                
                // Upload modal already closed - DON'T try to close it again
                // Translate error code to user-friendly message
                // Dynamic key lookup with i18n fallback key – not a hardcoded text fallback
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
            
            // "Failed to fetch" = cloud server unreachable (CORS or network error)
            const errorMsg = error.message === 'Failed to fetch'
                ? i18nStrings.upload_download.server_unreachable_details.replace('{0}', cloudServerUrl)
                : i18nStrings.common.error + ': ' + error.message;
            showErrorDialog(errorMsg);
        }
    });
    
    modal.show();

    // Decision #033: setupModalKeyboard for Enter key → Upload button
    setupModalKeyboard(modalEl, document.getElementById('btn-upload-file'));

    // Decision #033: setupModalCleanup for DOM cleanup
    setupModalCleanup(modalEl);
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
    let savedObserverKK = '';
    
    if (!isCloudMode) {
        try {
            const [obsResponse, configResp, kkResp] = await Promise.all([
                fetch('/api/observers'),
                fetch('/api/config/fixed_observer'),
                fetch('/api/config/upload_observer_kk')
            ]);
            
            if (obsResponse.ok) {
                const data = await obsResponse.json();
                observers = data.observers || [];
            }
            
            if (configResp.ok) {
                const configData = await configResp.json();
                fixedObserver = configData.observer || '';
            }
            
            if (kkResp.ok) {
                const kkData = await kkResp.json();
                savedObserverKK = kkData.observer_kk || '';
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
            <input type="password" class="form-control" id="download-password" autocomplete="current-password">
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    // Ensure default radio selection is applied
    document.getElementById('scope-own').checked = true;
    
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
        clearMenuHighlights();
        
        // Show spinner
        const spinner = showInfoModal(i18nStrings.upload_download.download_title, i18nStrings.upload_download.download_progress);
        
        try {
            // Download first, show file picker only on success
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
                // Save observer_kk for convenience (Local Mode only)
                if (!isCloudMode) {
                    try {
                        await fetch('/api/config/upload_observer_kk', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ observer_kk: observerKK })
                        });
                    } catch (error) {
                        // Silent fail - not critical if settings save fails
                    }
                }
                
                // Hide spinner before file picker
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
                
                // Handle file saving - show file picker only after successful download
                const csvContent = result.csv_content;
                const defaultFilename = result.is_admin && downloadAll
                    ? 'halobeo.csv'
                    : 'observations.csv';
                
                triggerFileSaveDialog(csvContent, defaultFilename);
                
                // Success notification
                const successMessage = i18nStrings.upload_download.download_success.replace('{0}', result.count);
                showNotification(successMessage, 'success');
            } else {
                // Hide spinner on error
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
                
                // Dynamic key lookup with i18n fallback
                const errorKey = result.error || 'unknown_error';
                const errorMessage = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
                showErrorDialog(errorMessage);
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

    // Decision #033: setupModalKeyboard for Enter key → OK button
    setupModalKeyboard(modalEl, document.getElementById('btn-download-file'));

    // clearMenuHighlights on close (file menu)
    modalEl.addEventListener('hidden.bs.modal', () => clearMenuHighlights(), { once: true });

    // Decision #033: setupModalCleanup for DOM cleanup
    setupModalCleanup(modalEl);
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
                    // Dynamic key lookup with i18n fallback key – not a hardcoded text fallback
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
                        // Dynamic key lookup with i18n fallback key – not a hardcoded text fallback
                        const errorKey = error.error || 'unknown_error';
                        const errorMsg = i18nStrings.messages[errorKey] || i18nStrings.messages.unknown_error;
                        showErrorDialog(errorMsg);
                    }, 300);
                } else {
                    // Dynamic key lookup with i18n fallback key – not a hardcoded text fallback
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
            
            const errorMsg = error.message === 'Failed to fetch'
                ? i18nStrings.upload_download.server_unreachable_details.replace('{0}', cloudServerUrl)
                : i18nStrings.common.error + ': ' + error.message;
            showErrorDialog(errorMsg);
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
    let savedObserverKK = '';
    
    if (!isCloudMode) {
        try {
            const [obsResponse, configResp, kkResp] = await Promise.all([
                fetch('/api/observers'),
                fetch('/api/config/fixed_observer'),
                fetch('/api/config/upload_observer_kk')
            ]);
            
            if (obsResponse.ok) {
                const data = await obsResponse.json();
                observers = data.observers || [];
            }
            
            if (configResp.ok) {
                const configData = await configResp.json();
                fixedObserver = configData.observer || '';
            }
            
            if (kkResp.ok) {
                const kkData = await kkResp.json();
                savedObserverKK = kkData.observer_kk || '';
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
            <input type="password" class="form-control" id="download-observer-password" autocomplete="current-password">
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
                        <h5 class="modal-title">${i18nStrings.upload_download.download_title_observer}</h5>
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
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    
    // Ensure default radio selection is applied
    document.getElementById('scope-observer-own').checked = true;
    
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
            
            // Save observer_kk to halo.cfg for convenience
            try {
                await fetch('/api/config/upload_observer_kk', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ observer_kk: observerKK })
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
                // || guards against missing server error text, not an i18n fallback
                showErrorDialog(i18nStrings.common.error + ': ' + (saveResult.error || 'save_failed'));
            }
        } else {
            // Close spinner on error
            if (spinner) {
                spinner.modal.hide();
                setTimeout(() => spinner.modalEl.remove(), 300);
            }
            
            // Dynamic key lookup with i18n fallback key – not a hardcoded text fallback
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
        // Skip autosave recovery if we already have data loaded
        if (window.haloData.isLoaded && window.haloData.count > 0) {
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
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        
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
                
                // Sync state from server (count, dirty flag, display)
                await refreshFileStatus();
                
                modal.hide();
                
                // Show success notification
                const message = `${result.count} ${i18nStrings.common.observations} ${i18nStrings.messages.loaded_from} "${escapeHtml(result.filename)}" ${i18nStrings.messages.loaded}`;
                showNotification(`<strong>✓</strong> ${message}`, 'success', 5000);
            } catch (error) {
                showErrorDialog(i18nStrings.messages.autosave_recovery_error + ': ' + error.message);
            }
        });
        
        // Decision #033: setupModalKeyboard for Enter key → Restore (Yes) button
        setupModalKeyboard(modalEl, document.getElementById('btn-restore-autosave'));

        // Decision #033: setupModalCleanup for DOM cleanup
        setupModalCleanup(modalEl);

        modal.show();
    } catch (error) {
        // Silently ignore - autosave check is optional and may fail if feature not enabled
    }
}

// Show error dialog - defined in modal-utils.js
// Show info/loading modal - defined in modal-utils.js
// Show success modal - defined in modal-utils.js


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
            () => continueLoadFile(),
            () => clearMenuHighlights()
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
                        <p class="mb-0">${i18nStrings.messages.loading_file} "${escapeHtml(file.name)}" ...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        const bsModal = new bootstrap.Modal(loadingModal, { backdrop: 'static', keyboard: false });

        // Track when modal is fully shown (needed to safely call hide())
        let modalFullyShown = false;
        const modalShownPromise = new Promise(resolve => {
            loadingModal.addEventListener('shown.bs.modal', () => {
                modalFullyShown = true;
                resolve();
            }, { once: true });
        });

        // Register hidden.bs.modal listener BEFORE setupModalCleanup,
        // so our resolve fires before cleanup removes the element from DOM.
        const modalHiddenPromise = new Promise(resolve => {
            loadingModal.addEventListener('hidden.bs.modal', resolve, { once: true });
        });

        // Decision #033: setupModalCleanup for DOM cleanup
        setupModalCleanup(loadingModal);

        bsModal.show();
        
        try {
            // Clear previous data before loading new file
            window.haloData.count = 0;
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
            
            // Sync state from server (count, dirty flag, display)
            await refreshFileStatus();
            window.haloData.fileName = file.name;  // Use client filename (may differ from server)
            
            // Hide loading modal and wait for animation to complete
            // before showing any new modal (prevents Bootstrap stacking issues).
            // Must wait for show animation to finish first, otherwise hide() is
            // ignored by Bootstrap and hidden.bs.modal never fires (race condition).
            if (!modalFullyShown) await modalShownPromise;
            bsModal.hide();
            await modalHiddenPromise;
            
            // Show conversion modal if legacy format was converted
            if (uploadResult.converted) {
                showSuccessModal(
                    i18nStrings.upload_download.legacy_format_converted_title,
                    i18nStrings.upload_download.legacy_format_converted_message
                );
            }
            
            // Show success message
            showNotification(`<strong>✓</strong> ${window.haloData.count} ${i18nStrings.common.observations} ${i18nStrings.messages.loaded_from} "${escapeHtml(file.name)}" ${i18nStrings.messages.loaded}`);
        } catch (error) {
            bsModal.hide();
            showNotification(`<strong>✗</strong> ${i18nStrings.messages.error_loading}: ${escapeHtml(error.message)}`, 'danger', 5000);
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
        clearMenuHighlights();
        return;
    }
    
    // Check if current file has unsaved changes
    if (window.haloData && window.haloData.isDirty) {
        const message = i18nStrings.messages.unsaved_changes_message;
        showConfirmDialog(
            i18nStrings.messages.unsaved_changes_title,
            message,
            () => continueMergeFile(),
            () => clearMenuHighlights()
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
                        <p class="mb-0">${i18nStrings.messages.merging_file} "${escapeHtml(file.name)}" ...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        const bsModal = new bootstrap.Modal(loadingModal, { backdrop: 'static', keyboard: false });

        // Decision #033: setupModalCleanup for DOM cleanup
        setupModalCleanup(loadingModal);

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
            
            const addedCount = result.added_count || 0;
            
            // Sync state from server (count, dirty flag, display)
            await refreshFileStatus();
            
            // Hide loading modal (setupModalCleanup handles DOM removal)
            bsModal.hide();
            
            // Show success message with count of added observations
            // (addedCount already computed above)
            showNotification(`<strong>✓</strong> ${addedCount} ${i18nStrings.common.observations} ${i18nStrings.messages.added} "${escapeHtml(file.name)}"`);
        } catch (error) {
            bsModal.hide();
            showNotification(`<strong>✗</strong> ${i18nStrings.messages.merge_error}: ${escapeHtml(error.message)}`, 'danger', 5000);
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
        count: 0,
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
                window.haloData.count = status.count || 0;
                updateFileInfoDisplay(null, status.count);
            } else if (status.count > 0 && status.filename) {
                // Local Mode: data is loaded, sync all state from server
                window.haloData.isLoaded = true;
                window.haloData.fileName = status.filename;
                window.haloData.count = status.count;
                window.haloData.isDirty = status.dirty || false;
                saveHaloDataToSession();
                updateFileInfoDisplay(status.filename, status.count);
                
                // Show notification if file was auto-loaded
                if (status.auto_loaded) {
                    showNotification(`<strong>✓</strong> ${escapeHtml(status.filename)} ${i18nStrings.messages.loaded} (${status.count} ${i18nStrings.observations.records_label})`);
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
