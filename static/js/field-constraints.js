/**
 * Shared Field Constraint Logic
 * 
 * This module contains the core business logic for calculating valid field values
 * based on HALO observation rules and dependencies. It is used by both:
 * - Menu entry mode (observation-form.js)
 * - Number entry mode (main.js)
 * 
 * Decision #6 (DRY Principle): Constraints are maintained in ONE place only.
 */

/**
 * Check if observer was active at a given date (async API call)
 * 
 * @param {string} kk - Observer code (e.g., '44')
 * @param {number} mm - Month (1-12)
 * @param {number} jj - Year (2-digit: 86 = 1986, 26 = 2026)
 * @returns {Promise<boolean>} - True if observer was active at that date
 */
async function isObserverActive(kk, mm, jj) {
    if (!kk || mm < 1 || mm > 12 || jj < 0) {
        return false;
    }
    
    try {
        const response = await fetch(`/api/observers/${kk}/active?mm=${mm}&jj=${jj}`);
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        return data.active;
    } catch (error) {
        return false;
    }
}

/**
 * Calculate valid values for a field based on current observation context
 * 
 * @param {string} fieldKey - Field identifier ('d', 'n', 'C', 'c', 'TT', etc.)
 * @param {object} context - Current field values { o, d, n, mm, jj, kk, ee, v, ... }
 * @returns {Array<string>|null} - Array of valid string values, or null if async needed
 */
