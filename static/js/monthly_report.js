// Monthly Report (Monatsmeldung) functionality
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for i18nStrings to be loaded (from main.js)
    await window.waitForI18n();

    let allObservers = [];
    let fixedObserver = '';
    let currentReportData = null; // Store current report data for save/print

    // Elements
    const filterDialog = document.getElementById('filter-dialog');
    const observerSelect = document.getElementById('observer-select');
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const monthYearError = document.getElementById('month-year-error');
    const btnCancel = document.getElementById('btn-cancel-filter');
    const btnApply = document.getElementById('btn-apply-filter');
    const applySpinner = document.getElementById('apply-spinner');

    // Show warning modal and navigate to main on close
    function showWarningAndGoHome(message) {
        const modalEl = showWarningModal(message);
        if (modalEl) {
            modalEl.addEventListener('hidden.bs.modal', () => {
                window.navigateInternal('/');
            });
        }
    }

    // Update UI text from i18n
    function updateUIText() {
        // Filter dialog title already set by template
        
        // Observer select placeholder
        const observerPlaceholder = document.getElementById('observer-select-placeholder');
        if (observerPlaceholder) {
            observerPlaceholder.textContent = '-- ' + i18nStrings.messages.select_prompt + ' --';
        }
        
        // Populate year dropdown
        if (yearSelect) {
            yearSelect.innerHTML = '<option value="">-- ' + i18nStrings.messages.select_prompt + ' --</option>';
            for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
                const yy = String(year % 100).padStart(2, '0');
                yearSelect.innerHTML += `<option value="${yy}">${year}</option>`;
            }
        }
    }

    // Load observers
    async function loadObservers() {
        try {
            const response = await fetch('/api/observers');
            if (response.ok) {
                const data = await response.json();
                allObservers = data.observers || [];

                populateObserverSelect();
            }
        } catch (error) {
            console.error('Error loading observers:', error);
        }
    }

    // Load fixed observer setting
    async function loadFixedObserver() {
        try {
            const response = await fetch('/api/config/fixed_observer');
            if (response.ok) {
                const data = await response.json();
                fixedObserver = data.observer || '';

            }
        } catch (error) {
            console.error('Error loading fixed observer:', error);
        }
    }

    // Load date default and pre-fill month/year dropdowns
    async function loadDateDefault() {
        try {
            // Use the helper function from main.js
            const dateDefault = await getDateDefault();
            if (dateDefault) {
                // Pre-fill month and year dropdowns
                if (monthSelect) {
                    monthSelect.value = dateDefault.month;
                }
                if (yearSelect) {
                    yearSelect.value = dateDefault.jj;
                }
            }
        } catch (error) {
            console.error('Error loading date default:', error);
        }
    }

    // Populate observer dropdown
    function populateObserverSelect() {
        const placeholder = '-- ' + i18nStrings.messages.select_prompt + ' --';
        observerSelect.innerHTML = `<option value="">${placeholder}</option>`;

        // Get unique observers (latest record per KK)
        const observerMap = new Map();
        
        for (const obs of allObservers) {
            // Observer data format from API: { KK, VName, NName, seit, aktiv, HbOrt, GH, ... }
            const kk = parseInt(obs.KK);
            const seit = obs.seit;
            
            if (!observerMap.has(kk) || seit > observerMap.get(kk).seit) {
                observerMap.set(kk, {
                    kk: kk,
                    vname: obs.VName || '',
                    nname: obs.NName || '',
                    seit: seit
                });
            }
        }

        // Convert to array and sort by KK
        const observers = Array.from(observerMap.values()).sort((a, b) => a.kk - b.kk);

        // Add to select
        for (const obs of observers) {
            const option = document.createElement('option');
            option.value = obs.kk;
            option.textContent = `${String(obs.kk).padStart(2, '0')} - ${obs.vname} ${obs.nname}`;
            observerSelect.appendChild(option);
        }

        // Pre-select fixed observer if configured
        if (fixedObserver) {
            const fixedKK = parseInt(fixedObserver);
            if (observerMap.has(fixedKK)) {
                observerSelect.value = fixedKK;
                // In Cloud Mode: pre-select but allow changing observer
                // In Local Mode: disable dropdown when fixed observer is set
                observerSelect.disabled = !window.isCloudMode;
            }
        }
    }

    // Validate month/year selection from dropdowns
    function validateMonthYear() {
        const mm = monthSelect.value;
        const jj = yearSelect.value;
        
        if (!mm || !jj) {
            return null;
        }

        return { 
            mm: String(parseInt(mm)).padStart(2, '0'), 
            jj: String(parseInt(jj)).padStart(2, '0')
        };
    }

    // Apply filter
    async function applyFilter() {
        const selectedKK = observerSelect.value;

        // Validate observer selection
        if (!selectedKK) {
            showWarningAndGoHome(i18nStrings.monthly_report.error_no_observer);
            observerSelect.focus();
            return;
        }

        // Validate month/year
        const dateInfo = validateMonthYear();
        if (!dateInfo) {
            monthSelect.focus();
            return;
        }

        // Show loading spinner
        applySpinner.style.display = 'inline-block';
        btnApply.disabled = true;

        try {
            // Fetch monthly report data
            const response = await fetch(`/api/monthly-report?kk=${selectedKK}&mm=${dateInfo.mm}&jj=${dateInfo.jj}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('API error:', errorData);
                throw new Error(errorData.error);
            }
            
            const data = await response.json();

            
            // Close filter dialog
            const modal = bootstrap.Modal.getInstance(filterDialog);
            modal.hide();

            // Display the report
            displayMonthlyReport(data);

        } catch (error) {
            console.error('Error generating report:', error);
            showWarningAndGoHome(i18nStrings.messages.error_loading);
        } finally {
            applySpinner.style.display = 'none';
            btnApply.disabled = false;
        }
    }

    // Event listeners
    btnCancel.addEventListener('click', () => {
        window.navigateInternal('/');
    });

    btnApply.addEventListener('click', applyFilter);

    // Enter key support
    observerSelect.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFilter();
        }
    });

    monthSelect.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFilter();
        }
    });

    yearSelect.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFilter();
        }
    });

    // ESC key support - close dialog and return to main
    const escKeyHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.navigateInternal('/');
        }
    };
    
    document.addEventListener('keydown', escKeyHandler);

    // kurzausgabe() - uses global function from main.js (H_BEOBNG.PAS lines 200-308)

    // Display monthly report
    async function displayMonthlyReport(data) {
        const resultsModal = document.getElementById('results-modal');
        const reportContent = document.getElementById('report-content');
        const reportTitle = document.getElementById('results-modal-title');
        
        // Store current report data for save/print operations
        currentReportData = data;
        
        // Check output mode setting
        let outputMode = 'P'; // Default: Pseudografik
        try {
            const modeResponse = await fetch('/api/config/outputmode');
            const modeData = await modeResponse.json();
            outputMode = modeData.mode || 'P';
        } catch (error) {
            console.error('Error fetching output mode:', error);
        }
        
        // Modal title shows i18n title
        reportTitle.textContent = i18nStrings.output.monthly_report;
        
        // Expose output mode for save/print helpers
        window.currentOutputMode = outputMode;
        
        // Fetch formatted report from server
        let html = '';
        let formatParam;
        
        if (outputMode === 'P') {
            formatParam = 'text';
        } else if (outputMode === 'M') {
            formatParam = 'markdown';
        } else {
            formatParam = 'html';
        }
        
        try {
            const response = await fetch(`/api/monthly-report?kk=${data.kk}&mm=${data.mm}&jj=${data.jj}&format=${formatParam}`);
            let content;
            
            if (formatParam === 'html') {
                // HTML format returns JSON; convert to HTML table
                const jsonData = await response.json();
                html = buildHTMLTableReport(jsonData, i18nStrings);
            } else {
                // Text and markdown formats return text
                content = await response.text();
                
                if (formatParam === 'text') {
                    // Display as preformatted text with tight line spacing
                    html = `<pre style="font-family: 'Courier New', monospace; white-space: pre-wrap; word-wrap: break-word; padding: 20px; background-color: white; border: 1px solid #ddd; line-height: 1;">${escapeHtml(content)}</pre>`;
                } else if (formatParam === 'markdown') {
                    // Render markdown to HTML
                    if (window.marked && typeof window.marked.parse === 'function') {
                        html = `<div class="markdown-body" style="padding:20px; background-color: white;">${window.marked.parse(content)}</div>`;
                    } else {
                        html = `<pre style="font-family: monospace; white-space: pre; padding: 20px;">${escapeHtml(content)}</pre>`;
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching monthly report:', error);
            html = `<p style="color: red; padding: 20px;">Error loading report: ${escapeHtml(error.message)}</p>`;
        }
        
        reportContent.innerHTML = html;
        
        // Show modal
        const modal = new bootstrap.Modal(resultsModal, {
            backdrop: 'static',
            keyboard: false
        });
        modal.show();
        
        // Decision #033: setupModalKeyboard for Enter key → OK button
        setupModalKeyboard(resultsModal, document.getElementById('btn-report-ok'));
        
        // Wire up action buttons
        setupActionButtons();
    }
    
    // Build HTML-Tabellen format report (implementation)
    function buildHTMLTableReport(data, i18nStrings) {
        // Use i18n month names
        const monthName = i18nStrings.months[data.mm];
        
        // Format title
        const year = data.jj < (YEAR_MIN-1900) ? 2000 + data.jj : 1900 + data.jj;
        const title = i18nStrings.monthly_report.report_title_template
            .replace('{observer}', data.observer_name)
            .replace('{month}', monthName)
            .replace('{year}', year);
        
        let html = '<div class="analysis-results">';
        
        // Title
        html += `<h4 style="text-align: center; margin-bottom: 20px;">${title}</h4>`;
        
        // Table with single column for HALO key
        html += '<table class="table table-bordered analysis-table">';
        html += '<thead>';
        html += '<tr>';
        html += '<th class="monthly-report-header" style="font-family: monospace; white-space: pre;">KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH ' + i18nStrings.fields.sectors + ' ' + i18nStrings.fields.remarks + '</th>';
        html += '</tr>';
        html += '</thead>';
        html += '<tbody>';
        
        // Observations using kurzausgabe format
        if (data.observations.length === 0) {
            const noObsMsg = i18nStrings.messages.no_observations;
            html += `<tr><td style="text-align: center; padding: 20px;">${noObsMsg}</td></tr>`;
        } else {
            for (const obs of data.observations) {
                const line = kurzausgabe(obs);
                html += `<tr><td style="font-family: monospace; white-space: pre;">${line}</td></tr>`;
            }
        }
        
        html += '</tbody>';
        
        // Footer with observer locations
        html += '<tfoot>';
        html += '<tr>';
        html += `<td style="text-align: center; padding: 10px;">`;
        html += `<strong>${i18nStrings.observers.primary_site_label}:</strong> ${data.observer_hbort}<br>`;
        html += `<strong>${i18nStrings.observers.secondary_site_label}:</strong> ${data.observer_nbort}`;
        html += `</td>`;
        html += '</tr>';
        html += '</tfoot>';
        
        html += '</table>';
        html += '</div>';
        
        return html;
    }
    
    // Generate plain text report content for save/print (generates based on output mode)
    function generateReportText() {
        if (!currentReportData) return '';
        
        // Check current output mode
        let outputMode = window.currentOutputMode || 'P'; // Default: Pseudografik
        
        const data = currentReportData;
        const monthName = i18nStrings.months[data.mm];
        const year = data.jj < (YEAR_MIN-1900) ? 2000 + data.jj : 1900 + data.jj;
        const title = i18nStrings.monthly_report.report_title_template
            .replace('{observer}', data.observer_name)
            .replace('{month}', monthName)
            .replace('{year}', year);
        
        let text = '';
        
        // Generate format based on output mode
        if (outputMode === 'M') {
            // Markdown format
            text += `# ${title}\n\n`;
            text += '```\n';
            text += 'KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH ' + i18nStrings.fields.sectors + ' ' + i18nStrings.fields.remarks + '\n';
            text += '```\n\n';
            
            if (data.observations.length === 0) {
                const noObsMsg = i18nStrings.messages.no_observations;
                text += `**${noObsMsg}**\n\n`;
            } else {
                text += '```\n';
                for (const obs of data.observations) {
                    try {
                        text += kurzausgabe(obs) + '\n';
                    } catch (err) {
                        console.error('Error formatting observation:', obs, err);
                        text += 'ERROR formatting observation\n';
                    }
                }
                text += '```\n\n';
            }
            
            text += `## ${i18nStrings.observers.primary_site_label}\n`;
            text += `${data.observer_hbort}\n\n`;
            text += `## ${i18nStrings.observers.secondary_site_label}\n`;
            text += `${data.observer_nbort}\n`;
        } else if (outputMode === 'H') {
            // HTML format - return as plain monospace text
            text += title + '\n';
            text += '═'.repeat(title.length) + '\n\n';
            text += 'KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH ' + i18nStrings.fields.sectors + ' ' + i18nStrings.fields.remarks + '\n';
            text += '─'.repeat(120) + '\n';
            
            if (data.observations.length === 0) {
                const noObsMsg = i18nStrings.messages.no_observations;
                text += noObsMsg + '\n';
            } else {
                for (const obs of data.observations) {
                    try {
                        text += kurzausgabe(obs) + '\n';
                    } catch (err) {
                        console.error('Error formatting observation:', obs, err);
                        text += 'ERROR formatting observation\n';
                    }
                }
            }
            
            text += '─'.repeat(120) + '\n';
            text += `${i18nStrings.observers.primary_site_label}: ${data.observer_hbort}\n`;
            text += `${i18nStrings.observers.secondary_site_label}: ${data.observer_nbort}\n`;
        } else {
            // Pseudografik format (original)
            text = '';
            
            // Header box
            const titlePadLeft = Math.floor((122 - title.length) / 2);
            text += ' '.repeat(titlePadLeft) + title + '\n';
            text += ' '.repeat(titlePadLeft) + '═'.repeat(title.length) + '\n\n';
            text += '╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
            const sectors = i18nStrings.fields.sectors;
            const remarks = i18nStrings.fields.remarks;
            const headerLine = `KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH ${sectors.padEnd(15)} ${remarks.padEnd(47)}`;
            text += '║ ' + headerLine.substring(0, 118).padEnd(118) + ' ║\n';
            text += '╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\n';
            
            // Observations
            let lastDay = -1;
            for (const obs of data.observations) {
                if (lastDay !== -1 && obs.TT !== lastDay) {
                    text += '╟────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╢\n';
                }
                try {
                    text += '║ ' + kurzausgabe(obs) + ' ║\n';
                } catch (err) {
                    console.error('Error formatting observation:', obs, err);
                    text += '║ ERROR formatting observation                                                                                           ║\n';
                }
                lastDay = obs.TT;
            }
            
            // No observations message
            if (data.observations.length === 0) {
                const noObsMsg = i18nStrings.messages.no_observations;
                const padding = Math.floor((118 - noObsMsg.length) / 2);
                text += '║' + ' '.repeat(118) + '║\n';
                text += '║' + ' '.repeat(padding) + noObsMsg + ' '.repeat(118 - padding - noObsMsg.length) + '║\n';
                text += '║' + ' '.repeat(118) + '║\n';
            }
            
            // Footer
            text += '╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\n';
            let hbLine = i18nStrings.observers.primary_site_label + ': ' + data.observer_hbort;
            let nbLine = i18nStrings.observers.secondary_site_label + ': ' + data.observer_nbort;
            const hbPadLeft = Math.floor((122 - hbLine.length) / 2);
            hbLine = ' '.repeat(hbPadLeft) + hbLine;
            nbLine = ' '.repeat(hbPadLeft) + nbLine;
            text += '║' + hbLine.substring(0, 118).padEnd(120, ' ') + '║\n';
            text += '║' + nbLine.substring(0, 118).padEnd(120, ' ') + '║\n';
            text += '╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
        }
        
        return text;
    }
    
    // Setup action button handlers
    function setupActionButtons() {
        const btnOk = document.getElementById('btn-report-ok');
        const btnPrint = document.getElementById('btn-report-print');
        const btnSave = document.getElementById('btn-report-save');
        const resultsModal = document.getElementById('results-modal');
        
        // OK button - close modal and return to main
        if (btnOk) {
            btnOk.onclick = () => {
                const modal = bootstrap.Modal.getInstance(resultsModal);
                if (modal) modal.hide();
                window.navigateInternal('/');
            };
        }
        
        // Print button
        if (btnPrint) {
            btnPrint.onclick = () => {
                const reportContent = document.getElementById('report-content');
                if (reportContent) {
                    const printTitle = i18nStrings.output.monthly_report;
                    const printWindow = window.open('', '_blank');
                    printWindow.document.write(`<html><head><title>${printTitle}</title>`);
                    printWindow.document.write('<style>');
                    printWindow.document.write('body { font-family: monospace; font-size: 9pt; white-space: pre; margin: 0.5cm; }');
                    printWindow.document.write('.analysis-table { width: 100%; border-collapse: collapse; font-size: 9pt; }');
                    printWindow.document.write('.analysis-table th, .analysis-table td { border: 1px solid #dee2e6; padding: 4px; }');
                    printWindow.document.write('.analysis-table thead th { background-color: #f8f9fa; font-weight: bold; }');
                    printWindow.document.write('.analysis-table tfoot td { background-color: #f8f9fa; }');
                    printWindow.document.write('</style>');
                    printWindow.document.write('</head><body>');
                    printWindow.document.write(reportContent.innerHTML);
                    printWindow.document.write('</body></html>');
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => {
                        printWindow.print();
                    }, 250);
                }
            };
        }
        
        // Save button - format based on output mode
        if (btnSave) {
            btnSave.onclick = async () => {
                if (!currentReportData) return;
                
                // Use globally exposed output mode
                const outputMode = window.currentOutputMode || 'P';
                
                const data = currentReportData;
                const monthShort = i18nStrings.months_short[data.mm];
                const kkPadded = String(data.kk).padStart(2, '0');
                const jjPadded = String(data.jj).padStart(2, '0');
                
                if (outputMode === 'M') {
                    // Save as Markdown file (lowercase filename) - fetch from server
                    const filename = `${kkPadded}-${monthShort.toLowerCase()}${jjPadded}.md`;
                    
                    try {
                        const response = await fetch(`/api/monthly-report?kk=${data.kk}&mm=${data.mm}&jj=${data.jj}&format=markdown`);
                        const reportText = await response.text();
                        
                        const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    } catch (error) {
                        console.error('Error fetching markdown for save:', error);
                        showErrorDialog(i18nStrings.messages.markdown_save_failed);
                    }
                } else {
                    // Save as CSV file (lowercase filename) for H and P modes
                    const filename = `${kkPadded}-${monthShort.toLowerCase()}${jjPadded}.csv`;
                    
                    // Generate CSV with comma-separated fields
                    let csv = 'KK,O,JJ,MM,TT,g,ZZZZ,d,DD,N,C,c,EE,H,F,V,f,zz,GG,8HHHH,Sektoren,Bemerkungen\n';
                    for (const obs of data.observations) {
                        try {
                            // Extract and format each field - use nullish coalescing for proper zero handling
                            const kk = String(obs.KK ?? '').padStart(2, '0');
                            const o = (obs.O ?? '') === '' ? '' : String(obs.O);
                            const jj = String(obs.JJ ?? '').padStart(2, '0');
                            const mm = String(obs.MM ?? '').padStart(2, '0');
                            const tt = String(obs.TT ?? '').padStart(2, '0');
                            const g = (obs.g ?? '') === '' ? '' : String(obs.g);
                            const zzzz = String(obs.ZS ?? '').padStart(2, '0') + String(obs.ZM ?? '').padStart(2, '0');
                            const d = (obs.d ?? '') === '' ? '' : String(obs.d);
                            const dd = String(obs.DD ?? '').padStart(2, '0');
                            const n = (obs.N ?? '') === '' ? '' : String(obs.N);
                            const c_upper = (obs.C ?? '') === '' ? '' : String(obs.C);
                            const c_lower = (obs.c ?? '') === '' ? '' : String(obs.c);
                            const ee = String(obs.EE ?? '').padStart(2, '0');
                            const h = (obs.H ?? '') === '' ? '' : String(obs.H);
                            const f_upper = (obs.F ?? '') === '' ? '' : String(obs.F);
                            const v = (obs.V ?? '') === '' ? '' : String(obs.V);
                            const f_lower = (obs.f ?? '') === '' ? '' : String(obs.f);
                            const zz = String(obs.zz ?? '').padStart(2, '0');
                            const gg = String(obs.GG ?? 0).padStart(2, '0');
                            
                            // Height fields - 8HHHH
                            let hhhh = '';
                            if (obs.EE === 8 && obs.HO != null) {
                                hhhh = '8' + String(obs.HO).padStart(2, '0') + '//';
                            } else if (obs.EE === 9 && obs.HU != null) {
                                hhhh = '8//' + String(obs.HU).padStart(2, '0');
                            } else if (obs.EE === 10 && obs.HO != null && obs.HU != null) {
                                hhhh = '8' + String(obs.HO).padStart(2, '0') + String(obs.HU).padStart(2, '0');
                            } else if ([8, 9, 10].includes(obs.EE)) {
                                hhhh = '8////';
                            }
                            
                            // Sectors and remarks - check both property names
                            const sektoren = (obs.sectors ?? obs.SE ?? '').trim();
                            const bemerkungen = (obs.remarks ?? obs.BEM ?? '').replace(/,/g, ';').trim(); // Escape commas in remarks
                            
                            csv += `${kk},${o},${jj},${mm},${tt},${g},${zzzz},${d},${dd},${n},${c_upper},${c_lower},${ee},${h},${f_upper},${v},${f_lower},${zz},${gg},${hhhh},${sektoren},${bemerkungen}\n`;
                        } catch (err) {
                            console.error('Error formatting observation:', obs, err);
                        }
                    }
                    
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            };
        }
    }

    // Initialize
    async function initialize() {
        // Check if data is available (Cloud Mode: always available from DB, Local Mode: check if file loaded)
        try {
            const response = await fetch('/api/observations?limit=1');
            if (response.ok) {
                const data = await response.json();
                // Cloud Mode: data.total > 0 is sufficient (no file in cloud mode)
                // Local Mode: data.total > 0 && data.file (file must be loaded)
                const hasData = data.total > 0 && (window.isCloudMode || data.file);
                if (hasData) {
                    // Data is available
                    
                    // Update UI text to populate dropdowns
                    updateUIText();
                    
                    // Load observers, fixed observer and date default in parallel
                    await Promise.all([loadFixedObserver(), loadDateDefault(), loadObservers()]);

                    // Show filter dialog with explicit backdrop configuration
                    const modal = new bootstrap.Modal(filterDialog, {
                        backdrop: 'static',
                        keyboard: false
                    });
                    modal.show();
                    
                    // Decision #033: setupModalKeyboard for Enter key → Apply button
                    setupModalKeyboard(filterDialog, document.getElementById('btn-apply-filter'));
                    
                    // Decision #034: OK disabled until month and year selected
                    function updateApplyState() {
                        btnApply.disabled = !monthSelect.value || !yearSelect.value;
                    }
                    monthSelect.addEventListener('change', updateApplyState);
                    yearSelect.addEventListener('change', updateApplyState);
                    updateApplyState();
                    
                    return;
                }
            }
        } catch (error) {
            console.error('Error checking server data:', error);
        }
        
        // No data loaded (only show warning in Local Mode)
        if (!window.isCloudMode) {
            const msg = i18nStrings.messages.no_data;
            showWarningAndGoHome(msg);
        }
    }

    initialize();
});
