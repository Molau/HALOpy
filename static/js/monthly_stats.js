// Monthly Statistics (Monatsstatistik) functionality
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for i18nStrings to be loaded (from main.js)
    await window.waitForI18n();

    let currentStatsData = null; // Store current stats data for save/print
    let filterApplied = false; // Flag to distinguish Apply from Cancel/X/ESC

    // Elements
    const filterDialog = document.getElementById('filter-dialog');
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const monthYearError = document.getElementById('month-year-error');
    const btnCancel = document.getElementById('btn-cancel-filter');
    const btnApply = document.getElementById('btn-apply-filter');
    const applySpinner = document.getElementById('apply-spinner');
    
    // Placeholder is already set in HTML template via Jinja2

    // Validate month/year selection from dropdowns
    function validateMonthYear() {
        const mm = monthSelect.value;
        const jj = yearSelect.value;
        
        if (!mm || !jj) {
            return null;
        }

        return { 
            mm: String(parseInt(mm)).padStart(2, '0'), 
            jj: String(parseInt(jj))
        };
    }

    // Load date defaults (same helper used by monthly report)
    async function loadDateDefault() {
        try {
            const dateDefault = await getDateDefault();
            if (dateDefault) {
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

    // Populate year dropdown
    function populateYears() {
        
        for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    }

    // Apply filter and generate statistics
    async function applyFilter() {
        // Validate month/year
        const dateInfo = validateMonthYear();
        if (!dateInfo) {
            monthSelect.focus();
            return;
        }

        // Show spinner
        if (applySpinner) applySpinner.style.display = 'inline-block';
        if (btnApply) btnApply.disabled = true;
        
        try {
            // Fetch monthly statistics
            const url = `/api/monthly-stats?mm=${dateInfo.mm}&jj=${dateInfo.jj}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                // Handle different error response types gracefully
                let errorMessage = `Server Error ${response.status}: ${response.statusText}`;
                
                try {
                    // Try to parse JSON error response
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (jsonError) {
                    // If JSON parsing fails, try to get text content
                    try {
                        const textContent = await response.text();
                        if (textContent && textContent.length < 200) {
                            errorMessage = textContent;
                        }
                    } catch (textError) {
                        // If everything fails, use status info
                        console.warn('Failed to parse error response:', jsonError);
                    }
                }
                
                console.error('API error:', { status: response.status, statusText: response.statusText, message: errorMessage });
                throw new Error(errorMessage);
            }
            
            const data = await response.json();

            
            // Close filter dialog (flag prevents hidden handler from navigating home)
            filterApplied = true;
            const modal = bootstrap.Modal.getInstance(filterDialog);
            modal.hide();

            // Display the statistics
            showStatistics(data);

        } catch (error) {
            console.error('Error generating statistics:', error);
            showWarningModal(error.message || i18nStrings.messages.error_loading);
        } finally {
            applySpinner.style.display = 'none';
            btnApply.disabled = false;
        }
    }

    // Show statistics in results modal
    async function showStatistics(data) {
        // Store data for save/print/chart functions
        currentStatsData = data;
        
        const statsContent = document.getElementById('stats-content');
        if (!statsContent) return;
        
        // Check output mode setting
        let outputMode = 'P'; // Default: Pseudografik
        try {
            const modeResponse = await fetch('/api/config/setting?key=OUTPUT_MODE');
            const modeData = await modeResponse.json();
            outputMode = modeData.value || 'P';
        } catch (error) {
            console.error('Error fetching output mode:', error);
        }
        
        // Get month name (months array is 1-indexed in i18nStrings)
        const months = i18nStrings.months || {};
        const monthName = months[data.mm] || months[data.mm.toString()];
        
        // Format year (data.jj is 4-digit from backend)
        const year = String(data.jj);
        
        // Set title with month and year
        const resultsTitle = document.getElementById('results-modal-title');
        if (resultsTitle) {
            resultsTitle.textContent = `${i18nStrings.monthly_stats.title} ${monthName} ${year}`;
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
            const response = await fetch(`/api/monthly-stats?mm=${data.mm}&jj=${data.jj}&format=${formatParam}`);
            let content;
            
            if (formatParam === 'html') {
                // HTML format returns JSON; convert to HTML tables
                const jsonData = await response.json();
                html = buildHTMLTableMonthlyStats(jsonData, monthName, year, i18nStrings);
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
            console.error('Error fetching monthly statistics:', error);
            html = `<p style="color: red; padding: 20px;">Error loading statistics: ${escapeHtml(error.message)}</p>`;
        }
        
        statsContent.innerHTML = html;
        
        // Show results modal
        const resultsModalEl = document.getElementById('results-modal');
        const resultsModal = new bootstrap.Modal(resultsModalEl, {
            backdrop: 'static'
        });
        resultsModal.show();
        
        // Wire up action buttons
        setupActionButtons(resultsModalEl);
    }
    
    // Render observer overview table
    function renderObserverOverview(observers, monthName, year) {
        let html = '';
        
        // Table header
        html += '╔' + '═'.repeat(86) + '╗\n';
        const headerText = `${i18nStrings.monthly_stats.observer_overview} ${monthName} ${year}`;
        const headerPadding = Math.max(0, Math.floor((86 - headerText.length) / 2));
        html += '║' + ' '.repeat(headerPadding) + headerText + ' '.repeat(86 - headerPadding - headerText.length) + '║\n';
        html += '╠════╦══════════╦══════════╦══════════╦══════════╦══════════╦════════════╦═════════════╣\n';
        html += '║KKGG║ 1   3   5║   7   9  ║11  13  15║  17  19  ║21  23  25║  27  29  31║ 1) 2) 3) 4) ║\n';
        html += '║    ║   2   4  ║ 6   8  10║  12  14  ║16  18  20║  22  24  ║26  28  30  ║             ║\n';
        html += '╠════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════════════╣\n';
        
        // Data rows
        let rowCount = 0;
        for (const obs of observers) {
            const kk = obs.kk.toString().padStart(2, '0');
            const gg = obs.region === 39 ? '//' : obs.region.toString().padStart(2, '0');
            
            html += '║' + kk + gg + '║';
            
            // Days 1-31 in groups of 5
            for (let day = 1; day <= 31; day++) {
                const dayData = obs.days[day];
                let cellValue = '  ';
                if (dayData) {
                    const solar = dayData.solar || 0;
                    const lunar = dayData.lunar || false;
                    if (solar > 0 && lunar) cellValue = '_' + solar.toString().padStart(1);
                    else if (solar > 0) cellValue = solar.toString().padStart(2);
                    else if (lunar) cellValue = ' X';
                }
                html += cellValue;
                
                // Add spacing between days within group, or column separator after every 5 days
                if (day % 5 === 0 && day !== 30) {
                    html += '║';
                }
            }
            html += '║';
            
            // Summary columns
            html += obs.total_solar.toString().padStart(3) + ' ';
            html += obs.days_solar.toString().padStart(2) + ' ';
            html += obs.days_lunar.toString().padStart(2) + ' ';
            html += obs.total_days.toString().padStart(2) + ' ';
            html += '║\n';
            
            rowCount++;
            
            // Add separator every 5 rows (but not at the end)
            if (rowCount % 5 === 0 && rowCount < observers.length) {
                html += '╠════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════════════╣\n';
            }
        }
        
        // Table footer
        html += '╠════╩══════════╩══════════╩══════════╩══════════╩══════════╩═════════════╩════════════╣\n';
        html += '║  ' + i18nStrings.statistics.footnote_ee_days.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '') + '         ║\n';
        html += '╚' + '═'.repeat(86) + '╝\n\n';
        
        return html;
    }

    // Render EE overview table (Ergebnisübersicht Sonnenhalos)
    function renderEEOverview(eeData, dailyTotals, grandTotal, monthName, year) {
        let html = '';
        
        // Table header
        html += '    ╔' + '═'.repeat(79) + '╗\n';
        const headerText = `${i18nStrings.monthly_stats.ee_overview} ${monthName} ${year}`;
        const headerPadding = Math.max(0, Math.floor((79 - headerText.length) / 2));
        html += '    ║' + ' '.repeat(headerPadding) + headerText + ' '.repeat(79 - headerPadding - headerText.length) + '║\n';
        html += '    ╠═════╦══════════╦══════════╦══════════╦══════════╦══════════╦════════════╦═════╣\n';
        html += '    ║ EE  ║ 1   3   5║   7   9  ║11  13  15║  17  19  ║21  23  25║  27  29  31║ ges ║\n';
        html += '    ║     ║   2   4  ║ 6   8  10║  12  14  ║16  18  20║  22  24  ║26  28  30  ║     ║\n';
        html += '    ╠═════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣\n';
        
        // Data rows
        let rowCount = 0;
        for (const eeRow of eeData) {
            const ee = eeRow.ee_label || eeRow.ee.toString().padStart(2, '0');
            html += '    ║' + ee.padEnd(5, ' ') + '║';
            
            // Days 1-31 in groups of 5
            for (let day = 1; day <= 31; day++) {
                const count = eeRow.days[day] || 0;
                const cellValue = count > 0 ? count.toString().padStart(2) : '  ';
                html += cellValue;
                
                // Add column separator after every 5 days
                if (day % 5 === 0 && day !== 30) {
                    html += '║';
                }
            }
            html += '║';
            
            // Total column
            html += eeRow.total.toString().padStart(4) + ' ║\n';
            
            rowCount++;
            
            // Add separator after each EE row, except:
            // - After the last row
            // - Between EE 5, 6, 7 (keep them grouped)
            const currentEE = eeRow.ee;
            const isLast = rowCount >= eeData.length;
            const isBeforeGroup567 = currentEE === 5 || currentEE === 6;
            
            if (!isLast && !isBeforeGroup567) {
                html += '    ╠═════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣\n';
            }
        }
        
        // Daily totals row
        html += '    ╠═════╩══════════╩══════════╩══════════╩══════════╩══════════╩════════════╩═════╣\n';
        html += '    ║  Σ  ║';
        for (let day = 1; day <= 31; day++) {
            const count = dailyTotals[day] || 0;
            const cellValue = count > 0 ? count.toString().padStart(2) : '  ';
            html += cellValue;
            
            if (day % 5 === 0 && day !== 30) {
                html += '║';
            }
        }
        html += '║';
        html += grandTotal.toString().padStart(4) + ' ║\n';
        html += '    ╚' + '═'.repeat(79) + '╝\n\n';
        
        return html;
    }

    // Render rare halos table (EE > 12)
    function renderRareHalos(rareHalos, monthName, year) {
        let html = '';
        
        // Table header
        html += '    ╔' + '═'.repeat(77) + '╗\n';
        const headerPadding = Math.max(0, Math.floor((77 - i18nStrings.monthly_stats.rare_halos.length) / 2));
        html += '    ║' + ' '.repeat(headerPadding) + i18nStrings.monthly_stats.rare_halos + ' '.repeat(77 - headerPadding - i18nStrings.monthly_stats.rare_halos.length) + '║\n';
        
        // Check if there are any rare halos
        if (!rareHalos || rareHalos.length === 0) {
            // No rare halos - show message
            html += '    ╠' + '═'.repeat(77) + '╣\n';
            const noneText = (i18nStrings.monthly_stats.rare_halos_none).replace('{month}', monthName);
            const nonePadding = Math.max(0, Math.floor((77 - noneText.length) / 2));
            html += '    ║' + ' '.repeat(nonePadding) + noneText + ' '.repeat(77 - nonePadding - noneText.length) + '║\n';
            html += '    ╚' + '═'.repeat(77) + '╝\n\n';
            return html;
        }
        
        // Column header
        html += '    ╠════════════╦════════════╦════════════╦════════════╦════════════╦════════════╣\n';
        html += '    ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║\n';
        html += '    ╠════════════╬════════════╬════════════╬════════════╬════════════╬════════════╣\n';
        
        // Distribute all halos across 6 columns sequentially
        // Insert empty row when day changes
        const itemsPerCol = Math.ceil(rareHalos.length / 6);
        const maxRows = itemsPerCol;
        
        let lastDay = null;
        let itemIndex = 0;
        let displayedItems = [];
        
        // Build array with empty slots for day boundaries
        for (const halo of rareHalos) {
            if (lastDay !== null && halo.tt !== lastDay) {
                // Day changed - insert empty slot
                displayedItems.push(null);
            }
            displayedItems.push(halo);
            lastDay = halo.tt;
        }
        
        // Recalculate rows based on items + empty slots
        const totalItems = displayedItems.length;
        const itemsPerColumn = Math.ceil(totalItems / 6);
        
        for (let row = 0; row < itemsPerColumn; row++) {
            html += '    ║';
            for (let col = 0; col < 6; col++) {
                const idx = col * itemsPerColumn + row;
                if (idx < displayedItems.length && displayedItems[idx] !== null) {
                    const h = displayedItems[idx];
                    const ttStr = String(h.tt).padStart(2, ' ');
                    const eeStr = String(h.ee).padStart(2, '0');
                    html += ` ${ttStr} ${eeStr} ${h.kk}${h.gg} ║`;
                } else {
                    html += '            ║';
                }
            }
            html += '\n';
        }
        
        html += '    ╚════════════╩════════════╩════════════╩════════════╩════════════╩════════════╝\n\n';
        
        return html;
    }

    // Render activity table (real and relative) - split into two tables
    function renderActivityTable(activityReal, activityRelative, activityTotals, monthName, year) {
        let html = '';
        
        // Table header
        html += '╔' + '═'.repeat(86) + '╗\n';
        const headerText = `${i18nStrings.monthly_stats.activity_title} ${monthName} ${year}`;
        const headerPadding = Math.max(0, Math.floor((86 - headerText.length) / 2));
        html += '║' + ' '.repeat(headerPadding) + headerText + ' '.repeat(86 - headerPadding - headerText.length) + '║\n';
        html += '╠═════╦════════════════════════╦════════════════════════╦════════════════════════╦═════╣\n';
        
        // First table: Days 1-16
        html += '║ ' + i18nStrings.statistics.table_day.padEnd(3) + ' ║  1.   2.   3.   4.   5.║  6.   7.   8.   9.  10.║ 11.  12.  13.  14.  15.║ 16. ║\n';
        html += '╠═════╬════════════════════════╬════════════════════════╬════════════════════════╬═════╣\n';
        
        // Real activity row (days 1-16)
        html += '║ real║';
        for (let d = 1; d <= 16; d++) {
            const val = activityReal[d] || 0;
            const valStr = val.toFixed(1);
            html += valStr.padStart(4, ' ');
            if (d % 5 === 0) {
                html += '║';
            } else if (d === 16) {
                html += ' ║';
            } else {
                html += ' ';
            }
        }
        html += '\n';
        
        // Separator
        html += '╠═════╬════════════════════════╬════════════════════════╬════════════════════════╬═════╣\n';
        
        // Relative activity row (days 1-16)
        html += '║ rel.║';
        for (let d = 1; d <= 16; d++) {
            const val = activityRelative[d] || 0;
            const valStr = val.toFixed(1);
            html += valStr.padStart(4, ' ');
            if (d % 5 === 0) {
                html += '║';
            } else if (d === 16) {
                html += ' ║';
            } else {
                html += ' ';
            }
        }
        html += '\n';
        html += '╚═════╩════════════════════════╩════════════════════════╩════════════════════════╩═════╝\n';
        
        // Second table: Days 17-31 with total
        html += '╔═════╦═══════════════════╦════════════════════════╦════════════════════════╦════╦═════╗\n';
        html += '║ ' + i18nStrings.statistics.table_day.padEnd(3) + ' ║ 17.  18.  19.  20.║ 21.  22.  23.  24.  25.║ 26.  27.  28.  29.  30.║ 31.║ ges ║\n';
        html += '╠═════╬═══════════════════╬════════════════════════╬════════════════════════╬════╬═════╣\n';
        
        // Real activity row (days 17-31)
        html += '║ real║';
        for (let d = 17; d <= 31; d++) {
            const val = activityReal[d] || 0;
            const valStr = val.toFixed(1);
            html += valStr.padStart(4, ' ');
            if (d % 5 === 0) {
                html += '║';
            } else if (d === 31) {
                html += '║';
            } else {
                html += ' ';
            }
        }
        const totalRealStr = (activityTotals.real || 0).toFixed(1);
        html += totalRealStr.padStart(5, ' ') + '║\n';
        
        // Separator
        html += '╠═════╬═══════════════════╬════════════════════════╬════════════════════════╬════╬═════╣\n';
        
        // Relative activity row (days 17-31)
        html += '║ rel.║';
        for (let d = 17; d <= 31; d++) {
            const val = activityRelative[d] || 0;
            const valStr = val.toFixed(1);
            html += valStr.padStart(4, ' ');
            if (d % 5 === 0) {
                html += '║';
            } else if (d === 31) {
                html += '║';
            } else {
                html += ' ';
            }
        }
        const totalRelStr = (activityTotals.relative || 0).toFixed(1);
        html += totalRelStr.padStart(5, ' ') + '║\n';
        
        html += '╚═════╩═══════════════════╩════════════════════════╩════════════════════════╩════╩═════╝\n\n';
        
        return html;
    }

    // Event handlers
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            const m = bootstrap.Modal.getInstance(filterDialog);
            if (m) m.hide();
        });
    }
    
    if (btnApply) {
        btnApply.addEventListener('click', applyFilter);
    }
    
    // Setup action button handlers
    function setupActionButtons(resultsModalEl) {
        const btnStatsOk = document.getElementById('btn-stats-ok');
        const btnStatsPrint = document.getElementById('btn-stats-print');
        const btnStatsSave = document.getElementById('btn-stats-save');
        if (!resultsModalEl) resultsModalEl = document.getElementById('results-modal');
        
        // OK button - close modal (hidden.bs.modal handler navigates home)
        if (btnStatsOk) {
            btnStatsOk.onclick = () => {
                const modal = bootstrap.Modal.getInstance(resultsModalEl);
                if (modal) modal.hide();
            };
        }
        
        // Decision #033: setupModalKeyboard for Enter key → OK button
        setupModalKeyboard(resultsModalEl, btnStatsOk);

        // Stop ESC from propagating to page-level handler
        resultsModalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.stopPropagation();
        });

        // Navigate home when result modal is closed (ESC, OK, or X button)
        // Check e.target to avoid reacting to child modal (chart) close events bubbling up
        resultsModalEl.addEventListener('hidden.bs.modal', (e) => {
            if (e.target !== resultsModalEl) return;
            window.navigateInternal('/');
        });
        
        // Print button
        if (btnStatsPrint) {
            btnStatsPrint.onclick = () => {
                window.print();
            };
        }
        
        // Save button
        if (btnStatsSave) {
            btnStatsSave.onclick = async () => {
                if (!currentStatsData) return;
                
                const data = currentStatsData;
                const monthShort = i18nStrings.months_short[data.mm];
                const yearStr = String(data.jj);
                
                // Check output mode
                const modeResponse = await fetch('/api/config/setting?key=OUTPUT_MODE');
                const modeData = await modeResponse.json();
                const outputMode = modeData.value || 'P';
                
                let content, mimeType, filename;
                
                if (outputMode === 'H') {
                    // HTML-Tabellen mode: save as CSV with table data
                    filename = `${monthShort.toLowerCase()}${yearStr}.csv`;
                    content = generateStatsCSV(data);
                    mimeType = 'text/csv;charset=utf-8';
                } else if (outputMode === 'M') {
                    // Markdown mode: save as Markdown with pipe tables
                    filename = `${monthShort.toLowerCase()}${yearStr}.md`;
                    content = buildMarkdownMonthlyStats(data, i18nStrings.months[data.mm], data.jj, i18nStrings);
                    mimeType = 'text/markdown;charset=utf-8';
                } else {
                    // Pseudografik mode: save as TXT with formatted statistics
                    filename = `${monthShort.toLowerCase()}${yearStr}.txt`;
                    content = generateStatsText();
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
            };
        }
        
        // Chart button for line graph
        const btnStatsChartLine = document.getElementById('btn-stats-chart-line');
        if (btnStatsChartLine) {
            btnStatsChartLine.onclick = () => {
                if (!currentStatsData) return;
                showActivityChart(currentStatsData);
            };
        }
        
        // Chart button for bar graph
        const btnStatsChartBar = document.getElementById('btn-stats-chart-bar');
        if (btnStatsChartBar) {
            btnStatsChartBar.onclick = () => {
                if (!currentStatsData) return;
                showActivityBarChart(currentStatsData);
            };
        }
    }
    
    // Show activity chart - render with Chart.js for interactive display
    function showActivityChart(data) {
        const months = i18nStrings.months || {};
        const monthName = months[data.mm];
        const year = String(data.jj);
        
        // Set chart title - LINE CHART
        const chartPrintableTitle = document.getElementById('chart-printable-title-line');
        if (chartPrintableTitle) {
            chartPrintableTitle.textContent = i18nStrings.monthly_stats.chart_title
                .replace('{month}', monthName)
                .replace('{year}', year);
        }
        
        // Set chart subtitle - LINE CHART
        const chartSubtitle = document.getElementById('chart-subtitle-line');
        if (chartSubtitle) {
            const observationCount = data.activity_observation_count || 0;
            chartSubtitle.textContent = i18nStrings.monthly_stats.chart_subtitle.replace('{count}', observationCount);
        }
        
        // Prepare chart data - days 1-31
        const days = Array.from({length: 31}, (_, i) => i + 1);
        const realData = days.map(d => data.activity_real[d] || 0);
        const relativeData = days.map(d => data.activity_relative[d] || 0);
        
        // Create chart - LINE CHART
        const canvas = document.getElementById('activity-chart-line');
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if it exists
        if (window.activityChart) {
            window.activityChart.destroy();
        }
        
        window.activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: days,
                datasets: [
                    {
                        label: i18nStrings.monthly_stats.activity_real,
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
                        label: i18nStrings.monthly_stats.activity_relative,
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
                            text: i18nStrings.monthly_stats.x_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        ticks: {
                            stepSize: 1
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: i18nStrings.monthly_stats.y_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
        
        // Show chart modal - LINE CHART VERSION
        const chartModalElement = document.getElementById('chart-modal-line');
        chartModalElement.setAttribute('tabindex', '-1');
        chartModalElement.addEventListener('shown.bs.modal', () => {
            chartModalElement.focus({ preventScroll: true });
        }, { once: true });
        const chartModal = new bootstrap.Modal(chartModalElement, { backdrop: 'static' });
        
        // Store data for print/save buttons
        window.chartData = data;
        
        // Decision #033: setupModalKeyboard for Enter key → OK button (data-bs-dismiss)
        const okBtnLine = document.getElementById('btn-chart-close-line');
        setupModalKeyboard(chartModalElement, okBtnLine);

        // Prevent ESC key from closing parent modal
        chartModalElement.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.stopPropagation();
        });
        
        chartModal.show();
    }
    
    function showActivityBarChart(data) {
        const monthName = i18nStrings.months[data.mm];
        const year = String(data.jj);
        
        // Set chart title - BAR CHART
        const chartPrintableTitle = document.getElementById('chart-printable-title-bar');
        if (chartPrintableTitle) {
            chartPrintableTitle.textContent = i18nStrings.monthly_stats.chart_title
                .replace('{month}', monthName)
                .replace('{year}', year);
        }
        
        // Set chart subtitle - BAR CHART
        const chartSubtitle = document.getElementById('chart-subtitle-bar');
        if (chartSubtitle) {
            const observationCount = data.activity_observation_count || 0;
            chartSubtitle.textContent = i18nStrings.monthly_stats.chart_subtitle.replace('{count}', observationCount);
        }
        
        // Prepare chart data - days 1-31
        const days = Array.from({length: 31}, (_, i) => i + 1);
        const realData = days.map(d => data.activity_real[d] || 0);
        const relativeData = days.map(d => data.activity_relative[d] || 0);
        
        // Create chart - BAR CHART
        const canvas = document.getElementById('activity-chart-bar');
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if it exists
        if (window.activityChart) {
            window.activityChart.destroy();
        }
        
        window.activityChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: days,
                datasets: [
                    {
                        label: i18nStrings.monthly_stats.activity_real,
                        data: realData,
                        backgroundColor: '#dc3545',  // Red
                        borderColor: '#dc3545',
                        borderWidth: 1,
                        barPercentage: 0.8,
                        categoryPercentage: 0.9
                    },
                    {
                        label: i18nStrings.monthly_stats.activity_relative,
                        data: relativeData,
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
                            text: i18nStrings.monthly_stats.x_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        ticks: {
                            stepSize: 1
                        },
                        stacked: false
                    },
                    y: {
                        title: {
                            display: true,
                            text: i18nStrings.monthly_stats.y_axis,
                            font: { size: 12, weight: 'bold' }
                        },
                        beginAtZero: true,
                        stacked: false
                    }
                }
            }
        });
        
        // Show chart modal - BAR CHART VERSION
        const chartModalElement = document.getElementById('chart-modal-bar');
        chartModalElement.setAttribute('tabindex', '-1');
        chartModalElement.addEventListener('shown.bs.modal', () => {
            chartModalElement.focus({ preventScroll: true });
        }, { once: true });
        const chartModal = new bootstrap.Modal(chartModalElement, { backdrop: 'static' });
        
        // Store data for print/save buttons
        window.chartData = data;
        
        // Decision #033: setupModalKeyboard for Enter key → OK button (data-bs-dismiss)
        const okBtnBar = document.getElementById('btn-chart-close-bar');
        setupModalKeyboard(chartModalElement, okBtnBar);

        // Prevent ESC key from closing parent modal
        chartModalElement.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.stopPropagation();
        });
        
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
                    const response = await fetch(`/api/monthly-stats?mm=${window.chartData.mm}&jj=${window.chartData.jj}&format=linegraph`);
                    const blob = await response.blob();
                    
                    const printWindow = window.open();
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    printWindow.document.write('<html><head><title>Haloaktivität</title></head><body>');
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
                    const data = window.chartData;
                    const monthShort = i18nStrings.months_short[data.mm];
                    const filename = `Haloaktivitaet_${monthShort.toLowerCase()}${data.jj}.png`;
                    
                    const response = await fetch(`/api/monthly-stats?mm=${data.mm}&jj=${data.jj}&format=linegraph`);
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
                    const response = await fetch(`/api/monthly-stats?mm=${window.chartData.mm}&jj=${window.chartData.jj}&format=bargraph`);
                    const blob = await response.blob();
                    
                    const printWindow = window.open();
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    printWindow.document.write('<html><head><title>Haloaktivität</title></head><body>');
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
                    const data = window.chartData;
                    const monthShort = i18nStrings.months_short[data.mm];
                    const filename = `Haloaktivitaet_${monthShort.toLowerCase()}${data.jj}_Balken.png`;
                    
                    const response = await fetch(`/api/monthly-stats?mm=${data.mm}&jj=${data.jj}&format=bargraph`);
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
    
    // Generate plain text statistics content for save and print
    function generateStatsText() {
        if (!currentStatsData) return '';
        
        const data = currentStatsData;
        const monthName = i18nStrings.months[data.mm];
        const year = String(data.jj);
        
        let text = '';
        
        // Title (centered)
        const titleLine = `${i18nStrings.monthly_stats.title} ${monthName} ${year}`;
        const titlePadding = Math.max(0, Math.floor((86 - titleLine.length) / 2));
        text += ' '.repeat(titlePadding) + titleLine + '\n';
        text += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n\n';
        
        // Table 1: Observer Overview (reuse rendering function)
        if (data.observer_overview && data.observer_overview.length > 0) {
            text += renderObserverOverview(data.observer_overview, monthName, year);
        }

        // Observer Directory (after table 1, before table 2)
        if (data.observer_names && data.observer_names.length > 0) {
            text += window.renderObserverListPseudo(data.observer_names, i18nStrings);
        }

        // Table 2: EE Overview (reuse rendering function)
        if (data.ee_overview && data.ee_overview.length > 0) {
            text += renderEEOverview(data.ee_overview, data.daily_totals || {}, data.grand_total || 0, monthName, year);
        }
        
        // Table 3: Rare Halos (reuse rendering function)
        if (data.rare_halos && data.rare_halos.length > 0) {
            text += renderRareHalos(data.rare_halos, monthName, year);
        }
        
        // Table 4: Activity (reuse rendering function)
        if (data.activity_real && data.activity_relative && data.activity_totals) {
            text += renderActivityTable(data.activity_real, data.activity_relative, data.activity_totals, monthName, year);
        }
        
        return text;
    }

    // Save bar chart as PNG
    function saveBarChart() {
        if (!currentStatsData) return;
        
        const data = currentStatsData;
        const monthShort = i18nStrings.months_short[data.mm];
        const filename = `Haloaktivitaet_Balken_${monthShort.toLowerCase()}${data.jj}.png`;
        
        // Fetch server-generated bar graph
        fetch(`/api/monthly-stats?mm=${data.mm}&jj=${data.jj}&format=bargraph`)
            .then(response => response.blob())
            .then(blob => {
                // Download the PNG file
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            })
            .catch(error => {
                console.error('Error saving bar chart:', error);
                showErrorDialog(i18nStrings.messages.chart_save_failed);
            });
    }

    // Save chart as PNG
    function saveChart() {
        if (!currentStatsData) return;
        
        const data = currentStatsData;
        const monthShort = i18nStrings.months_short[data.mm];
        const filename = `Haloaktivitaet_${monthShort.toLowerCase()}${data.jj}.png`;
        
        // Fetch server-generated line graph
        fetch(`/api/monthly-stats?mm=${data.mm}&jj=${data.jj}&format=linegraph`)
            .then(response => response.blob())
            .then(blob => {
                // Download the PNG file
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            })
            .catch(error => {
                console.error('Error saving chart:', error);
                showErrorDialog(i18nStrings.messages.chart_save_failed);
            });
    }

    // Generate CSV from statistics data
    function generateStatsCSV(data) {
        let csv = '';
        const months = i18nStrings.months || {};
        const monthName = months[data.mm];
        const year = String(data.jj);
        
        // Table 1: Observer Overview
        if (data.observer_overview && data.observer_overview.length > 0) {
            csv += `"${i18nStrings.monthly_stats.observer_overview} ${monthName} ${year}"\n`;
            csv += 'KKGG';
            for (let d = 1; d <= 31; d++) {
                csv += ',' + d;
            }
            csv += ',' + i18nStrings.statistics.table_ee_sun + ',' + i18nStrings.statistics.table_days_sun + ',' + i18nStrings.statistics.table_days_moon + ',' + i18nStrings.statistics.table_days_total + '\n';
            
            for (const obs of data.observer_overview) {
                const kk = obs.kk.toString().padStart(2, '0');
                const gg = obs.region === 39 ? '//' : obs.region.toString().padStart(2, '0');
                csv += kk + gg;
                
                for (let day = 1; day <= 31; day++) {
                    const dayData = obs.days[day];
                    let cellValue = '';
                    if (dayData) {
                        const solar = dayData.solar || 0;
                        const lunar = dayData.lunar || false;
                        if (solar > 0 && lunar) cellValue = '_' + solar;
                        else if (solar > 0) cellValue = solar;
                        else if (lunar) cellValue = 'X';
                    }
                    csv += ',' + cellValue;
                }
                
                csv += ',' + obs.total_solar + ',' + obs.days_solar + ',' + obs.days_lunar + ',' + obs.total_days + '\n';
            }
            csv += '\n';
        }
        
        // Table 2: EE Overview
        if (data.ee_overview && data.ee_overview.length > 0) {
            csv += `"${i18nStrings.monthly_stats.ee_overview} ${monthName} ${year}"\n`;
            csv += 'EE';
            for (let d = 1; d <= 31; d++) {
                csv += ',' + d;
            }
            csv += ',gesamt\n';
            
            for (const eeRow of data.ee_overview) {
                csv += (eeRow.ee_label || eeRow.ee.toString().padStart(2, '0'));
                
                for (let day = 1; day <= 31; day++) {
                    const count = eeRow.days[day] || 0;
                    csv += ',' + (count > 0 ? count : '');
                }
                
                csv += ',' + eeRow.total + '\n';
            }
            
            // Daily totals
            csv += 'Summe';
            for (let day = 1; day <= 31; day++) {
                const count = (data.daily_totals && data.daily_totals[day]) || 0;
                csv += ',' + (count > 0 ? count : '');
            }
            csv += ',' + (data.grand_total || 0) + '\n';
            csv += '\n';
        }
        
        // Table 3: Rare Halos
        if (data.rare_halos && data.rare_halos.length > 0) {
            csv += `"${i18nStrings.monthly_stats.rare_halos}"\n`;
            csv += 'TT,EE,KK,GG\n';
            for (const halo of data.rare_halos) {
                const tt = halo.tt;
                const ee = halo.ee.toString().padStart(2, '0');
                const kk = halo.kk.toString().padStart(2, '0');
                const gg = halo.gg === 39 ? '//' : halo.gg.toString().padStart(2, '0');
                csv += tt + ',' + ee + ',' + kk + ',' + gg + '\n';
            }
            csv += '\n';
        }
        
        // Table 4: Activity
        if (data.activity_real && data.activity_relative && data.activity_totals) {
            csv += `"${i18nStrings.monthly_stats.activity_title} ${monthName} ${year}"\n`;
            csv += i18nStrings.statistics.table_day;
            for (let d = 1; d <= 31; d++) {
                csv += ',' + d;
            }
            csv += ',gesamt\n';
            
            // Real activity
            csv += 'real';
            for (let d = 1; d <= 31; d++) {
                const val = data.activity_real[d] || 0;
                csv += ',' + val.toFixed(1);
            }
            csv += ',' + (data.activity_totals.real || 0).toFixed(1) + '\n';
            
            // Relative activity
            csv += 'rel.';
            for (let d = 1; d <= 31; d++) {
                const val = data.activity_relative[d] || 0;
                csv += ',' + val.toFixed(1);
            }
            csv += ',' + (data.activity_totals.relative || 0).toFixed(1) + '\n';
        }
        
        return csv;
    }

    // Initialize
    async function initialize() {
        // Populate year dropdown
        populateYears();
        
        // Check data and load date default in parallel
        const [dataLoaded] = await Promise.all([checkDataLoaded(), loadDateDefault()]);
        
        if (dataLoaded) {
            
            // Show filter dialog automatically with explicit backdrop configuration
            const modal = new bootstrap.Modal(filterDialog, {
                backdrop: 'static'
            });
            modal.show();
            
            // Decision #033: setupModalKeyboard for Enter key → Apply button
            setupModalKeyboard(filterDialog, btnApply);

            // Navigate home when filter dialog is dismissed (X, Cancel, ESC)
            // but not when filter was applied successfully
            filterDialog.addEventListener('hidden.bs.modal', () => {
                if (!filterApplied) {
                    window.navigateInternal('/');
                }
            }, { once: true });

            // Decision #034: OK disabled until month and year selected
            function updateApplyState() {
                btnApply.disabled = !monthSelect.value || !yearSelect.value;
            }
            monthSelect.addEventListener('change', updateApplyState);
            yearSelect.addEventListener('change', updateApplyState);
            updateApplyState();

            // Focus month select when modal is shown
            filterDialog.addEventListener('shown.bs.modal', () => {
                if (monthSelect) {
                    monthSelect.focus();
                }
            });
        }
    }

    // Setup event listeners for action buttons (OK, Print, Save)
    setupActionButtons();

    // Build Pseudografik format statistics (original implementation)
    function buildPseudografikMonthlyStats(data, monthName, year, i18nStrings) {
        let html = '<div class="statistics-report" style="font-family: monospace; white-space: pre; font-size: 11px; color: #000000; line-height: 1;">';
        
        // Title (centered)
        const titleLine = `${i18nStrings.monthly_stats.title} ${monthName} ${year}`;
        const titlePadding = Math.max(0, Math.floor((86 - titleLine.length) / 2));
        html += ' '.repeat(titlePadding) + titleLine + '\n';
        html += ' '.repeat(titlePadding) + '═'.repeat(titleLine.length) + '\n\n';
        
        // Table 1: Observer Overview (Beobachterübersicht)
        if (data.observer_overview && data.observer_overview.length > 0) {
            html += renderObserverOverview(data.observer_overview, monthName, year);
        }
        
        // Table 2: EE Overview (Ergebnisübersicht Sonnenhalos)
        if (data.ee_overview && data.ee_overview.length > 0) {
            html += renderEEOverview(data.ee_overview, data.daily_totals || {}, data.grand_total || 0, monthName, year);
        }
        
        // Table 3: Rare Halos (Erscheinungen über EE 12)
        if (data.rare_halos && data.rare_halos.length > 0) {
            html += renderRareHalos(data.rare_halos, monthName, year);
        }
        
        // Table 4: Activity (Haloaktivität)
        if (data.activity_real && data.activity_relative && data.activity_totals) {
            html += renderActivityTable(data.activity_real, data.activity_relative, data.activity_totals, monthName, year);
        }
        
        html += '</div>';
        return html;
    }

    // Build Markdown format statistics
    function buildMarkdownMonthlyStats(data, monthName, year, i18nStrings) {
        let md = `# ${i18nStrings.monthly_stats.title} ${monthName} ${year}\n\n`;
        
        // Table 1: Observer Overview
        if (data.observer_overview && data.observer_overview.length > 0) {
            md += `## ${i18nStrings.monthly_stats.observer_overview} ${monthName} ${year}\n\n`;
            md += '| KKGG |';
            for (let d = 1; d <= 31; d++) md += ' ' + d + ' |';
            md += ' 1) | 2) | 3) | 4) |\n';
            md += '|:---:|';
            for (let d = 1; d <= 31; d++) md += ':---:|';
            md += ':---:|---:|---:|---:|\n';
            
            for (const obs of data.observer_overview) {
                const kk = obs.kk.toString().padStart(2, '0');
                const gg = obs.region === 39 ? '//' : obs.region.toString().padStart(2, '0');
                md += '| ' + kk + gg + ' |';
                
                for (let day = 1; day <= 31; day++) {
                    const dayData = obs.days[day];
                    let cellValue = '';
                    if (dayData) {
                        const solar = dayData.solar || 0;
                        const lunar = dayData.lunar || false;
                            if (solar > 0 && lunar) cellValue = '_' + solar.toString();
                            else if (solar > 0) cellValue = solar.toString();
                            else if (lunar) cellValue = 'X';
                    }
                    md += ' ' + cellValue + ' |';
                }
                
                md += ' ' + obs.total_solar + ' | ' + obs.days_solar + ' | ' + obs.days_lunar + ' | ' + obs.total_days + ' |\n';
            }
            md += '\n_' + i18nStrings.statistics.footnote_ee_days + '_\n\n';
        }

        // Observer Directory (after table 1, before table 2)
        if (data.observer_names && data.observer_names.length > 0) {
            md += window.renderObserverListMarkdown(data.observer_names, i18nStrings);
        }

        // Table 2: EE Overview
        if (data.ee_overview && data.ee_overview.length > 0) {
            md += `## ${i18nStrings.monthly_stats.ee_overview} ${monthName} ${year}\n\n`;
            md += '| EE |';
            for (let d = 1; d <= 31; d++) md += ' ' + d + ' |';
            md += ' Total |\n';
            md += '|---:|';
            for (let d = 1; d <= 31; d++) md += '---:|';
            md += '---:|\n';
            
            for (const eeRow of data.ee_overview) {
                md += '| ' + (eeRow.ee_label || eeRow.ee.toString().padStart(2, '0')) + ' |';
                for (let day = 1; day <= 31; day++) {
                    const count = eeRow.days[day] || 0;
                    md += ' ' + (count > 0 ? count : '') + ' |';
                }
                md += ' **' + eeRow.total + '** |\n';
            }
            
            // Daily totals row
            md += '| **Σ** |';
            for (let day = 1; day <= 31; day++) {
                const count = (data.daily_totals && data.daily_totals[day]) || 0;
                md += ' ' + (count > 0 ? count : '') + ' |';
            }
            md += ' **' + (data.grand_total || 0) + '** |\n\n';
        }
        
        // Table 3: Rare Halos
        if (data.rare_halos && data.rare_halos.length > 0) {
            md += `## ${i18nStrings.monthly_stats.rare_halos}\n\n`;
            md += '| TT EE KKGG | TT EE KKGG | TT EE KKGG | TT EE KKGG | TT EE KKGG | TT EE KKGG |\n';
            md += '|:---:|:---:|:---:|:---:|:---:|:---:|\n';
            
            // Layout same as HTML: 6 columns
            const itemsPerCol = Math.ceil(data.rare_halos.length / 6);
            
            for (let row = 0; row < itemsPerCol; row++) {
                md += '|';
                for (let col = 0; col < 6; col++) {
                    const idx = col * itemsPerCol + row;
                    if (idx < data.rare_halos.length) {
                        const h = data.rare_halos[idx];
                        const ttStr = (h.tt || 0).toString().padStart(2, ' ');
                        const eeStr = (h.ee || 0).toString().padStart(2, '0');
                        const kkStr = (h.kk || 0).toString().padStart(2, '0');
                        const ggStr = (h.region === 39 || h.region === undefined) ? '//' : h.region.toString().padStart(2, '0');
                        md += ' ' + ttStr + ' ' + eeStr + ' ' + kkStr + ggStr + ' |';
                    } else {
                        md += ' |';
                    }
                }
                md += '\n';
            }
            md += '\n';
        }
        
        // Table 4: Activity
        if (data.activity_real && data.activity_relative && data.activity_totals) {
            md += `## ${i18nStrings.monthly_stats.activity_title} ${monthName} ${year}\n\n`;
            
            // Table with days as columns
            md += '| |';
            for (let day = 1; day <= 31; day++) {
                const real = data.activity_real[day] || 0;
                const relative = data.activity_relative[day] || 0;
                // Only include days that have any activity
                if (real > 0 || relative > 0) {
                    md += ' ' + day + ' |';
                }
            }
            md += '\n|---:|';
            for (let day = 1; day <= 31; day++) {
                const real = data.activity_real[day] || 0;
                const relative = data.activity_relative[day] || 0;
                if (real > 0 || relative > 0) {
                    md += '---:|';
                }
            }
            md += '\n';
            
            // Real row
            md += '| ' + i18nStrings.monthly_stats.activity_real + ' |';
            for (let day = 1; day <= 31; day++) {
                const real = data.activity_real[day] || 0;
                const relative = data.activity_relative[day] || 0;
                if (real > 0 || relative > 0) {
                    md += ' ' + real.toFixed(1) + ' |';
                }
            }
            md += '\n';
            
            // Relative row
            md += '| ' + i18nStrings.monthly_stats.activity_relative + ' |';
            for (let day = 1; day <= 31; day++) {
                const real = data.activity_real[day] || 0;
                const relative = data.activity_relative[day] || 0;
                if (real > 0 || relative > 0) {
                    md += ' ' + relative.toFixed(1) + ' |';
                }
            }
            md += '\n\n';
        }
        
        return md;
    }

    // Build HTML-Tabellen format statistics
    function buildHTMLTableMonthlyStats(data, monthName, year, i18nStrings) {
        let html = '<div style="padding: 20px;">';
        
        // Title
        const titleLine = `${i18nStrings.monthly_stats.title} ${monthName} ${year}`;
        html += `<h3 style="text-align: center; font-family: Arial, sans-serif; margin-bottom: 30px;">${titleLine}</h3>`;
        
        // Table 1: Observer Overview (Beobachterübersicht)
        if (data.observer_overview && data.observer_overview.length > 0) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th colspan="36" style="text-align: center;">' + 
                    i18nStrings.monthly_stats.observer_overview + ' ' + monthName + ' ' + year + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th>KKGG</th>';
            for (let d = 1; d <= 31; d++) {
                html += '<th>' + d + '</th>';
            }
            html += '<th>1)</th><th>2)</th><th>3)</th><th>4)</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            for (const obs of data.observer_overview) {
                const kk = obs.kk.toString().padStart(2, '0');
                const gg = obs.region === 39 ? '//' : obs.region.toString().padStart(2, '0');
                
                html += '<tr>';
                html += '<td style="font-weight: bold;">' + kk + gg + '</td>';
                
                for (let day = 1; day <= 31; day++) {
                    const dayData = obs.days[day];
                    let cellValue = '';
                    if (dayData) {
                        const solar = dayData.solar || 0;
                        const lunar = dayData.lunar || false;
                        if (solar > 0 && lunar) cellValue = '<u>' + solar + '</u>';
                        else if (solar > 0) cellValue = solar;
                        else if (lunar) cellValue = '<u>X</u>';
                    }
                    html += '<td style="text-align: center;">' + cellValue + '</td>';
                }
                
                html += '<td style="text-align: right;">' + obs.total_solar + '</td>';
                html += '<td style="text-align: right;">' + obs.days_solar + '</td>';
                html += '<td style="text-align: right;">' + obs.days_lunar + '</td>';
                html += '<td style="text-align: right;">' + obs.total_days + '</td>';
                html += '</tr>';
            }
            
            html += '</tbody>';
            html += '<tfoot>';
            html += '<tr><td colspan="36" style="text-align: left; font-size: 90%;">';
            html += i18nStrings.statistics.footnote_ee_days;
            html += '</td></tr>';
            html += '</tfoot>';
            html += '</table>';
        }

        // Observer Directory (after table 1, before table 2)
        if (data.observer_names && data.observer_names.length > 0) {
            html += window.renderObserverListHTML(data.observer_names, i18nStrings);
        }

        // Table 2: EE Overview (Ergebnisübersicht Sonnenhalos)
        if (data.ee_overview && data.ee_overview.length > 0) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th colspan="33" style="text-align: center;">' + 
                    i18nStrings.monthly_stats.ee_overview + ' ' + monthName + ' ' + year + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th>EE</th>';
            for (let d = 1; d <= 31; d++) {
                html += '<th>' + d + '</th>';
            }
            html += '<th>ges</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            for (const eeRow of data.ee_overview) {
                html += '<tr>';
                html += '<td style="font-weight: bold;">' + (eeRow.ee_label || eeRow.ee.toString().padStart(2, '0')) + '</td>';
                
                for (let day = 1; day <= 31; day++) {
                    const count = eeRow.days[day] || 0;
                    html += '<td style="text-align: center;">' + (count > 0 ? count : '') + '</td>';
                }
                
                html += '<td style="text-align: right; font-weight: bold;">' + eeRow.total + '</td>';
                html += '</tr>';
            }
            
            // Daily totals row
            html += '<tr style="font-weight: bold; border-top: 2px solid #000;">';
            html += '<td>Σ</td>';
            for (let day = 1; day <= 31; day++) {
                const count = (data.daily_totals && data.daily_totals[day]) || 0;
                html += '<td style="text-align: center;">' + (count > 0 ? count : '') + '</td>';
            }
            html += '<td style="text-align: right;">' + (data.grand_total || 0) + '</td>';
            html += '</tr>';
            
            html += '</tbody>';
            html += '</table>';
        }
        
        // Table 3: Rare Halos (Erscheinungen über EE 12)
        if (data.rare_halos && data.rare_halos.length > 0) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th colspan="6" style="text-align: center;">' + 
                    i18nStrings.monthly_stats.rare_halos + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th style="text-align: center;">TT EE KKGG</th>';
            html += '<th style="text-align: center;">TT EE KKGG</th>';
            html += '<th style="text-align: center;">TT EE KKGG</th>';
            html += '<th style="text-align: center;">TT EE KKGG</th>';
            html += '<th style="text-align: center;">TT EE KKGG</th>';
            html += '<th style="text-align: center;">TT EE KKGG</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            // Distribute halos across 6 columns
            const itemsPerColumn = Math.ceil(data.rare_halos.length / 6);
            
            for (let row = 0; row < itemsPerColumn; row++) {
                html += '<tr>';
                for (let col = 0; col < 6; col++) {
                    const idx = col * itemsPerColumn + row;
                    if (idx < data.rare_halos.length) {
                        const h = data.rare_halos[idx];
                        const ttStr = String(h.tt).padStart(2, ' ');
                        const eeStr = String(h.ee).padStart(2, '0');
                        const kkStr = String(h.kk).padStart(2, '0');
                        const ggStr = h.gg === 39 ? '//' : String(h.gg).padStart(2, '0');
                        html += '<td style="text-align: center; font-family: monospace;">' + 
                                ttStr + ' ' + eeStr + ' ' + kkStr + ggStr + '</td>';
                    } else {
                        html += '<td></td>';
                    }
                }
                html += '</tr>';
            }
            
            html += '</tbody>';
            html += '</table>';
        } else {
            // No rare halos message
            html += '<div style="padding: 20px; text-align: center; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; margin-bottom: 30px;">';
            const noneText = (i18nStrings.monthly_stats.rare_halos_none || '').replace('{month}', monthName);
            html += '<p style="margin: 0;">' + noneText + '</p>';
            html += '</div>';
        }
        
        // Table 4: Activity (Haloaktivität) - all 31 days in one table
        if (data.activity_real && data.activity_relative && data.activity_totals) {
            html += '<table class="table table-bordered analysis-table" style="margin-bottom: 30px;">';
            html += '<thead>';
            html += '<tr>';
            html += '<th colspan="33" style="text-align: center;">' + 
                    i18nStrings.monthly_stats.activity_title + ' ' + monthName + ' ' + year + '</th>';
            html += '</tr>';
            html += '<tr>';
            html += '<th>' + i18nStrings.statistics.table_day + '</th>';
            for (let d = 1; d <= 31; d++) {
                html += '<th>' + d + '</th>';
            }
            html += '<th>ges</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            // Real activity row
            html += '<tr>';
            html += '<td style="font-weight: bold;">real</td>';
            for (let d = 1; d <= 31; d++) {
                const val = data.activity_real[d] || 0;
                html += '<td style="text-align: center;">' + val.toFixed(1) + '</td>';
            }
            html += '<td style="text-align: right; font-weight: bold;">' + 
                    (data.activity_totals.real || 0).toFixed(1) + '</td>';
            html += '</tr>';
            
            // Relative activity row
            html += '<tr>';
            html += '<td style="font-weight: bold;">rel.</td>';
            for (let d = 1; d <= 31; d++) {
                const val = data.activity_relative[d] || 0;
                html += '<td style="text-align: center;">' + val.toFixed(1) + '</td>';
            }
            html += '<td style="text-align: right; font-weight: bold;">' + 
                    (data.activity_totals.relative || 0).toFixed(1) + '</td>';
            html += '</tr>';
            
            html += '</tbody>';
            html += '</table>';
        }
        
        html += '</div>';
        return html;
    }

    initialize();
});