function calculateFieldConstraints(fieldKey, context) {
    
    // Helper: Normalize value (empty/undefined → -1)
    const norm = (val) => (val === '' || val === undefined || val === null) ? -1 : parseInt(val);
    
    switch (fieldKey) {
        
        // d (Cirrus Density) ← depends on O (Object)
        case 'd': {
            const o = norm(context.o);
            
            if (o >= 1 && o <= 4) {
                // O=1-4 (Sun, Moon, Planet, Star): d can be any density
                return ['-1', '0', '1', '2', '4', '5', '6', '7'];
            } else if (o === 5) {
                // O=5 (Earthbound light): Only non-cirrus sources (excluding virga)
                return ['-1', '4', '5', '6'];
            } else {
                // O=-1 (not set): d must be -1
                return ['-1'];
            }
        }
        
        // n (Cloud Cover) ← depends on d (Cirrus Density)
        case 'n': {
            const d = norm(context.d);
            
            if (d >= 0 && d <= 2) {
                // d=0-2 (thin cirrus): N can be -1 or 1..9
                return ['-1', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            } else if (d >= 4 && d <= 6) {
                // d=4-6 (thick cirrus/non-cirrus): N must be -1
                return ['-1'];
            } else if (d === 7) {
                // d=7 (virga): N must be -1
                return ['-1'];
            } else if (d === -2) {
                // d=-2 (observed but not present, '/'): N must be -1
                return ['-1'];
            } else {
                // d=-1 (not observed): N must be -1
                return ['-1'];
            }
        }
        
        // C (Cirrus Cover Upper) ← depends on N (Cloud Cover) and d (Cirrus Density)
        case 'C': {
            const n = norm(context.n);
            const d = norm(context.d);
            
            // Special case: d=7 (virga) forces C=-1
            if (d === 7) {
                return ['-1'];
            }
            
            if (n === 0) {
                // N=0 (clear sky): C must be 0
                return ['0'];
            } else if (n >= 1 && n <= 8) {
                // N=1-8 (some clouds): C=-1 or 1..7
                return ['-1', '1', '2', '3', '4', '5', '6', '7'];
            } else if (n === 9) {
                // N=9 (overcast): C=-1..7
                return ['-1', '0', '1', '2', '3', '4', '5', '6', '7'];
            } else {
                // N=-1 (not observed): C=-1
                return ['-1'];
            }
        }
        
        // c (Cirrus Cover Lower) ← depends on N (Cloud Cover) and d (Cirrus Density)
        case 'c': {
            const n = norm(context.n);
            const d = norm(context.d);
            
            // Special case: d=7 (virga) allows c=-1,1..9 (not 0)
            if (d === 7) {
                return ['-1', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            }
            
            if (n === 0) {
                // N=0 (clear sky): c must be -1
                return ['-1'];
            } else if (n >= 1 && n <= 8) {
                // N=1-8 (some clouds): c=-1..9
                return ['-1', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            } else if (n === 9) {
                // N=9 (overcast): c=-1 or 1..9 (not 0)
                return ['-1', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            } else {
                // N=-1 (not observed): c=-1
                return ['-1'];
            }
        }
        
        // TT (Day) ← depends on MM (Month) and JJ (Year)
        case 'TT': {
            const mm = norm(context.mm);
            const jj = norm(context.jj);
            
            if (mm === -1) {
                return [''];  // Empty for menu mode, will be filtered for number mode
            }
            
            let maxDay;
            if (mm === 1 || mm === 3 || mm === 5 || mm === 7 || mm === 8 || mm === 10 || mm === 12) {
                maxDay = 31;
            } else if (mm === 4 || mm === 6 || mm === 9 || mm === 11) {
                maxDay = 30;
            } else if (mm === 2) {
                // February - check for leap year
                const year = jj > -1 ? (jj < (YEAR_MIN - 1900) ? 2000 + jj : 1900 + jj) : YEAR_MIN;
                maxDay = new Date(year, 2, 0).getDate();  // Days in February
            } else {
                return [''];
            }
            
            // Generate valid days: '01', '02', ..., '31' (with leading zeros for number mode)
            const validDays = [''];
            for (let d = 1; d <= maxDay; d++) {
                validDays.push(d.toString().padStart(2, '0'));
            }
            return validDays;
        }
        
        // g (Location Type) ← depends on KK, MM, JJ and observer activity
        case 'g': {
            const kk = norm(context.kk);
            const mm = norm(context.mm);
            const jj = norm(context.jj);// Required fields must be set
            if (mm === -1 || jj === -1 || kk === -1) {return [];  // Cannot enter g if required fields missing
            }
            
            // Return a Promise that checks observer activity via API
            // This makes the constraint async - calling code must handle Promise
            return isObserverActive(kk, mm, jj).then(active => {
                if (!active) {
                    return [];  // Observer not active: g cannot be entered
                }
                // All checks passed: g can be entered
                return ['0', '1', '2'];
            });
        }
        
        // GG (Geographic Region) ← depends on g (Location Type) and observer data
        // NOTE: Returns null because this requires ASYNC API call
        case 'GG': {
            return null;  // Requires async observer data fetch
        }
        
        // HO, HU (Light Pillar Heights) ← depend on EE (Halo Type)
        case 'HO':
        case 'HU': {
            const ee = norm(context.ee);
            
            if (ee === 8 || ee === 9 || ee === 10) {
                // EE=8,9,10: Light pillar visible, height required
                return ['-1', '-2', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            } else {
                // Other EE values: Height not applicable
                return ['-1'];
            }
        }
        
        // sectors ← depend on EE (Halo Type) and V (Completeness)
        case 'sectors': {
            const ee = norm(context.ee);
            const v = norm(context.v);
            
            // Check if EE is in Sektor set (requires sector data)
            const sektorSet = [3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 40, 41, 42, 43, 44, 45, 46, 50, 51, 52, 53, 54, 55, 56, 62, 63];
            const needsSectors = sektorSet.includes(ee) && v === 1;
            
            return needsSectors ? ['active'] : ['inactive'];
        }
        
        default:
            return null;  // Field not handled by constraints
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.calculateFieldConstraints = calculateFieldConstraints;
    window.isObserverActive = isObserverActive;
}

// Make available for Node.js/module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateFieldConstraints, isObserverActive };
}

