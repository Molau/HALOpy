// Analysis (Auswertung) functionality

document.addEventListener('DOMContentLoaded', async function() {
    // Wait for i18nStrings to be loaded (from main.js)
    await window.waitForI18n();

    let observers = [];

    // Timezone array from H_TYPES.PAS - timezone offsets by region (1-38)
    const Zeitzone = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        2, 10, 0, 0, 1, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0,
        1, -1, 0, -8, 9
    ];

    // Modal elements
    const paramDialog = document.getElementById('param-dialog');

    // Parameter dialog elements
    const param1Select = document.getElementById('param1-select');
    const param2Select = document.getElementById('param2-select');
    const filter1Select = document.getElementById('filter1-select');
    const filter2Select = document.getElementById('filter2-select');
    const btnCancelParam = document.getElementById('btn-cancel-param');
    const btnApplyParam = document.getElementById('btn-apply-param');

    // Range elements for first parameter
    const param1RangeDiv = document.getElementById('param1-range');
    const param1FromSelect = document.getElementById('param1-from');
    const param1ToSelect = document.getElementById('param1-to');

    // Special day parameter elements
    const param1DayFieldsDiv = document.getElementById('param1-day-fields');
    const param1MonthSelect = document.getElementById('param1-month');
    const param1YearSelect = document.getElementById('param1-year');
    const param1DayFromSelect = document.getElementById('param1-day-from');
    const param1DayToSelect = document.getElementById('param1-day-to');

    // Special time parameter elements
    const param1TimeFieldsDiv = document.getElementById('param1-time-fields');
    const param1TimezoneRadios = document.querySelectorAll('input[name="param1-timezone"]');

    // Special solar altitude parameter elements
    const param1ShFieldsDiv = document.getElementById('param1-sh-fields');
    const param1ShTimeRadios = document.querySelectorAll('input[name="param1-sh-time"]');
    const param1ShFromSelect = document.getElementById('param1-sh-from');
    const param1ShToSelect = document.getElementById('param1-sh-to');

    // Special halo type parameter elements
    const param1EeFieldsDiv = document.getElementById('param1-ee-fields');
    const param1EeSplitRadios = document.querySelectorAll('input[name="param1-ee-split"]');
    const param1EeFromSelect = document.getElementById('param1-ee-from');
    const param1EeToSelect = document.getElementById('param1-ee-to');

    // Special cirrus type parameter elements
    const param1CFieldsDiv = document.getElementById('param1-c-fields');
    const param1CSplitRadios = document.querySelectorAll('input[name="param1-c-split"]');
    const param1CFromSelect = document.getElementById('param1-c-from');
    const param1CToSelect = document.getElementById('param1-c-to');

    // Special duration parameter elements
    const param1DdFieldsDiv = document.getElementById('param1-dd-fields');
    const param1DdIncompleteRadios = document.querySelectorAll('input[name="param1-dd-incomplete"]');
    const param1DdFromSelect = document.getElementById('param1-dd-from');
    const param1DdToSelect = document.getElementById('param1-dd-to');

    // Range elements for second parameter
    const param2RangeDiv = document.getElementById('param2-range');
    const param2FromSelect = document.getElementById('param2-from');
    const param2ToSelect = document.getElementById('param2-to');
    const percentageModeFields = document.getElementById('percentage-mode-fields');

    // Special day parameter elements for param2
    const param2DayFieldsDiv = document.getElementById('param2-day-fields');
    const param2MonthSelect = document.getElementById('param2-month');
    const param2YearSelect = document.getElementById('param2-year');
    const param2DayFromSelect = document.getElementById('param2-day-from');
    const param2DayToSelect = document.getElementById('param2-day-to');

    // Special time parameter elements for param2
    const param2TimeFieldsDiv = document.getElementById('param2-time-fields');
    const param2TimezoneRadios = document.querySelectorAll('input[name="param2-timezone"]');

    // Special solar altitude parameter elements for param2
    const param2ShFieldsDiv = document.getElementById('param2-sh-fields');
    const param2ShTimeRadios = document.querySelectorAll('input[name="param2-sh-time"]');
    const param2ShFromSelect = document.getElementById('param2-sh-from');
    const param2ShToSelect = document.getElementById('param2-sh-to');

    // Special halo type parameter elements for param2
    const param2EeFieldsDiv = document.getElementById('param2-ee-fields');
    const param2EeSplitRadios = document.querySelectorAll('input[name="param2-ee-split"]');
    const param2EeFromSelect = document.getElementById('param2-ee-from');
    const param2EeToSelect = document.getElementById('param2-ee-to');

    // Special cirrus type parameter elements for param2
    const param2CFieldsDiv = document.getElementById('param2-c-fields');
    const param2CSplitRadios = document.querySelectorAll('input[name="param2-c-split"]');
    const param2CFromSelect = document.getElementById('param2-c-from');
    const param2CToSelect = document.getElementById('param2-c-to');

    // Special duration parameter elements for param2
    const param2DdFieldsDiv = document.getElementById('param2-dd-fields');
    const param2DdIncompleteRadios = document.querySelectorAll('input[name="param2-dd-incomplete"]');
    const param2DdFromSelect = document.getElementById('param2-dd-from');
    const param2DdToSelect = document.getElementById('param2-dd-to');

    // Filter1 elements (filter1Select already declared above)
    const filter1ValueDiv = document.getElementById('filter1-value');
    const filter1ValueSelect = document.getElementById('filter1-value-select');
    const filter1DayFieldsDiv = document.getElementById('filter1-day-fields');
    const filter1MonthSelect = document.getElementById('filter1-month-select');
    const filter1YearSelect = document.getElementById('filter1-year-select');
    const filter1TimeFieldsDiv = document.getElementById('filter1-time-fields');
    const filter1TimezoneRadios = document.querySelectorAll('input[name="filter1-timezone"]');
    const filter1ShFieldsDiv = document.getElementById('filter1-sh-fields');
    const filter1ShTimeRadios = document.querySelectorAll('input[name="filter1-sh-time"]');
    const filter1EeFieldsDiv = document.getElementById('filter1-ee-fields');
    const filter1EeSplitRadios = document.querySelectorAll('input[name="filter1-ee-split"]');
    const filter1CFieldsDiv = document.getElementById('filter1-c-fields');
    const filter1CSplitRadios = document.querySelectorAll('input[name="filter1-c-split"]');
    const filter1DdFieldsDiv = document.getElementById('filter1-dd-fields');
    const filter1DdIncompleteRadios = document.querySelectorAll('input[name="filter1-dd-incomplete"]');

    // Filter2 elements (filter2Select already declared above)
    const filter2ValueDiv = document.getElementById('filter2-value');
    const filter2ValueSelect = document.getElementById('filter2-value-select');
    const filter2DayFieldsDiv = document.getElementById('filter2-day-fields');
    const filter2MonthSelect = document.getElementById('filter2-month-select');
    const filter2YearSelect = document.getElementById('filter2-year-select');
    const filter2TimeFieldsDiv = document.getElementById('filter2-time-fields');
    const filter2TimezoneRadios = document.querySelectorAll('input[name="filter2-timezone"]');
    const filter2ShFieldsDiv = document.getElementById('filter2-sh-fields');
    const filter2ShTimeRadios = document.querySelectorAll('input[name="filter2-sh-time"]');
    const filter2EeFieldsDiv = document.getElementById('filter2-ee-fields');
    const filter2EeSplitRadios = document.querySelectorAll('input[name="filter2-ee-split"]');
    const filter2CFieldsDiv = document.getElementById('filter2-c-fields');
    const filter2CSplitRadios = document.querySelectorAll('input[name="filter2-c-split"]');
    const filter2DdFieldsDiv = document.getElementById('filter2-dd-fields');
    const filter2DdIncompleteRadios = document.querySelectorAll('input[name="filter2-dd-incomplete"]');

    // Load observers - get all observers and sort by KK numerically
    async function loadObservers() {
        try {
            const response = await fetch('/api/observers/list');
            const data = await response.json();
            
            // Sort observers numerically by KK
            observers = data.observers.sort((a, b) => {
                const kkA = parseInt(a.KK);
                const kkB = parseInt(b.KK);
                return kkA - kkB;
            });
            
            // observers loaded successfully

        } catch (error) {
            console.error('Error loading observers:', error);
            observers = [];
        }
    }

    // Show warning modal (same style as other pages)
    function showWarningModal(message) {
        const modalHtml = `
            <div class="modal fade" id="warning-modal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.common.warning}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('warning-modal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
            window.navigateInternal('/');
        });
    }

    // Populate parameter dropdowns with all available parameters
    function populateParameterSelects() {
        const params = [
            { code: 'JJ', name: i18nStrings.analysis_dialog.param_names.JJ },
            { code: 'MM', name: i18nStrings.analysis_dialog.param_names.MM },
            { code: 'TT', name: i18nStrings.analysis_dialog.param_names.TT },
            { code: 'ZZ', name: i18nStrings.analysis_dialog.param_names.ZZ },
            { code: 'SH', name: i18nStrings.analysis_dialog.param_names.SH },
            { code: 'KK', name: i18nStrings.analysis_dialog.param_names.KK },
            { code: 'GG', name: i18nStrings.analysis_dialog.param_names.GG },
            { code: 'O', name: i18nStrings.analysis_dialog.param_names.O },
            { code: 'f', name: i18nStrings.analysis_dialog.param_names.f },
            { code: 'C', name: i18nStrings.analysis_dialog.param_names.C },
            { code: 'd', name: i18nStrings.analysis_dialog.param_names.d },
            { code: 'EE', name: i18nStrings.analysis_dialog.param_names.EE },
            { code: 'DD', name: i18nStrings.analysis_dialog.param_names.DD },
            { code: 'H', name: i18nStrings.analysis_dialog.param_names.H },
            { code: 'F', name: i18nStrings.analysis_dialog.param_names.F },
            { code: 'V', name: i18nStrings.analysis_dialog.param_names.V },
            { code: 'zz', name: i18nStrings.analysis_dialog.param_names.zz },
            { code: 'HO_HU', name: i18nStrings.analysis_dialog.param_names.HO_HU },
            { code: 'SE', name: i18nStrings.analysis_dialog.param_names.SE }
        ];

        // Populate all select dropdowns
        [param1Select, param2Select, filter1Select, filter2Select].forEach(select => {
            // Keep the first option (placeholder/empty option)
            const firstOption = select.firstElementChild;
            select.innerHTML = '';
            if (firstOption) {
                select.appendChild(firstOption);
            }
            
            params.forEach(param => {
                const option = document.createElement('option');
                option.value = param.code;
                option.textContent = param.name;
                select.appendChild(option);
            });
        });
    }

    // Update available options based on selections (prevent duplicates)
    function updateAvailableOptions() {
        const selectedValues = [
            param1Select.value,
            param2Select.value,
            filter1Select.value,
            filter2Select.value
        ].filter(v => v !== '');

        // Update param2 options (exclude param1 and incompatible combinations)
        Array.from(param2Select.options).forEach(option => {
            if (option.value === '') return; // Keep empty option

            let shouldDisable = selectedValues.includes(option.value) && option.value !== param2Select.value;
            const param1Value = param1Select.value;

            // Incompatible day/month/year combinations
            if ((option.value === 'TT' && (param1Value === 'MM' || param1Value === 'JJ')) ||
                (option.value === 'JJ' && param1Value === 'TT') ||
                (option.value === 'MM' && param1Value === 'TT')) {
                shouldDisable = true;
            }

            option.disabled = shouldDisable;
        });

        // Update filter1 options (exclude param1, param2)
        Array.from(filter1Select.options).forEach(option => {
            if (option.value === '') return;
            option.disabled = selectedValues.includes(option.value) && option.value !== filter1Select.value;
        });

        // Update filter2 options (exclude param1, param2, filter1)
        Array.from(filter2Select.options).forEach(option => {
            if (option.value === '') return;
            option.disabled = selectedValues.includes(option.value) && option.value !== filter2Select.value;
        });
    }

    // Get range values for a parameter
    function getParameterRange(paramCode) {
        // Helper function to get month name - check actual type
        function getMonthName(monthNum) {
            if (Array.isArray(i18nStrings.months)) {
                // Array (0-indexed): ["Januar", "Februar", ...]
                return i18nStrings.months[monthNum - 1];
            } else {
                // Object with string keys: {"1": "Januar", "2": "Februar", ...}
                return i18nStrings.months[String(monthNum)];
            }
        }
        
        switch (paramCode) {
            case 'JJ':
                const years = [];
                for (let i = YEAR_MIN; i <= YEAR_MAX; i++) {
                    years.push({ value: i, display: String(i) });
                }
                return years;
            
            case 'MM':
                // Format: "01 - Januar", "02 - Februar", etc.
                const months = [];
                for (let i = 1; i <= 12; i++) {
                    const monthName = getMonthName(i);
                    months.push({ value: i, display: `${String(i).padStart(2, '0')} - ${monthName}` });
                }
                return months;
            
            case 'TT':
                const days = [];
                for (let i = 1; i <= 31; i++) {
                    days.push({ value: i, display: String(i).padStart(2, '0') });
                }
                return days;
            
            case 'ZZ':
                const hours = [];
                for (let i = 0; i <= 23; i++) {
                    hours.push({ value: i, display: `${i} Uhr` });
                }
                return hours;
            
            case 'SH':
                // Solar altitude: all degrees from -10 to 90
                const altitudes = [];
                for (let i = -10; i <= 90; i++) {
                    altitudes.push({ value: i, display: String(i) + '°' });
                }
                return altitudes;
            
            case 'KK':
                // Format: "44 - Hans Mustermann"
                return observers.map(obs => ({
                    value: obs.KK,
                    display: `${String(obs.KK).padStart(2, '0')} - ${obs.VName} ${obs.NName}`
                }));
            
            case 'GG':
                // Use exact region list from observation form
                const regionNumbers = [1,2,3,4,5,6,7,8,9,10,11,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39];
                return regionNumbers.map(gg => {
                    const regionName = i18nStrings.geographic_regions[String(gg)];
                    return { value: gg, display: `${String(gg).padStart(2, '0')} - ${regionName}` };
                });
            
            case 'O':
                const objects = [];
                for (let i = 1; i <= 5; i++) {
                    const objName = i18nStrings.object_types[String(i)];
                    objects.push({ value: i, display: `${i} - ${objName}` });
                }
                return objects;
            
            case 'f':
                // Weather front with text names
                const fronts = [];
                for (let i = 0; i <= 8; i++) {
                    const frontName = i18nStrings.weather_front[String(i)];
                    fronts.push({ value: i, display: `${i} - ${frontName}` });
                }
                return fronts;
            
            case 'C':
                // Cirrus type with text names
                const cirrus = [];
                for (let i = 0; i <= 7; i++) {
                    const cirrusName = i18nStrings.cirrus_types[String(i)];
                    cirrus.push({ value: i, display: `${i} - ${cirrusName}` });
                }
                return cirrus;
            
            case 'd':
                // Cirrus density - use exact format from observation form
                return [
                    { value: 0, display: `0 - ${i18nStrings.cirrus_density['0']}` },
                    { value: 1, display: `1 - ${i18nStrings.cirrus_density['1']}` },
                    { value: 2, display: `2 - ${i18nStrings.cirrus_density['2']}` },
                    { value: 4, display: `4 - ${i18nStrings.cirrus_density['4']}` },
                    { value: 5, display: `5 - ${i18nStrings.cirrus_density['5']}` },
                    { value: 6, display: `6 - ${i18nStrings.cirrus_density['6']}` },
                    { value: 7, display: `7 - ${i18nStrings.cirrus_density['7']}` }
                ];
            
            case 'EE':
                // Only halo types 1-77 and 99 (exclude 78-98)
                const haloTypes = [];
                for (let i = 1; i <= 77; i++) {
                    const haloName = i18nStrings.halo_types[String(i)];
                    haloTypes.push({ value: i, display: `${String(i).padStart(2, '0')} - ${haloName}` });
                }
                haloTypes.push({ value: 99, display: `99 - ${i18nStrings.halo_types['99']}` });
                return haloTypes;
            
            case 'DD':
                // Duration: display key values 0, 10, 20, 30, etc.
                const durations = [];
                const minuteText = i18nStrings.observations.detail_labels.minutes.trim();
                for (let i = 0; i <= 99; i += 10) {
                    durations.push({ value: i, display: `${i} ${minuteText}` });
                }
                return durations;
            
            case 'H':
                // Brightness with text values
                const brightness = [];
                for (let i = 0; i <= 3; i++) {
                    const brightName = i18nStrings.brightness[String(i)];
                    brightness.push({ value: i, display: `${i} - ${brightName}` });
                }
                return brightness;
            
            case 'F':
                // Color with text values
                const colours = [];
                for (let i = 0; i <= 5; i++) {
                    const colorName = i18nStrings.color[String(i)];
                    colours.push({ value: i, display: `${i} - ${colorName}` });
                }
                return colours;
            
            case 'V':
                // Completeness with text values
                return [
                    { value: 1, display: `1 - ${i18nStrings.completeness['1']}` },
                    { value: 2, display: `2 - ${i18nStrings.completeness['2']}` }
                ];
            
            case 'zz':
                // Zeit bis Niederschlag (hours): 0 hours, 1 hours, etc.
                const zzTimes = [];
                const hourText = i18nStrings.observations.detail_labels.hours.trim();
                for (let i = 0; i <= 99; i++) {
                    zzTimes.push({ value: i, display: `${i} ${hourText}` });
                }
                return zzTimes;
            
            case 'HO_HU':
                // Lichtäulenhöhe (pillar height): limited to 30 degrees
                const heights = [];
                for (let i = 0; i <= 30; i++) {
                    heights.push({ value: i, display: String(i) + '°' });
                }
                return heights;
            
            case 'SE':
                // Sectors (octants a-h)
                return ['a','b','c','d','e','f','g','h'].map(letter => ({ value: letter, display: letter }));
            
            default:
                return [];
        }
    }

    // Map raw parameter value to its display label using the same data used for dropdowns
    const valueLabelCache = {};
    function formatParamValue(paramCode, rawValue) {
        // Special handling for KK (observer) - search observers array directly
        if (paramCode === 'KK') {
            const kkNum = parseInt(rawValue);
            const observer = observers.find(obs => parseInt(obs.KK) === kkNum);
            if (!observer) {
                return null; // Return null if observer not found (will be filtered out)
            }
            return `${String(kkNum).padStart(2, '0')} - ${observer.VName} ${observer.NName}`;
        }
        
        // Special handling for GG (geographic region) - filter out non-existent regions
        if (paramCode === 'GG') {
            const validRegions = [1,2,3,4,5,6,7,8,9,10,11,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39];
            const ggNum = parseInt(rawValue);
            if (!validRegions.includes(ggNum)) {
                return null; // Return null if region doesn't exist (will be filtered out)
            }
            const regionName = i18nStrings.geographic_regions[String(ggNum)];
            return `${String(ggNum).padStart(2, '0')} - ${regionName}`;
        }

        // Special handling for SE (sectors) - count by octant letter
        if (paramCode === 'SE') {
            if (rawValue === 'keine Angabe') {
                return i18nStrings.fields.not_applicable;
            }
            return String(rawValue).toLowerCase();
        }

        // Special handling for DD (duration) - display as minutes in steps of 10
        if (paramCode === 'DD') {
            const ddVal = parseInt(rawValue);
            if (isNaN(ddVal)) {
                return null;
            }
            const minutes = ddVal * 10;
            return `${minutes} min`;
        }

        // Special handling for zz (time till precipitation) - display as hours
        if (paramCode === 'zz') {
            const hoursVal = parseInt(rawValue);
            if (isNaN(hoursVal)) {
                return null;
            }
            const hourText = i18nStrings.observations.detail_labels.hours.trim();
            return `${hoursVal} ${hourText}`;
        }
        
        // Special handling for EE (halo type) - filter out non-existent types (78-98)
        if (paramCode === 'EE') {
            const eeNum = parseInt(rawValue);
            // Valid halo types: 1-77 and 99
            if (eeNum < 1 || (eeNum > 77 && eeNum !== 99)) {
                return null; // Return null if halo type doesn't exist (will be filtered out)
            }
            const haloName = i18nStrings.halo_types[String(eeNum)];
            return `${String(eeNum).padStart(2, '0')} - ${haloName}`;
        }
        
        if (!valueLabelCache[paramCode]) {
            valueLabelCache[paramCode] = getParameterRange(paramCode).reduce((acc, item) => {
                acc[String(item.value)] = item.display;
                return acc;
            }, {});
        }
        const cache = valueLabelCache[paramCode];
        const key = String(rawValue);
        return cache && cache[key] ? cache[key] : rawValue;
    }

    // Populate month and year fields for day (TT) parameter
    function populateDayFields() {
        // Populate months
        param1MonthSelect.innerHTML = '';
        const months = getParameterRange('MM');
        months.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            param1MonthSelect.appendChild(option);
        });
        
        // Populate years
        param1YearSelect.innerHTML = '';
        const years = getParameterRange('JJ');
        years.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            param1YearSelect.appendChild(option);
        });

        // Populate day range dropdowns (days 1-31)
        const days = [];
        for (let i = 1; i <= 31; i++) {
            days.push({ value: i, display: String(i) });
        }

        param1DayFromSelect.innerHTML = '';
        param1DayToSelect.innerHTML = '';
        
        days.forEach(item => {
            const fromOption = document.createElement('option');
            fromOption.value = item.value;
            fromOption.textContent = item.display;
            param1DayFromSelect.appendChild(fromOption);
            
            const toOption = document.createElement('option');
            toOption.value = item.value;
            toOption.textContent = item.display;
            param1DayToSelect.appendChild(toOption);
        });

        // Set "to" day to 31 by default (last day)
        param1DayToSelect.selectedIndex = 30; // 31st day
    }

    // Populate month and year fields for day (TT) parameter - param2
    function populateDayFields2() {
        // Populate months
        param2MonthSelect.innerHTML = '';
        const months = getParameterRange('MM');
        months.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            param2MonthSelect.appendChild(option);
        });
        
        // Populate years
        param2YearSelect.innerHTML = '';
        const years = getParameterRange('JJ');
        years.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            param2YearSelect.appendChild(option);
        });

        // Populate day range dropdowns (days 1-31)
        const days = [];
        for (let i = 1; i <= 31; i++) {
            days.push({ value: i, display: String(i) });
        }

        param2DayFromSelect.innerHTML = '';
        param2DayToSelect.innerHTML = '';
        
        days.forEach(item => {
            const fromOption = document.createElement('option');
            fromOption.value = item.value;
            fromOption.textContent = item.display;
            param2DayFromSelect.appendChild(fromOption);
            
            const toOption = document.createElement('option');
            toOption.value = item.value;
            toOption.textContent = item.display;
            param2DayToSelect.appendChild(toOption);
        });

        // Set "to" day to 31 by default (last day)
        param2DayToSelect.selectedIndex = 30; // 31st day
    }

    // Populate month and year fields for day (TT) parameter - filter1
    function populateFilter1DayFields() {
        // Populate months
        filter1MonthSelect.innerHTML = '';
        const months = getParameterRange('MM');
        months.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            filter1MonthSelect.appendChild(option);
        });
        
        // Populate years
        filter1YearSelect.innerHTML = '';
        const years = getParameterRange('JJ');
        years.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            filter1YearSelect.appendChild(option);
        });
    }

    // Populate month and year fields for day (TT) parameter - filter2
    function populateFilter2DayFields() {
        // Populate months
        filter2MonthSelect.innerHTML = '';
        const months = getParameterRange('MM');
        months.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            filter2MonthSelect.appendChild(option);
        });
        
        // Populate years
        filter2YearSelect.innerHTML = '';
        const years = getParameterRange('JJ');
        years.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            filter2YearSelect.appendChild(option);
        });
    }

    // Populate value dropdown for filter1 (single value, not range)
    function populateFilter1Value(paramCode) {
        const range = getParameterRange(paramCode);
        filter1ValueSelect.innerHTML = '';
        range.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            filter1ValueSelect.appendChild(option);
        });
    }

    // Populate value dropdown for filter2 (single value, not range)
    function populateFilter2Value(paramCode) {
        const range = getParameterRange(paramCode);
        filter2ValueSelect.innerHTML = '';
        range.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.display;
            filter2ValueSelect.appendChild(option);
        });
    }

    // Populate range dropdowns for first parameter
    function populateParam1Range(paramCode) {
        const range = getParameterRange(paramCode);
        
        param1FromSelect.innerHTML = '';
        param1ToSelect.innerHTML = '';
        
        range.forEach(item => {
            const fromOption = document.createElement('option');
            fromOption.value = item.value;
            fromOption.textContent = item.display;
            param1FromSelect.appendChild(fromOption);
            
            const toOption = document.createElement('option');
            toOption.value = item.value;
            toOption.textContent = item.display;
            param1ToSelect.appendChild(toOption);
        });

        // Set "to" dropdown to last value by default
        if (range.length > 0) {
            param1ToSelect.selectedIndex = range.length - 1;
        }

        // Show range selection
        param1RangeDiv.style.display = 'block';
    }

    // Validate that "to" >= "from"
    function validateParam1Range() {
        const fromValue = parseFloat(param1FromSelect.value);
        const toValue = parseFloat(param1ToSelect.value);
        
        if (toValue < fromValue) {
            param1ToSelect.value = param1FromSelect.value;
        }
    }

    // Validate that "to day" >= "from day"
    function validateDayRange() {
        const fromDay = parseInt(param1DayFromSelect.value);
        const toDay = parseInt(param1DayToSelect.value);
        
        if (toDay < fromDay) {
            param1DayToSelect.value = param1DayFromSelect.value;
        }
    }

    // Populate range dropdowns for second parameter
    function populateParam2Range(paramCode) {
        const range = getParameterRange(paramCode);
        
        param2FromSelect.innerHTML = '';
        param2ToSelect.innerHTML = '';
        
        range.forEach(item => {
            const fromOption = document.createElement('option');
            fromOption.value = item.value;
            fromOption.textContent = item.display;
            param2FromSelect.appendChild(fromOption);
            
            const toOption = document.createElement('option');
            toOption.value = item.value;
            toOption.textContent = item.display;
            param2ToSelect.appendChild(toOption);
        });

        // Set "to" dropdown to last value by default
        if (range.length > 0) {
            param2ToSelect.selectedIndex = range.length - 1;
        }

        // Show range selection
        param2RangeDiv.style.display = 'block';
    }

    // Validate that "to" >= "from" for param2
    function validateParam2Range() {
        const fromValue = parseFloat(param2FromSelect.value);
        const toValue = parseFloat(param2ToSelect.value);
        
        if (toValue < fromValue) {
            param2ToSelect.value = param2FromSelect.value;
        }
    }

    // Populate range dropdowns for special parameters (SH, C, EE, DD)
    function populateSpecialRangeSelects(paramCode, fromSelect, toSelect) {
        const range = getParameterRange(paramCode);
        // Use abbreviated minutes label for duration (DD)
        const minuteSuffix = ' min';
        
        fromSelect.innerHTML = '';
        toSelect.innerHTML = '';
        
        range.forEach(item => {
            const displayText = paramCode === 'DD'
                ? `${item.value}${minuteSuffix}`
                : item.display;
            const fromOption = document.createElement('option');
            fromOption.value = item.value;
            fromOption.textContent = displayText;
            fromSelect.appendChild(fromOption);
            
            const toOption = document.createElement('option');
            toOption.value = item.value;
            toOption.textContent = displayText;
            toSelect.appendChild(toOption);
        });

        // Set "to" dropdown to last value by default
        if (range.length > 0) {
            toSelect.selectedIndex = range.length - 1;
        }
    }

    // Validate that "to day" >= "from day" for param2
    function validateDayRange2() {
        const fromDay = parseInt(param2DayFromSelect.value);
        const toDay = parseInt(param2DayToSelect.value);
        
        if (toDay < fromDay) {
            param2DayToSelect.value = param2DayFromSelect.value;
        }
    }

    // Event Listeners

    // First parameter selection - show range when selected
    param1Select.addEventListener('change', () => {
        // Enable/disable OK button based on param1 selection
        btnApplyParam.disabled = !param1Select.value;
        
        if (param1Select.value) {
            // Check if this is the day (TT) parameter
            if (param1Select.value === 'TT') {
                param1RangeDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'none';
                param1DayFieldsDiv.style.display = 'block';
                populateDayFields();
            }
            // Check if this is the time (ZZ) parameter
            else if (param1Select.value === 'ZZ') {
                param1DayFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'block';
                // Show range selection for hours (0-23)
                populateParam1Range('ZZ');
                // Reset timezone to CET
                document.getElementById('param1-tz-cet').checked = true;
            }
            // Check if this is the solar altitude (SH) parameter
            else if (param1Select.value === 'SH') {
                param1RangeDiv.style.display = 'none';
                param1DayFieldsDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'block';
                // Reset to mean (default)
                document.getElementById('param1-sh-mean').checked = true;
                // Populate range selects for solar altitude
                populateSpecialRangeSelects('SH', param1ShFromSelect, param1ShToSelect);
            }
            // Check if this is the halo type (EE) parameter
            else if (param1Select.value === 'EE') {
                param1RangeDiv.style.display = 'none';
                param1DayFieldsDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'block';
                // Reset to split (default)
                document.getElementById('param1-ee-split').checked = true;
                // Populate range selects for halo type
                populateSpecialRangeSelects('EE', param1EeFromSelect, param1EeToSelect);
            }
            // Check if this is the cirrus type (C) parameter
            else if (param1Select.value === 'C') {
                param1RangeDiv.style.display = 'none';
                param1DayFieldsDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'block';
                // Reset to split (default)
                document.getElementById('param1-c-split').checked = true;
                // Populate range selects for cirrus type
                populateSpecialRangeSelects('C', param1CFromSelect, param1CToSelect);
            }
            // Check if this is the duration (DD) parameter
            else if (param1Select.value === 'DD') {
                param1RangeDiv.style.display = 'none';
                param1DayFieldsDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'block';
                // Reset to include (default)
                document.getElementById('param1-dd-incomplete').checked = true;
                // Populate range selects for duration
                populateSpecialRangeSelects('DD', param1DdFromSelect, param1DdToSelect);
            }
            else {
                param1RangeDiv.style.display = 'block';
                param1DayFieldsDiv.style.display = 'none';
                param1TimeFieldsDiv.style.display = 'none';
                param1ShFieldsDiv.style.display = 'none';
                param1EeFieldsDiv.style.display = 'none';
                param1CFieldsDiv.style.display = 'none';
                param1DdFieldsDiv.style.display = 'none';
                populateParam1Range(param1Select.value);
            }
        } else {
            param1RangeDiv.style.display = 'none';
            param1DayFieldsDiv.style.display = 'none';
            param1TimeFieldsDiv.style.display = 'none';
            param1ShFieldsDiv.style.display = 'none';
            param1EeFieldsDiv.style.display = 'none';
            param1CFieldsDiv.style.display = 'none';
            param1DdFieldsDiv.style.display = 'none';
        }
        
        // Disable incompatible second parameter options
        // TT (day) makes no sense with MM (month) because day needs specific month/year
        const param2Options = param2Select.querySelectorAll('option');
        param2Options.forEach(option => {
            let shouldDisable = false;
            
            // Day (TT) cannot be param2 when Month (MM) is param1
            if (option.value === 'TT' && param1Select.value === 'MM') {
                shouldDisable = true;
            }
            
            // Day (TT) cannot be param2 when Year (JJ) is param1
            if (option.value === 'TT' && param1Select.value === 'JJ') {
                shouldDisable = true;
            }
            
            // Year (JJ) cannot be param2 when Day (TT) is param1
            if (option.value === 'JJ' && param1Select.value === 'TT') {
                shouldDisable = true;
            }
            
            // Month (MM) cannot be param2 when Day (TT) is param1
            if (option.value === 'MM' && param1Select.value === 'TT') {
                shouldDisable = true;
            }
            
            if (shouldDisable) {
                option.disabled = true;
                // If this option was already selected, clear it
                if (param2Select.value === option.value) {
                    param2Select.value = '';
                    param2RangeDiv.style.display = 'none';
                    param2DayFieldsDiv.style.display = 'none';
                    param2TimeFieldsDiv.style.display = 'none';
                    param2ShFieldsDiv.style.display = 'none';
                    param2EeFieldsDiv.style.display = 'none';
                    param2CFieldsDiv.style.display = 'none';
                    param2DdFieldsDiv.style.display = 'none';
                    percentageModeFields.style.display = 'none';
                }
            } else {
                // Re-enable options that are not in conflict
                option.disabled = false;
            }
        });
        
        updateAvailableOptions();
    });

    // Range validation
    param1FromSelect.addEventListener('change', validateParam1Range);
    param1ToSelect.addEventListener('change', validateParam1Range);

    // Day range validation
    param1DayFromSelect.addEventListener('change', validateDayRange);
    param1DayToSelect.addEventListener('change', validateDayRange);

    // Range validation
    param1FromSelect.addEventListener('change', validateParam1Range);
    param1ToSelect.addEventListener('change', validateParam1Range);

    // Day range validation
    param1DayFromSelect.addEventListener('change', validateDayRange);
    param1DayToSelect.addEventListener('change', validateDayRange);

    // Range validation for param2
    param2FromSelect.addEventListener('change', validateParam2Range);
    param2ToSelect.addEventListener('change', validateParam2Range);

    // Day range validation for param2
    param2DayFromSelect.addEventListener('change', validateDayRange2);
    param2DayToSelect.addEventListener('change', validateDayRange2);

    // Second parameter selection - show range/special fields when selected
    param2Select.addEventListener('change', () => {
        if (param2Select.value) {
            // Validate parameter combinations - prevent incompatible selections
            const param1Value = param1Select.value;
            const param2Value = param2Select.value;
            
            // Check for incompatible combinations and clear selection if found
            if ((param2Value === 'TT' && (param1Value === 'MM' || param1Value === 'JJ')) ||
                (param2Value === 'JJ' && param1Value === 'TT') ||
                (param2Value === 'MM' && param1Value === 'TT')) {
                // Clear the invalid selection
                param2Select.value = '';
                // Hide all param2 fields
                param2RangeDiv.style.display = 'none';
                param2DayFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                percentageModeFields.style.display = 'none';
                return; // Exit early
            }
            
            // Check if this is the day (TT) parameter
            if (param2Select.value === 'TT') {
                param2RangeDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                param2DayFieldsDiv.style.display = 'block';
                populateDayFields2();
            }
            // Check if this is the time (ZZ) parameter
            else if (param2Select.value === 'ZZ') {
                param2DayFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'block';
                // Show range selection for hours (0-23)
                populateParam2Range('ZZ');
                // Reset timezone to CET
                document.getElementById('param2-tz-cet').checked = true;
            }
            // Check if this is the solar altitude (SH) parameter
            else if (param2Select.value === 'SH') {
                param2RangeDiv.style.display = 'none';
                param2DayFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'block';
                // Reset to mean (default)
                document.getElementById('param2-sh-mean').checked = true;
                // Populate range selects for solar altitude
                populateSpecialRangeSelects('SH', param2ShFromSelect, param2ShToSelect);
            }
            // Check if this is the halo type (EE) parameter
            else if (param2Select.value === 'EE') {
                param2RangeDiv.style.display = 'none';
                param2DayFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'block';
                // Reset to split (default)
                document.getElementById('param2-ee-split').checked = true;
                // Populate range selects for halo type
                populateSpecialRangeSelects('EE', param2EeFromSelect, param2EeToSelect);
            }
            // Check if this is the cirrus type (C) parameter
            else if (param2Select.value === 'C') {
                param2RangeDiv.style.display = 'none';
                param2DayFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'block';
                // Reset to split (default)
                document.getElementById('param2-c-split').checked = true;
                // Populate range selects for cirrus type
                populateSpecialRangeSelects('C', param2CFromSelect, param2CToSelect);
            }
            // Check if this is the duration (DD) parameter
            else if (param2Select.value === 'DD') {
                param2RangeDiv.style.display = 'none';
                param2DayFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'block';
                // Reset to include (default)
                document.getElementById('param2-dd-incomplete').checked = true;
                // Populate range selects for duration
                populateSpecialRangeSelects('DD', param2DdFromSelect, param2DdToSelect);
            }
            else {
                param2RangeDiv.style.display = 'block';
                param2DayFieldsDiv.style.display = 'none';
                param2TimeFieldsDiv.style.display = 'none';
                param2ShFieldsDiv.style.display = 'none';
                param2EeFieldsDiv.style.display = 'none';
                param2CFieldsDiv.style.display = 'none';
                param2DdFieldsDiv.style.display = 'none';
                populateParam2Range(param2Select.value);
            }
            percentageModeFields.style.display = 'block';
        } else {
            param2RangeDiv.style.display = 'none';
            param2DayFieldsDiv.style.display = 'none';
            param2TimeFieldsDiv.style.display = 'none';
            param2ShFieldsDiv.style.display = 'none';
            param2EeFieldsDiv.style.display = 'none';
            param2CFieldsDiv.style.display = 'none';
            param2DdFieldsDiv.style.display = 'none';
            percentageModeFields.style.display = 'none';
        }
        updateAvailableOptions();
    });

    // Add change listener for filter1 parameter
    filter1Select.addEventListener('change', () => {
        if (filter1Select.value) {
            // Check if this is the day (TT) parameter
            if (filter1Select.value === 'TT') {
                filter1ValueDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'none';
                filter1DayFieldsDiv.style.display = 'block';
                populateFilter1DayFields();
                // Also populate day values (1-31) in the main value dropdown
                filter1ValueDiv.style.display = 'block';
                populateFilter1Value('TT');
            }
            // Check if this is the time (ZZ) parameter
            else if (filter1Select.value === 'ZZ') {
                filter1ValueDiv.style.display = 'block';
                filter1DayFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'block';
                populateFilter1Value('ZZ');
                // Reset timezone to CET
                document.getElementById('filter1-tz-cet').checked = true;
            }
            // Check if this is the solar altitude (SH) parameter
            else if (filter1Select.value === 'SH') {
                filter1ValueDiv.style.display = 'block';
                filter1DayFieldsDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'block';
                populateFilter1Value('SH');
                // Reset to mean (default)
                document.getElementById('filter1-sh-mean').checked = true;
            }
            // Check if this is the halo type (EE) parameter
            else if (filter1Select.value === 'EE') {
                filter1ValueDiv.style.display = 'block';
                filter1DayFieldsDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'block';
                populateFilter1Value('EE');
                // Reset to split (default)
                document.getElementById('filter1-ee-split-yes').checked = true;
            }
            // Check if this is the cirrus type (C) parameter
            else if (filter1Select.value === 'C') {
                filter1ValueDiv.style.display = 'block';
                filter1DayFieldsDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'block';
                populateFilter1Value('C');
                // Reset to split (default)
                document.getElementById('filter1-c-split-yes').checked = true;
            }
            // Check if this is the duration (DD) parameter
            else if (filter1Select.value === 'DD') {
                filter1ValueDiv.style.display = 'block';
                filter1DayFieldsDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'block';
                populateFilter1Value('DD');
                // Reset to include (default)
                document.getElementById('filter1-dd-include').checked = true;
            }
            // All other parameters - just show single value dropdown
            else {
                filter1ValueDiv.style.display = 'block';
                filter1DayFieldsDiv.style.display = 'none';
                filter1TimeFieldsDiv.style.display = 'none';
                filter1ShFieldsDiv.style.display = 'none';
                filter1EeFieldsDiv.style.display = 'none';
                filter1CFieldsDiv.style.display = 'none';
                filter1DdFieldsDiv.style.display = 'none';
                populateFilter1Value(filter1Select.value);
            }
            // Enable filter2 when filter1 has a value
            filter2Select.disabled = false;
        } else {
            filter1ValueDiv.style.display = 'none';
            filter1DayFieldsDiv.style.display = 'none';
            filter1TimeFieldsDiv.style.display = 'none';
            filter1ShFieldsDiv.style.display = 'none';
            filter1EeFieldsDiv.style.display = 'none';
            filter1CFieldsDiv.style.display = 'none';
            filter1DdFieldsDiv.style.display = 'none';
            // Disable and reset filter2 when filter1 is empty
            filter2Select.disabled = true;
            filter2Select.value = '';
            // Hide all filter2 fields
            filter2ValueDiv.style.display = 'none';
            filter2DayFieldsDiv.style.display = 'none';
            filter2TimeFieldsDiv.style.display = 'none';
            filter2ShFieldsDiv.style.display = 'none';
            filter2EeFieldsDiv.style.display = 'none';
            filter2CFieldsDiv.style.display = 'none';
            filter2DdFieldsDiv.style.display = 'none';
        }
        updateAvailableOptions();
    });

    // Add change listener for filter2 parameter
    filter2Select.addEventListener('change', () => {
        if (filter2Select.value) {
            // Check if this is the day (TT) parameter
            if (filter2Select.value === 'TT') {
                filter2ValueDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'none';
                filter2DayFieldsDiv.style.display = 'block';
                populateFilter2DayFields();
                // Also populate day values (1-31) in the main value dropdown
                filter2ValueDiv.style.display = 'block';
                populateFilter2Value('TT');
            }
            // Check if this is the time (ZZ) parameter
            else if (filter2Select.value === 'ZZ') {
                filter2ValueDiv.style.display = 'block';
                filter2DayFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'block';
                populateFilter2Value('ZZ');
                // Reset timezone to CET
                document.getElementById('filter2-tz-cet').checked = true;
            }
            // Check if this is the solar altitude (SH) parameter
            else if (filter2Select.value === 'SH') {
                filter2ValueDiv.style.display = 'block';
                filter2DayFieldsDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'block';
                populateFilter2Value('SH');
                // Reset to mean (default)
                document.getElementById('filter2-sh-mean').checked = true;
            }
            // Check if this is the halo type (EE) parameter
            else if (filter2Select.value === 'EE') {
                filter2ValueDiv.style.display = 'block';
                filter2DayFieldsDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'block';
                populateFilter2Value('EE');
                // Reset to split (default)
                document.getElementById('filter2-ee-split-yes').checked = true;
            }
            // Check if this is the cirrus type (C) parameter
            else if (filter2Select.value === 'C') {
                filter2ValueDiv.style.display = 'block';
                filter2DayFieldsDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'block';
                populateFilter2Value('C');
                // Reset to split (default)
                document.getElementById('filter2-c-split-yes').checked = true;
            }
            // Check if this is the duration (DD) parameter
            else if (filter2Select.value === 'DD') {
                filter2ValueDiv.style.display = 'block';
                filter2DayFieldsDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'block';
                populateFilter2Value('DD');
                // Reset to include (default)
                document.getElementById('filter2-dd-include').checked = true;
            }
            // All other parameters - just show single value dropdown
            else {
                filter2ValueDiv.style.display = 'block';
                filter2DayFieldsDiv.style.display = 'none';
                filter2TimeFieldsDiv.style.display = 'none';
                filter2ShFieldsDiv.style.display = 'none';
                filter2EeFieldsDiv.style.display = 'none';
                filter2CFieldsDiv.style.display = 'none';
                filter2DdFieldsDiv.style.display = 'none';
                populateFilter2Value(filter2Select.value);
            }
        } else {
            filter2ValueDiv.style.display = 'none';
            filter2DayFieldsDiv.style.display = 'none';
            filter2TimeFieldsDiv.style.display = 'none';
            filter2ShFieldsDiv.style.display = 'none';
            filter2EeFieldsDiv.style.display = 'none';
            filter2CFieldsDiv.style.display = 'none';
            filter2DdFieldsDiv.style.display = 'none';
        }
        updateAvailableOptions();
    });

    // Parameter selection - Apply button
    btnApplyParam.addEventListener('click', async () => {
        // Collect selected parameters
        const selectedParams = {
            param1: param1Select.value,
            param1_from: param1FromSelect.value,
            param1_to: param1ToSelect.value,
            param2: param2Select.value,
            filter1: filter1Select.value,
            filter2: filter2Select.value
        };

        // Handle special cases
        if (param1Select.value === 'TT') {
            // Day parameter - add month, year, and day range
            selectedParams.param1_month = param1MonthSelect.value;
            selectedParams.param1_year = param1YearSelect.value;
            selectedParams.param1_from = param1DayFromSelect.value;
            selectedParams.param1_to = param1DayToSelect.value;
        } else if (param1Select.value === 'ZZ') {
            // Time parameter - add timezone selection
            const selectedTz = document.querySelector('input[name="param1-timezone"]:checked');
            selectedParams.param1_timezone = selectedTz.value; // 'cet' or 'local'
        } else if (param1Select.value === 'SH') {
            // Solar altitude parameter - add time calculation method and range
            const selectedSh = document.querySelector('input[name="param1-sh-time"]:checked');
            selectedParams.param1_sh_time = selectedSh.value; // 'min', 'mean', or 'max'
            selectedParams.param1_from = param1ShFromSelect.value;
            selectedParams.param1_to = param1ShToSelect.value;
        } else if (param1Select.value === 'EE') {
            // Halo type parameter - add split option and range
            const selectedEe = document.querySelector('input[name="param1-ee-split"]:checked');
            selectedParams.param1_ee_split = selectedEe.value === 'split'; // true or false
            selectedParams.param1_from = param1EeFromSelect.value;
            selectedParams.param1_to = param1EeToSelect.value;
        } else if (param1Select.value === 'C') {
            // Cirrus type parameter - add split option and range
            const selectedC = document.querySelector('input[name="param1-c-split"]:checked');
            selectedParams.param1_c_split = selectedC.value === 'split'; // true or false
            selectedParams.param1_from = param1CFromSelect.value;
            selectedParams.param1_to = param1CToSelect.value;
        } else if (param1Select.value === 'DD') {
            // Duration parameter - add incomplete observation filter and range
            const selectedDd = document.querySelector('input[name="param1-dd-incomplete"]:checked');
            selectedParams.param1_dd_incomplete = selectedDd.value === 'include'; // true to include, false to exclude
            selectedParams.param1_from = param1DdFromSelect.value;
            selectedParams.param1_to = param1DdToSelect.value;
        }

        // Handle special cases for param2
        if (param2Select.value === 'TT') {
            // Day parameter - add month, year, and day range
            selectedParams.param2_month = param2MonthSelect.value;
            selectedParams.param2_year = param2YearSelect.value;
            selectedParams.param2_from = param2DayFromSelect.value;
            selectedParams.param2_to = param2DayToSelect.value;
        } else if (param2Select.value === 'ZZ') {
            // Time parameter - add timezone selection
            const selectedTz = document.querySelector('input[name="param2-timezone"]:checked');
            selectedParams.param2_timezone = selectedTz.value; // 'cet' or 'local'
        } else if (param2Select.value === 'SH') {
            // Solar altitude parameter - add time calculation method and range
            const selectedSh = document.querySelector('input[name="param2-sh-time"]:checked');
            selectedParams.param2_sh_time = selectedSh.value; // 'min', 'mean', or 'max'
            selectedParams.param2_from = param2ShFromSelect.value;
            selectedParams.param2_to = param2ShToSelect.value;
        } else if (param2Select.value === 'EE') {
            // Halo type parameter - add split option and range
            const selectedEe = document.querySelector('input[name="param2-ee-split"]:checked');
            selectedParams.param2_ee_split = selectedEe.value === 'split'; // true or false
            selectedParams.param2_from = param2EeFromSelect.value;
            selectedParams.param2_to = param2EeToSelect.value;
        } else if (param2Select.value === 'C') {
            // Cirrus type parameter - add split option and range
            const selectedC = document.querySelector('input[name="param2-c-split"]:checked');
            selectedParams.param2_c_split = selectedC.value === 'split'; // true or false
            selectedParams.param2_from = param2CFromSelect.value;
            selectedParams.param2_to = param2CToSelect.value;
        } else if (param2Select.value === 'DD') {
            // Duration parameter - add incomplete observation filter and range
            const selectedDd = document.querySelector('input[name="param2-dd-incomplete"]:checked');
            selectedParams.param2_dd_incomplete = selectedDd.value === 'include'; // true to include, false to exclude
            selectedParams.param2_from = param2DdFromSelect.value;
            selectedParams.param2_to = param2DdToSelect.value;
        }

        // Handle special cases for filter1
        if (filter1Select.value) {
            selectedParams.filter1_value = filter1ValueSelect.value;
            // Store display text for restrictions display
            const selectedOption = filter1ValueSelect.options[filter1ValueSelect.selectedIndex];
            selectedParams.filter1_display = selectedOption ? selectedOption.text : filter1ValueSelect.value;
            
            if (filter1Select.value === 'TT') {
                // Day parameter - add month and year
                selectedParams.filter1_month = filter1MonthSelect.value;
                selectedParams.filter1_year = filter1YearSelect.value;
            } else if (filter1Select.value === 'ZZ') {
                // Time parameter - add timezone selection
                const selectedTz = document.querySelector('input[name="filter1-timezone"]:checked');
                selectedParams.filter1_timezone = selectedTz.value; // 'CET' or 'local'
            } else if (filter1Select.value === 'SH') {
                // Solar altitude parameter - add time calculation method
                const selectedSh = document.querySelector('input[name="filter1-sh-time"]:checked');
                selectedParams.filter1_sh_time = selectedSh.value; // 'min', 'mean', or 'max'
            } else if (filter1Select.value === 'EE') {
                // Halo type parameter - add split option
                const selectedEe = document.querySelector('input[name="filter1-ee-split"]:checked');
                selectedParams.filter1_ee_split = selectedEe.value === 'split'; // true or false
            } else if (filter1Select.value === 'C') {
                // Cirrus type parameter - add split option
                const selectedC = document.querySelector('input[name="filter1-c-split"]:checked');
                selectedParams.filter1_c_split = selectedC.value === 'split'; // true or false
            } else if (filter1Select.value === 'DD') {
                // Duration parameter - add incomplete observation filter
                const selectedDd = document.querySelector('input[name="filter1-dd-incomplete"]:checked');
                selectedParams.filter1_dd_incomplete = selectedDd.value === 'include'; // true to include, false to exclude
            }
        }

        // Handle special cases for filter2
        if (filter2Select.value) {
            selectedParams.filter2_value = filter2ValueSelect.value;
            // Store display text for restrictions display
            const selectedOption = filter2ValueSelect.options[filter2ValueSelect.selectedIndex];
            selectedParams.filter2_display = selectedOption ? selectedOption.text : filter2ValueSelect.value;
            
            if (filter2Select.value === 'TT') {
                // Day parameter - add month and year
                selectedParams.filter2_month = filter2MonthSelect.value;
                selectedParams.filter2_year = filter2YearSelect.value;
            } else if (filter2Select.value === 'ZZ') {
                // Time parameter - add timezone selection
                const selectedTz = document.querySelector('input[name="filter2-timezone"]:checked');
                selectedParams.filter2_timezone = selectedTz.value; // 'CET' or 'local'
            } else if (filter2Select.value === 'SH') {
                // Solar altitude parameter - add time calculation method
                const selectedSh = document.querySelector('input[name="filter2-sh-time"]:checked');
                selectedParams.filter2_sh_time = selectedSh.value; // 'min', 'mean', or 'max'
            } else if (filter2Select.value === 'EE') {
                // Halo type parameter - add split option
                const selectedEe = document.querySelector('input[name="filter2-ee-split"]:checked');
                selectedParams.filter2_ee_split = selectedEe.value === 'split'; // true or false
            } else if (filter2Select.value === 'C') {
                // Cirrus type parameter - add split option
                const selectedC = document.querySelector('input[name="filter2-c-split"]:checked');
                selectedParams.filter2_c_split = selectedC.value === 'split'; // true or false
            } else if (filter2Select.value === 'DD') {
                // Duration parameter - add incomplete observation filter
                const selectedDd = document.querySelector('input[name="filter2-dd-incomplete"]:checked');
                selectedParams.filter2_dd_incomplete = selectedDd.value === 'include'; // true to include, false to exclude
            }
        }

        // Add percentage mode for two-parameter analysis
        if (selectedParams.param2) {
            const percentageMode = document.querySelector('input[name="percentage-mode"]:checked');
            selectedParams.percentage_mode = percentageMode ? percentageMode.value : 'global';
        }
        
        // Add percentage mode for two-parameter analysis
        if (selectedParams.param2) {
            const percentageMode = document.querySelector('input[name="percentage-mode"]:checked');
            selectedParams.percentage_mode = percentageMode ? percentageMode.value : 'global';
        }
        
        // Log configuration

        
        // Close the parameter dialog
        const modalInstance = bootstrap.Modal.getInstance(paramDialog);
        if (modalInstance) {
            modalInstance.hide();
        }
        
        // Send to backend for processing
        try {
            const response = await fetch('/api/analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedParams)
            });
            
            if (!response.ok) {
                showWarningModal('Fehler bei der Auswertung');
                return;
            }
            
            const result = await response.json();

            
            // Display the result
            displayAnalysisResult(result, selectedParams);
        } catch (error) {
            console.error('Analysis error:', error);
            showWarningModal('Fehler: ' + error.message);
        }
    });

    btnCancelParam.addEventListener('click', () => {
        window.navigateInternal('/');
    });

    // Store last analysis result globally for print/save functionality
    let lastAnalysisResult = null;
    let lastAnalysisParams = null;

    // Display analysis result as table
    async function displayAnalysisResult(result, params) {
        if (!result.success) {
            showWarningModal(result.error);
            return;
        }
        
        // Check output mode setting
        let outputMode = 'H'; // Default: HTML-Tabellen (current for analysis)
        try {
            const modeResponse = await fetch('/api/config/outputmode');
            const modeData = await modeResponse.json();
            outputMode = modeData.mode || 'H';
        } catch (error) {
            console.error('Error fetching output mode:', error);
        }
        
        // Store result for later use (print/save)
        lastAnalysisResult = result;
        lastAnalysisParams = params;
        
        // Build title
        const param1Name = i18nStrings.analysis_dialog.param_names[params.param1];
        const param2Name = params.param2 ? i18nStrings.analysis_dialog.param_names[params.param2] : null;
        const titleText = param2Name 
            ? `${i18nStrings.analysis_results.title_two_params}: ${param1Name} ${i18nStrings.analysis_results.and} ${param2Name}`
            : `${i18nStrings.analysis_results.title_one_param}: ${param1Name}`;
        
        // Build restrictions array
        const restrictions = [];
        if (params.filter1) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter1];
            const displayValue = params.filter1_display;
            restrictions.push(`${filterName} = ${displayValue}`);
        }
        if (params.filter2) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter2];
            const displayValue = params.filter2_display;
            restrictions.push(`${filterName} = ${displayValue}`);
        }
        
        // Build restrictions HTML (for HTML mode only)
        let restrictionsHtml = '';
        if (restrictions.length > 0 && outputMode === 'H') {
            restrictionsHtml = `<div class="restrictions"><strong>${i18nStrings.analysis_results.restriction}:</strong> ${restrictions.join(', ')}</div>`;
        }
        
        // Build result HTML based on output mode and number of parameters
        let resultHtml = '';
        
        if (outputMode === 'H') {
            // HTML-Tabellen format (current implementation)
            if (!params.param2) {
                // Single parameter - show simple table
                resultHtml = buildSingleParameterTable(result.data, param1Name, result.total, params.param1);
            } else {
                // Two parameters - show cross-tabulation
                const percentageMode = params.percentage_mode;
                resultHtml = buildTwoParameterTable(result.data, param1Name, param2Name, result.total, percentageMode, params.param1, params.param2);
            }
        } else if (outputMode === 'M') {
            // Markdown format: generate markdown and render if possible
            const md = generateAnalysisMarkdown();
            if (window.marked && typeof window.marked.parse === 'function') {
                resultHtml = `<div class="markdown-body">${window.marked.parse(md)}</div>`;
            } else {
                resultHtml = `<pre style="white-space: pre-wrap;">${md}</pre>`;
            }
        } else {
            // Pseudografik format (title and restrictions are included in the table itself)
            resultHtml = buildPseudografikAnalysisTable(result, params, param1Name, param2Name, restrictions, i18nStrings);
        }
        
        // Combine all parts
        const html = `
            <div class="analysis-results">
                ${outputMode === 'H' ? `<h4>${titleText}</h4>` : ''}
                ${restrictionsHtml}
                ${resultHtml}
            </div>
        `;
        
        // Show in modal dialog
        showResultModal(html);
    }
    
    // Show result in modal dialog
    function showResultModal(html) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('resultModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'resultModal';
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-scrollable" style="max-width: 800px;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${i18nStrings.menu_titles.analysis}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="resultModalBody" style="overflow-x: auto; overflow-y: auto; max-height: calc(100vh - 250px);">
                        </div>
                        <div class="modal-footer d-flex justify-content-end gap-2">
                            <button type="button" id="btn-result-bar-chart" class="btn btn-secondary btn-sm px-3">${i18nStrings.common.bar_chart}</button>
                            <button type="button" id="btn-result-line-chart" class="btn btn-secondary btn-sm px-3">${i18nStrings.common.line_chart}</button>
                            <button type="button" id="btn-result-print" class="btn btn-secondary btn-sm px-3">${i18nStrings.common.print}</button>
                            <button type="button" id="btn-result-save" class="btn btn-secondary btn-sm px-3">${i18nStrings.common.save}</button>
                            <button type="button" id="btn-result-ok" class="btn btn-primary btn-sm px-3">${i18nStrings.common.ok}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Setup button handlers
            setupResultModalHandlers(modal);
        }
        
        // Set content
        document.getElementById('resultModalBody').innerHTML = html;
        
        // Show modal
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        
        // Focus OK button
        setTimeout(() => {
            document.getElementById('btn-result-ok').focus();
        }, 500);
    }
    
    // Setup result modal button handlers
    function setupResultModalHandlers(modal) {
        const btnOk = document.getElementById('btn-result-ok');
        const btnBarChart = document.getElementById('btn-result-bar-chart');
        const btnLineChart = document.getElementById('btn-result-line-chart');
        const btnPrint = document.getElementById('btn-result-print');
        const btnSave = document.getElementById('btn-result-save');
        
        // OK button - close modal and return to main
        if (btnOk) {
            btnOk.onclick = () => {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
                window.navigateInternal('/');
            };
        }
        
        // Bar Chart button
        if (btnBarChart) {
            btnBarChart.onclick = () => {



                showBarChart();
            };
        }
        
        // Line Chart button
        if (btnLineChart) {
            btnLineChart.onclick = () => {



                showLineChart();
            };
        }
        
        // Enter key support when modal is visible
        const enterKeyHandler = (e) => {
            if (e.key === 'Enter' && modal.classList.contains('show')) {
                e.preventDefault();
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
                window.navigateInternal('/');
            }
        };
        
        // ESC key support when modal is visible
        const escKeyHandler = (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                e.preventDefault();
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
                window.navigateInternal('/');
            }
        };
        
        // Remove any existing handlers first to avoid duplicates
        document.removeEventListener('keypress', enterKeyHandler);
        document.addEventListener('keypress', enterKeyHandler);
        document.removeEventListener('keydown', escKeyHandler);
        document.addEventListener('keydown', escKeyHandler);
        
        // Print button
        if (btnPrint) {
            btnPrint.onclick = () => {
                window.print();
            };
        }
        
        // Save button
        if (btnSave) {
            btnSave.onclick = () => {
                saveAnalysisResult();
            };
        }
    }
    
    // Show bar chart for analysis result
    function showBarChart() {
        if (!lastAnalysisResult || !lastAnalysisParams) return;

        const result = lastAnalysisResult;
        const params = lastAnalysisParams;
        const data = result.data;
        
        // Build title with parameter names and filters
        const param1Name = i18nStrings.analysis_dialog.param_names[params.param1];
        const param2Name = params.param2 ? i18nStrings.analysis_dialog.param_names[params.param2] : null;
        let titleText;
        
        if (param2Name) {
            titleText = `Parameter: ${param1Name} ${i18nStrings.analysis_results.and} ${param2Name}`;
        } else {
            titleText = `Parameter: ${param1Name}`;
        }
        
        // Add filter restrictions to title
        const restrictions = [];
        if (params.filter1) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter1];
            const displayValue = params.filter1_display;
            restrictions.push(`${filterName} = ${displayValue}`);
        }
        if (params.filter2) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter2];
            const displayValue = params.filter2_display;
            restrictions.push(`${filterName} = ${displayValue}`);
        }
        if (restrictions.length > 0) {
            titleText += `\n${i18nStrings.analysis_results.restriction}: ${restrictions.join(', ')}`;
        }
        
        if (!params.param2) {
            // 1-parameter analysis: simple 2D bar chart using Chart.js
            // data is an array of {key: value, count: number}
            const labels = data.map(item => formatParamValue(params.param1, item.key));
            const counts = data.map(item => item.count);
            
            const datasets = [{
                label: i18nStrings.analysis_results.count,
                data: counts,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }];
            
            showChart2D(titleText, labels, datasets, 'bar');
        } else {
            // 2-parameter analysis: 3D bar chart using Plotly.js
            show3DBarChart(titleText, data, params);
        }
    }
    
    // Show 3D bar chart using Plotly.js
    function show3DBarChart(titleText, data, params) {
        const param1Values = Object.keys(data).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        
        const param2Values = new Set();
        Object.values(data).forEach(row => {
            Object.keys(row).forEach(col => param2Values.add(col));
        });
        const param2ValuesArray = Array.from(param2Values).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        
        // Create individual bars using mesh3d for each data point
        const traces = [];
        
        param1Values.forEach((p1Val, i) => {
            param2ValuesArray.forEach((p2Val, j) => {
                const count = data[p1Val][p2Val] || 0;
                if (count === 0) return; // Skip empty bars
                
                const x0 = j - 0.4;
                const x1 = j + 0.4;
                const y0 = i - 0.4;
                const y1 = i + 0.4;
                const z0 = 0;
                const z1 = count;
                
                // Create a box (bar) using mesh3d
                traces.push({
                    type: 'mesh3d',
                    x: [x0, x0, x1, x1, x0, x0, x1, x1],
                    y: [y0, y1, y1, y0, y0, y1, y1, y0],
                    z: [z0, z0, z0, z0, z1, z1, z1, z1],
                    i: [7, 0, 0, 0, 4, 4, 6, 6, 4, 0, 3, 2],
                    j: [3, 4, 1, 2, 5, 6, 5, 2, 0, 1, 6, 3],
                    k: [0, 7, 2, 3, 6, 7, 1, 1, 5, 5, 7, 6],
                    opacity: 0.8,
                    color: count,
                    colorscale: 'Viridis',
                    showscale: false,
                    hovertemplate: 
                        formatParamValue(params.param1, p1Val) + '<br>' +
                        formatParamValue(params.param2, p2Val) + '<br>' +
                        i18nStrings.analysis_results.count + ': ' + count +
                        '<extra></extra>',
                    showlegend: false
                });
            });
        });
        
        // Add one trace for the colorbar
        const allCounts = [];
        param1Values.forEach(p1Val => {
            param2ValuesArray.forEach(p2Val => {
                const count = data[p1Val][p2Val] || 0;
                if (count > 0) allCounts.push(count);
            });
        });
        
        traces.push({
            type: 'scatter3d',
            x: [null],
            y: [null],
            z: [null],
            mode: 'markers',
            marker: {
                size: 0,
                color: allCounts,
                colorscale: 'Viridis',
                showscale: true,
                colorbar: {
                    title: i18nStrings.analysis_results.count
                }
            },
            showlegend: false,
            hoverinfo: 'skip'
        });
        
        const layout = {
            title: {
                text: titleText.replace(/\n/g, '<br>'),
                font: { size: 16 }
            },
            scene: {
                xaxis: { 
                    title: i18nStrings.analysis_dialog.param_names[params.param2],
                    tickvals: param2ValuesArray.map((_, i) => i),
                    ticktext: param2ValuesArray.map(v => formatParamValue(params.param2, v))
                },
                yaxis: { 
                    title: i18nStrings.analysis_dialog.param_names[params.param1],
                    tickvals: param1Values.map((_, i) => i),
                    ticktext: param1Values.map(v => formatParamValue(params.param1, v))
                },
                zaxis: { 
                    title: i18nStrings.analysis_results.count
                },
                camera: {
                    eye: { x: 1.5, y: 1.5, z: 1.3 }
                }
            },
            autosize: true,
            margin: { l: 0, r: 0, b: 0, t: 60 }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['pan3d', 'select3d', 'lasso3d']
        };
        
        show3DChartModal(traces, layout, config, 'bar');
    }
    
    // Show 3D chart in a modal using Plotly
    function show3DChartModal(traces, layout, config, chartType) {
        // Remove any existing chart modal
        let oldModal = document.getElementById('chart3DModal');
        if (oldModal) {
            oldModal.remove();
        }
        
        // Determine chart title based on type
        const chartTitle = chartType === 'line' ? i18nStrings.common.line_chart : i18nStrings.common.bar_chart;
        
        // Create fresh modal
        const chartModal = document.createElement('div');
        chartModal.id = 'chart3DModal';
        chartModal.className = 'modal fade';
        chartModal.setAttribute('tabindex', '-1');
        chartModal.setAttribute('data-bs-backdrop', 'true');
        chartModal.setAttribute('data-bs-keyboard', 'true');
        chartModal.style.zIndex = '10000';
        chartModal.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${chartTitle}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" style="height: 600px;">
                        <div id="plotly3DChart" style="width: 100%; height: 100%;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm px-3" onclick="window.print()">${i18nStrings.common.print}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-save-3d-chart">${i18nStrings.common.save}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(chartModal);
        
        // Show modal
        const modalInstance = new bootstrap.Modal(chartModal);
        modalInstance.show();
        
        // Prevent ESC key from propagating to parent modal
        chartModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
            }
        });
        
        // Create chart after modal is shown
        chartModal.addEventListener('shown.bs.modal', () => {
            // Set focus to this modal to capture ESC key
            chartModal.focus();
            
            Plotly.newPlot('plotly3DChart', traces, layout, config);
            
            // Setup save button handler
            document.getElementById('btn-save-3d-chart').onclick = () => {
                const filename = chartType === 'line' ? 'analysis_line_chart' : 'analysis_bar_chart';
                Plotly.downloadImage('plotly3DChart', {
                    format: 'png',
                    width: 1200,
                    height: 800,
                    filename: filename
                });
            };
        }, { once: true });
        
        // Clean up on hide
        chartModal.addEventListener('hidden.bs.modal', () => {
            Plotly.purge('plotly3DChart');
        }, { once: true });
    }
    
    // Show 2D chart in a modal using Chart.js
    function showChart2D(titleText, labels, datasets, chartTypeParam) {
        // Remove any existing chart modal
        let oldModal = document.getElementById('chartModal');
        if (oldModal) {
            oldModal.remove();
        }
        
        // Determine chart title based on type
        const chartTitle = chartTypeParam === 'line' ? i18nStrings.common.line_chart : i18nStrings.common.bar_chart;
        
        // Create fresh modal
        const chartModal = document.createElement('div');
        chartModal.id = 'chartModal';
        chartModal.className = 'modal fade';
        chartModal.setAttribute('tabindex', '-1');
        chartModal.setAttribute('data-bs-backdrop', 'true');
        chartModal.setAttribute('data-bs-keyboard', 'true');
        chartModal.style.zIndex = '10000';
        chartModal.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${chartTitle}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <canvas id="analysisChart"></canvas>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm px-3" onclick="window.print()">${i18nStrings.common.print}</button>
                        <button type="button" class="btn btn-secondary btn-sm px-3" id="btn-save-2d-chart">${i18nStrings.common.save}</button>
                        <button type="button" class="btn btn-primary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.ok}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(chartModal);
        
        // Show modal
        const modalInstance = new bootstrap.Modal(chartModal);
        modalInstance.show();
        
        // Prevent ESC key from propagating to parent modal
        chartModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
            }
        });
        
        // Create chart after modal is shown
        chartModal.addEventListener('shown.bs.modal', () => {
            // Set focus to this modal to capture ESC key
            chartModal.focus();
            
            const ctx = document.getElementById('analysisChart').getContext('2d');
            
            // Destroy existing chart if any
            if (window.analysisChartInstance) {
                window.analysisChartInstance.destroy();
            }
            
            // Create new chart
            window.analysisChartInstance = new Chart(ctx, {
                type: chartTypeParam,
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        title: {
                            display: true,
                            text: titleText.split('\n'),
                            font: { size: 14 }
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            type: 'category',
                            title: {
                                display: false
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: i18nStrings.analysis_results.count
                            }
                        }
                    }
                }
            });
            
            // Setup save button handler
            document.getElementById('btn-save-2d-chart').onclick = () => {
                const canvas = document.getElementById('analysisChart');
                const filename = chartTypeParam === 'line' ? 'analysis_line_chart.png' : 'analysis_bar_chart.png';
                
                // Create a temporary canvas with white background
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Fill white background
                tempCtx.fillStyle = 'white';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                
                // Draw the chart on top
                tempCtx.drawImage(canvas, 0, 0);
                
                // Convert to blob and download
                tempCanvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                }, 'image/png');
            };
        }, { once: true });
    }
    
    // Show line chart for analysis result
    function showLineChart() {
        if (!lastAnalysisResult || !lastAnalysisParams) return;

        const result = lastAnalysisResult;
        const params = lastAnalysisParams;
        const data = result.data;
        
        // Build title with parameter names and filters
        const param1Name = i18nStrings.analysis_dialog.param_names[params.param1];
        const param2Name = params.param2 ? i18nStrings.analysis_dialog.param_names[params.param2] : null;
        let titleText;
        
        if (param2Name) {
            titleText = `Parameter: ${param1Name} ${i18nStrings.analysis_results.and} ${param2Name}`;
        } else {
            titleText = `Parameter: ${param1Name}`;
        }
        
        // Add filter restrictions to title
        const restrictions = [];
        if (params.filter1) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter1];
            const displayValue = params.filter1_display;
            restrictions.push(`${filterName} = ${displayValue}`);
        }
        if (params.filter2) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter2];
            const displayValue = params.filter2_display;
            restrictions.push(`${filterName} = ${displayValue}`);
        }
        if (restrictions.length > 0) {
            titleText += `\n${i18nStrings.analysis_results.restriction}: ${restrictions.join(', ')}`;
        }
        
        if (!params.param2) {
            // 1-parameter analysis: simple 2D line chart using Chart.js
            // data is an array of {key: value, count: number}
            const labels = data.map(item => formatParamValue(params.param1, item.key));
            const counts = data.map(item => item.count);
            
            const datasets = [{
                label: i18nStrings.analysis_results.count,
                data: counts,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }];
            
            showChart2D(titleText, labels, datasets, 'line');
        } else {
            // 2-parameter analysis: 3D surface chart using Plotly.js
            show3DSurfaceChart(titleText, data, params);
        }
    }
    
    // Show 3D surface chart using Plotly.js
    function show3DSurfaceChart(titleText, data, params) {
        const param1Values = Object.keys(data).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        
        const param2Values = new Set();
        Object.values(data).forEach(row => {
            Object.keys(row).forEach(col => param2Values.add(col));
        });
        const param2ValuesArray = Array.from(param2Values).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        
        // Build Z matrix for surface plot
        const zMatrix = [];
        param1Values.forEach(p1Val => {
            const row = [];
            param2ValuesArray.forEach(p2Val => {
                row.push(data[p1Val][p2Val] || 0);
            });
            zMatrix.push(row);
        });
        
        const trace = {
            type: 'surface',
            x: param2ValuesArray.map(v => formatParamValue(params.param2, v)),
            y: param1Values.map(v => formatParamValue(params.param1, v)),
            z: zMatrix,
            colorscale: 'Viridis',
            showscale: true,
            colorbar: {
                title: i18nStrings.analysis_results.count
            },
            hovertemplate: 
                i18nStrings.analysis_dialog.param_names[params.param1] + ': %{y}<br>' +
                i18nStrings.analysis_dialog.param_names[params.param2] + ': %{x}<br>' +
                i18nStrings.analysis_results.count + ': %{z}<br>' +
                '<extra></extra>'
        };
        
        const layout = {
            title: {
                text: titleText.replace(/\n/g, '<br>'),
                font: { size: 16 }
            },
            scene: {
                xaxis: { 
                    title: i18nStrings.analysis_dialog.param_names[params.param2]
                },
                yaxis: { 
                    title: i18nStrings.analysis_dialog.param_names[params.param1]
                },
                zaxis: { 
                    title: i18nStrings.analysis_results.count
                },
                camera: {
                    eye: { x: 1.5, y: 1.5, z: 1.3 }
                }
            },
            autosize: true,
            margin: { l: 0, r: 0, b: 0, t: 60 }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['pan3d', 'select3d', 'lasso3d']
        };
        
        show3DChartModal([trace], layout, config, 'line');
    }
    
    
    // Save analysis result to file (CSV or TXT depending on output mode)
    async function saveAnalysisResult() {
        if (!lastAnalysisResult || !lastAnalysisParams) return;

        // Check output mode
        const modeResponse = await fetch('/api/config/outputmode');
        const modeData = await modeResponse.json();
        const outputMode = modeData.mode || 'P';

        // Generate filename based on parameters
        const param1 = lastAnalysisParams.param1;
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        let content, mimeType, filename;
        
        if (outputMode === 'H') {
            // HTML-Tabellen mode: save as CSV
            filename = `analysis_${param1}_${timestamp}.csv`;
            content = generateAnalysisCsv();
            mimeType = 'text/csv;charset=utf-8';
        } else if (outputMode === 'M') {
            // Markdown mode: save as .md
            filename = `analysis_${param1}_${timestamp}.md`;
            content = generateAnalysisMarkdown();
            mimeType = 'text/markdown;charset=utf-8';
        } else {
            // Pseudografik mode: save as TXT with content from modal
            filename = `analysis_${param1}_${timestamp}.txt`;
            const modalBody = document.getElementById('resultModalBody');
            if (modalBody) {
                // Find the monospace div containing the pseudografik output
                const preDiv = modalBody.querySelector('div[style*="monospace"]');
                content = preDiv ? preDiv.textContent : modalBody.textContent;
                // Remove leading/trailing whitespace but preserve internal formatting
                content = content.trim();
            } else {
                content = '';
            }
            mimeType = 'text/plain;charset=utf-8';
        }

        // Create blob and download
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

    function escapeCsv(value) {
        const text = String(value ?? '');
        if (text.includes('"') || text.includes(',') || text.includes('\n')) {
            return '"' + text.replaceAll('"', '""') + '"';
        }
        return text;
    }

    // Generate CSV version of analysis result (title + table)
    function generateAnalysisCsv() {
        if (!lastAnalysisResult || !lastAnalysisParams) return '';

        const params = lastAnalysisParams;
        const result = lastAnalysisResult;

        const param1Name = i18nStrings.analysis_dialog.param_names[params.param1];
        const param2Name = params.param2 ? i18nStrings.analysis_dialog.param_names[params.param2] : '';
        const titleText = params.param2
            ? `${i18nStrings.analysis_results.title_two_params}: ${param1Name} ${i18nStrings.analysis_results.and} ${param2Name}`
            : `${i18nStrings.analysis_results.title_one_param}: ${param1Name}`;

        const restrictions = [];
        if (params.filter1) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter1];
            restrictions.push(`${filterName} = ${params.filter1_value}`);
        }
        if (params.filter2) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter2];
            restrictions.push(`${filterName} = ${params.filter2_value}`);
        }

        const lines = [];
        lines.push(escapeCsv(titleText));
        if (restrictions.length > 0) {
            lines.push(escapeCsv(`${i18nStrings.analysis_results.restriction}: ${restrictions.join(', ')}`));
        }
        lines.push('');

        if (!params.param2) {
            // Single-parameter table
            lines.push([param1Name, `${i18nStrings.analysis_results.count} (Σ=${result.total} ${i18nStrings.analysis_results.observations})`].map(escapeCsv).join(','));
            for (const item of result.data) {
                const displayKey = formatParamValue(params.param1, item.key);
                const percentage = result.total > 0 ? ((item.count / result.total) * 100).toFixed(1) : '0.0';
                lines.push([displayKey, `${item.count} (${percentage}%)`].map(escapeCsv).join(','));
            }
        } else {
            // Two-parameter cross-tab
            const data = result.data;

            // Collect sorted param2 values (columns)
            const param2Values = new Set();
            Object.values(data).forEach(row => {
                Object.keys(row).forEach(col => param2Values.add(col));
            });
            const columns = Array.from(param2Values).sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a).localeCompare(String(b));
            });

            // Column totals
            const columnTotals = {};
            columns.forEach(col => {
                columnTotals[col] = 0;
                Object.values(data).forEach(row => {
                    columnTotals[col] += row[col] !== undefined ? row[col] : 0;
                });
            });

            // Header row
            const header = [param1Name, `${param2Name} Σ (Σ=${result.total})`];
            columns.forEach(col => {
                const colTotal = columnTotals[col];
                const colPercentage = result.total > 0 ? ((colTotal / result.total) * 100).toFixed(1) : '0.0';
                const colLabel = formatParamValue(params.param2, col);
                header.push(`${colLabel} Σ=${colTotal} (Σ=${colPercentage}%)`);
            });
            lines.push(header.map(escapeCsv).join(','));

            // Rows
            const param1Values = Object.keys(data).sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a).localeCompare(String(b));
            });

            param1Values.forEach(param1Val => {
                const rowData = data[param1Val];
                let rowTotal = 0;
                columns.forEach(col => {
                    rowTotal += rowData[col] !== undefined ? rowData[col] : 0;
                });
                const rowPercentage = result.total > 0 ? ((rowTotal / result.total) * 100).toFixed(1) : '0.0';
                const rowLabel = formatParamValue(params.param1, param1Val);

                const row = [rowLabel, `Σ=${rowTotal} (Σ=${rowPercentage}%)`];
                columns.forEach(col => {
                    const val = rowData[col] !== undefined ? rowData[col] : 0;
                    row.push(val);
                });
                lines.push(row.map(escapeCsv).join(','));
            });

            // Totals row
            const totalsRow = [i18nStrings.analysis_results.total, `Σ=${result.total} (Σ=100%)`];
            columns.forEach(col => {
                const colTotal = columnTotals[col];
                const colPercentage = result.total > 0 ? ((colTotal / result.total) * 100).toFixed(1) : '0.0';
                totalsRow.push(`${colTotal} (${colPercentage}%)`);
            });
            lines.push(totalsRow.map(escapeCsv).join(','));
        }

        return lines.join('\n');
    }
    
    // Generate Markdown version of analysis result (title + table)
    function generateAnalysisMarkdown() {
        if (!lastAnalysisResult || !lastAnalysisParams) return '';

        const params = lastAnalysisParams;
        const result = lastAnalysisResult;

        const param1Name = i18nStrings.analysis_dialog.param_names[params.param1];
        const param2Name = params.param2 ? i18nStrings.analysis_dialog.param_names[params.param2] : '';
        const titleText = params.param2
            ? `${i18nStrings.analysis_results.title_two_params}: ${param1Name} ${i18nStrings.analysis_results.and} ${param2Name}`
            : `${i18nStrings.analysis_results.title_one_param}: ${param1Name}`;

        const restrictions = [];
        if (params.filter1) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter1];
            restrictions.push(`${filterName} = ${params.filter1_value}`);
        }
        if (params.filter2) {
            const filterName = i18nStrings.analysis_dialog.param_names[params.filter2];
            restrictions.push(`${filterName} = ${params.filter2_value}`);
        }

        const escapeCell = (text) => String(text ?? '').replaceAll('|', '\\|');

        const lines = [];
        lines.push(`#### ${escapeCell(titleText)}`);
        if (restrictions.length > 0) {
            lines.push(`_${escapeCell(i18nStrings.analysis_results.restriction)}: ${escapeCell(restrictions.join(', '))}_`);
        }
        lines.push('');

        if (!params.param2) {
            // Single-parameter table
            lines.push(`| **${escapeCell(param1Name)}** | ${escapeCell(i18nStrings.analysis_results.count)} (Σ=${result.total} ${escapeCell(i18nStrings.analysis_results.observations)}) |`);
            lines.push('| --- | --- |');
            for (const item of result.data) {
                const displayKey = formatParamValue(params.param1, item.key);
                const percentage = result.total > 0 ? ((item.count / result.total) * 100).toFixed(1) : '0.0';
                lines.push(`| **${escapeCell(displayKey)}** | ${item.count} (${percentage}%) |`);
            }
        } else {
            // Two-parameter cross-tab (Markdown)
            const data = result.data;

            // Collect sorted param2 values (columns)
            const param2Values = new Set();
            Object.values(data).forEach(row => {
                Object.keys(row).forEach(col => param2Values.add(col));
            });
            const columns = Array.from(param2Values).sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a).localeCompare(String(b));
            });

            // Column totals
            const columnTotals = {};
            columns.forEach(col => {
                columnTotals[col] = 0;
                Object.values(data).forEach(row => {
                    columnTotals[col] += row[col] !== undefined ? row[col] : 0;
                });
            });

            // Header row: param names with overall total in brackets
            const firstHeader = `**${escapeCell(param1Name)} \\ ${escapeCell(param2Name)}** (Σ=${result.total})`;
            let headerLine = `| ${firstHeader} |`;
            columns.forEach(col => {
                const colTotal = columnTotals[col];
                const colPercentage = result.total > 0 ? ((colTotal / result.total) * 100).toFixed(1) : '0.0';
                const colLabel = formatParamValue(params.param2, col);
                headerLine += ` **${escapeCell(colLabel)}** Σ=${colTotal} (Σ=${colPercentage}%) |`;
            });
            lines.push(headerLine);

            // Separator row (one for param1, one for each param2 column)
            let sepLine = '| --- |';
            columns.forEach(() => { sepLine += ' --- |'; });
            lines.push(sepLine);

            // Rows
            const param1Values = Object.keys(data).sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a).localeCompare(String(b));
            });

            // Row totals
            const rowTotals = {};
            param1Values.forEach(param1Val => {
                const rowData = data[param1Val];
                let rowTotal = 0;
                columns.forEach(col => { rowTotal += rowData[col] !== undefined ? rowData[col] : 0; });
                rowTotals[param1Val] = rowTotal;
            });

            // Build rows: merge label and row total into first cell
            param1Values.forEach(param1Val => {
                const rowData = data[param1Val];
                const rowTotal = rowTotals[param1Val];
                const rowPercentage = result.total > 0 ? ((rowTotal / result.total) * 100).toFixed(1) : '0.0';
                const rowLabel = formatParamValue(params.param1, param1Val);

                // First cell contains label and row total
                let rowLine = `| **${escapeCell(rowLabel)}** Σ=${rowTotal} (Σ=${rowPercentage}%) |`;
                columns.forEach(col => {
                    const count = rowData[col] !== undefined ? rowData[col] : 0;
                    let pct = 0.0;
                    if (params.percentage_mode === 'param1') {
                        pct = rowTotal > 0 ? ((count / rowTotal) * 100) : 0;
                    } else if (params.percentage_mode === 'param2') {
                        const colTotal = columnTotals[col];
                        pct = colTotal > 0 ? ((count / colTotal) * 100) : 0;
                    } else {
                        pct = result.total > 0 ? ((count / result.total) * 100) : 0;
                    }
                    rowLine += ` ${count} (${pct.toFixed(1)}%) |`;
                });
                lines.push(rowLine);
            });

            // Totals row: merge label and total into first cell
            let totalsLine = `| **${escapeCell(i18nStrings.analysis_results.total)}** Σ=${result.total} (Σ=100%) |`;
            columns.forEach(col => {
                const colTotal = columnTotals[col];
                const colPercentage = result.total > 0 ? ((colTotal / result.total) * 100).toFixed(1) : '0.0';
                totalsLine += ` ${colTotal} (${colPercentage}%) |`;
            });
            lines.push(totalsLine);
        }

        return lines.join('\n');
    }
    
    // Export/Import functions - deactivated for now, may be needed later
    /*
    function exportAnalysisResult() {
        // TODO: Implement export functionality

    }
    
    function importAnalysisResult() {
        // TODO: Implement import functionality

    }
    */
    
    // Build single parameter result table
    function buildSingleParameterTable(data, paramName, total, paramCode) {
        let html = `
            <table class="table table-bordered analysis-table">
                <thead>
                    <tr class="table-primary">
                        <th>${paramName}</th>
                        <th>${i18nStrings.analysis_results.count} (Σ=${total} ${i18nStrings.analysis_results.observations})</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // data is now an array of {key, count} objects, preserving sort order from backend
        for (const item of data) {
            const key = item.key;
            const count = item.count;
            const displayKey = formatParamValue(paramCode, key);
            const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            html += `
                <tr>
                    <td>${displayKey}</td>
                    <td cass="text-end">${count} ${i18nStrings.analysis_results.observation_s} - ${percentage}%</td>
                </tr>
            `;
        }
        
        html += `
                </tbody>
            </table>
        `;
        
        return html;
    }
    
    // Build two parameter cross-tabulation table
    function buildTwoParameterTable(data, param1Name, param2Name, total, percentageMode, param1Code, param2Code) {
        // Pre-sort helpers
        const sortKeys = (arr) => arr.sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        
        // Extract all unique param2 values (columns) and sort them
        const param2Values = new Set();
        Object.values(data).forEach(row => {
            Object.keys(row).forEach(col => param2Values.add(col));
        });
        const columns = sortKeys(Array.from(param2Values));
        
        // Rows
        const param1Values = sortKeys(Object.keys(data));

        // Precompute totals and cell percentages
        const rowTotals = {};
        const columnTotals = {};
        const cells = {};
        columns.forEach(col => columnTotals[col] = 0);
        
        // First pass: counts and row totals
        param1Values.forEach(r => {
            const rowData = data[r];
            let rSum = 0;
            columns.forEach(c => {
                const count = rowData[c] !== undefined ? rowData[c] : 0;
                rSum += count;
                columnTotals[c] += count;
            });
            rowTotals[r] = rSum;
        });
        
        // Second pass: build cell metric map
        param1Values.forEach(r => {
            const rowData = data[r];
            cells[r] = {};
            columns.forEach(c => {
                const count = rowData[c] !== undefined ? rowData[c] : 0;
                const pGlobal = total > 0 ? (count / total) * 100 : 0;
                const pRow = rowTotals[r] > 0 ? (count / rowTotals[r]) * 100 : 0;
                const pCol = columnTotals[c] > 0 ? (count / columnTotals[c]) * 100 : 0;
                cells[r][c] = { count, pGlobal, pRow, pCol };
            });
        });
        
        // Build table header
        let html = `
            <table class="table table-bordered analysis-table">
                <thead>
                    <tr>
                        <th>${param1Name} \\ ${param2Name} (Σ=${total})</th>
        `;
        
        // Add column headers with totals
        columns.forEach(col => {
            const colTotal = columnTotals[col];
            let colPercentage;
            if (percentageMode === 'param2') {
                // Spaltensumme mode: each column = 100%
                colPercentage = '100.0%';
            } else if (percentageMode === 'param1') {
                // Zeilensumme mode: column header shows average of percentages in this column
                let sum = 0;
                let count = 0;
                param1Values.forEach(r => {
                    if (cells[r][col].count > 0) {
                        sum += cells[r][col].pRow;
                        count++;
                    }
                });
                colPercentage = count > 0 ? 'Ø=' + (sum / count).toFixed(1) + '%' : 'Ø=0.0%';
            } else {
                // Global mode: show actual percentage
                colPercentage = total > 0 ? ((colTotal / total) * 100).toFixed(1) + '%' : '0.0%';
            }
            const colLabel = formatParamValue(param2Code, col);
            html += `<th><strong>${colLabel}</strong><br/>Σ=${colTotal} (Σ=${colPercentage})</th>`;
        });
        
        html += `
                    </tr>
                </thead>
                <tbody>
        `;
        
        param1Values.forEach(param1Val => {
            const rowTotal = rowTotals[param1Val];
            let rowPercentage;
            if (percentageMode === 'param1') {
                // Zeilensumme mode: each row = 100%
                rowPercentage = '(Σ=100.0%)';
            } else if (percentageMode === 'param2') {
                // Spaltensumme mode: row header shows average of percentages in this row
                let sum = 0;
                let count = 0;
                columns.forEach(c => {
                    if (cells[param1Val][c].count > 0) {
                        sum += cells[param1Val][c].pCol;
                        count++;
                    }
                });
                rowPercentage = count > 0 ? '(Ø=' + (sum / count).toFixed(1) + '%)' : '(Ø=0.0%)';
            } else {
                // Global mode: show actual percentage
                rowPercentage = total > 0 ? ((rowTotal / total) * 100).toFixed(1) + '%' : '0.0%';
            }
            const rowLabel = formatParamValue(param1Code, param1Val);
            
            html += `
                <tr>
                    <th scope="row" class="bg-primary text-white"><strong>${rowLabel}</strong><br/>Σ=${rowTotal} (Σ=${rowPercentage})</th>
            `;
            
            // Add data cells with percentages
            columns.forEach(col => {
                const cell = cells[param1Val][col];
                const percentage = (percentageMode === 'param1')
                    ? cell.pRow.toFixed(1)
                    : (percentageMode === 'param2')
                        ? cell.pCol.toFixed(1)
                        : cell.pGlobal.toFixed(1);
                
                html += `<td class="text-end">${cell.count} ${i18nStrings.analysis_results.observation_abbr} - ${percentage}%</td>`;
            });
            
            html += `</tr>`;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        return html;
    }

    // Build Pseudografik format analysis table (full implementation)
    function buildPseudografikAnalysisTable(result, params, param1Name, param2Name, restrictions, i18nStrings) {
        let html = '<div style="font-family: monospace; white-space: pre; font-size: 11px; line-height: 1.0;">';
        
        // Build table first to get its width, then add centered title
        let tableHtml = '';
        let tableWidth = 0;
        
        if (!params.param2) {
            // Single parameter - simple two-column table
            const tableResult = buildSingleParameterPseudografikWithWidth(result.data, param1Name, result.total, params.param1, i18nStrings);
            tableHtml = tableResult.html;
            tableWidth = tableResult.width;
        } else {
            // Two parameters - cross-tabulation
            const tableResult = buildTwoParameterPseudografikWithWidth(result.data, param1Name, param2Name, result.total, params.percentage_mode, params.param1, params.param2, i18nStrings);
            tableHtml = tableResult.html;
            tableWidth = tableResult.width;
        }
        
        // Build centered title with double underline based on actual table width
        const titleText = param2Name 
            ? `${i18nStrings.analysis_results.title_two_params}: ${param1Name} ${i18nStrings.analysis_results.and} ${param2Name}`
            : `${i18nStrings.analysis_results.title_one_param}: ${param1Name}`;
        const titlePadLeft = Math.max(0, Math.floor((tableWidth - titleText.length) / 2));
        html += ' '.repeat(titlePadLeft) + titleText + '\n';
        html += ' '.repeat(titlePadLeft) + '═'.repeat(titleText.length) + '\n';
        
        // Add centered restrictions with double underline if any
        if (restrictions.length > 0) {
            const restrictionText = `${i18nStrings.analysis_results.restriction}: ${restrictions.join(', ')}`;
            const restrictionPadLeft = Math.max(0, Math.floor((tableWidth - restrictionText.length) / 2));
            html += '\n' + ' '.repeat(restrictionPadLeft) + restrictionText + '\n';
            html += ' '.repeat(restrictionPadLeft) + '═'.repeat(restrictionText.length) + '\n';
        }
        
        html += '\n' + tableHtml;
        html += '</div>';
        return html;
    }

    // Build single parameter pseudo-graphics table
    function buildSingleParameterPseudografikWithWidth(data, paramName, total, paramCode, i18nStrings) {
        let html = '';
        // Keep local alias for clarity and to avoid undefined references
        const param1Code = paramCode;
        
        // Data is already sorted by backend
        
        // First pass: calculate actual column widths needed
        let maxValueWidth = paramName.length;
        let maxCountWidth = 0;
        let maxPercentWidth = 0;
        
        const formattedData = [];
        const isNumericAlignedParam = param1Code === 'DD' || param1Code === 'zz';
        const obsAbbr = i18nStrings.analysis_results.observation_abbr;
        
        for (const item of data) {
            const key = item.key;
            const count = item.count;
            const displayKey = formatParamValue(paramCode, key);
            
            // Skip if observer doesn't exist (formatParamValue returns null)
            if (displayKey === null) {
                continue;
            }
            
            const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            const obsLabel = obsAbbr; // use full abbreviation (e.g., "Beob.")
            
            maxValueWidth = Math.max(maxValueWidth, displayKey.length);
            maxCountWidth = Math.max(maxCountWidth, (count + ' ' + obsLabel).length);
            maxPercentWidth = Math.max(maxPercentWidth, (percentage + '%').length);
            
            formattedData.push({
                displayKey: displayKey,
                count: count,
                obsLabel: obsLabel,
                percentage: percentage
            });
        }
        
        // Combined single column header
        const colWidth = Math.max(maxValueWidth + 3 + maxCountWidth + 3 + maxPercentWidth, paramName.length + 10);
        const tableWidth = colWidth + 4; // +4 for borders and spaces
        
        // Table header
        html += '╔' + '═'.repeat(colWidth + 2) + '╗\n';
        
        // Combined header: "paramName / Beob."
        const headerText = paramName + ' / ' + obsAbbr;
        const header = ' ' + headerText.padEnd(colWidth) + ' ';
        html += '║' + header + '║\n';
        html += '╠' + '═'.repeat(colWidth + 2) + '╣\n';
        
        // Data rows
        for (const item of formattedData) {
            const alignedValue = isNumericAlignedParam
                ? item.displayKey.padStart(maxValueWidth)
                : item.displayKey.padEnd(maxValueWidth);
            
            // Right-align count and percentage
            const countText = (item.count + ' ' + item.obsLabel).padStart(maxCountWidth);
            const percentText = (item.percentage + '%').padStart(maxPercentWidth);
            const cellContent = alignedValue + ' ' + countText + ' - ' + percentText;
            const row = ' ' + cellContent.padEnd(colWidth) + ' ';
            
            html += '║' + row + '║\n';
        }
        
        // Table footer
        html += '╚' + '═'.repeat(colWidth + 2) + '╝\n';
        
        return { html: html, width: tableWidth };
    }

    // Build two parameter cross-tabulation pseudo-graphics table
    function buildTwoParameterPseudografikWithWidth(data, param1Name, param2Name, total, percentageMode, param1Code, param2Code, i18nStrings) {
        let html = '';
        
        // Extract all unique param2 values (columns) and sort them
        const param2Values = new Set();
        Object.values(data).forEach(row => {
            Object.keys(row).forEach(col => param2Values.add(col));
        });
        const columns = Array.from(param2Values).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        
        // Calculate column totals
        const columnTotals = {};
        columns.forEach(col => {
            columnTotals[col] = 0;
            Object.values(data).forEach(row => {
                const val = row[col] !== undefined ? row[col] : 0;
                columnTotals[col] += val;
            });
        });
        
        // Precompute row totals and cell metrics
        const param1Values = Object.keys(data).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        const rowTotals = {};
        param1Values.forEach(param1Val => {
            const rowData = data[param1Val];
            let rSum = 0;
            columns.forEach(col => {
                rSum += rowData[col] !== undefined ? rowData[col] : 0;
            });
            rowTotals[param1Val] = rSum;
        });
        const cells = {};
        param1Values.forEach(param1Val => {
            const rowData = data[param1Val];
            cells[param1Val] = {};
            columns.forEach(col => {
                const count = rowData[col] !== undefined ? rowData[col] : 0;
                const pGlobal = total > 0 ? (count / total) * 100 : 0;
                const pRow = rowTotals[param1Val] > 0 ? (count / rowTotals[param1Val]) * 100 : 0;
                const pCol = columnTotals[col] > 0 ? (count / columnTotals[col]) * 100 : 0;
                cells[param1Val][col] = { count, pGlobal, pRow, pCol };
            });
        });

        // First pass: calculate actual column widths
        // Combined first column: param1Name + row label + total
        let maxCombinedWidth = param1Name.length + 3 + param2Name.length + 2; // ' ' + name1 + ' | ' + name2 + ' '
        let labelWidth = 0; // width for row label in first column
        let totalCountWidthFirst = 0; // width for Σ count in first column
        let totalPercWidthFirst = 0; // width for percentage in first column
        
        // Check row labels width + totals
        param1Values.forEach(param1Val => {
            const rowLabel = formatParamValue(param1Code, param1Val);
            labelWidth = Math.max(labelWidth, rowLabel.length);

            // Use precomputed row total
            const rowTotal = rowTotals[param1Val];
            let rowPercentageStr;
            if (percentageMode === 'param1') {
                // Zeilensumme mode: each row = 100%
                rowPercentageStr = '(Σ=100.0%)';
            } else if (percentageMode === 'param2') {
                // Spaltensumme mode: row header shows average of percentages in this row
                let sum = 0;
                let count = 0;
                columns.forEach(c => {
                    if (cells[param1Val][c].count > 0) {
                        sum += cells[param1Val][c].pCol;
                        count++;
                    }
                });
                rowPercentageStr = count > 0 ? '(Ø=' + (sum / count).toFixed(1) + '%)' : '(Ø=0.0%)';
            } else {
                // Global mode: show actual percentage
                rowPercentageStr = total > 0 ? ((rowTotal / total) * 100).toFixed(1) + '%' : '0.0%';
            }
            totalCountWidthFirst = Math.max(totalCountWidthFirst, String(rowTotal).length);
            totalPercWidthFirst = Math.max(totalPercWidthFirst, rowPercentageStr.length);
        });

        // Ensure combined width fits aligned first-column core content
        const firstColCoreLen = labelWidth + 3 + (2 + totalCountWidthFirst + 1 + totalPercWidthFirst); // label + ' | ' + 'Σ=' + total + ' ' + perc
        maxCombinedWidth = Math.max(maxCombinedWidth, firstColCoreLen);
        
        // Calculate data cell widths (one width per column)
        const cellWidths = [];
        const countColWidths = [];
        const percColWidths = [];
        const obsAbbr = i18nStrings.analysis_results.observation_abbr;
        const alignNumericParam1 = param1Code === 'DD' || param1Code === 'zz';
        
        columns.forEach(col => {
            const colLabel = formatParamValue(param2Code, col);
            const colTotal = columnTotals[col];
            const colPercentage = total > 0 ? ((colTotal / total) * 100).toFixed(1) : '0.0';
            const headerText = colLabel + ' Σ=' + colTotal;
            const percentText = '(' + colPercentage + '%)';
            
            // Start with header-driven width
            let maxCellWidth = Math.max(headerText.length, percentText.length);

            // Determine fixed subfield widths per column (count and percentage) using precomputed cells
            let countWidth = 0;
            let percWidth = 0;
            param1Values.forEach(param1Val => {
                const cell = cells[param1Val][col];
                const pctVal = (percentageMode === 'param1') ? cell.pRow : (percentageMode === 'param2') ? cell.pCol : cell.pGlobal;
                const percStr = pctVal.toFixed(1) + '%';
                countWidth = Math.max(countWidth, String(cell.count).length);
                percWidth = Math.max(percWidth, percStr.length);
            });

            // Core content length for data cell with aligned subfields
            const coreLen = countWidth + 1 + obsAbbr.length + 3 + percWidth; // count + ' ' + obsAbbr + ' - ' + perc
            maxCellWidth = Math.max(maxCellWidth, coreLen);

            // Save widths for rendering and push final cell width
            countColWidths.push(countWidth);
            percColWidths.push(percWidth);
            cellWidths.push(maxCellWidth);
        });
        
        // Calculate fixed center padding per column using coreLen
        const centerPaddings = [];
        columns.forEach((col, idx) => {
            const coreLen = countColWidths[idx] + 1 + obsAbbr.length + 3 + percColWidths[idx];
            const centerPad = Math.floor((cellWidths[idx] - coreLen) / 2);
            centerPaddings.push(Math.max(0, centerPad));
        });
        
        const combinedWidth = maxCombinedWidth;
        const totalCellWidth = cellWidths.reduce((sum, w) => sum + w + 3, 0); // +3 per cell for borders and spaces
        const tableWidth = combinedWidth + totalCellWidth + 4; // +4 for borders and spaces
        
        // Table header
        html += '╔' + '═'.repeat(combinedWidth + 2);
        cellWidths.forEach(w => {
            html += '╦' + '═'.repeat(w + 2);
        });
        html += '╗\n';
        
        // First header row with param names combined, centered
        const headerCombinedText = (param1Name + ' | ' + param2Name);
        const headerCombinedLeftPad = Math.max(0, Math.floor((combinedWidth - headerCombinedText.length) / 2));
        const headerCombinedRightPad = Math.max(0, combinedWidth - headerCombinedLeftPad - headerCombinedText.length);
        const headerCombined = ' ' + ' '.repeat(headerCombinedLeftPad) + headerCombinedText + ' '.repeat(headerCombinedRightPad) + ' ';
        html += '║' + headerCombined;
        
        // Parameter 2 columns (centered column headers)
        columns.forEach((col, idx) => {
            const colLabel = formatParamValue(param2Code, col);
            const leftPad = Math.max(0, Math.floor((cellWidths[idx] - colLabel.length) / 2));
            const rightPad = Math.max(0, cellWidths[idx] - leftPad - colLabel.length);
            const cellText = ' ' + ' '.repeat(leftPad) + colLabel + ' '.repeat(rightPad) + ' ';
            html += '║' + cellText;
        });
        html += '║\n';
        
        // Second header row with column totals and percentages
        const headerSpace = ' '.repeat(combinedWidth + 2);
        html += '║' + headerSpace;
        
        // Column headers with totals and percentages (centered)
        columns.forEach((col, idx) => {
            const colTotal = columnTotals[col];
            let colPercentageStr;
            if (percentageMode === 'param2') {
                // Spaltensumme mode: each column = 100%
                colPercentageStr = '100.0%';
            } else if (percentageMode === 'param1') {
                // Zeilensumme mode: column header shows average of percentages in this column
                let sum = 0;
                let count = 0;
                param1Values.forEach(r => {
                    if (cells[r][col].count > 0) {
                        sum += cells[r][col].pRow;
                        count++;
                    }
                });
                colPercentageStr = count > 0 ? 'Ø=' + (sum / count).toFixed(1) + '%' : 'Ø=0.0%';
            } else {
                // Global mode: show actual percentage
                colPercentageStr = total > 0 ? ((colTotal / total) * 100).toFixed(1) + '%' : '0.0%';
            }
            const headerText = 'Σ=' + colTotal + ' (' + colPercentageStr + ')';
            const leftPad = Math.max(0, Math.floor((cellWidths[idx] - headerText.length) / 2));
            const rightPad = Math.max(0, cellWidths[idx] - leftPad - headerText.length);
            const cellText = ' ' + ' '.repeat(leftPad) + headerText + ' '.repeat(rightPad) + ' ';
            html += '║' + cellText;
        });
        html += '║\n';
        html += '╠' + '═'.repeat(combinedWidth + 2);
        cellWidths.forEach(w => {
            html += '╬' + '═'.repeat(w + 2);
        });
        html += '╣\n';
        
        // Data rows
        param1Values.forEach((param1Val, rowIndex) => {
            // Use precomputed row total
            const rowTotal = rowTotals[param1Val];
            let rowPercentageStr;
            if (percentageMode === 'param1') {
                // Zeilensumme mode: each row = 100%
                rowPercentageStr = '(Σ=100.0%)';
            } else if (percentageMode === 'param2') {
                // Spaltensumme mode: row header shows average of percentages in this row
                let sum = 0;
                let count = 0;
                columns.forEach(c => {
                    if (cells[param1Val][c].count > 0) {
                        sum += cells[param1Val][c].pCol;
                        count++;
                    }
                });
                rowPercentageStr = count > 0 ? '(Ø=' + (sum / count).toFixed(1) + '%)' : '(Ø=0.0%)';
            } else {
                // Global mode: show actual percentage
                rowPercentageStr = total > 0 ? ((rowTotal / total) * 100).toFixed(1) + '%' : '0.0%';
            }
            const rowLabel = formatParamValue(param1Code, param1Val);
            const totalText = 'Σ=' + rowTotal + ' ' + rowPercentageStr;
            
            // Combined first column with aligned subparts and centered as a whole
            const labelStr = (alignNumericParam1 ? rowLabel.padStart(labelWidth) : rowLabel.padEnd(labelWidth));
            const totalStr = 'Σ=' + String(rowTotal).padStart(totalCountWidthFirst) + ' ' + rowPercentageStr.padStart(totalPercWidthFirst);
            const combinedCore = labelStr + ' | ' + totalStr;
            const firstColLeftPad = Math.max(0, Math.floor((combinedWidth - combinedCore.length) / 2));
            const firstColRightPad = Math.max(0, combinedWidth - firstColLeftPad - combinedCore.length);
            const combinedCell = ' ' + ' '.repeat(firstColLeftPad) + combinedCore + ' '.repeat(firstColRightPad) + ' ';
            
            html += '║' + combinedCell;
            
            // Data cells
            columns.forEach((col, idx) => {
                const cellMetrics = cells[param1Val][col];
                const pctVal = (percentageMode === 'param1') ? cellMetrics.pRow : (percentageMode === 'param2') ? cellMetrics.pCol : cellMetrics.pGlobal;
                // Build aligned inner content: right-align count and percentage per column widths
                const countStr = String(cellMetrics.count).padStart(countColWidths[idx]);
                const percStr = (pctVal.toFixed(1) + '%').padStart(percColWidths[idx]);
                const core = countStr + ' ' + obsAbbr + ' - ' + percStr;

                // Apply fixed column center padding
                const leftPad = ' '.repeat(centerPaddings[idx]);
                const rightPad = ' '.repeat(cellWidths[idx] - centerPaddings[idx] - core.length);
                const cellRendered = ' ' + leftPad + core + rightPad + ' ';
                html += '║' + cellRendered;
            });
            
            html += '║\n';
        });
        
        // Table footer
        html += '╚' + '═'.repeat(combinedWidth + 2);
        cellWidths.forEach(w => {
            html += '╩' + '═'.repeat(w + 2);
        });
        html += '╝\n';
        
        return { html: html, width: tableWidth };
    }

    // ESC key support - close current dialog and return to main
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.navigateInternal('/');
        }
    });

    // Initialize
    await loadObservers();
    populateParameterSelects();
    
    // Disable filter2 and OK button initially
    filter2Select.disabled = true;
    btnApplyParam.disabled = true;
    
    // Show parameter dialog on load
    const modal = new bootstrap.Modal(paramDialog);
    modal.show();
});
