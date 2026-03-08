"""Analysis API endpoint.

Routes: /analysis (POST)

Includes helper functions for filtering, grouping, and solar altitude calculation.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

import calendar
import traceback
from collections import defaultdict
from typing import Dict, Any

from flask import jsonify, request, current_app, Response, session, g

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.models.constants import (
    CIRCULAR_HALOS,
    COMBINED_TO_INDIVIDUAL_HALOS,
    YEAR_CUTOFF,
    YEAR_MIN,
    YEAR_MAX,
    jj_to_full_year,
    resolve_halo_type,
    calculate_halo_activity,
)
from halo.resources.i18n import get_i18n
from halo.api.statistics import (
    _format_annual_stats_text,
    _format_annual_stats_markdown,
    _generate_annual_stats_chart,
    _generate_annual_stats_bar_chart,
)
import halo.io.observations_db as obs_db
import halo.io.observers_db as observer_db
from ._helpers import (
    _int, _parse_seit, calculate_solar_altitude,
    get_observer_coordinates, get_days_in_month,
)


@api_blueprint.route('/annual-stats', methods=['GET'])
def get_annual_stats() -> Dict[str, Any]:
    """Get annual statistics for a given year.
    
    Query parameters:
        jj: Year (2-digit, (YEAR_MIN-1900)-99 for 19xx)
        format: Output format - 'json' (default), 'html', 'text', or 'markdown'
    
    Returns:
        - format=json/html: Dictionary with monthly_stats, totals, observer_distribution, phenomena
        - format=text: Pseudographic output with box-drawing characters
        - format=markdown: Markdown tables for all statistics
    """
    jj = request.args.get('jj', '').strip()
    
    if not jj:
        return jsonify({'error': 'Missing required parameter: jj'}), 400
    
    try:
        jj_int = int(jj)

        # Accept both 2-digit and 4-digit years, normalize to 4-digit
        if 0 <= jj_int <= 99:
            jj_int = jj_to_full_year(jj_int)
        elif jj_int < YEAR_MIN or jj_int > YEAR_MAX:
            return jsonify({'error': f'Invalid year (0-99 or {YEAR_MIN}-{YEAR_MAX})'}), 400

    except ValueError:
        return jsonify({'error': 'Invalid numeric parameter'}), 400
    
    # Load observations - CLOUD MODE: Filter in SQL, LOCAL MODE: Filter in memory
    if is_cloud_mode():
        # Layer 3b: Direct database query with SQL filtering
        filtered_obs = obs_db.load_filtered(jj=jj_int)
        observers = observer_db.load_all()
        active_observers_only = False  # In Cloud Mode, admin can see all
    else:
        # Local Mode: Load from memory cache, filter in Python
        observations = current_app.config.get('OBSERVATIONS', [])
        if not observations:
            return jsonify({'error': 'No observations loaded. Please load a file first.'}), 400
        
        filtered_obs = [obs for obs in observations if _int(obs, 'JJ') == jj_int]
        observers = current_app.config.get('OBSERVERS', [])
        active_observers_only = bool(current_app.config.get('ACTIVE_OBSERVERS_ONLY', False))
    
    # Get all active observers up to end of year
    # Use December of the year as reference (month 12)
    # Convert 4-digit year to seit-compatible format for comparison
    jj_2digit = jj_int % 100
    jj_adjusted = jj_2digit
    if jj_2digit < (YEAR_MIN - 1900):
        jj_adjusted = jj_2digit + 100
    month_year_value = 12 + 13 * jj_adjusted
    
    # Get unique active observers up to this year
    active_observers = {}
    for obs_record in observers:
        kk = obs_record.get('KK', '')
        seit_str = obs_record.get('seit', '')
        aktiv_str = obs_record.get('aktiv', '')
        
        # Parse seit from "MM/JJ" to integer MMJJ
        seit = _parse_seit(seit_str) if seit_str else 0
        
        # Parse aktiv to integer
        try:
            aktiv = int(aktiv_str) if aktiv_str else 0
        except (ValueError, TypeError):
            aktiv = 0
        
        # Observer is active if:
        # 1. They started before or during this year (seit <= month_year_value)
        # 2. If active_observers_only is True, they must be marked as active (aktiv == 1)
        if seit <= month_year_value:
            if not active_observers_only or aktiv == 1:
                # Keep the most recent record for each KK
                kk_seit_str = active_observers.get(kk, {}).get('seit', '') if kk in active_observers else None
                if kk not in active_observers or seit > _parse_seit(kk_seit_str if kk_seit_str else ''):
                    active_observers[kk] = obs_record
    
    # Calculate statistics per month using deduplication algorithm
    # Prevents double counting: each observer (KK) can only count each halo type (EE) once per day
    # Only EE=4 (both 22° parhelia) splits into EE=2 + EE=3
    monthly_stats = {}
    
    # Track counts per individual EE type across all months
    sun_ee_counts = {}  # {ee: count}
    moon_ee_counts = {}  # {ee: count}
    
    for mm in range(1, 13):
        month_obs = [obs for obs in filtered_obs if _int(obs, 'MM') == mm]
        
        # Sort observations by day for efficient processing
        month_obs.sort(key=lambda o: (_int(o, 'TT'), _int(o, 'KK'), _int(o, 'O'), _int(o, 'EE')))
        
        # Track which (observer, object, halo_type) combinations have been counted each day
        # Key: (day, observer_KK, object_O, halo_EE) -> prevents double counting
        counted_today = set()
        last_day = -1
        
        sun_ee_count = 0
        moon_ee_count = 0
        sun_days_set = set()
        moon_days_set = set()
        total_days_set = set()
        
        for obs in month_obs:
            # Reset tracking when day changes
            if _int(obs, 'TT') != last_day:
                last_day = _int(obs, 'TT')
                counted_today = set()
            
            # Handle EE=4 (both 22° parhelia) - splits into EE=2 + EE=3
            halos_to_count = []
            if _int(obs, 'EE') == 4:
                # EE=4 splits into EE=2 (left parhelion) and EE=3 (right parhelion)
                # Check if EE=2 hasn't been counted yet
                if (_int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'), 2) not in counted_today:
                    halos_to_count.append(2)
                    counted_today.add((_int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'), 2))
                # Check if EE=3 hasn't been counted yet
                if (_int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'), 3) not in counted_today:
                    halos_to_count.append(3)
                    counted_today.add((_int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'), 3))
            else:
                # Normal halo type - check if not yet counted for this observer today
                if (_int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'), _int(obs, 'EE')) not in counted_today:
                    halos_to_count.append(_int(obs, 'EE'))
                    counted_today.add((_int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'), _int(obs, 'EE')))
            
            # Count only if this observation adds new halo types
            if halos_to_count:
                count_increment = len(halos_to_count)
                
                if _int(obs, 'O') == 1:
                    # Sun halos
                    sun_ee_count += count_increment
                    sun_days_set.add((_int(obs, 'TT'), _int(obs, 'MM')))
                    total_days_set.add((_int(obs, 'TT'), _int(obs, 'MM')))
                    # Track individual EE counts
                    for ee in halos_to_count:
                        sun_ee_counts[ee] = sun_ee_counts.get(ee, 0) + 1
                elif _int(obs, 'O') == 2:
                    # Moon halos
                    moon_ee_count += count_increment
                    moon_days_set.add((_int(obs, 'TT'), _int(obs, 'MM')))
                    total_days_set.add((_int(obs, 'TT'), _int(obs, 'MM')))
                    # Track individual EE counts
                    for ee in halos_to_count:
                        moon_ee_counts[ee] = moon_ee_counts.get(ee, 0) + 1
        
        sun_days = len(sun_days_set)
        moon_days = len(moon_days_set)
        total_days = len(total_days_set)
        total_ee_count = sun_ee_count + moon_ee_count
        
        # Get sun observations for activity calculation
        sun_obs = [obs for obs in month_obs if _int(obs, 'O') == 1]
        
        # Calculate activity
        activity_data = calculate_halo_activity(
            observations=sun_obs,  # Activity calculation typically based on sun observations
            observers=active_observers,
            mm=mm,
            jj=jj_int,
            active_observers_only=active_observers_only
        )
        
        # Apply 30-day normalization for this month (Pascal: aktf[mm] * 30 / tprom[mm])
        # This ensures activity values are comparable across months of different lengths
        days_in_month = get_days_in_month(mm, jj_int)
        normalization_factor = 30.0 / days_in_month
        normalized_real = round(activity_data['total_real'] * normalization_factor, 1)
        normalized_relative = round(activity_data['total_relative'] * normalization_factor, 1)
        
        # Use string keys for JSON serialization
        monthly_stats[str(mm)] = {
            'sun_ee': sun_ee_count,
            'sun_days': sun_days,
            'moon_ee': moon_ee_count,
            'moon_days': moon_days,
            'total_ee': total_ee_count,
            'total_days': total_days,
            'real': normalized_real,
            'relative': normalized_relative
        }
    
    # Calculate totals (using string keys) with rounded values
    totals = {
        'sun_ee': sum(monthly_stats[str(mm)]['sun_ee'] for mm in range(1, 13)),
        'sun_days': sum(monthly_stats[str(mm)]['sun_days'] for mm in range(1, 13)),
        'moon_ee': sum(monthly_stats[str(mm)]['moon_ee'] for mm in range(1, 13)),
        'moon_days': sum(monthly_stats[str(mm)]['moon_days'] for mm in range(1, 13)),
        'total_ee': sum(monthly_stats[str(mm)]['total_ee'] for mm in range(1, 13)),
        'total_days': sum(monthly_stats[str(mm)]['total_days'] for mm in range(1, 13)),
        'real': round(sum(monthly_stats[str(mm)]['real'] for mm in range(1, 13)), 1),
        'relative': round(sum(monthly_stats[str(mm)]['relative'] for mm in range(1, 13)), 1)
    }
    
    # Calculate per-observer EE distribution (EE 01, 02, 03, 05-07)
    # Track for each observer: counts of EE 01, 02, 03, 05, 06, 07 and total sun EE
    observer_stats = {}
    
    # First pass: initialize observer stats and count total days (sun + moon)
    for obs in filtered_obs:
        kk = _int(obs, 'KK')
        if kk not in observer_stats:
            observer_stats[kk] = {
                'ee01': 0, 'ee02': 0, 'ee03': 0, 'ee567': 0,
                'total_sun_ee': 0, 'sun_days': set(), 'total_days': set()
            }
        # Track all halo days (sun and moon) for total_days
        observer_stats[kk]['total_days'].add((_int(obs, 'MM'), _int(obs, 'TT')))
    
    # Now count sun halos with deduplication
    filtered_obs.sort(key=lambda o: (_int(o, 'MM'), _int(o, 'TT'), _int(o, 'KK'), _int(o, 'O'), _int(o, 'EE')))
    counted_per_observer = {}  # {kk: {(day, ee): counted}}
    
    for obs in filtered_obs:
        if _int(obs, 'O') != 1:  # Only sun halos for EE distribution
            continue
        
        kk = _int(obs, 'KK')
        if kk not in counted_per_observer:
            counted_per_observer[kk] = {}
        
        # Track per day for this observer (use month+day to make unique across year)
        day_key = (_int(obs, 'MM'), _int(obs, 'TT'))
        
        # Handle EE=4 splitting
        halos_to_count = []
        if _int(obs, 'EE') == 4:
            if (day_key, 2) not in counted_per_observer[kk]:
                halos_to_count.append(2)
                counted_per_observer[kk][(day_key, 2)] = True
            if (day_key, 3) not in counted_per_observer[kk]:
                halos_to_count.append(3)
                counted_per_observer[kk][(day_key, 3)] = True
        else:
            if (day_key, _int(obs, 'EE')) not in counted_per_observer[kk]:
                halos_to_count.append(_int(obs, 'EE'))
                counted_per_observer[kk][(day_key, _int(obs, 'EE'))] = True
        
        # Count for this observer
        for ee in halos_to_count:
            observer_stats[kk]['total_sun_ee'] += 1
            
            if ee == 1:
                observer_stats[kk]['ee01'] += 1
            elif ee == 2:
                observer_stats[kk]['ee02'] += 1
            elif ee == 3:
                observer_stats[kk]['ee03'] += 1
            elif ee in [5, 6, 7]:
                observer_stats[kk]['ee567'] += 1
        
        # Track sun halo days only
        if halos_to_count:
            observer_stats[kk]['sun_days'].add((_int(obs, 'MM'), _int(obs, 'TT')))
    
    # Convert sets to counts and calculate EE1-7
    observer_distribution = []
    for kk in sorted(observer_stats.keys()):
        stats = observer_stats[kk]
        ee17 = stats['ee01'] + stats['ee02'] + stats['ee03'] + stats['ee567']
        
        # Calculate percentages (relative to EE1-7)
        if ee17 > 0:
            pct01 = (stats['ee01'] / ee17) * 100.0
            pct02 = (stats['ee02'] / ee17) * 100.0
            pct03 = (stats['ee03'] / ee17) * 100.0
            pct567 = (stats['ee567'] / ee17) * 100.0
        else:
            pct01 = pct02 = pct03 = pct567 = 0.0
        
        observer_distribution.append({
            'kk': kk,
            'ee01': stats['ee01'],
            'pct01': pct01,
            'ee02': stats['ee02'],
            'pct02': pct02,
            'ee03': stats['ee03'],
            'pct03': pct03,
            'ee567': stats['ee567'],
            'pct567': pct567,
            'ee17': ee17,
            'total_sun_ee': stats['total_sun_ee'],
            'sun_days': len(stats['sun_days']),
            'total_days': len(stats['total_days'])
        })
    
    # Detect halo phenomena: observations marked with '*' in remarks field
    # (Pascal: sonder:=sonder OR (elem.bemerkung[lauf]='*'))
    # Group by unique (MM, TT, KK, O) combination, collect EE types
    phenomena_dict = {}  # Key: (MM, TT, KK, O), Value: phenomenon data
    
    for obs in filtered_obs:
        # Only consider observations with '*' in remarks
        remarks = obs.get('remarks', '') or ''
        if '*' not in remarks:
            continue
        
        # Group by (MM, TT, KK, O)
        key = (_int(obs, 'MM'), _int(obs, 'TT'), _int(obs, 'KK'), _int(obs, 'O'))
        if key not in phenomena_dict:
            phenomena_dict[key] = {
                'mm': _int(obs, 'MM'),
                'tt': _int(obs, 'TT'),
                'kk': _int(obs, 'KK'),
                'gg': _int(obs, 'GG'),
                'zs': _int(obs, 'ZS', -1),
                'zm': _int(obs, 'ZM', -1),
                'o': _int(obs, 'O'),
                'ee_types': set(),
                'ee_count': 0  # Track count of EE types
            }
        
        # Add EE type - resolve combined types (Pascal: ZusHaloart)
        for individual_ee in resolve_halo_type(_int(obs, 'EE')):
            phenomena_dict[key]['ee_types'].add(individual_ee)
        
        ee_count = len(phenomena_dict[key]['ee_types'])
        phenomena_dict[key]['ee_count'] = ee_count
        
        # Update time only if count < 6 (freeze time after 5th EE type confirmed)
        # Pascal: IF ph[lauf,0]<6 THEN BEGIN ph[lauf,5]:=elem.ZS; ph[lauf,6]:=elem.ZM; END
        if ee_count < 6:
            phenomena_dict[key]['zs'] = _int(obs, 'ZS', -1)
            phenomena_dict[key]['zm'] = _int(obs, 'ZM', -1)
    
    # All '*'-marked observation groups are phenomena - convert to sorted list
    phenomena_list = []
    for key in sorted(phenomena_dict.keys()):
        phenom = phenomena_dict[key]
        phenom['ee_types'] = sorted(list(phenom['ee_types']))
        phenomena_list.append(phenom)
    
    # Sort by (MM, TT, KK, time)
    phenomena_list.sort(key=lambda p: (p['mm'], p['tt'], p['kk'], p['zs'], p['zm']))
    
    # Build data structure for formatting
    data = {
        'jj': jj_int,
        'monthly_stats': monthly_stats,
        'totals': totals,
        'observer_count': len(active_observers),
        'sun_ee_counts': sun_ee_counts,
        'moon_ee_counts': moon_ee_counts,
        'observer_distribution': observer_distribution,
        'phenomena': phenomena_list
    }
    
    # Check requested format
    output_format = request.args.get('format', 'json').lower()
    i18n = get_i18n()
    
    if output_format in ['json', 'html']:
        # JSON format and HTML format both return data; HTML is formatted client-side
        return jsonify(data)
    elif output_format in ['text', 'markdown']:
        # Get formatted year for display (jj_int is already 4-digit)
        year = str(jj_int)
        if output_format == 'text':
            content = _format_annual_stats_text(data, year, i18n)
            return Response(content, mimetype='text/plain; charset=utf-8')
        elif output_format == 'markdown':
            content = _format_annual_stats_markdown(data, year, i18n)
            return Response(content, mimetype='text/markdown; charset=utf-8')
    elif output_format == 'linegraph':
        # Generate PNG line chart
        img_data = _generate_annual_stats_chart(data, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    elif output_format == 'bargraph':
        # Generate PNG bar chart
        img_data = _generate_annual_stats_bar_chart(data, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    else:
        return jsonify({'error': f'Invalid format: {output_format}. Use json, text, markdown, linegraph, or bargraph.'}), 400



@api_blueprint.route('/analysis', methods=['POST'])
def analyze_observations() -> Dict[str, Any]:
    """
    Perform analysis on observations with selected parameters.
    
    Request body:
        - param1: Primary parameter (MM, JJ, TT, ZZ, SH, KK, GG, O, f, C, d, EE, DD, H, F, V, zz, HO_HU, SE)
        - param1_from: Range start for param1 (varies by parameter type, e.g., day 1-31 for TT, degree -90 to +90 for SH)
        - param1_to: Range end for param1 (varies by parameter type, e.g., day 1-31 for TT, degree -90 to +90 for SH)
        - param1_month: Month for TT parameter (1-12, required when param1=TT)
        - param1_year: Year for TT parameter (0-99, required when param1=TT)
        - param2: Secondary parameter (optional)
        - param2_from: Range start for param2 (optional)
        - param2_to: Range end for param2 (optional)
        - param2_month: Month for param2 when TT (optional)
        - param2_year: Year for param2 when TT (optional)
        - filter1: First filter parameter (optional)
        - filter1_value: Value for filter1 (optional)
        - filter2: Second filter parameter (optional)
        - filter2_value: Value for filter2 (optional)
        - param1_ee_split: Split EE parameter (true/false)
        - param1_c_split: Split C parameter (true/false)
        - param1_dd_incomplete: Include incomplete DD observations (true/false)
        - filter1_ee_split: Split filter1 EE parameter (true/false)
        - filter1_c_split: Split filter1 C parameter (true/false)
        - filter1_dd_incomplete: Include incomplete filter1 DD (true/false)
        - filter2_ee_split: Split filter2 EE parameter (true/false)
        - filter2_c_split: Split filter2 C parameter (true/false)
        - filter2_dd_incomplete: Include incomplete filter2 DD (true/false)
    
    Returns:
        JSON object with:
        - success: True/False
        - data: Object with grouped observation counts {value: count, ...}
        - total: Total number of observations matching criteria
    """
    
    try:
        # Get request parameters
        params = request.get_json()
        
        # Cloud Mode: Use database analysis functions (SQL-based)
        # Local Mode: Use Python filtering on loaded observations
        if is_cloud_mode():
            # Apply fixed observer filter for non-admin users
            fixed_observer = session.get('observer_kk')
            if fixed_observer:
                params['kk'] = int(fixed_observer)
            
            # Use database analysis functions
            param1 = params.get('param1')
            param2 = params.get('param2')
            
            # Special parameters that require Python calculation (not yet implemented in SQL)
            # SH is now implemented in SQL with calculate_solar_altitude() function
            # SE is now implemented in SQL with regexp_split_to_table()
            needs_python_fallback = (param1 in ['HO_HU']) or (param2 and param2 in ['HO_HU'])
            
            if needs_python_fallback:
                # Fall back to Python filtering for complex parameters
                # Load filtered observations from database
                if fixed_observer:
                    observations = obs_db.load_filtered(kk=int(fixed_observer))
                else:
                    observations = obs_db.load_all()
                
                # Apply filters and grouping in Python (same as Local Mode)
                filtered_obs = observations
                
                # Apply filter1 if specified
                if params.get('filter1'):
                    filter1 = params['filter1']
                    filter1_value = params.get('filter1_value', '')
                    filtered_obs = _apply_filter(filtered_obs, filter1, filter1_value, params, 'filter1')
                
                # Apply filter2 if specified
                if params.get('filter2'):
                    filter2 = params['filter2']
                    filter2_value = params.get('filter2_value', '')
                    filtered_obs = _apply_filter(filtered_obs, filter2, filter2_value, params, 'filter2')
                
                # Apply param1 range filter if needed
                filtered_obs = _apply_param_range_filter(filtered_obs, param1, params, 'param1')
                
                # Apply param2 range filter if specified
                if param2:
                    filtered_obs = _apply_param_range_filter(filtered_obs, param2, params, 'param2')
                
                # Group by parameter(s)
                if not param2:
                    data = _group_by_parameter(filtered_obs, param1, params, 'param1')
                else:
                    data, debug_info = _group_by_two_parameters(filtered_obs, param1, param2, params)
                
                total = len(filtered_obs)
                
            elif not param2:
                # Single parameter analysis
                data_dict = obs_db.execute_single_param_analysis(params)
                
                # Fill in missing values in range with count=0 (same as Local Mode)
                from_val = params.get('param1_from')
                to_val = params.get('param1_to')
                if from_val is not None and to_val is not None:
                    try:
                        from_val = int(from_val)
                        to_val = int(to_val)
                        
                        # Generate all values in range based on parameter type
                        if param1 == 'TT':
                            # Day parameter - generate ALL days in the month (1 to max_day)
                            month = params.get('param1_month')
                            year = params.get('param1_year')
                            if month is not None and year is not None:
                                import calendar
                                month = int(month)
                                year = int(year)
                                # Convert 2-digit year to 4-digit for calendar
                                year = year if year >= 1900 else (year + 2000 if year < 50 else year + 1900)
                                max_day = calendar.monthrange(year, month)[1]
                                all_values = list(range(1, max_day + 1))
                            else:
                                all_values = list(range(1, 32))
                        elif param1 == 'JJ':
                            # Year parameter - handle century boundary
                            from_year = from_val if from_val >= 1900 else (from_val + 2000 if from_val < YEAR_CUTOFF else from_val + 1900)
                            to_year = to_val if to_val >= 1900 else (to_val + 2000 if to_val < YEAR_CUTOFF else to_val + 1900)
                            if from_year > to_year:
                                all_values = list(range(from_year, 2100)) + list(range(1900, to_year + 1))
                            else:
                                all_values = list(range(from_year, to_year + 1))
                        else:
                            # Regular numeric range (MM, ZZ, DD, EE, C, etc.)
                            all_values = list(range(from_val, to_val + 1))
                        
                        # Add missing values with count=0
                        for val in all_values:
                            if val not in data_dict:
                                data_dict[val] = 0
                    except (ValueError, TypeError):
                        pass
                
                # Convert dict {value: count} to array [{key: value, count: count}], sorted
                data = [{"key": str(k), "count": v} for k, v in sorted(data_dict.items())]
                total = sum(data_dict.values())
            else:
                # Two parameter analysis (cross-tabulation)
                data = obs_db.execute_two_param_analysis(params)
                # Data is nested dict - keep as is for cross-tabulation
                total = sum(sum(inner.values()) for inner in data.values())
            
            debug_info = None  # DB analysis doesn't provide debug info yet
            
        else:
            # Local Mode: Load observations and use Python filtering
            observations = current_app.config.get('OBSERVATIONS', [])
            if not observations:
                return jsonify({
                    'success': True,
                    'data': [],
                    'total': 0
                })
            
            # Apply filters first
            filtered_obs = observations
            
            # Apply filter1 if specified
            if params.get('filter1'):
                filter1 = params['filter1']
                filter1_value = params.get('filter1_value', '')
                filtered_obs = _apply_filter(filtered_obs, filter1, filter1_value, params, 'filter1')
            
            # Apply filter2 if specified
            if params.get('filter2'):
                filter2 = params['filter2']
                filter2_value = params.get('filter2_value', '')
                filtered_obs = _apply_filter(filtered_obs, filter2, filter2_value, params, 'filter2')
            
            # Apply param1 range filter if needed
            param1 = params.get('param1')
            filtered_obs = _apply_param_range_filter(filtered_obs, param1, params, 'param1')
            
            # Apply param2 range filter if specified
            param2 = params.get('param2')
            if param2:
                filtered_obs = _apply_param_range_filter(filtered_obs, param2, params, 'param2')
            
            # Group by parameter(s)
            if not param2:
                # Single parameter analysis
                data = _group_by_parameter(filtered_obs, param1, params, 'param1')
            else:
                # Two parameter analysis (cross-tabulation)
                data, debug_info = _group_by_two_parameters(filtered_obs, param1, param2, params)
            
            total = len(filtered_obs)
        
        response_payload = {
            'success': True,
            'data': data,
            'total': total
        }
        # Include SH debug info when present (Local Mode only)
        if not is_cloud_mode() and param2 and param1 and (param1 == 'SH' or param2 == 'SH'):
            response_payload['debug'] = debug_info

        return jsonify(response_payload)
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Analysis error: {str(e)}'
        }), 400


def _apply_filter(observations, param_name, param_value, all_params, prefix):
    """Apply a single filter constraint to observations."""
    result = []
    for obs in observations:
        if _matches_parameter(obs, param_name, param_value, all_params, prefix):
            result.append(obs)
    return result


def _get_timezone_offset(region_code):
    """Calculate timezone offset (in hours) for a geographic region.
    
    Args:
        region_code: Geographic region code (GG field, 1-39)
    
    Returns:
        Hour offset to add to CET to get local time
    """
    try:
        region = int(region_code)
    except (ValueError, TypeError):
        return 0
    
    # Asia regions (15-26)
    if 15 <= region <= 20:
        return 4
    elif 21 <= region <= 26:
        return 7
    
    # Americas regions (27-34)
    elif 27 <= region <= 30:
        return -6
    elif 31 <= region <= 34:
        return -4
    
    # Europe and other regions (1-14, 35-39)
    else:
        return 0


def _extract_sector_letters(sector_str: str) -> list[str]:
    """Return unique sector octant letters (a-h) found in the sector string."""
    if not sector_str:
        return []
    cleaned = []
    for ch in sector_str.lower():
        if 'a' <= ch <= 'h':
            cleaned.append(ch)
    return sorted(set(cleaned))


def _calculate_observation_solar_altitude(obs, observers_list, sh_type='mean'):
    """Calculate solar altitude for an observation.
    
    This is only applicable for sun observations (O=1) with known observer location.
    
    Args:
        obs: Observation object
        observers_list: List of observer records
        sh_type: Altitude calculation type ('min', 'mean', or 'max')
    
    Returns:
        Solar altitude in degrees (integer), or None if not calculable
    """
    # Only calculate for sun observations
    if _int(obs, 'O') != 1:
        return None
    
    # Skip if g=1 (observation outside known sites - location unknown)
    if _int(obs, 'g') == 1:
        return None
    
    # Find observer record valid for this observation date
    observer_kk = str(_int(obs, 'KK')).zfill(2)
    observer_record = None
    
    # Convert observation date to comparable format
    # obs.JJ uses (YEAR_MIN-1900) boundary for 19xx/20xx
    obs_month = _int(obs, 'MM')
    obs_year_2digit = _int(obs, 'JJ')
    obs_year = jj_to_full_year(obs_year_2digit)
    
    # Create sortable seit value for observation: YYYYMM (year*100 + month)
    obs_seit_comparable = obs_year * 100 + obs_month
    
    # Find the observer record for this KK that is valid on this observation date
    # Multiple records per observer - find the latest one with seit <= obs_seit
    candidates = []
    for obs_rec in observers_list:
        if obs_rec['KK'] == observer_kk:
            try:
                seit_parts = obs_rec['seit'].split('/')
                seit_month = int(seit_parts[0])
                seit_year_2digit = int(seit_parts[1])
                seit_year = jj_to_full_year(seit_year_2digit)
                
                # Create sortable seit value for record: YYYYMM
                rec_seit_comparable = seit_year * 100 + seit_month
                
                # Check if this record is valid on the observation date
                if rec_seit_comparable <= obs_seit_comparable:
                    candidates.append((rec_seit_comparable, obs_rec))
            except (ValueError, IndexError):
                pass
    
    if candidates:
        # Use the record with the most recent seit date that is still valid
        candidates.sort(key=lambda x: x[0], reverse=True)
        observer_record = candidates[0][1]
    
    if not observer_record:
        return None
    
    # observer_record is already a dict - pass directly to get_observer_coordinates
    longitude, latitude = get_observer_coordinates(observer_record, _int(obs, 'g'))
    
    # Calculate solar altitude
    # Convert DD (duration in units of 10 minutes) to actual minutes
    # DD=1 means 10 minutes, DD=2 means 20 minutes, etc.
    duration_minutes = _int(obs, 'DD') * 10 if _int(obs, 'DD') >= 0 else 0
    
    altitude = calculate_solar_altitude(
        year=_int(obs, 'JJ'),
        month=_int(obs, 'MM'),
        day=_int(obs, 'TT'),
        hour=_int(obs, 'ZS'),
        minute=_int(obs, 'ZM'),
        duration=duration_minutes,
        longitude=longitude,
        latitude=latitude,
        altitude_type=sh_type,
        gg=_int(obs, 'g')
    )
    
    return altitude


def _apply_param_range_filter(observations, param_name, all_params, prefix):
    """Apply range filter to a parameter."""
    # Special handling for TT (day) - ALWAYS filter by month/year, regardless of range
    if param_name == 'TT':
        month_key = f'{prefix}_month'
        year_key = f'{prefix}_year'
        month = all_params.get(month_key)
        year = all_params.get(year_key)
        
        # TT parameter REQUIRES month and year context
        if month is None or year is None:
            return observations  # Can't filter without month/year
        
        try:
            month = int(month)
            year = int(year)
            # Accept both 2-digit and 4-digit, normalize to 4-digit
            if year < 100:
                year = jj_to_full_year(year)
        except (ValueError, TypeError):
            return observations
        
        # Filter by month and year first (obs['JJ'] is 4-digit)
        filtered = []
        for obs in observations:
            if _int(obs, 'MM') == month and _int(obs, 'JJ') == year:
                filtered.append(obs)
        
        # Then apply day range if specified
        from_key = f'{prefix}_from'
        to_key = f'{prefix}_to'
        if from_key in all_params and to_key in all_params:
            from_val = all_params.get(from_key)
            to_val = all_params.get(to_key)
            if from_val is not None and to_val is not None:
                try:
                    from_val = int(from_val)
                    to_val = int(to_val)
                    result = []
                    for obs in filtered:
                        if from_val <= _int(obs, 'TT') <= to_val:
                            result.append(obs)
                    return result
                except (ValueError, TypeError):
                    pass
        
        return filtered
    
    from_key = f'{prefix}_from'
    to_key = f'{prefix}_to'
    
    # Handle parameters with no range (single values)
    if from_key not in all_params or to_key not in all_params:
        return observations
    
    from_val = all_params.get(from_key)
    to_val = all_params.get(to_key)
    
    if from_val is None or to_val is None:
        return observations
    
    # Convert to appropriate numeric type
    try:
        if param_name == 'ZZ':
            # Time can be float
            from_val = float(from_val)
            to_val = float(to_val)
        elif param_name == 'JJ':
            # Year - accept both 2-digit and 4-digit, normalize to 4-digit
            from_val = int(from_val)
            to_val = int(to_val)
            if from_val < 100:
                from_val = jj_to_full_year(from_val)
            if to_val < 100:
                to_val = jj_to_full_year(to_val)
        else:
            # Most parameters are integers
            from_val = int(from_val)
            to_val = int(to_val)
    except (ValueError, TypeError):
        return observations
    
    # Special handling for different parameter types
    if param_name == 'TT':
        # Day parameter - requires month/year context
        return _apply_tt_range_filter(observations, all_params, prefix)
    elif param_name == 'JJ':
        # Year parameter - obs['JJ'] is 4-digit, from_val/to_val are 4-digit
        result = []
        
        # Handle year ranges that cross century boundary
        if from_val > to_val:
            # Range wraps (e.g., 2070-2079 then 1980-1990)
            for obs in observations:
                val = _int(obs, param_name, -1)
                if val != -1 and (from_val <= val <= YEAR_MAX or YEAR_MIN <= val <= to_val):
                    result.append(obs)
        else:
            # Normal range
            for obs in observations:
                val = _int(obs, param_name, -1)
                if val != -1 and from_val <= val <= to_val:
                    result.append(obs)
        
        return result
    elif param_name == 'ZZ':
        # Time parameter - from/to are hours (0-23 or float)
        # Note: ZZ refers to ZS (hour) field in the observation model
        # Observations are stored in CET, but may need conversion to local time
        
        # Check if timezone conversion is needed
        timezone_key = f'{prefix}_timezone'
        use_local = all_params.get(timezone_key) == 'local'
        
        result = []
        for obs in observations:
            zz = _int(obs, 'ZS')
            
            # If local time requested, convert from CET to observer's local time
            if use_local:
                # Get observer's region to determine timezone offset
                # GG contains the geographic region code
                region_code = _int(obs, 'GG')
                
                # Calculate timezone offset based on region
                # This is a simplified approach - in reality, timezones are complex
                # For now, we'll use rough approximations based on longitude
                # Europe regions (1-14): mostly CET (offset = 0)
                # Asia regions (15-26): UTC+5 to UTC+9 (offset = +4 to +8 from CET)
                # Americas regions (27-34): UTC-5 to UTC-8 (offset = -6 to -9 from CET)
                # Other regions: assume CET
                
                offset = 0
                if 15 <= region_code <= 20:  # West/Central Asia
                    offset = 4  # Roughly UTC+5 = CET+4
                elif 21 <= region_code <= 26:  # East Asia
                    offset = 7  # Roughly UTC+8 = CET+7
                elif 27 <= region_code <= 30:  # North America
                    offset = -6  # Roughly UTC-6 = CET-7
                elif 31 <= region_code <= 34:  # South America
                    offset = -4  # Roughly UTC-3 = CET-4
                
                # Apply offset (with wraparound for 24-hour clock)
                zz = (zz + offset) % 24
            
            if from_val <= zz <= to_val:
                result.append(obs)
        return result
    elif param_name == 'SH':
        # Solar altitude parameter - must be calculated on-the-fly
        # Only applicable for sun observations (O=1) at known observer locations (g != 1)
        observers = current_app.config.get('OBSERVERS', [])
        
        result = []
        for obs in observations:
            # Filter out observations that can't have solar altitude calculated
            if _int(obs, 'O') != 1 or _int(obs, 'g') == 1:
                continue
            
            sh_type = all_params.get('sh_type', 'mean')
            altitude = _calculate_observation_solar_altitude(obs, observers, sh_type)
            if altitude is not None and from_val <= altitude <= to_val:
                result.append(obs)
        
        return result
    elif param_name == 'HO_HU':
        # Pillar height parameter - check both HO and HU values
        result = []
        for obs in observations:
            ho = _int(obs, 'HO', -1)
            hu = _int(obs, 'HU', -1)
            # Include observation if either HO or HU is in range
            if (ho != -1 and from_val <= ho <= to_val) or \
               (hu != -1 and from_val <= hu <= to_val):
                result.append(obs)
        return result
    else:
        # Numeric range parameters
        result = []
        for obs in observations:
            val = _int(obs, param_name, -1)
            if val != -1 and from_val <= val <= to_val:
                result.append(obs)
        return result


def _apply_tt_range_filter(observations, all_params, prefix):
    """Apply day range filter to TT parameter with month/year context."""
    month_key = f'{prefix}_month'
    year_key = f'{prefix}_year'
    from_key = f'{prefix}_from'
    to_key = f'{prefix}_to'
    
    month = all_params.get(month_key)
    year = all_params.get(year_key)
    day_from = all_params.get(from_key)
    day_to = all_params.get(to_key)
    
    # If any required parameter is missing, don't filter
    if month is None or year is None or day_from is None or day_to is None:
        return observations
    
    try:
        month = int(month)
        year = int(year)
        day_from = int(day_from)
        day_to = int(day_to)
        
        # Convert 4-digit year to 2-digit if needed
        if year >= 1900:
            year = year % 100
    except (ValueError, TypeError):
        return observations
    
    result = []
    for obs in observations:
        # Only include observations from the specified month and year, within day range
        if _int(obs, 'MM') == month and _int(obs, 'JJ') == year:
            if day_from <= _int(obs, 'TT') <= day_to:
                result.append(obs)
    
    return result


def _matches_parameter(obs, param_name, param_value, all_params, prefix):
    """Check if observation matches a parameter filter value."""
    # Special handling for TT (day) - requires month and year context
    if param_name == 'TT':
        # Day parameter requires month and year to be meaningful
        month_key = f'{prefix}_month'
        year_key = f'{prefix}_year'
        filter_month = all_params.get(month_key)
        filter_year = all_params.get(year_key)
        
        # If month/year not provided, can't match properly
        if filter_month is None or filter_year is None:
            return False
        
        try:
            filter_day = int(param_value)
            filter_month = int(filter_month)
            filter_year = int(filter_year)
            
            # Convert 4-digit year to 2-digit if needed
            if filter_year >= 1900:
                filter_year = filter_year % 100
            
            # Match all three: day, month, year
            return (_int(obs, 'TT') == filter_day and 
                    _int(obs, 'MM') == filter_month and 
                    _int(obs, 'JJ') == filter_year)
        except (ValueError, TypeError):
            return False
    
    # Get the parameter value from observation
    # Special handling for ZZ (time) - use ZS (hour) field
    if param_name == 'ZZ':
        obs_value = _int(obs, 'ZS', -1)
        if obs_value == -1:
            obs_value = None
        # Apply timezone conversion if needed
        if obs_value is not None:
            timezone_key = f'{prefix}_timezone'
            use_local = all_params.get(timezone_key) == 'local'
            if use_local:
                region_code = _int(obs, 'GG')
                offset = _get_timezone_offset(region_code)
                obs_value = (obs_value + offset) % 24
    elif param_name == 'SH':
        # Solar altitude - must be calculated (only for sun observations at known locations)
        if _int(obs, 'O') != 1 or _int(obs, 'g') == 1:
            obs_value = None
        else:
            observers = current_app.config.get('OBSERVERS', [])
            sh_type = all_params.get('sh_type', 'mean')
            obs_value = _calculate_observation_solar_altitude(obs, observers, sh_type)
    elif param_name == 'SE':
        # Sectors: check if the filter octant letter is present in the sectors string
        sector_letters = _extract_sector_letters(obs.get('sectors', ''))
        # param_value should be a single letter a-h
        return param_value.lower() in sector_letters
    else:
        obs_value = obs.get(param_name)
    
    if obs_value is None:
        return False
    
    # Convert param_value to appropriate type for comparison
    try:
        if param_name in ['MM', 'JJ', 'ZZ', 'SH', 'KK', 'GG', 'O', 'f', 'd', 'EE', 'DD', 'H', 'F', 'V', 'zz']:
            # Most parameters are integers (note: TT handled above)
            # obs_value from obs.get() is a string - convert to int for comparison
            obs_int = _int(obs, param_name, -1)
            if obs_int == -1:
                return False
            if param_name == 'ZZ':
                # Time can be float
                param_value = float(param_value)
                return obs_int == param_value
            elif param_name == 'JJ':
                # Year - convert 4-digit to 2-digit (1988 -> 88)
                param_value = int(param_value)
                if param_value >= 1900:
                    param_value = param_value % 100
            else:
                param_value = int(param_value)
            return obs_int == param_value
    except (ValueError, TypeError):
        return False
    
    # For composite parameters, handle special cases
    if param_name == 'C':
        # Completeness can have split option
        split_key = f'{prefix}_c_split'
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        if all_params.get(split_key):
            # When split, compare the full C value
            return _int(obs, 'C', -1) == param_value
        else:
            # When not split, compare without suffix
            return str(_int(obs, 'C', -1)).rstrip('+') == str(param_value)
    
    elif param_name == 'EE':
        # Halo type can have split option
        split_key = f'{prefix}_ee_split'
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        if all_params.get(split_key):
            return _int(obs, 'EE', -1) == param_value
        else:
            return str(_int(obs, 'EE', -1)).rstrip('*') == str(param_value)
    
    elif param_name == 'HO_HU':
        # Match if either HO or HU equals the requested height (only valid when >=0)
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        ho = _int(obs, 'HO', -1)
        hu = _int(obs, 'HU', -1)
        ho_match = ho != -1 and ho >= 0 and ho == param_value
        hu_match = hu != -1 and hu >= 0 and hu == param_value
        return ho_match or hu_match

    elif param_name == 'DD':
        # Duration with incomplete option
        incomplete_key = f'{prefix}_dd_incomplete'
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        if all_params.get(incomplete_key):
            # Include all observations
            return True
        else:
            # Exclude observations with kA or kE
            dd_val = obs.get('DD')
            return dd_val is not None and dd_val not in ['kA', 'kE', '', '-1']
    
    return obs_value == param_value


def _group_by_parameter(observations, param_name, all_params, prefix):
    """Group observations by a single parameter and return counts."""
    
    groups = defaultdict(int)
    
    # Check if timezone conversion is needed for ZZ parameter
    timezone_key = f'{prefix}_timezone'
    use_local = all_params.get(timezone_key) == 'local' and param_name == 'ZZ'
    
    # Check if we need observer data for SH calculation
    observers = None
    if param_name == 'SH':
        observers = current_app.config.get('OBSERVERS', [])
    
    for obs in observations:
        # Get parameter value from observation
        # Special handling for TT (day) - observations are already filtered by month/year in _apply_param_range_filter
        if param_name == 'TT':
            # Just use the day value directly - filtering by month/year already done
            value = _int(obs, 'TT')
        # Special handling for ZZ (time) - use ZS (hour) field
        elif param_name == 'ZZ':
            value = _int(obs, 'ZS', -1)
            if value == -1:
                value = None
            
            # Apply timezone conversion if needed
            if value is not None and use_local:
                region_code = _int(obs, 'GG')
                offset = _get_timezone_offset(region_code)
                value = (value + offset) % 24
        elif param_name == 'SH':
            # Solar altitude - must be calculated (only for sun observations at known locations)
            if _int(obs, 'O') != 1 or _int(obs, 'g') == 1:
                value = None
            else:
                sh_type = all_params.get('sh_type', 'mean')
                value = _calculate_observation_solar_altitude(obs, observers, sh_type)
        elif param_name == 'HO_HU':
            # Light pillar heights: count both HO and HU if present (>=0)
            ho = _int(obs, 'HO', -1)
            hu = _int(obs, 'HU', -1)
            added = False
            if ho >= 0:
                groups[str(ho)] += 1
                added = True
            if hu >= 0:
                groups[str(hu)] += 1
                added = True
            value = None if added else None
        elif param_name == 'C':
            # Cirrus type with split option
            value = obs.get('C')
            split_key = f'{prefix}_c_split'
            if value is not None and all_params.get(split_key):
                # When split is enabled, expand C4/C5/C6/C7 into components
                c_value = int(value) if isinstance(value, (int, str)) else value
                if c_value == 4:  # C4 (Ci + Cc) → count as both C1 and C2
                    groups['1'] += 1
                    groups['2'] += 1
                    value = None  # Don't count again below
                elif c_value == 5:  # C5 (Ci + Cs) → count as both C1 and C3
                    groups['1'] += 1
                    groups['3'] += 1
                    value = None  # Don't count again below
                elif c_value == 6:  # C6 (Cc + Cs) → count as both C2 and C3
                    groups['2'] += 1
                    groups['3'] += 1
                    value = None  # Don't count again below
                elif c_value == 7:  # C7 (Ci + Cc + Cs) → count as C1, C2, and C3
                    groups['1'] += 1
                    groups['2'] += 1
                    groups['3'] += 1
                    value = None  # Don't count again below
        elif param_name == 'EE':
            # Halo type with split option
            value = obs.get('EE')
            split_key = f'{prefix}_ee_split'
            if value is not None and all_params.get(split_key):
                # When split is enabled, expand combined halo types into components
                ee_value = int(value) if isinstance(value, (int, str)) else value
                if ee_value in COMBINED_TO_INDIVIDUAL_HALOS:
                    left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee_value]
                    groups[str(left)] += 1
                    groups[str(right)] += 1
                    value = None  # Don't count again below
        elif param_name == 'SE':
            # Sectors: count octants present or visible
            # V=2 (complete halo) + circular halo type: all segments a-h are visible
            # V=1 (incomplete halo) OR non-circular: only explicitly listed segments are visible
            # No segments: "nicht zutreffend" - skip this observation entirely
            v = _int(obs, 'V', -1)
            ee = _int(obs, 'EE', -1)
            
            # Check if this is a circular halo type
            is_circular = ee in CIRCULAR_HALOS if ee != -1 else False
            
            if v == 2 and is_circular:
                # Complete circular halo: count all segments a-h
                sector_letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
            else:
                # Incomplete halo or non-circular: extract explicit sectors
                sector_letters = _extract_sector_letters(obs.get('sectors', ''))
            
            # Only count observations that have sectors (skip "nicht zutreffend")
            for letter in sector_letters:
                groups[letter] += 1
            continue  # Skip further processing for this observation
        else:
            value = obs.get(param_name)
        
        # Use unformatted key for grouping to avoid duplicates
        if value is None:
            if param_name in ['C', 'EE', 'HO_HU']:
                # For split/combined parameters, component values may already be counted
                pass
            else:
                group_key = '__none__'  # language-neutral sentinel for "not observed"
                groups[group_key] += 1
        else:
            group_key = str(value)  # Keep numeric/raw value for grouping
            groups[group_key] += 1
    
    # Generate all values in the range if range is specified
    result = dict(groups)
    
    # Skip range expansion for non-numeric sectors parameter
    if param_name != 'SE':
        # Get range from parameters
        from_key = f'{prefix}_from'
        to_key = f'{prefix}_to'
        
        if from_key in all_params and to_key in all_params:
            from_val = all_params[from_key]
            to_val = all_params[to_key]
            
            if from_val is not None and to_val is not None:
                try:
                    from_val = int(from_val) if from_val else None
                    to_val = int(to_val) if to_val else None
                    
                    if from_val is not None and to_val is not None:
                        # Generate all values in range (handling century boundary for JJ)
                        range_values = []
                        
                        if param_name == 'TT':
                            # Day parameter - generate ALL days in the month (1 to max_day)
                            # Get the number of days in the specified month
                            month_key = f'{prefix}_month'
                            year_key = f'{prefix}_year'
                            month = all_params.get(month_key)
                            year = all_params.get(year_key)
                            
                            if month is not None and year is not None:
                                try:
                                    month = int(month)
                                    year = int(year)
                                    # Convert 2-digit year to 4-digit for calendar
                                    year = jj_to_full_year(year)
                                    
                                    # Get max days in this month
                                    max_day = calendar.monthrange(year, month)[1]
                                    
                                    # Generate all days in month (1 to max_day)
                                    range_values = list(range(1, max_day + 1))
                                except (ValueError, TypeError):
                                    # Fallback to 1-31
                                    range_values = list(range(1, 32))
                            else:
                                # No month/year context, generate 1-31
                                range_values = list(range(1, 32))
                        elif param_name == 'JJ':
                            # Year - from_val/to_val are already 4-digit
                            from_year = jj_to_full_year(from_val)
                            to_year = jj_to_full_year(to_val)
                            
                            # Generate range with 4-digit years
                            if from_year > to_year:
                                # Century boundary case (wrap across YEAR_MAX/YEAR_MIN)
                                range_values = list(range(from_year, YEAR_MAX + 1)) + list(range(YEAR_MIN, to_year + 1))
                            else:
                                # Normal case
                                range_values = list(range(from_year, to_year + 1))
                        else:
                            # Regular numeric range
                            range_values = list(range(from_val, to_val + 1))
                        
                        # Add missing values with count 0
                        for val in range_values:
                            str_val = str(val)
                            if str_val not in result:
                                result[str_val] = 0
                except (ValueError, TypeError):
                    pass
    
    # Sort keys intelligently (before formatting)
    def numeric_sort_key(item):
        key = item[0]
        if key == '__none__':
            return (0, float('-inf'))  # Sort to beginning
        try:
            return (1, float(key))  # Sort numerically
        except (ValueError, TypeError):
            return (2, key)  # Non-numeric at end
    
    # Apply numeric sorting for all parameters (numeric parameters sort numerically, others alphabetically)
    result = dict(sorted(result.items(), key=numeric_sort_key))
    
    # Remove combined types when split is enabled (they will have 0 counts)
    if param_name == 'C' and all_params.get(f'{prefix}_c_split'):
        # Remove C4, C5, C6, C7 (combined cirrus types)
        for combined_c in ['4', '5', '6', '7']:
            result.pop(combined_c, None)
    elif param_name == 'EE' and all_params.get(f'{prefix}_ee_split'):
        # Remove combined halo types
        for combined_ee in COMBINED_TO_INDIVIDUAL_HALOS.keys():
            result.pop(str(combined_ee), None)
    
    # Format values for display - return as ordered list to preserve sort order in JSON
    formatted_result = [
        {"key": key, "count": count}
        for key, count in result.items()
    ]
    
    return formatted_result


def _group_by_two_parameters(observations, param1_name, param2_name, all_params):
    """Group observations by two parameters and return cross-tabulation."""
    
    # Create nested structure for cross-tab
    groups = defaultdict(lambda: defaultdict(int))
    
    # Check if we need observer data for SH calculation
    observers = None
    if param1_name == 'SH' or param2_name == 'SH':
        observers = current_app.config.get('OBSERVERS', [])

    # Debug counters for SH and HO_HU calculations
    hohu_debug = {
        'processed': 0,
        'samples': []
    }
    sh_debug = {
        'param1_attempts': 0,
        'param1_none': 0,
        'param2_attempts': 0,
        'param2_none': 0,
    }
    
    for obs in observations:
        # Get values for both parameters
        # Special handling for ZZ (time) - use ZS (hour) field
        if param1_name == 'ZZ':
            val1 = _int(obs, 'ZS', -1)
            # ZS=-1 means time not specified - skip this observation for time analysis
            if val1 == -1:
                continue
        elif param1_name == 'SH':
            if _int(obs, 'O') != 1 or _int(obs, 'g') == 1:
                val1 = None
                sh_debug['param1_none'] += 1
            else:
                sh_type = all_params.get('sh_type', 'mean')
                val1 = _calculate_observation_solar_altitude(obs, observers, sh_type)
                sh_debug['param1_attempts'] += 1
                if val1 is None:
                    sh_debug['param1_none'] += 1
        else:
            val1 = obs.get(param1_name)
        
        if param2_name == 'ZZ':
            val2 = _int(obs, 'ZS', -1)
            # ZS=-1 means time not specified - skip this observation for time analysis
            if val2 == -1:
                continue
        elif param2_name == 'SH':
            if _int(obs, 'O') != 1 or _int(obs, 'g') == 1:
                val2 = None
                sh_debug['param2_none'] += 1
            else:
                sh_type = all_params.get('sh_type', 'mean')
                val2 = _calculate_observation_solar_altitude(obs, observers, sh_type)
                sh_debug['param2_attempts'] += 1
                if val2 is None:
                    sh_debug['param2_none'] += 1
        else:
            val2 = obs.get(param2_name)
        
        # Apply timezone conversion for time parameters if needed
        if param1_name == 'ZZ' and val1 is not None:
            use_local = all_params.get('param1_timezone') == 'local'
            if use_local:
                region_code = _int(obs, 'GG')
                offset = _get_timezone_offset(region_code)
                val1 = (val1 + offset) % 24
        
        if param2_name == 'ZZ' and val2 is not None:
            use_local = all_params.get('param2_timezone') == 'local'
            if use_local:
                region_code = _int(obs, 'GG')
                offset = _get_timezone_offset(region_code)
                val2 = (val2 + offset) % 24
        
        # Handle C (cirrus) splitting for param1
        if param1_name == 'SE':
            # DEFECT: Es gibt kleine Abweichungen zwischen Local Mode und Cloud Mode
            # bei Sektoren-Zählung (z.B. 'c': 66197 vs 66193, Differenz: 4 Beobachtungen)
            # Vermutlich unterschiedliches Whitespace-Handling zwischen Python regex
            # und PostgreSQL regexp_split_to_table. Muss später untersucht werden.
            # 
            # Sectors: count octants present or visible
            # V=2 + circular halo type: all 8 segments a-h are visible
            # V=1 + circular halo type: parse sectors field
            # Non-circular halos: should NOT have sectors (would be error)
            v = _int(obs, 'V', -1)
            ee = _int(obs, 'EE', -1)
            
            # Check if this is a circular halo type
            is_circular = ee in CIRCULAR_HALOS if ee != -1 else False
            
            if is_circular:
                if v == 2:
                    # V=2 + circular: all 8 segments visible
                    val1_list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
                elif v == 1:
                    # V=1 + circular: parse sectors field
                    sector_letters = _extract_sector_letters(obs.get('sectors', ''))
                    val1_list = sector_letters if sector_letters else []
                else:
                    # Other V values: skip
                    val1_list = []
            else:
                # Non-circular halos: no sectors
                val1_list = []
        elif param1_name == 'HO_HU':
            ho = _int(obs, 'HO', -1)
            hu = _int(obs, 'HU', -1)
            val1_list = []
            if ho >= 0:
                val1_list.append(str(ho))
            if hu >= 0:
                val1_list.append(str(hu))
            if not val1_list:
                val1_list = ['__none__']
            if len(hohu_debug['samples']) < 5:
                hohu_debug['samples'].append({'obs': obs.get('KK'), 'ho': ho, 'hu': hu, 'val1_list': list(val1_list)})
            hohu_debug['processed'] += 1
        elif param1_name == 'C' and val1 is not None and all_params.get('param1_c_split'):
            c_value = int(val1) if isinstance(val1, (int, str)) else val1
            if c_value == 4:  # C4 (Ci + Cc) → count as both C1 and C2
                val1_list = ['1', '2']
            elif c_value == 5:  # C5 (Ci + Cs) → count as both C1 and C3
                val1_list = ['1', '3']
            elif c_value == 6:  # C6 (Cc + Cs) → count as both C2 and C3
                val1_list = ['2', '3']
            elif c_value == 7:  # C7 (Ci + Cc + Cs) → count as C1, C2, and C3
                val1_list = ['1', '2', '3']
            else:
                val1_list = [str(c_value)]
        # Handle EE (halo) splitting for param1
        elif param1_name == 'EE' and val1 is not None and all_params.get('param1_ee_split'):
            ee_value = int(val1) if isinstance(val1, (int, str)) else val1
            if ee_value in COMBINED_TO_INDIVIDUAL_HALOS:
                left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee_value]
                val1_list = [str(left), str(right)]
            else:
                val1_list = [str(ee_value)]
        else:
            val1_list = [str(val1) if val1 is not None else '__none__']
        
        # Handle C (cirrus) splitting for param2
        if param2_name == 'SE':
            # Sectors: count octants present or visible
            # V=2 + circular halo type: all 8 segments a-h are visible
            # V=1 + circular halo type: parse sectors field
            # Non-circular halos: should NOT have sectors (would be error)
            v = _int(obs, 'V', -1)
            ee = _int(obs, 'EE', -1)
            
            # Check if this is a circular halo type
            is_circular = ee in CIRCULAR_HALOS if ee != -1 else False
            
            if is_circular:
                if v == 2:
                    # V=2 + circular: all 8 segments visible
                    val2_list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
                elif v == 1:
                    # V=1 + circular: parse sectors field
                    sector_letters = _extract_sector_letters(obs.get('sectors', ''))
                    val2_list = sector_letters if sector_letters else []
                else:
                    # Other V values: skip
                    val2_list = []
            else:
                # Non-circular halos: no sectors
                val2_list = []
        elif param2_name == 'HO_HU':
            ho = _int(obs, 'HO', -1)
            hu = _int(obs, 'HU', -1)
            val2_list = []
            if ho >= 0:
                val2_list.append(str(ho))
            if hu >= 0:
                val2_list.append(str(hu))
            if not val2_list:
                val2_list = ['__none__']
            if param1_name != 'HO_HU' and len(hohu_debug['samples']) < 5:
                hohu_debug['samples'].append({'obs': obs.get('KK'), 'ho': ho, 'hu': hu, 'val2_list': list(val2_list)})
            hohu_debug['processed'] += 1
        elif param2_name == 'C' and val2 is not None and all_params.get('param2_c_split'):
            c_value = int(val2) if isinstance(val2, (int, str)) else val2
            if c_value == 4:  # C4 (Ci + Cc) → count as both C1 and C2
                val2_list = ['1', '2']
            elif c_value == 5:  # C5 (Ci + Cs) → count as both C1 and C3
                val2_list = ['1', '3']
            elif c_value == 6:  # C6 (Cc + Cs) → count as both C2 and C3
                val2_list = ['2', '3']
            elif c_value == 7:  # C7 (Ci + Cc + Cs) → count as C1, C2, and C3
                val2_list = ['1', '2', '3']
            else:
                val2_list = [str(c_value)]
        # Handle EE (halo) splitting for param2
        elif param2_name == 'EE' and val2 is not None and all_params.get('param2_ee_split'):
            ee_value = int(val2) if isinstance(val2, (int, str)) else val2
            if ee_value in COMBINED_TO_INDIVIDUAL_HALOS:
                left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee_value]
                val2_list = [str(left), str(right)]
            else:
                val2_list = [str(ee_value)]
        else:
            val2_list = [str(val2) if val2 is not None else '__none__']
        
        # Count all combinations
        for v1 in val1_list:
            for v2 in val2_list:
                groups[v1][v2] += 1

    # Debug: summarize HO_HU counts before range expansion
    if (param1_name == 'HO_HU' or param2_name == 'HO_HU'):
        hohu_total = 0
        hohu_rows = []
        for k1, inner in groups.items():
            for k2, cnt in inner.items():
                hohu_total += cnt
                if len(hohu_rows) < 5 and cnt > 0:
                    hohu_rows.append((k1, k2, cnt))
    
    # Generate all values for param1 range FIRST
    # Only fill ranges for parameters where all values in range are meaningful
    param1_from_key = 'param1_from'
    param1_to_key = 'param1_to'
    param1_range_values = []
    
    # Parameters that support complete range filling (every value exists/is meaningful)
    rangeable_params = ['ZZ', 'MM', 'TT', 'JJ', 'DD', 'C', 'dd', 'SH', 'EE', 'GG', 'KK', 'HO_HU']
    
    if param1_name in rangeable_params and param1_from_key in all_params and param1_to_key in all_params:
        from_val = all_params[param1_from_key]
        to_val = all_params[param1_to_key]
        
        i18n = get_i18n()
        if from_val is not None and to_val is not None:
            try:
                from_val = int(from_val) if from_val else None
                to_val = int(to_val) if to_val else None
                
                if from_val is not None and to_val is not None:
                    if param1_name == 'JJ':
                        # Year - values are already 4-digit (jj_to_full_year is a safe no-op)
                        from_year = jj_to_full_year(from_val)
                        to_year = jj_to_full_year(to_val)
                        if from_year > to_year:
                            param1_range_values = list(range(from_year, YEAR_MAX + 1)) + list(range(YEAR_MIN, to_year + 1))
                        else:
                            param1_range_values = list(range(from_year, to_year + 1))
                    elif param1_name == 'EE':
                        # Halo types - only those defined in i18n
                        valid_ee = set(int(k) for k in i18n.strings['halo_types'].keys())
                        param1_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_ee:
                                param1_range_values.append(val)
                    elif param1_name == 'GG':
                        # Geographic regions - only those defined in i18n
                        valid_gg = set(int(k) for k in i18n.strings['geographic_regions'].keys())
                        param1_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_gg:
                                param1_range_values.append(val)
                    elif param1_name == 'KK':
                        # Observers - show all that exist in observer database, regardless of observations
                        observers = current_app.config.get('OBSERVERS', [])
                        existing_kk = sorted(set(int(obs['KK']) for obs in observers))
                        param1_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in existing_kk:
                                param1_range_values.append(val)
                    else:
                        param1_range_values = list(range(from_val, to_val + 1))
            except (ValueError, TypeError):
                pass
    
    # Generate all values for param2 range
    param2_from_key = 'param2_from'
    param2_to_key = 'param2_to'
    param2_range_values = []
    
    if param2_name in rangeable_params and param2_from_key in all_params and param2_to_key in all_params:
        from_val = all_params[param2_from_key]
        to_val = all_params[param2_to_key]
        
        if from_val is not None and to_val is not None:
            try:
                from_val = int(from_val) if from_val else None
                to_val = int(to_val) if to_val else None
                
                if from_val is not None and to_val is not None:
                    if param2_name == 'JJ':
                        # Year - values are already 4-digit (jj_to_full_year is a safe no-op)
                        from_year = jj_to_full_year(from_val)
                        to_year = jj_to_full_year(to_val)
                        if from_year > to_year:
                            param2_range_values = list(range(from_year, YEAR_MAX + 1)) + list(range(YEAR_MIN, to_year + 1))
                        else:
                            param2_range_values = list(range(from_year, to_year + 1))
                    elif param2_name == 'EE':
                        # Halo types - only those defined in i18n
                        valid_ee = set(int(k) for k in i18n.strings['halo_types'].keys())
                        param2_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_ee:
                                param2_range_values.append(val)
                    elif param2_name == 'GG':
                        # Geographic regions - only those defined in i18n
                        valid_gg = set(int(k) for k in i18n.strings['geographic_regions'].keys())
                        param2_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_gg:
                                param2_range_values.append(val)
                    elif param2_name == 'KK':
                        # Observers - show all that exist in observer database, regardless of observations
                        observers = current_app.config.get('OBSERVERS', [])
                        existing_kk = sorted(set(int(obs['KK']) for obs in observers))
                        param2_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in existing_kk:
                                param2_range_values.append(val)
                    else:
                        param2_range_values = list(range(from_val, to_val + 1))
            except (ValueError, TypeError):
                pass
    
    # Build complete result table with pre-initialization strategy
    # Step 1: Determine which param1 and param2 values to include
    
    # Convert param1_range_values to string keys for display
    param1_values_to_show = []
    if param1_range_values:
        param1_values_to_show = [str(v) for v in param1_range_values]
    else:
        # Use all param1 values that appear in observations
        param1_values_to_show = sorted(groups.keys())
    
    # Collect all param2 values from observations
    param2_from_observations = set()
    for p1_val in groups:
        param2_from_observations.update(groups[p1_val].keys())
    
    # Determine param2 values to show
    param2_values_to_show = []
    if param2_range_values:
        param2_values_to_show = [str(v) for v in param2_range_values]
    else:
        # Use all param2 values that appear in observations
        param2_values_to_show = sorted(param2_from_observations)
    
    # Step 2: Initialize result table with all param1 × param2 combinations = 0
    result = {}
    for p1_val in param1_values_to_show:
        result[p1_val] = {}
        for p2_val in param2_values_to_show:
            result[p1_val][p2_val] = 0
    
    # Step 3: Fill in counts from groups
    for p1_val in groups:
        if p1_val not in result:
            # This shouldn't happen if we set up param1_values_to_show correctly
            result[p1_val] = {}
        for p2_val in groups[p1_val]:
            if p2_val not in result[p1_val]:
                # This shouldn't happen if we set up param2_values_to_show correctly
                result[p1_val][p2_val] = 0
            result[p1_val][p2_val] = groups[p1_val][p2_val]
    
    # Remove combined types when split is enabled (they will have 0 counts)
    # For param1
    if param1_name == 'C' and all_params.get('param1_c_split'):
        for combined_c in ['4', '5', '6', '7']:
            result.pop(combined_c, None)
    elif param1_name == 'EE' and all_params.get('param1_ee_split'):
        for combined_ee in COMBINED_TO_INDIVIDUAL_HALOS.keys():
            result.pop(str(combined_ee), None)
    
    # For param2
    if param2_name == 'C' and all_params.get('param2_c_split'):
        combined_c_list = ['4', '5', '6', '7']
        for param1_val in result:
            for combined_c in combined_c_list:
                result[param1_val].pop(combined_c, None)
    elif param2_name == 'EE' and all_params.get('param2_ee_split'):
        combined_ee_list = [str(k) for k in COMBINED_TO_INDIVIDUAL_HALOS.keys()]
        for param1_val in result:
            for combined_ee in combined_ee_list:
                result[param1_val].pop(combined_ee, None)

    # Emit debug info for SH calculations to diagnose empty tables
    if (param1_name == 'SH' or param2_name == 'SH'):
        if current_app and current_app.logger:
            current_app.logger.debug(
                "SH debug: param1_attempts=%s param1_none=%s param2_attempts=%s param2_none=%s",
                sh_debug['param1_attempts'],
                sh_debug['param1_none'],
                sh_debug['param2_attempts'],
                sh_debug['param2_none']
            )
        # Also print to stdout in case logger level filters debug
        try:
            print(
                f"SH debug: param1_attempts={sh_debug['param1_attempts']} param1_none={sh_debug['param1_none']} "
                f"param2_attempts={sh_debug['param2_attempts']} param2_none={sh_debug['param2_none']}"
            )
        except Exception:
            pass

    return result, sh_debug

