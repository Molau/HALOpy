// Observations page functionality - Exact translation from H_BEOBNG.PAS zeibeobachtung()
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for i18nStrings to be loaded (from main.js)
    await window.waitForI18n();

    let currentPage = 1;
    const pageSize = 50;  // Pascal shows 50 rows at a time (zeile variable)
    let allObservations = [];
    let filteredObservations = [];
    let displayMode = 'kurz';  // Default to compact mode (Eingabeart = 'Z')
    let currentDetailIndex = 0;
    
    // Filter state (matching Pascal auswahl, auswahl2)
    let filterCriterion1 = 'none';  // auswahl: none, observer, region
    let filterValue1 = null;
    let filterCriterion2 = 'none';  // auswahl2: none, date (with optional t/m/j), halo-type
    let filterValue2 = null;
    
    // Elements
    const filterDialog = document.getElementById('filter-dialog');
    

    const btnApplyFilter = document.getElementById('btn-apply-filter');
    const btnCancelFilter = document.getElementById('btn-cancel-filter');
    const compactView = document.getElementById('compact-view');
    const detailView = document.getElementById('detail-view');
    const compactTbody = document.getElementById('compact-tbody');
    const detailContent = document.getElementById('detail-content');
    const pageInfo = document.getElementById('page-info');
    const recordCount = document.getElementById('record-count');
    const loadingSpinner = document.getElementById('loading-spinner');

    function showLoadingOverlay(message) {
        const overlay = document.createElement('div');
        overlay.className = 'modal fade';
        overlay.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background-color:#f8f9fa;">
                    <div class="modal-body text-center py-4">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mb-0">${message}</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const bsModal = new bootstrap.Modal(overlay, { backdrop: 'static', keyboard: false });
        bsModal.show();
        return { overlay, bsModal };
    }

    function hideLoadingOverlay(instance) {
        if (!instance) return;
        instance.bsModal.hide();
        setTimeout(() => {
            instance.overlay.remove();
            // Remove any leftover Bootstrap modal backdrops
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(backdrop => backdrop.remove());
            // Restore body scroll
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        }, 300);
    }
    
    function showWarning(message) {
        showNotification(message, 'warning', 5000);
    }
    
    // Filter form elements
    const filterCriterion1Select = document.getElementById('filter-criterion-1');
    const filter1Input = document.getElementById('filter-1-input');
    const filter1SelectElem = document.getElementById('filter-1-select');
    const filterCriterion2Select = document.getElementById('filter-criterion-2');
    const filter2Input = document.getElementById('filter-2-input');
    const filter2Value = document.getElementById('filter-2-value');
    const filter2SelectElem = document.getElementById('filter-2-select');
    const btnExitObservations = document.getElementById('btn-exit-observations');
    





    // Pagination buttons
    const btnFirstPage = document.getElementById('btn-first-page');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    const btnLastPage = document.getElementById('btn-last-page');
    const compactPageInfo = document.getElementById('compact-page-info');
    
    // Initialize
    async function initialize() {
        await loadObserversData();  // Load observers early for dropdown
        
        // Check if data is already loaded on the server
        try {
            const response = await fetch('/api/observations?limit=1');
            if (response.ok) {
                const data = await response.json();
                if (data.total > 0 && data.file) {
                    // Data is loaded on server, fetch all observations
                    const fullResponse = await fetch('/api/observations?limit=200000');
                    if (fullResponse.ok) {
                        const fullData = await fullResponse.json();
                        if (!window.haloData) {
                            window.haloData = { observations: [], fileName: null, isLoaded: false, isDirty: false };
                        }
                        window.haloData.observations = fullData.observations;
                        window.haloData.fileName = fullData.file;
                        window.haloData.isLoaded = true;
                    }
                }
            }
        } catch (error) {}
        
        // Show filter dialog
        showFilterDialog();
    }
    
    initialize();
    
    // Event listeners
    btnApplyFilter.addEventListener('click', applyFilters);
    btnCancelFilter.addEventListener('click', () => {
        window.navigateInternal('/');
    });
    
    // Enter key is now handled by setupModalKeyboard() in showFilterDialog() (Decision #033)
    
    btnExitObservations.addEventListener('click', () => {
        window.navigateInternal('/');
    });
    
    // Pagination event listeners
    btnFirstPage.addEventListener('click', () => goToPage(1));
    btnPrevPage.addEventListener('click', () => goToPage(currentPage - 1));
    btnNextPage.addEventListener('click', () => goToPage(currentPage + 1));
    btnLastPage.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredObservations.length / pageSize);
        goToPage(maxPage);
    });
    
    // ESC key handler - exit observations display
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
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
    
    filterCriterion1Select.addEventListener('change', handleFilter1Change);
    filterCriterion2Select.addEventListener('change', (e) => {

        handleFilter2Change();
    });

    
    document.getElementById('btn-prev-detail').addEventListener('click', () => navigateDetail(-1));
    document.getElementById('btn-next-detail').addEventListener('click', () => navigateDetail(1));
    
    async function loadObserversData() {
        try {
            const response = await fetch('/api/observers');
            if (response.ok) {
                const data = await response.json();
                if (window.haloData) {
                    window.haloData.observers = data.observers || [];
                }
            }
        } catch (error) {
            console.warn('Could not load observers:', error);
        }
    }
    
    // Expose function globally so main.js can call it when language switches
    window.reloadObservationsI18n = loadI18n;
    
    function updateFilterDialogText() {
        if (!i18nStrings) return;
                
        // Modal title
        document.getElementById('filterDialogLabel').textContent = i18nStrings.filter_dialog.title;
        
        // Filter 1 label and options
        document.querySelector('#filter-criterion-1').previousElementSibling.textContent = '1. ' + i18nStrings.filter_dialog.question_1;
        const filter1Select = document.getElementById('filter-criterion-1');
        filter1Select.options[0].textContent = i18nStrings.filter_dialog.no_criterion;
        filter1Select.options[1].textContent = i18nStrings.common.observer;
        filter1Select.options[2].textContent = i18nStrings.filter_dialog.region;
        
        // Filter 2 label and options
        document.querySelector('#filter-criterion-2').previousElementSibling.textContent = '2. ' + i18nStrings.filter_dialog.question_2;
        if (filterCriterion2Select && filterCriterion2Select.options.length >= 3) {
            const opt = filterCriterion2Select.options;
            opt[0].textContent = i18nStrings.filter_dialog.no_criterion;
            opt[1].textContent = i18nStrings.filter_dialog.date;
            opt[2].textContent = i18nStrings.filter_dialog.halo_type;
        }
        
        // Buttons
        document.getElementById('btn-cancel-filter').textContent = i18nStrings.common.cancel;
        const applyBtn = document.getElementById('btn-apply-filter');
        applyBtn.childNodes[applyBtn.childNodes.length - 1].textContent = i18nStrings.common.ok;
        
        // Loading text
        const loadingText = document.querySelector('#loading-spinner p');
        if (loadingText) loadingText.textContent = i18nStrings.messages.loading;
        
        // Update date dropdowns if visible
        if (filterCriterion2Select.value === 'date') {
            populateDateSelects();
        }
        
        // Update dropdowns if populated
        if (criterion1 === 'observer' && filter1SelectElem.options.length > 0) {
            populateObserverSelect();
        } else if (criterion1 === 'region' && filter1SelectElem.options.length > 0) {
            populateRegionSelectForFilter1();
        }
        if (criterion2 === 'halo-type' && filter2SelectElem.options.length > 0) {
            populateHaloTypeSelect();
        }
        
        // Update page info text if observations are displayed
        if (filteredObservations.length > 0) {
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filteredObservations.length);
            pageInfo.textContent = `${i18nStrings.common.row} ${startIndex + 1}-${endIndex} ${i18nStrings.common.of} ${filteredObservations.length}`;
        }
        
        // Update record count if displayed
        if (recordCount && filteredObservations.length > 0) {
            recordCount.textContent = `${filteredObservations.length} ${i18nStrings.common.observations}`;
        }
        
        // Update exit button text
        const exitText = document.getElementById('exit-text');
        if (exitText) {
            exitText.textContent = i18nStrings.common.exit;
        }
    }
    
    async function loadObservations() {
        try {
            compactTbody.textContent = i18nStrings.messages.loading_short;
            
            // Load observations
            const obsResponse = await fetch('/api/observations?limit=200000');
            if (!obsResponse.ok) throw new Error('Failed to load observations');
            
            const obsData = await obsResponse.json();
            allObservations = obsData.observations;
            
            // Load observers
            try {
                const obsrResponse = await fetch('/api/observers');
                if (obsrResponse.ok) {
                    const obsrData = await obsrResponse.json();
                    if (window.haloData) {
                        window.haloData.observers = obsrData.observers || [];
                    }
                }
            } catch (err) {
                console.warn('Could not load observers:', err);
            }
            
            // Sync with global data store
            if (window.haloData) {
                window.haloData.observations = allObservations;
                window.haloData.fileName = obsData.file;
                window.haloData.isLoaded = true;
            }
            
            applyFiltersInternal();
            updateFileInfo(obsData.file, allObservations.length);
        } catch (error) {compactTbody.textContent = i18nStrings.messages.error_loading_data;
        }
    }
    
    function updateFileInfo(fileName, count) {
        const fileInfo = document.getElementById('file-info');
        const fileNameElem = document.getElementById('file-name');
        const obsCountElem = document.getElementById('obs-count');
        
        if (fileInfo && fileNameElem && obsCountElem) {
            fileNameElem.textContent = fileName;
            const countText = i18nStrings.common.observations;
            obsCountElem.textContent = `${count} ${countText}`;
            fileInfo.style.display = 'flex';
        }
    }
    
    // Expose function globally so it can be called when language switches
    window.updateFileInfoLanguage = function() {
        if (allObservations.length > 0) {
            const fileName = document.getElementById('file-name').textContent;
            updateFileInfo(fileName, allObservations.length);
        }
    };
    
    function showFilterDialog() {
        const modal = new bootstrap.Modal(filterDialog, { backdrop: 'static' });
        modal.show();
        // Decision #033: consistent Enter key handling
        setupModalKeyboard(filterDialog, btnApplyFilter);
    }
    
    function handleFilter1Change() {
        const value = filterCriterion1Select.value;
        
        if (value === 'none') {
            filter1Input.style.display = 'none';
        } else if (value === 'observer') {
            filter1Input.style.display = 'block';
            filter1SelectElem.style.display = 'block';
            populateObserverSelect();
            setTimeout(() => filter1SelectElem.focus(), 50);
        } else if (value === 'region') {
            filter1Input.style.display = 'block';
            filter1SelectElem.style.display = 'block';
            populateRegionSelectForFilter1();
            setTimeout(() => filter1SelectElem.focus(), 50);
        }
    }
    
    function handleFilter2Change() {
        const value = filterCriterion2Select.value;
        
        const dateSelects = document.getElementById('filter-2-date-selects');
        
        if (value === 'none') {
            filter2Input.style.display = 'none';
            dateSelects.style.display = 'none';
            filter2SelectElem.style.display = 'none';
        } else if (value === 'date') {
            filter2Input.style.display = 'block';
            dateSelects.style.display = 'flex';
            filter2SelectElem.style.display = 'none';
            populateDateSelects();
            setTimeout(() => document.getElementById('filter-2-day').focus(), 50);
        } else if (value === 'halo-type') {
            filter2Input.style.display = 'block';
            dateSelects.style.display = 'none';
            filter2SelectElem.style.display = 'block';
            populateHaloTypeSelect();
            setTimeout(() => filter2SelectElem.focus(), 50);
        }
    }
    
    function populateDateSelects() {
        const daySelect = document.getElementById('filter-2-day');
        const monthSelect = document.getElementById('filter-2-month');
        const yearSelect = document.getElementById('filter-2-year');
        
        if (!daySelect || !monthSelect || !yearSelect || !i18nStrings) return;
        
        // Day dropdown (1-31)
        daySelect.innerHTML = `<option value="">${i18nStrings.fields.any}</option>`;
        for (let i = 1; i <= 31; i++) {
            daySelect.innerHTML += `<option value="${i}">${i.toString().padStart(2, '0')}</option>`;
        }
        
        // Month dropdown - use i18nStrings.months["1"] to ["12"]
        monthSelect.innerHTML = `<option value="">${i18nStrings.fields.any}</option>`;
        for (let i = 1; i <= 12; i++) {
            const monthName = i18nStrings.months[i.toString()];
            monthSelect.innerHTML += `<option value="${i}">${monthName}</option>`;
        }
        
        // Year dropdown (1986-2099)
        yearSelect.innerHTML = `<option value="">${i18nStrings.fields.any}</option>`;
        for (let i = 1986; i <= 2099; i++) {
            const yy = i % 100;
            yearSelect.innerHTML += `<option value="${yy}">${i}</option>`;
        }
    }
    
    function populateObserverSelect() {
        // Load from global observer data
        filter1SelectElem.innerHTML = '';
        
        // Get observers from window.haloData if available, or extract from observations
        let observers = [];
        
        if (window.haloData && window.haloData.observers && Array.isArray(window.haloData.observers)) {
            observers = window.haloData.observers.map(obs => ({
                KK: parseInt(obs.KK),
                VName: obs.VName || '',
                NName: obs.NName || ''
            })).sort((a,b) => a.KK - b.KK);
        } else {
            // Fallback: extract from observations
            const uniqueK = [...new Set(allObservations.map(o => o.k))];
            observers = uniqueK.sort((a,b) => a-b).map(k => ({ KK: k, VName: '', NName: '' }));
        }
        
        observers.forEach(obs => {
            const option = document.createElement('option');
            option.value = obs.KK;
            const name = `${obs.VName} ${obs.NName}`.trim();
            option.textContent = `${String(obs.KK).padStart(2, '0')} - ${name}`;
            filter1SelectElem.appendChild(option);
        });
    }

    function populateRegionSelectForFilter1() {
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
    
    function populateHaloTypeSelect() {

        filter2SelectElem.innerHTML = '';
        for (let i = 1; i <= 99; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${String(i).padStart(2, '0')} - ${i18nStrings.halo_types[i] || i18nStrings.common.unknown}`;
            filter2SelectElem.appendChild(option);
        }
    }
    
    function populateRegionSelect() {

        filter2SelectElem.innerHTML = '';
        for (let i = 1; i <= 39; i++) {
            const regionName = i18nStrings.geographic_regions[String(i)];
            // Skip empty regions
            if (regionName && regionName.trim()) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${String(i).padStart(2, '0')} - ${regionName}`;
                filter2SelectElem.appendChild(option);
            }

        }
    }
    
    async function applyFilters() {
        // Show spinner
        const applyBtn = document.getElementById('btn-apply-filter');
        const applySpinner = document.getElementById('apply-spinner');
        const loadingSpinner = document.getElementById('loading-spinner');
        
        // Store filter state
        filterCriterion1 = filterCriterion1Select.value;
        filterCriterion2 = filterCriterion2Select.value;
        
        // Validate filter 1
        if (filterCriterion1 !== 'none') {
            if (filterCriterion1 === 'observer') {
                if (!filter1SelectElem.value || filter1SelectElem.value === '') {
                    showWarning(i18nStrings.messages.filter_value_required);
                    return;
                }
            } else if (filterCriterion1 === 'region') {
                if (!filter1SelectElem.value || filter1SelectElem.value === '') {
                    showWarning(i18nStrings.messages.filter_value_required);
                    return;
                }
            }
        }
        
        // Validate filter 2
        if (filterCriterion2 !== 'none') {
            if (filterCriterion2 === 'date') {
                // At least one date field must be selected
                const daySelect = document.getElementById('filter-2-day');
                const monthSelect = document.getElementById('filter-2-month');
                const yearSelect = document.getElementById('filter-2-year');
                if ((!daySelect.value || daySelect.value === '') && 
                    (!monthSelect.value || monthSelect.value === '') && 
                    (!yearSelect.value || yearSelect.value === '')) {
                    showWarning(i18nStrings.messages.filter_value_required);
                    return;
                }
            } else if (filterCriterion2 === 'halo-type') {
                if (!filter2SelectElem.value || filter2SelectElem.value === '') {
                    showWarning(i18nStrings.messages.filter_value_required);
                    return;
                }
            }
        }
        
        applyBtn.disabled = true;
        applySpinner.style.display = 'inline-block';
        
        // Get filter values
        if (filterCriterion1 === 'observer') {
            filterValue1 = parseInt(filter1SelectElem.value) || null;
        } else if (filterCriterion1 === 'region') {
            filterValue1 = parseInt(filter1SelectElem.value) || null;
        } else {
            filterValue1 = null;
        }
        
        if (filterCriterion2 === 'date') {
            // Read from three dropdowns
            const daySelect = document.getElementById('filter-2-day');
            const monthSelect = document.getElementById('filter-2-month');
            const yearSelect = document.getElementById('filter-2-year');
            
            const t = daySelect.value ? parseInt(daySelect.value) : null;
            const m = monthSelect.value ? parseInt(monthSelect.value) : null;
            const j = yearSelect.value ? parseInt(yearSelect.value) : null;
            
            filterValue2 = { t, m, j };
        } else if (filterCriterion2 === 'halo-type') {
            filterValue2 = parseInt(filter2SelectElem.value) || null;
        } else {
            filterValue2 = null;
        }
        
        // Close the modal properly and wait for it to complete
        const modal = bootstrap.Modal.getInstance(filterDialog);
        if (modal) {
            // Listen for modal hidden event to avoid focus issues
            filterDialog.addEventListener('hidden.bs.modal', function onModalHidden() {
                // Remove listener after it fires once
                filterDialog.removeEventListener('hidden.bs.modal', onModalHidden);
                
                const overlay = showLoadingOverlay(i18nStrings.messages.loading);
                window.currentOverlay = overlay; // Store for access in display functions
                
                // Process filters after modal is fully hidden - add delay for backdrop cleanup
                setTimeout(async () => {
                    try {


                        
                        if (window.haloData && window.haloData.isLoaded) {

                            allObservations = window.haloData.observations;
                            await applyFiltersInternal();
                            updateFileInfo(window.haloData.fileName, allObservations.length);
                        } else if (allObservations.length === 0) {

                            await loadObservations();
                        } else {

                            await applyFiltersInternal();
                        }

                    } catch (error) {} finally {
                        applySpinner.style.display = 'none';
                        applyBtn.disabled = false;
                        if (window.currentOverlay) {
                            hideLoadingOverlay(window.currentOverlay);
                            window.currentOverlay = null;
                        }
                    }
                }, 350); // Increased delay to allow modal backdrop to fully disappear
            }, { once: true });
            
            modal.hide();
        } else {
            const overlay = showLoadingOverlay(i18nStrings.messages.loading);
            
            setTimeout(async () => {
                try {
                    if (window.haloData && window.haloData.isLoaded) {
                        allObservations = window.haloData.observations;
                        await applyFiltersInternal();
                        updateFileInfo(window.haloData.fileName, allObservations.length);
                    } else if (allObservations.length === 0) {
                        await loadObservations();
                    } else {
                        await applyFiltersInternal();
                    }
                } catch (error) {} finally {
                    applySpinner.style.display = 'none';
                    applyBtn.disabled = false;
                    hideLoadingOverlay(overlay);
                }
            }, 50);
        }
    }
    
    // checkelem() function from H_BEOBNG.PAS - checks if observation matches filters
    function checkelem(obs) {
        // DEBUG: Log filter check
        if (filterCriterion1 === 'region' && filterValue1 !== null) {}
        // First filter (auswahl)
        if (filterCriterion1 === 'observer') {
            if (filterValue1 !== null && obs.KK !== filterValue1) return false;
        } else if (filterCriterion1 === 'region') {
            if (filterValue1 !== null && obs.GG !== filterValue1) return false;
        }
        
        // Second filter (auswahl2)
        if (filterCriterion2 === 'date') {
            if (filterValue2) {
                // Check each field that was specified (null means "any")
                if (filterValue2.t !== null && obs.TT !== filterValue2.t) return false;
                if (filterValue2.m !== null && obs.MM !== filterValue2.m) return false;
                if (filterValue2.j !== null && obs.JJ !== filterValue2.j) return false;
            }
        } else if (filterCriterion2 === 'halo-type') {
            if (filterValue2 !== null && obs.EE !== filterValue2) return false;
        }
        
        return true;
    }
    
    async function applyFiltersInternal() {
        filteredObservations = allObservations.filter(checkelem);
        recordCount.textContent = `${filteredObservations.length} ${i18nStrings.common.observations}`;
        currentPage = 1;
        
        await displayPage();
    }
    
    async function displayPage() {
        // Load displayMode from configuration (Eingabeart setting)
        try {
            const response = await fetch('/api/config/inputmode');
            const config = await response.json();

            displayMode = config.mode === 'M' ? 'lang' : 'kurz';

        } catch (error) {displayMode = 'kurz';  // Default to compact on error
        }
        

        if (displayMode === 'kurz') {
            displayCompactView();
        } else {
            displayDetailView();
        }
    }
    
    // Direct 1:1 translation of Kurzausgabe from H_BEOBNG.PAS lines 200-308
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
            // No light pillar - use empty field not slashes
            erg += '     ';
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
    
    async function displayCompactView() {
        compactView.style.display = 'block';
        detailView.style.display = 'none';
        btnExitObservations.style.display = 'block';
        
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, filteredObservations.length);
        const pageData = filteredObservations.slice(startIndex, endIndex);
        const maxPage = Math.ceil(filteredObservations.length / pageSize);
        
        if (pageData.length === 0) {
            // Hide overlay BEFORE showing modal to prevent backdrop interference
            if (window.currentOverlay) {
                hideLoadingOverlay(window.currentOverlay);
                window.currentOverlay = null;
            }
            await showWarningModal(i18nStrings.messages.no_observations);
            // Return to main page after user closes warning
            window.navigateInternal('/');
            return;
        }
        
        // Build compact display using kurzausgabe() format
        const lines = pageData.map(obs => kurzausgabe(obs));
        compactTbody.textContent = lines.join('\n');
        
        // Update pagination info
        const pageText = i18nStrings.common.page;
        const ofText = i18nStrings.common.of;
        compactPageInfo.textContent = `${pageText} ${currentPage} ${ofText} ${maxPage}`;
        
        // Update button states
        btnFirstPage.disabled = currentPage === 1;
        btnPrevPage.disabled = currentPage === 1;
        btnNextPage.disabled = currentPage === maxPage;
        btnLastPage.disabled = currentPage === maxPage;
        
        // Update record count at bottom
        pageInfo.textContent = `${i18nStrings.common.row} ${startIndex + 1}-${endIndex} ${ofText} ${filteredObservations.length}`;
    }
    
    async function displayDetailView() {
        // Hide all views - modal will display the observation
        compactView.style.display = 'none';
        detailView.style.display = 'none';
        btnExitObservations.style.display = 'none';
        
        if (filteredObservations.length === 0) {
            // Hide overlay BEFORE showing modal to prevent backdrop interference
            if (window.currentOverlay) {
                hideLoadingOverlay(window.currentOverlay);
                window.currentOverlay = null;
            }
            await showWarningModal(i18nStrings.messages.no_observations);
            // Return to main page after user closes warning
            window.navigateInternal('/');
            return;
        }
        
        currentDetailIndex = (currentPage - 1) * pageSize;
        showDetailRecord();
    }
    
    function showDetailRecord() {
        if (currentDetailIndex < 0 || currentDetailIndex >= filteredObservations.length) return;
        
        const obs = filteredObservations[currentDetailIndex];
        showObservationFormForView(obs, currentDetailIndex + 1, filteredObservations.length, 
            () => {
                // Next button
                if (currentDetailIndex < filteredObservations.length - 1) {
                    currentDetailIndex++;
                    showDetailRecord();
                }
            }, 
            () => {
                // Previous button
                if (currentDetailIndex > 0) {
                    currentDetailIndex--;
                    showDetailRecord();
                }
            }, 
            () => {
                // Close button - return to main
                window.navigateInternal('/');
            }
        );
    }
    
    function navigateDetail(direction) {
        currentDetailIndex += direction;
        if (currentDetailIndex < 0) currentDetailIndex = 0;
        if (currentDetailIndex >= filteredObservations.length) currentDetailIndex = filteredObservations.length - 1;
        showDetailRecord();
    }
        
    async function goToPage(page) {
        const maxPage = Math.ceil(filteredObservations.length / pageSize);
        if (page >= 1 && page <= maxPage) {
            currentPage = page;
            await displayPage();
        }
    }
});
