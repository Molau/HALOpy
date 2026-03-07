// Annual Statistics (Jahresstatistik) functionality
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for i18nStrings to be loaded (from main.js)
    await window.waitForI18n();

    // Use global i18n from main.js
    let currentStatsData = null; // Store current stats data for save/print

    // Elements
    const filterDialog = document.getElementById('filter-dialog');
    const yearSelect = document.getElementById('year-select');
    const yearError = document.getElementById('year-error');
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

    // Populate year dropdown (YEAR_MIN-YEAR_MAX)
    function populateYears() {
        if (!yearSelect) return;
        yearSelect.innerHTML = `<option value="">-- ${i18nStrings.messages.select_prompt} --</option>`;
        for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
            const yy = String(year % 100).padStart(2, '0');
            const option = document.createElement('option');
            option.value = yy;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    }

    // Load date default and pre-fill year dropdown
    async function loadDateDefault() {
        try {
            const dateDefault = await getDateDefault();
            if (dateDefault && yearSelect) {
                yearSelect.value = dateDefault.jj;
            }
        } catch (error) {
            console.error('Error loading date default:', error);
        }
    }

    // Check if observations are loaded (same approach as monthly_report.js)
    async function checkDataLoaded() {
        try {
            const response = await fetch('/api/observations?limit=1');
            if (response.ok) {
                const data = await response.json();
                // Cloud Mode: Data always available from DB, no file check needed
                // Local Mode: Check both data.total > 0 AND data.file exists
                const hasData = data.total > 0 && (window.isCloudMode || data.file);
                if (hasData) {
                    return true;
                }
            }
        } catch (error) {
            console.error('Error checking server data:', error);
        }
        
        // No data loaded - show warning only in Local Mode
        if (!window.isCloudMode) {
            showWarningAndGoHome(i18nStrings.messages.no_data);
        }
        return false;
    }

    // Validate year selection
    function validateYear() {
        const jj = yearSelect.value;
        if (!jj) {
            return null;
        }

        return { jj: String(parseInt(jj)).padStart(2, '0') };
    }

    // Apply filter and generate statistics
    async function applyFilter() {
        const validation = validateYear();
        if (!validation) {
            yearSelect.focus();
            return;
        }
        
        // Show spinner
        if (applySpinner) applySpinner.style.display = 'inline-block';
        if (btnApply) btnApply.disabled = true;
        
        try {
            // Fetch annual statistics
            const url = `/api/annual-stats?jj=${validation.jj}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (!response.ok) {
                if (yearError) {
                    yearError.textContent = i18nStrings.annual_stats.error_fetching;
                    yearError.style.display = 'block';
                }
                return;
            }
            
            if (data.activity_count === 0) {
                if (yearError) {
                    yearError.textContent = i18nStrings.annual_stats.error_no_data;
                    yearError.style.display = 'block';
                }
                return;
            }
            
            // Store data for save/print
            currentStatsData = data;
            
            // Debug: log the data

            
            // Close filter dialog
            const modal = bootstrap.Modal.getInstance(filterDialog);
            modal.hide();
            
            // Show results
            showStatistics(data);
            
        } catch (error) {
            console.error('Error fetching statistics:', error);
            if (yearError) {
                yearError.textContent = i18nStrings.annual_stats.error_fetching;
                yearError.style.display = 'block';
            }
        } finally {
            // Hide spinner
            if (applySpinner) applySpinner.style.display = 'none';
            if (btnApply) btnApply.disabled = false;
        }
    }

    // Show statistics in results modal
    async function showStatistics(data) {
        const statsContent = document.getElementById('stats-content');
        if (!statsContent) return;
        
        // Check output mode setting
        let outputMode = 'P'; // Default: Pseudografik
        try {
            const modeResponse = await fetch('/api/config/outputmode');
            const modeData = await modeResponse.json();
            outputMode = modeData.mode || 'P';
        } catch (error) {
            console.error('Error fetching output mode:', error);
        }
        
        // Format year
        const year = data.jj >= (YEAR_MIN-1900) ? `19${data.jj.toString().padStart(2, '0')}` : 
                 `20${data.jj.toString().padStart(2, '0')}`;
        
        // Set title
        const resultsTitle = document.getElementById('results-modal-title');
        if (resultsTitle) {
            resultsTitle.textContent = i18nStrings.annual_stats.title;
        }
        
        // Fetch formatted statistics from server
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
            const response = await fetch(`/api/annual-stats?jj=${data.jj}&format=${formatParam}`);
            let content;
            
            if (formatParam === 'html') {
                // HTML format returns JSON; convert to HTML tables
                const jsonData = await response.json();
                html = buildHTMLTableAnnualStats(jsonData, year, i18nStrings);
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
            console.error('Error fetching annual statistics:', error);
            html = `<p style="color: red; padding: 20px;">Error loading statistics: ${escapeHtml(error.message)}</p>`;
        }
        
        statsContent.innerHTML = html;
        
        // Show results modal
        const resultsModal = new bootstrap.Modal(document.getElementById('results-modal'), {
            backdrop: 'static',
            keyboard: false
        });
        resultsModal.show();
        
        // Decision #033: setupModalKeyboard for Enter key → OK button
        const resultsModalEl = document.getElementById('results-modal');
        const statsOkBtn = document.getElementById('btn-stats-ok');
        setupModalKeyboard(resultsModalEl, statsOkBtn);
        
        // Wire up action buttons
        setupActionButtons();
    }
    
    // Render observer distribution table
    function renderObserverDistribution(observerData) {
        if (!observerData || observerData.length === 0) return '';
        
        let html = '';
        
        // Title
        const titleLine = i18nStrings.annual_stats.observer_dist_title;
        const titlePadding = Math.max(0, Math.floor((73 - titleLine.length) / 2));
        html += ' '.repeat(titlePadding) + titleLine + '\n';
        html += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n';
        
        // Table header - top border
        html += '╔══╦═════╦══════╦═════╦══════╦═════╦══════╦═════╦══════╦═════╦═════╦══════╗\n';
        
        // Header row
        html += '║' + i18nStrings.annual_stats.observer_dist_kk + '║';
        html += i18nStrings.annual_stats.observer_dist_ee01 + '║';
        html += '   ' + i18nStrings.annual_stats.observer_dist_percent.padEnd(3) + '║';
        html += i18nStrings.annual_stats.observer_dist_ee02 + '║';
        html += '   ' + i18nStrings.annual_stats.observer_dist_percent.padEnd(3) + '║';
        html += i18nStrings.annual_stats.observer_dist_ee03 + '║';
        html += '   ' + i18nStrings.annual_stats.observer_dist_percent.padEnd(3) + '║';
        html += i18nStrings.annual_stats.observer_dist_ee567 + '║';
        html += '   ' + i18nStrings.annual_stats.observer_dist_percent.padEnd(3) + '║';
        html += i18nStrings.annual_stats.observer_dist_ee17 + '║';
        html += i18nStrings.annual_stats.observer_dist_ee_so + '║';
        html += i18nStrings.annual_stats.observer_dist_ht_ges + '║\n';
        
        // Header separator
        html += '╠══╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬═════╬══════╣\n';
        
        // Data rows with separators every 5 rows
        for (let i = 0; i < observerData.length; i++) {
            const obs = observerData[i];
            
            html += '║';
            html += obs.kk.toString().padStart(2, '0') + '║';
            html += obs.ee01.toString().padStart(4) + ' ║';
            html += obs.pct01.toFixed(1).padStart(5) + ' ║';
            html += obs.ee02.toString().padStart(4) + ' ║';
            html += obs.pct02.toFixed(1).padStart(5) + ' ║';
            html += obs.ee03.toString().padStart(4) + ' ║';
            html += obs.pct03.toFixed(1).padStart(5) + ' ║';
            html += obs.ee567.toString().padStart(4) + ' ║';
            html += obs.pct567.toFixed(1).padStart(5) + ' ║';
            html += obs.ee17.toString().padStart(4) + ' ║';
            html += obs.total_sun_ee.toString().padStart(4) + ' ║';
            html += obs.total_days.toString().padStart(5) + ' ║\n';
            
            // Add separator line every 5 rows (except last row)
            if ((i + 1) % 5 === 0 && i < observerData.length - 1) {
                html += '╠══╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬═════╬══════╣\n';
            }
        }
        
        // Bottom border
        html += '╚══╩═════╩══════╩═════╩══════╩═════╩══════╩═════╩══════╩═════╩═════╩══════╝\n\n';
        
        return html;
    }
    
    // Render EE observations tables
    function renderEEObservations(sunCounts, moonCounts) {
        let html = '';
        
        // Title
        const titleLine = i18nStrings.annual_stats.ee_observed_title;
        const titlePadding = Math.max(0, Math.floor((73 - titleLine.length) / 2));
        html += ' '.repeat(titlePadding) + titleLine + '\n';
        html += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n\n';
        
        // Sun halos table
        if (sunCounts && Object.keys(sunCounts).length > 0) {
            html += renderEETable(i18nStrings.annual_stats.ee_sun_label, sunCounts);
            html += '\n\n';
        }
        
        // Moon halos table
        if (moonCounts && Object.keys(moonCounts).length > 0) {
            html += renderEETable(i18nStrings.annual_stats.ee_moon_label, moonCounts);
            html += '\n\n';
        }
        
        return html;
    }
    
    // Render single EE table (sun or moon)
    function renderEETable(label, eeCounts) {
        let html = '';
        
        // Sort EE numbers
        const eeNumbers = Object.keys(eeCounts).map(Number).sort((a, b) => a - b);
        
        // Split into rows of 9 EE types (10 columns including header)
        const rowSize = 9;
        let startIdx = 0;
        
        while (startIdx < eeNumbers.length) {
            const rowEEs = eeNumbers.slice(startIdx, startIdx + rowSize);
            
            html += '   ╔═════════════';
            for (let i = 0; i < rowEEs.length; i++) {
                html += '╦═════';
            }
            html += '╗\n';
                    // First row: add label
            if (startIdx === 0) {
                html += '   ║ ' + label.padEnd(8) + 'EE  ║';
            } else {
                html += '   ║        EE   ║';
            }
            
            // EE numbers
            for (const ee of rowEEs) {
                html += '  ' + ee.toString().padStart(2) + ' ║';
            }
            
            html += '\n';

            // Separator line
            html += '   ╠═════════════╬';
            for (let i = 0; i < rowEEs.length; i++) {
                html += '═════╬';
            }

            html += '\n';

            // Counts
            html += '   ║      ' + i18nStrings.annual_stats.ee_count_label.padEnd(7) + '║';
            for (const ee of rowEEs) {
                const count = eeCounts[ee] || 0;
                html += count.toString().padStart(4) + ' ║';
            }
            html += '\n';
            html += '   ╚═════════════'
            for (let i = 0; i < rowEEs.length; i++) {
                html += '╩═════';
            }
            html += '╝\n';
            
            startIdx += rowSize;
            
            // Add spacing between rows (except last)
            if (startIdx < eeNumbers.length) {
                html += '\n';
            }
        }
        
        return html;
    }
    
    /**
     * Render phenomena table (observations with 5+ EE types marked with '*')
     */
    function renderPhenomena(phenomenaList) {
        if (!phenomenaList || phenomenaList.length === 0) {
            // No phenomena observed
            let html = '\n\n';
            const titleLine = i18nStrings.annual_stats.phenomena_title;
            const titlePadding = Math.max(0, Math.floor((74 - titleLine.length) / 2));
            html += ' '.repeat(titlePadding) + titleLine + '\n';
            html += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n\n';
            const phenomenaNoneText = i18nStrings.annual_stats.phenomena_none;
            const phenomenaPadding = Math.max(0, Math.floor((74 - phenomenaNoneText.length) / 2));
            html += ' '.repeat(phenomenaPadding) + phenomenaNoneText + '\n';
            return html;
        }
        
        let html = '\n\n';
        const titleLine = i18nStrings.annual_stats.phenomena_title;
        const titlePadding = Math.max(0, Math.floor((74 - titleLine.length) / 2));
        html += ' '.repeat(titlePadding) + titleLine + '\n';
        html += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n';
        html += '╔═══════╦═══════╦═════════╦═══╦══════════════════════════════════════════╗\n';
        
        // Header row
        html += '║ ';
        html += i18nStrings.annual_stats.phenomena_date.padEnd(5) + ' ║ KK GG ║ ';
        html += i18nStrings.annual_stats.phenomena_time.padEnd(4) + ' ║ O ║ ';
        html += '01 02 03 05 06 07 08 09 11 12 ' + i18nStrings.annual_stats.phenomena_other_ee;
        
        // Pad header to 76 characters (total line 74 with borders)
        while (html.length < html.lastIndexOf('\n') + 74) {
            html += ' ';
        }
        html += '║\n';
        
        // Separator after header
        html += '╠═══════╬═══════╬═════════╬═══╬══════════════════════════════════════════╣\n';
        
        let lastMonth = null;
        
        for (const phenom of phenomenaList) {
            // Add month separator if month changed
            if (lastMonth !== null && phenom.mm !== lastMonth) {
                html += '╠═══════╬═══════╬═════════╬═══╬══════════════════════════════════════════╣\n';
            }
            lastMonth = phenom.mm;
            
            // Format date: DD.MM
            const dateStr = phenom.tt.toString().padStart(2, '0') + '.' + phenom.mm.toString().padStart(2, '0');
            
            // Format observer: KK GG
            const kkgg = phenom.kk.toString().padStart(2, '0') + ' ' + phenom.gg.toString().padStart(2, '0');
            
            // Format time: HHh MMm
            const timeStr = phenom.zs.toString().padStart(2, ' ') + 'h ' + phenom.zm.toString().padStart(2, '0') + 'm';
            
            // Object (1 or 2)
            const oStr = phenom.o.toString();
            
            // Build data row
            html += '║ ' + dateStr + ' ║ ' + kkgg + ' ║ ' + timeStr + ' ║ ' + oStr + ' ║';
            
            // EE types 01-12 (show X where present)
            const ee12 = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12];
            for (const ee of ee12) {
                if (phenom.ee_types.includes(ee)) {
                    html += ' X ';
                } else {
                    html += '   ';
                }
            }
            
            // Further EE (beyond 12) - split into groups of 4
            const furtherEE = phenom.ee_types.filter(ee => ee > 12).map(ee => ee.toString().padStart(2, '0'));
            
            if (furtherEE.length <= 4) {
                // All fit on one line
                html += furtherEE.join(' ');
                
                // Pad row to 76 characters
                while (html.length - html.lastIndexOf('\n') - 1 < 73) {
                    html += ' ';
                }
                html += '║\n';
            } else {
                // Split into multiple lines (4 EE per line)
                const firstGroup = furtherEE.slice(0, 4);
                html += firstGroup.join(' ');
                
                // Pad first row to 76 characters
                while (html.length - html.lastIndexOf('\n') - 1 < 73) {
                    html += ' ';
                }
                html += '║\n';
                
                // Add continuation rows for remaining EE
                let idx = 4;
                while (idx < furtherEE.length) {
                    const group = furtherEE.slice(idx, idx + 4);
                    
                    // Empty columns for date, KK GG, time, O, and EE 01-12 space
                    html += '║       ║       ║         ║   ║                              ';
                    html += group.join(' ');
                    
                    // Pad continuation row to 76 characters
                    while (html.length - html.lastIndexOf('\n') - 1 < 73) {
                        html += ' ';
                    }
                    html += '║\n';
                    
                    idx += 4;
                }
            }
        }
        
        // Bottom border
        html += '╚═══════╩═══════╩═════════╩═══╩══════════════════════════════════════════╝\n';
        
        return html;
    }
    
    // Render monthly activity table
    function renderMonthlyActivity(monthlyStats, totals, year) {
        let html = '';
        
        // Table header with box drawing characters
        html += '╔═══════════╦══════════════╦══════════════╦══════════════╦══════════════╗\n';
        html += '║           ║     ' + i18nStrings.annual_stats.table_sun.padEnd(9) + '║     ' + i18nStrings.annual_stats.table_moon.padEnd(9) + '║    ' + i18nStrings.annual_stats.table_totals.padEnd(10) + '║   ' + i18nStrings.annual_stats.table_activity.padEnd(11) + '║\n';
        html += '║   ' + i18nStrings.annual_stats.table_month.padEnd(8) + '║   ' + i18nStrings.annual_stats.table_ee + '   ' + i18nStrings.annual_stats.table_days + '  ║   ' + i18nStrings.annual_stats.table_ee + '   ' + i18nStrings.annual_stats.table_days + '  ║   ' + i18nStrings.annual_stats.table_ee + '   ' + i18nStrings.annual_stats.table_days + '  ║   ' + i18nStrings.annual_stats.table_real.padEnd(6) + i18nStrings.annual_stats.table_relative.padEnd(5) + '║\n';
        html += '╠═══════════╬══════════════╬══════════════╬══════════════╬══════════════╣\n';
        
        // Data rows (one month per row)
        for (let mm = 1; mm <= 12; mm++) {
            const mmStr = mm.toString();
            const monthData = monthlyStats[mmStr] || {};
            
            html += '║ ';
            html += i18nStrings.months[mmStr].padEnd(9);  // Month name (9 chars)
            html += ' ║ ';
            html += (monthData.sun_ee || 0).toString().padStart(4);
            html += '   ';
            html += (monthData.sun_days || 0).toString().padStart(3);
            html += '   ║ ';
            html += (monthData.moon_ee || 0).toString().padStart(4);
            html += '   ';
            html += (monthData.moon_days || 0).toString().padStart(3);
            html += '   ║ ';
            html += (monthData.total_ee || 0).toString().padStart(4);
            html += '   ';
            html += (monthData.total_days || 0).toString().padStart(3);
            html += '   ║ ';
            html += (monthData.real || 0).toFixed(1).padStart(5);
            html += '  ';
            html += (monthData.relative || 0).toFixed(1).padStart(5);
            html += ' ║\n';
        }
        
        // Totals row
        html += '╠═══════════╬══════════════╬══════════════╬══════════════╬══════════════╣\n';
        html += '║ ' + i18nStrings.annual_stats.table_totals.padEnd(9) + ' ║ ';
        html += (totals.sun_ee || 0).toString().padStart(4);
        html += '   ';
        html += (totals.sun_days || 0).toString().padStart(3);
        html += '   ║ ';
        html += (totals.moon_ee || 0).toString().padStart(4);
        html += '   ';
        html += (totals.moon_days || 0).toString().padStart(3);
        html += '   ║ ';
        html += (totals.total_ee || 0).toString().padStart(4);
        html += '   ';
        html += (totals.total_days || 0).toString().padStart(3);
        html += '   ║ ';
        html += (totals.real || 0).toFixed(1).padStart(5);
        html += '  ';
        html += (totals.relative || 0).toFixed(1).padStart(5);
        html += ' ║\n';
        html += '╚═══════════╩══════════════╩══════════════╩══════════════╩══════════════╝\n\n';
        
        return html;
    }

    // Setup action buttons
    function setupActionButtons() {
        // OK button - close and return to main
        const btnOk = document.getElementById('btn-stats-ok');
        if (btnOk) {
            btnOk.onclick = () => {
                const resultsModal = bootstrap.Modal.getInstance(document.getElementById('results-modal'));
                resultsModal.hide();
                window.navigateInternal('/');
            };
            
            // Focus OK button
            btnOk.focus();
        }
        
        // Chart buttons for line graph
        const btnChartLine = document.getElementById('btn-stats-chart-line');
        if (btnChartLine) {
            btnChartLine.onclick = () => {
                showChart();
            };
        }
        
        // Chart buttons for bar graph
        const btnChartBar = document.getElementById('btn-stats-chart-bar');
        if (btnChartBar) {
            btnChartBar.onclick = () => {
                showBarChart();
            };
        }
        
        // Print button
        const btnPrint = document.getElementById('btn-stats-print');
        if (btnPrint) {
            btnPrint.onclick = () => {
                printStatistics();
            };
        }
        
        // Save button
        const btnSave = document.getElementById('btn-stats-save');
        if (btnSave) {
            btnSave.onclick = () => {
                saveStatistics();
            };
        }
    }
    
    // Show chart - render with Chart.js for interactive display
    function showChart() {
        if (!currentStatsData) return;
        
        // Format year
        const year = currentStatsData.jj >= (YEAR_MIN-1900) ? `19${currentStatsData.jj.toString().padStart(2, '0')}` : 
                 `20${currentStatsData.jj.toString().padStart(2, '0')}`;
        
        // Set chart title
        const chartTitle = document.getElementById('chart-printable-title-line');
        if (chartTitle) {
            chartTitle.textContent = i18nStrings.annual_stats.chart_title.replace('{year}', year);
            chartTitle.style.display = 'block';
        }
        
        // Set chart subtitle with observation count
        const chartSubtitle = document.getElementById('chart-subtitle-line');
        if (chartSubtitle) {
            const totalEE = currentStatsData.totals.total_ee || 0;
            chartSubtitle.textContent = i18nStrings.annual_stats.chart_subtitle.replace('{count}', totalEE);
        }
        
        // Prepare chart data
        const monthLabels = Object.values(i18nStrings.months_short);
        const months = Array.from({length: 12}, (_, i) => i + 1);
        
        // Extract real and relative activity from monthly_stats
        const realData = months.map(mm => currentStatsData.monthly_stats[mm.toString()].real || 0);
        const relativeData = months.map(mm => currentStatsData.monthly_stats[mm.toString()].relative || 0);
        
        // Create chart
        const canvas = document.getElementById('activity-chart-line');
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if it exists
        if (window.annualActivityChart) {
            window.annualActivityChart.destroy();
        }
        
        window.annualActivityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthLabels,
                datasets: [
                    {
                        label: i18nStrings.annual_stats.chart_real,
                        data: realData,
                        borderColor: '#dc3545',  // Red
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,  // Spline smoothing
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#dc3545'
                    },
                    {
                        label: i18nStrings.annual_stats.chart_relative,
                        data: relativeData,
                        borderColor: '#28a745',  // Green
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,  // Spline smoothing
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#28a745'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: { size: 12 },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: i18nStrings.annual_stats.chart_x_axis,
                            font: { size: 12, weight: 'bold' }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: i18nStrings.annual_stats.chart_y_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
        
        // Show chart modal
        const chartModalElementLine = document.getElementById('chart-modal-line');
        chartModalElementLine.setAttribute('tabindex', '-1');
        chartModalElementLine.addEventListener('shown.bs.modal', () => {
            chartModalElementLine.focus({ preventScroll: true });
        }, { once: true });
        const chartModalLine = new bootstrap.Modal(chartModalElementLine, { backdrop: 'static' });
        
        // Store data for print/save buttons
        window.chartData = currentStatsData;
        
        // Prevent ESC key from closing parent modal
        chartModalElementLine.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
            }
        });
        
        // Decision #033: setupModalKeyboard for Enter key → OK button
        setupModalKeyboard(chartModalElementLine, document.getElementById('btn-chart-close-line'));
        
        chartModalLine.show();
        if (!currentStatsData) return;
        
        const year2 = currentStatsData.jj >= (YEAR_MIN-1900) ? `19${currentStatsData.jj.toString().padStart(2, '0')}` : 
               `20${currentStatsData.jj.toString().padStart(2, '0')}`;
        
        // Set chart title
        const chartTitle2 = document.getElementById('chart-printable-title-bar');
        if (chartTitle2) {
            chartTitle2.textContent = i18nStrings.annual_stats.chart_title.replace('{year}', year2);
            chartTitle2.style.display = 'block';
        }
        
        // Set chart subtitle
        const chartSubtitle2 = document.getElementById('chart-subtitle-bar');
        if (chartSubtitle2) {
            const totalEE = currentStatsData.totals.total_ee || 0;
            chartSubtitle2.textContent = i18nStrings.annual_stats.chart_subtitle.replace('{count}', totalEE);
        }
        
        // Prepare chart data - months 1-12
        const monthLabels2 = Object.values(i18nStrings.months_short);
        const months2 = Array.from({length: 12}, (_, i) => i + 1);
        
        const realData2 = months2.map(mm => currentStatsData.monthly_stats[mm.toString()].real || 0);
        const relativeData2 = months2.map(mm => currentStatsData.monthly_stats[mm.toString()].relative || 0);
        
        // Create chart
        const canvas2 = document.getElementById('activity-chart-bar');
        const ctx2 = canvas2.getContext('2d');
        
        // Destroy existing chart if it exists
        if (window.activityChart) {
            window.activityChart.destroy();
        }
        
        window.activityChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: monthLabels2,
                datasets: [
                    {
                        label: i18nStrings.annual_stats.chart_real,
                        data: realData2,
                        backgroundColor: '#dc3545',  // Red
                        borderColor: '#dc3545',
                        borderWidth: 1,
                        barPercentage: 0.8,
                        categoryPercentage: 0.9
                    },
                    {
                        label: i18nStrings.annual_stats.chart_relative,
                        data: relativeData2,
                        backgroundColor: '#28a745',  // Green
                        borderColor: '#28a745',
                        borderWidth: 1,
                        barPercentage: 0.8,
                        categoryPercentage: 0.9
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: { size: 12 },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: i18nStrings.annual_stats.chart_x_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        stacked: false
                    },
                    y: {
                        title: {
                            display: true,
                            text: i18nStrings.annual_stats.chart_y_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        beginAtZero: true,
                        stacked: false
                    }
                }
            }
        });
        
        // Show chart modal
        const chartModalElement = document.getElementById('chart-modal-bar');
        chartModalElement.setAttribute('tabindex', '-1');
        chartModalElement.addEventListener('shown.bs.modal', () => {
            chartModalElement.focus({ preventScroll: true });
        }, { once: true });
        const chartModal = new bootstrap.Modal(chartModalElement, { backdrop: 'static' });
        
        // Store data for print/save buttons
        window.chartData = currentStatsData;
        
        // Prevent ESC key from closing parent modal
        chartModalElement.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
            }
        });
        
        // Decision #033: setupModalKeyboard for Enter key → OK button
        setupModalKeyboard(chartModalElement, document.getElementById('btn-chart-close-bar'));
        
        chartModal.show();
    }
    
    // Setup print/save button handlers for chart modal
    function setupChartModal() {
        // ===== LINE CHART BUTTONS =====
        const btnChartPrintLine = document.getElementById('btn-chart-print-line');
        if (btnChartPrintLine) {
            btnChartPrintLine.onclick = async () => {
                if (!window.chartData) return;
                try {
                    const response = await fetch(`/api/annual-stats?jj=${window.chartData.jj}&format=linegraph`);
                    const blob = await response.blob();
                    
                    const printWindow = window.open();
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    printWindow.document.write('<html><head><title>Jahresstatistik</title></head><body>');
                    printWindow.document.write('<img src="' + img.src + '" style="max-width: 100%; margin: auto; display: block;">');
                    printWindow.document.write('</body></html>');
                    printWindow.document.close();
                    
                    setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                    }, 500);
                } catch (error) {
                    console.error('Error printing chart:', error);
                    showErrorDialog(i18nStrings.messages.chart_print_failed);
                }
            };
        }
        
        const btnChartSaveLine = document.getElementById('btn-chart-save-line');
        if (btnChartSaveLine) {
            btnChartSaveLine.onclick = async () => {
                if (!window.chartData) return;
                try {
                    const year = window.chartData.jj >= (YEAR_MIN-1900) ? `19${window.chartData.jj.toString().padStart(2, '0')}` : 
                                 `20${window.chartData.jj.toString().padStart(2, '0')}`;
                    const filename = `Jahresstatistik_${year}.png`;
                    
                    const response = await fetch(`/api/annual-stats?jj=${window.chartData.jj}&format=linegraph`);
                    const blob = await response.blob();
                    
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (error) {
                    console.error('Error saving chart:', error);
                    showErrorDialog(i18nStrings.messages.chart_save_failed);
                }
            };
        }

        // ===== BAR CHART BUTTONS =====
        const btnChartPrintBar = document.getElementById('btn-chart-print-bar');
        if (btnChartPrintBar) {
            btnChartPrintBar.onclick = async () => {
                if (!window.chartData) return;
                try {
                    const response = await fetch(`/api/annual-stats?jj=${window.chartData.jj}&format=bargraph`);
                    const blob = await response.blob();
                    
                    const printWindow = window.open();
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    printWindow.document.write('<html><head><title>Jahresstatistik</title></head><body>');
                    printWindow.document.write('<img src="' + img.src + '" style="max-width: 100%; margin: auto; display: block;">');
                    printWindow.document.write('</body></html>');
                    printWindow.document.close();
                    
                    setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                    }, 500);
                } catch (error) {
                    console.error('Error printing chart:', error);
                    showErrorDialog(i18nStrings.messages.chart_print_failed);
                }
            };
        }
        
        const btnChartSaveBar = document.getElementById('btn-chart-save-bar');
        if (btnChartSaveBar) {
            btnChartSaveBar.onclick = async () => {
                if (!window.chartData) return;
                try {
                    const year = window.chartData.jj >= (YEAR_MIN-1900) ? `19${window.chartData.jj.toString().padStart(2, '0')}` : 
                                 `20${window.chartData.jj.toString().padStart(2, '0')}`;
                    const filename = `Jahresstatistik_${year}_Balken.png`;
                    
                    const response = await fetch(`/api/annual-stats?jj=${window.chartData.jj}&format=bargraph`);
                    const blob = await response.blob();
                    
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (error) {
                    console.error('Error saving chart:', error);
                    showErrorDialog(i18nStrings.messages.chart_save_failed);
                }
            };
        }
    }
    
    // Call setupChartModal when page loads
    setupChartModal();

    // Print statistics
    function printStatistics() {
        window.print();
    }
    
    // Save statistics
    async function saveStatistics() {
        if (!currentStatsData) return;
        
        const year = currentStatsData.jj >= (YEAR_MIN-1900) ? `19${currentStatsData.jj.toString().padStart(2, '0')}` : 
                 `20${currentStatsData.jj.toString().padStart(2, '0')}`;
        
        // Check output mode
        const modeResponse = await fetch('/api/config/outputmode');
        const modeData = await modeResponse.json();
        const outputMode = modeData.mode || 'P';
        
        let content, mimeType, filename;
        
        if (outputMode === 'M') {
            // Markdown mode: save as .md
            filename = `${year}.md`;
            content = buildMarkdownAnnualStats(currentStatsData, year, i18nStrings);
            mimeType = 'text/markdown;charset=utf-8';
        } else if (outputMode === 'H') {
            // HTML-Tabellen mode: save as CSV
            filename = `${year}.csv`;
            content = generateStatsCSV(currentStatsData, year);
            mimeType = 'text/csv;charset=utf-8';
        } else {
            // Pseudografik mode: save as TXT
            filename = `${year}.txt`;
            const statsContent = document.getElementById('stats-content');
            content = statsContent ? statsContent.textContent : '';
            mimeType = 'text/plain;charset=utf-8';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Generate CSV from annual statistics data
    function generateStatsCSV(data, year) {
        let csv = '';
        
        // Table 1: Monthly Activity
        if (data.monthly_stats && data.totals) {
            csv += `"${i18nStrings.annual_stats.title_with_year.replace('{year}', year)}"\n`;
            csv += i18nStrings.annual_stats.table_month;
            csv += ',,' + i18nStrings.annual_stats.table_sun;
            csv += ',,' + i18nStrings.annual_stats.table_moon;
            csv += ',,' + i18nStrings.annual_stats.table_total;
            csv += ',,' + i18nStrings.annual_stats.table_activity + '\n';
            csv += ',';
            csv += i18nStrings.annual_stats.table_ee + ',' + i18nStrings.annual_stats.table_days;
            csv += ',' + i18nStrings.annual_stats.table_ee + ',' + i18nStrings.annual_stats.table_days;
            csv += ',' + i18nStrings.annual_stats.table_ee + ',' + i18nStrings.annual_stats.table_days;
            csv += ',' + i18nStrings.annual_stats.table_real + ',' + i18nStrings.annual_stats.table_relative + '\n';
            
            for (let mm = 1; mm <= 12; mm++) {
                const mmStr = mm.toString();
                const monthData = data.monthly_stats[mmStr] || {};
                csv += i18nStrings.months[mmStr] + ',';
                csv += (monthData.sun_ee || 0) + ',' + (monthData.sun_days || 0) + ',';
                csv += (monthData.moon_ee || 0) + ',' + (monthData.moon_days || 0) + ',';
                csv += (monthData.total_ee || 0) + ',' + (monthData.total_days || 0) + ',';
                csv += (monthData.real || 0).toFixed(1) + ',' + (monthData.relative || 0).toFixed(1) + '\n';
            }
            
            // Totals
            csv += i18nStrings.annual_stats.table_totals + ',';
            csv += (data.totals.sun_ee || 0) + ',' + (data.totals.sun_days || 0) + ',';
            csv += (data.totals.moon_ee || 0) + ',' + (data.totals.moon_days || 0) + ',';
            csv += (data.totals.total_ee || 0) + ',' + (data.totals.total_days || 0) + ',';
            csv += (data.totals.real || 0).toFixed(1) + ',' + (data.totals.relative || 0).toFixed(1) + '\n\n';
        }
        
        // Table 2: EE Observations - Sun
        if (data.sun_ee_counts && Object.keys(data.sun_ee_counts).length > 0) {
            csv += `"${i18nStrings.annual_stats.ee_observed_title}"\n`;
            csv += `"${i18nStrings.annual_stats.ee_sun_label}"\n`;
            csv += 'EE';
            const sunEEs = Object.keys(data.sun_ee_counts).map(Number).sort((a, b) => a - b);
            for (const ee of sunEEs) {
                csv += ',' + ee.toString().padStart(2, '0');
            }
            csv += '\n' + i18nStrings.annual_stats.ee_count_label;
            for (const ee of sunEEs) {
                csv += ',' + (data.sun_ee_counts[ee] || 0);
            }
            csv += '\n\n';
        }
        
        // Table 2: EE Observations - Moon
        if (data.moon_ee_counts && Object.keys(data.moon_ee_counts).length > 0) {
            csv += `"${i18nStrings.annual_stats.ee_moon_label}"\n`;
            csv += 'EE';
            const moonEEs = Object.keys(data.moon_ee_counts).map(Number).sort((a, b) => a - b);
            for (const ee of moonEEs) {
                csv += ',' + ee.toString().padStart(2, '0');
            }
            csv += '\n' + i18nStrings.annual_stats.ee_count_label;
            for (const ee of moonEEs) {
                csv += ',' + (data.moon_ee_counts[ee] || 0);
            }
            csv += '\n\n';
        }
        
        // Table 3: Observer Distribution
        if (data.observer_distribution && data.observer_distribution.length > 0) {
            csv += `"${i18nStrings.annual_stats.observer_dist_title}"\n`;
            csv += i18nStrings.annual_stats.observer_dist_kk + ',';
            csv += i18nStrings.annual_stats.observer_dist_ee01 + ',' + i18nStrings.annual_stats.observer_dist_percent + ',';
            csv += i18nStrings.annual_stats.observer_dist_ee02 + ',' + i18nStrings.annual_stats.observer_dist_percent + ',';
            csv += i18nStrings.annual_stats.observer_dist_ee03 + ',' + i18nStrings.annual_stats.observer_dist_percent + ',';
            csv += i18nStrings.annual_stats.observer_dist_ee567 + ',' + i18nStrings.annual_stats.observer_dist_percent + ',';
            csv += i18nStrings.annual_stats.observer_dist_ee17 + ',';
            csv += i18nStrings.annual_stats.observer_dist_ee_so + ',';
            csv += i18nStrings.annual_stats.observer_dist_ht_ges + '\n';
            
            for (const obs of data.observer_distribution) {
                csv += obs.kk.toString().padStart(2, '0') + ',';
                csv += obs.ee01 + ',' + obs.pct01.toFixed(1) + ',';
                csv += obs.ee02 + ',' + obs.pct02.toFixed(1) + ',';
                csv += obs.ee03 + ',' + obs.pct03.toFixed(1) + ',';
                csv += obs.ee567 + ',' + obs.pct567.toFixed(1) + ',';
                csv += obs.ee17 + ',' + obs.total_sun_ee + ',' + obs.total_days + '\n';
            }
            csv += '\n';
        }
        
        // Table 4: Phenomena
        if (data.phenomena && data.phenomena.length > 0) {
            csv += `"${i18nStrings.annual_stats.phenomena_title}"\n`;
            csv += i18nStrings.annual_stats.phenomena_date + ',KK,GG,' + i18nStrings.annual_stats.phenomena_time + ',O,';
            const eeColumns = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12];
            for (const ee of eeColumns) {
                csv += ee.toString().padStart(2, '0') + ',';
            }
            csv += i18nStrings.annual_stats.phenomena_other_ee + '\n';
            
            for (const phenom of data.phenomena) {
                csv += phenom.tt.toString().padStart(2, '0') + '.' + phenom.mm.toString().padStart(2, '0') + ',';
                csv += phenom.kk.toString().padStart(2, '0') + ',';
                csv += phenom.gg.toString().padStart(2, '0') + ',';
                csv += phenom.zs.toString().padStart(2, ' ') + 'h ' + phenom.zm.toString().padStart(2, '0') + 'm,';
                csv += phenom.o + ',';
                
                // EE types 01-12
                for (const ee of eeColumns) {
                    csv += (phenom.ee_types.includes(ee) ? 'X' : '') + ',';
                }
                
                // Further EE
                const furtherEE = phenom.ee_types.filter(ee => ee > 12).map(ee => ee.toString().padStart(2, '0'));
                csv += furtherEE.join(' ') + '\n';
            }
        }
        
        return csv;
    }
    
    // Event Handlers
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            window.navigateInternal('/');
        });
    }
    
    if (btnApply) {
        btnApply.addEventListener('click', applyFilter);
    }
    
    if (yearSelect) {
        yearSelect.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFilter();
            }
        });
    }
    
    // ESC key support - close annual statistics and return to main
    const escKeyHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.navigateInternal('/');
        }
    };
    
    document.addEventListener('keydown', escKeyHandler);
    
    // Initialize UI
    populateYears();
    await loadDateDefault();
    
    // Check if data is loaded
    const dataLoaded = await checkDataLoaded();
    if (!dataLoaded) {
        return; // Warning modal will redirect to main
    }
    
    // Show filter dialog
    const modal = new bootstrap.Modal(filterDialog, {
        backdrop: 'static',
        keyboard: false
    });
    modal.show();
    
    // Decision #033: setupModalKeyboard for Enter key → Apply button
    setupModalKeyboard(filterDialog, btnApply);
    
    // Decision #034: OK disabled until year selected
    btnApply.disabled = true;
    yearSelect.addEventListener('change', () => {
        btnApply.disabled = !yearSelect.value;
    });
    
    // Focus year select when modal is shown
    filterDialog.addEventListener('shown.bs.modal', () => {
        if (yearSelect) {
            yearSelect.focus();
        }
    });

    // Build Pseudografik format annual statistics (original implementation)
    function buildPseudografikAnnualStats(data, year, i18nStrings) {
        let html = '<pre style="font-family: \'Courier New\', Courier, monospace; font-size: 11px; color: #000000; line-height: 1.2; overflow-x: auto; padding: 20px; background-color: #f5f5f5; border-radius: 4px; letter-spacing: 0; word-spacing: normal;">';
        
        // Title (centered)
        const titleLine = i18nStrings.annual_stats.title_with_year.replace('{year}', year);
        const titlePadding = Math.max(0, Math.floor((73 - titleLine.length) / 2));
        html += ' '.repeat(titlePadding) + titleLine + '\n';
        html += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n\n';
        
        // Monthly activity table
        if (data.monthly_stats && data.totals) {
            html += renderMonthlyActivity(data.monthly_stats, data.totals, year);
        }
        
        // EE observation tables
        if (data.sun_ee_counts || data.moon_ee_counts) {
            html += renderEEObservations(data.sun_ee_counts, data.moon_ee_counts);
        }
        
        // Observer distribution table
        if (data.observer_distribution) {
            html += renderObserverDistribution(data.observer_distribution);
        }
        
        // Phenomena table
        if (data.phenomena) {
            html += renderPhenomena(data.phenomena);
        }
        
        html += '</pre>';
        return html;
    }

    // Build HTML-Tabellen format annual statistics
    function buildHTMLTableAnnualStats(data, year, i18nStrings) {
        let html = '<div style="padding: 20px;">';
        
        // Title
        const titleLine = i18nStrings.annual_stats.title_with_year.replace('{year}', year);
        html += `<h3 style="text-align: center; font-family: Arial, sans-serif; margin-bottom: 30px;">${titleLine}</h3>`;
        
        // Table 1: Monthly Activity - split columns
        if (data.monthly_stats && data.totals) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th rowspan="2">' + i18nStrings.annual_stats.table_month + '</th>';
            html += '<th colspan="2">' + i18nStrings.annual_stats.table_sun + '</th>';
            html += '<th colspan="2">' + i18nStrings.annual_stats.table_moon + '</th>';
            html += '<th colspan="2">' + i18nStrings.annual_stats.table_totals + '</th>';
            html += '<th colspan="2">' + i18nStrings.annual_stats.table_activity + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th>' + i18nStrings.annual_stats.table_ee + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_days + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_ee + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_days + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_ee + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_days + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_real + '</th>';
            html += '<th>' + i18nStrings.annual_stats.table_relative + '</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            for (let mm = 1; mm <= 12; mm++) {
                const mmStr = mm.toString();
                const monthData = data.monthly_stats[mmStr] || {};
                
                html += '<tr>';
                html += '<td>' + i18nStrings.months[mmStr] + '</td>';
                html += '<td style="text-align: right;">' + (monthData.sun_ee || 0) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.sun_days || 0) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.moon_ee || 0) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.moon_days || 0) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.total_ee || 0) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.total_days || 0) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.real || 0).toFixed(1) + '</td>';
                html += '<td style="text-align: right;">' + (monthData.relative || 0).toFixed(1) + '</td>';
                html += '</tr>';
            }
            
            // Totals row
            html += '<tr style="font-weight: bold; border-top: 2px solid #000;">';
            html += '<td>' + i18nStrings.annual_stats.table_totals + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.sun_ee || 0) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.sun_days || 0) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.moon_ee || 0) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.moon_days || 0) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.total_ee || 0) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.total_days || 0) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.real || 0).toFixed(1) + '</td>';
            html += '<td style="text-align: right;">' + (data.totals.relative || 0).toFixed(1) + '</td>';
            html += '</tr>';
            
            html += '</tbody>';
            html += '</table>';
        }
        
        // Table 2: EE Observations - one table for sun, one for moon
        const titleLine2 = i18nStrings.annual_stats.ee_observed_title;
        html += `<h4 style="text-align: center; font-family: Arial, sans-serif; margin-top: 30px; margin-bottom: 20px;">${titleLine2}</h4>`;
        
        // Sun halos table
        if (data.sun_ee_counts && Object.keys(data.sun_ee_counts).length > 0) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th colspan="100" style="text-align: center;">' + i18nStrings.annual_stats.ee_sun_label + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th>EE</th>';
            const sunEEs = Object.keys(data.sun_ee_counts).map(Number).sort((a, b) => a - b);
            for (const ee of sunEEs) {
                html += '<th style="text-align: center;">' + ee.toString().padStart(2, '0') + '</th>';
            }
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            html += '<tr>';
            html += '<td style="font-weight: bold;">' + i18nStrings.annual_stats.ee_count_label + '</td>';
            for (const ee of sunEEs) {
                html += '<td style="text-align: right;">' + (data.sun_ee_counts[ee] || 0) + '</td>';
            }
            html += '</tr>';
            html += '</tbody>';
            html += '</table>';
        }
        
        // Moon halos table
        if (data.moon_ee_counts && Object.keys(data.moon_ee_counts).length > 0) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th colspan="100" style="text-align: center;">' + i18nStrings.annual_stats.ee_moon_label + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th>EE</th>';
            const moonEEs = Object.keys(data.moon_ee_counts).map(Number).sort((a, b) => a - b);
            for (const ee of moonEEs) {
                html += '<th style="text-align: center;">' + ee.toString().padStart(2, '0') + '</th>';
            }
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            html += '<tr>';
            html += '<td style="font-weight: bold;">' + i18nStrings.annual_stats.ee_count_label + '</td>';
            for (const ee of moonEEs) {
                html += '<td style="text-align: right;">' + (data.moon_ee_counts[ee] || 0) + '</td>';
            }
            html += '</tr>';
            html += '</tbody>';
            html += '</table>';
        }
        
        // Table 3: Observer Distribution - no separators every 5 rows
        if (data.observer_distribution && data.observer_distribution.length > 0) {
            const titleLine3 = i18nStrings.annual_stats.observer_dist_title;
            html += `<h4 style="text-align: center; font-family: Arial, sans-serif; margin-top: 30px; margin-bottom: 20px;">${titleLine3}</h4>`;
            
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_kk + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ee01 + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_percent + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ee02 + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_percent + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ee03 + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_percent + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ee567 + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_percent + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ee17 + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ee_so + '</th>';
            html += '<th>' + i18nStrings.annual_stats.observer_dist_ht_ges + '</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            for (const obs of data.observer_distribution) {
                html += '<tr>';
                html += '<td style="text-align: center;">' + obs.kk.toString().padStart(2, '0') + '</td>';
                html += '<td style="text-align: right;">' + obs.ee01 + '</td>';
                html += '<td style="text-align: right;">' + obs.pct01.toFixed(1) + '</td>';
                html += '<td style="text-align: right;">' + obs.ee02 + '</td>';
                html += '<td style="text-align: right;">' + obs.pct02.toFixed(1) + '</td>';
                html += '<td style="text-align: right;">' + obs.ee03 + '</td>';
                html += '<td style="text-align: right;">' + obs.pct03.toFixed(1) + '</td>';
                html += '<td style="text-align: right;">' + obs.ee567 + '</td>';
                html += '<td style="text-align: right;">' + obs.pct567.toFixed(1) + '</td>';
                html += '<td style="text-align: right;">' + obs.ee17 + '</td>';
                html += '<td style="text-align: right;">' + obs.total_sun_ee + '</td>';
                html += '<td style="text-align: right;">' + obs.total_days + '</td>';
                html += '</tr>';
            }
            
            html += '</tbody>';
            html += '</table>';
        }
        
        // Table 4: Phenomena - halo types in separate columns
        if (data.phenomena && data.phenomena.length > 0) {
            const titleLine4 = i18nStrings.annual_stats.phenomena_title;
            html += `<h4 style="text-align: center; font-family: Arial, sans-serif; margin-top: 30px; margin-bottom: 20px;">${titleLine4}</h4>`;
            
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th>' + i18nStrings.annual_stats.phenomena_date + '</th>';
            html += '<th>KK</th>';
            html += '<th>GG</th>';
            html += '<th>' + i18nStrings.annual_stats.phenomena_time + '</th>';
            html += '<th>O</th>';
            // EE columns 01-12
            const eeColumns = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12];
            for (const ee of eeColumns) {
                html += '<th style="text-align: center;">' + ee.toString().padStart(2, '0') + '</th>';
            }
            html += '<th>' + i18nStrings.annual_stats.phenomena_other_ee + '</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            for (const phenom of data.phenomena) {
                html += '<tr>';
                html += '<td>' + phenom.tt.toString().padStart(2, '0') + '.' + phenom.mm.toString().padStart(2, '0') + '</td>';
                html += '<td style="text-align: center;">' + phenom.kk.toString().padStart(2, '0') + '</td>';
                html += '<td style="text-align: center;">' + phenom.gg.toString().padStart(2, '0') + '</td>';
                html += '<td>' + phenom.zs.toString().padStart(2, ' ') + 'h ' + phenom.zm.toString().padStart(2, '0') + 'm</td>';
                html += '<td style="text-align: center;">' + phenom.o + '</td>';
                
                // EE types 01-12 (show X where present)
                for (const ee of eeColumns) {
                    if (phenom.ee_types.includes(ee)) {
                        html += '<td style="text-align: center;">X</td>';
                    } else {
                        html += '<td></td>';
                    }
                }
                
                // Further EE (beyond 12) - all in one column
                const furtherEE = phenom.ee_types.filter(ee => ee > 12).map(ee => ee.toString().padStart(2, '0'));
                html += '<td>' + furtherEE.join(' ') + '</td>';
                
                html += '</tr>';
            }
            
            html += '</tbody>';
            html += '</table>';
        } else {
            // No phenomena
            const titleLine4 = i18nStrings.annual_stats.phenomena_title;
            html += `<h4 style="text-align: center; font-family: Arial, sans-serif; margin-top: 30px; margin-bottom: 20px;">${titleLine4}</h4>`;
            html += '<div style="padding: 20px; text-align: center; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; margin-bottom: 30px;">';
            html += '<p style="margin: 0;">' + i18nStrings.annual_stats.phenomena_none + '</p>';
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }

    // Build Markdown format annual statistics (pipe tables from HTML format)
    function buildMarkdownAnnualStats(data, year, i18nStrings) {
        let md = `# ${i18nStrings.annual_stats.title_with_year.replace('{year}', year)}\n\n`;
        
        // Table 1: Monthly Activity
        if (data.monthly_stats && data.totals) {
            md += '| ' + i18nStrings.annual_stats.table_month + ' | ';
            md += i18nStrings.annual_stats.table_sun + ' EE | ' + i18nStrings.annual_stats.table_sun + ' ' + i18nStrings.annual_stats.table_days + ' | ';
            md += i18nStrings.annual_stats.table_moon + ' EE | ' + i18nStrings.annual_stats.table_moon + ' ' + i18nStrings.annual_stats.table_days + ' | ';
            md += i18nStrings.annual_stats.table_totals + ' EE | ' + i18nStrings.annual_stats.table_totals + ' ' + i18nStrings.annual_stats.table_days + ' | ';
            md += i18nStrings.annual_stats.table_real + ' | ' + i18nStrings.annual_stats.table_relative + ' |\n';
            
            md += '|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
            
            for (let mm = 1; mm <= 12; mm++) {
                const mmStr = mm.toString();
                const monthData = data.monthly_stats[mmStr] || {};
                md += '| ' + i18nStrings.months[mmStr] + ' | ';
                md += (monthData.sun_ee || 0) + ' | ' + (monthData.sun_days || 0) + ' | ';
                md += (monthData.moon_ee || 0) + ' | ' + (monthData.moon_days || 0) + ' | ';
                md += (monthData.total_ee || 0) + ' | ' + (monthData.total_days || 0) + ' | ';
                md += (monthData.real || 0).toFixed(1) + ' | ' + (monthData.relative || 0).toFixed(1) + ' |\n';
            }
            
            // Totals row
            md += '| **' + i18nStrings.annual_stats.table_totals + '** | ';
            md += '**' + (data.totals.sun_ee || 0) + '** | **' + (data.totals.sun_days || 0) + '** | ';
            md += '**' + (data.totals.moon_ee || 0) + '** | **' + (data.totals.moon_days || 0) + '** | ';
            md += '**' + (data.totals.total_ee || 0) + '** | **' + (data.totals.total_days || 0) + '** | ';
            md += '**' + (data.totals.real || 0).toFixed(1) + '** | **' + (data.totals.relative || 0).toFixed(1) + '** |\n\n';
        }
        
        // Table 2: EE Observations
        if (data.sun_ee_counts || data.moon_ee_counts) {
            md += `## ${i18nStrings.annual_stats.ee_observed_title}\n\n`;
        }
        
        // Sun halos
        if (data.sun_ee_counts && Object.keys(data.sun_ee_counts).length > 0) {
            md += `### ${i18nStrings.annual_stats.ee_sun_label}\n\n`;
            md += '| EE |';
            const sunEEs = Object.keys(data.sun_ee_counts).map(Number).sort((a,b)=>a-b);
            for (const ee of sunEEs) {
                md += ' ' + ee.toString().padStart(2, '0') + ' |';
            }
            md += '\n|---|';
            for (let i = 0; i < sunEEs.length; i++) {
                md += '---:|';
            }
            md += '\n| ' + i18nStrings.annual_stats.ee_count_label + ' |';
            for (const ee of sunEEs) {
                md += ' ' + (data.sun_ee_counts[ee] || 0) + ' |';
            }
            md += '\n\n';
        }
        
        // Moon halos
        if (data.moon_ee_counts && Object.keys(data.moon_ee_counts).length > 0) {
            md += `### ${i18nStrings.annual_stats.ee_moon_label}\n\n`;
            md += '| EE |';
            const moonEEs = Object.keys(data.moon_ee_counts).map(Number).sort((a,b)=>a-b);
            for (const ee of moonEEs) {
                md += ' ' + ee.toString().padStart(2, '0') + ' |';
            }
            md += '\n|---|';
            for (let i = 0; i < moonEEs.length; i++) {
                md += '---:|';
            }
            md += '\n| ' + i18nStrings.annual_stats.ee_count_label + ' |';
            for (const ee of moonEEs) {
                md += ' ' + (data.moon_ee_counts[ee] || 0) + ' |';
            }
            md += '\n\n';
        }
        
        // Table 3: Observer Distribution
        if (data.observer_distribution && data.observer_distribution.length > 0) {
            md += `## ${i18nStrings.annual_stats.observer_dist_title}\n\n`;
            md += '| ' + i18nStrings.annual_stats.observer_dist_kk + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ee01 + ' | ' + i18nStrings.annual_stats.observer_dist_percent + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ee02 + ' | ' + i18nStrings.annual_stats.observer_dist_percent + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ee03 + ' | ' + i18nStrings.annual_stats.observer_dist_percent + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ee567 + ' | ' + i18nStrings.annual_stats.observer_dist_percent + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ee17 + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ee_so + ' | ';
            md += i18nStrings.annual_stats.observer_dist_ht_ges + ' |\n';
            md += '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
            
            for (const obs of data.observer_distribution) {
                md += '| ' + obs.kk.toString().padStart(2, '0') + ' | ';
                md += obs.ee01 + ' | ' + obs.pct01.toFixed(1) + ' | ';
                md += obs.ee02 + ' | ' + obs.pct02.toFixed(1) + ' | ';
                md += obs.ee03 + ' | ' + obs.pct03.toFixed(1) + ' | ';
                md += obs.ee567 + ' | ' + obs.pct567.toFixed(1) + ' | ';
                md += obs.ee17 + ' | ' + obs.total_sun_ee + ' | ' + obs.total_days + ' |\n';
            }
            md += '\n';
        }
        
        // Table 4: Phenomena
        if (data.phenomena && data.phenomena.length > 0) {
            md += `## ${i18nStrings.annual_stats.phenomena_title}\n\n`;
            md += '| ' + i18nStrings.annual_stats.phenomena_date + ' | KK | GG | ' + i18nStrings.annual_stats.phenomena_time + ' | O |';
            const eeColumns = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12];
            for (const ee of eeColumns) {
                md += ' EE' + ee.toString().padStart(2, '0') + ' |';
            }
            md += ' ' + i18nStrings.annual_stats.phenomena_other_ee + ' |\n';
            md += '|---|---:|---:|---|---:|';
            for (let i = 0; i < eeColumns.length; i++) {
                md += '---:|';
            }
            md += '---|\n';
            
            for (const phenom of data.phenomena) {
                md += '| ' + phenom.tt.toString().padStart(2, '0') + '.' + phenom.mm.toString().padStart(2, '0') + ' | ';
                md += phenom.kk.toString().padStart(2, '0') + ' | ';
                md += phenom.gg.toString().padStart(2, '0') + ' | ';
                md += phenom.zs.toString().padStart(2, ' ') + 'h ' + phenom.zm.toString().padStart(2, '0') + 'm | ';
                md += phenom.o + ' |';
                
                // EE types 01-12
                for (const ee of eeColumns) {
                    md += phenom.ee_types.includes(ee) ? ' X |' : ' |';
                }
                
                // Further EE
                const furtherEE = phenom.ee_types.filter(ee => ee > 12).map(ee => ee.toString().padStart(2, '0'));
                md += ' ' + furtherEE.join(' ') + ' |\n';
            }
            md += '\n';
        } else {
            md += `## ${i18nStrings.annual_stats.phenomena_title}\n\n`;
            md += i18nStrings.annual_stats.phenomena_none + '\n\n';
        }
        
        return md;
    }
});
