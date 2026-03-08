"""Statistics API endpoints (monthly report, monthly/annual stats).

Routes: /monthly-report, /monthly-stats, /annual-stats

Includes helper functions for text/markdown formatting and chart generation.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

import io
import os
from typing import Dict, Any

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from flask import jsonify, request, current_app, Response, g

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.models.constants import YEAR_MIN, jj_to_full_year, resolve_halo_type, calculate_halo_activity
from halo.resources.i18n import get_i18n
import halo.io.observations_db as obs_db
import halo.io.observers_db as observer_db
from ._helpers import _int, _obs_to_json, _kurzausgabe, _parse_seit, get_days_in_month


def _format_monthly_report_text(data: Dict[str, Any], i18n) -> str:
    """Format monthly report as pseudographic text with box-drawing characters.
    
    Ported from monthly_report.js buildPseudografikReport() function.
    """
    # Use i18n month names
    month_name = i18n.get(f'months.{data["mm"]}', str(data['mm']))
    
    # Format title
    year = jj_to_full_year(data['jj'])
    title = i18n.get('monthly_report.report_title_template')
    title = title.replace('{observer}', data['observer_name'])
    title = title.replace('{month}', month_name)
    title = title.replace('{year}', str(year))
    
    lines = []
    
    # Header box
    title_pad_left = (122 - len(title)) // 2
    lines.append(' ' * title_pad_left + title)
    lines.append(' ' * title_pad_left + '═' * len(title))
    lines.append('')
    lines.append('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗')
    
    sectors = i18n.get('fields.sectors')
    remarks = i18n.get('fields.remarks')
    header_line = f"KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH {sectors.ljust(15)[:15]} {remarks.ljust(47)[:47]}"
    lines.append('║ ' + header_line[:118].ljust(118) + ' ║')
    lines.append('╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣')
    
    # Observations
    last_day = -1
    observations = data.get('observations', [])
    
    for obs in observations:
        # Add separator line between different days
        obs_tt = _int(obs, 'TT')
        if last_day != -1 and obs_tt != last_day:
            lines.append('╟────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╢')
        
        try:
            obs_line = _kurzausgabe(obs)
            lines.append('║ ' + obs_line + ' ║')
        except Exception as e:
            lines.append('║ ERROR formatting observation                                                                                           ║')
        
        last_day = obs_tt
    
    # No observations message
    if len(observations) == 0:
        no_obs_msg = i18n.get('messages.no_observations')
        padding = (118 - len(no_obs_msg)) // 2
        lines.append('║' + ' ' * 120 + '║')
        lines.append('║' + ' ' * padding + no_obs_msg + ' ' * (120 - padding - len(no_obs_msg)) + '║')
        lines.append('║' + ' ' * 120 + '║')
    
    # Footer
    lines.append('╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣')
    
    hb_line = i18n.get('observers.table_primary_site') + ': ' + data['observer_hbort']
    nb_line = i18n.get('observers.table_secondary_site') + ': ' + data['observer_nbort']
    hb_pad_left = (122 - len(hb_line)) // 2
    nb_pad_left = (122 - len(nb_line)) // 2
    hb_line = ' ' * hb_pad_left + hb_line
    nb_line = ' ' * nb_pad_left + nb_line
    
    lines.append('║' + hb_line[:118].ljust(120) + '║')
    lines.append('║' + nb_line[:118].ljust(120) + '║')
    lines.append('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝')
    
    return '\n'.join(lines)


def _format_monthly_report_markdown(data: Dict[str, Any], i18n) -> str:
    """Format monthly report as markdown.
    
    Ported from monthly_report.js buildMarkdownSource() function.
    """
    # Use i18n month names
    month_name = i18n.get(f'months.{data["mm"]}', str(data['mm']))
    
    # Format title
    year = jj_to_full_year(data['jj'])
    title = i18n.get('monthly_report.report_title_template')
    title = title.replace('{observer}', data['observer_name'])
    title = title.replace('{month}', month_name)
    title = title.replace('{year}', str(year))
    
    md = f"# {title}\n\n"
    
    # Header line (HALO key format) with fixed padding to align columns
    md += '```\n'
    sectors_label = i18n.get('fields.sectors')
    remarks_label = i18n.get('fields.remarks')
    header_line = f"KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH {sectors_label.ljust(15)[:15]} {remarks_label.ljust(47)[:47]}"
    md += header_line + '\n'
    md += '```\n\n'
    
    # Observations using kurzausgabe format
    observations = data.get('observations', [])
    
    if len(observations) == 0:
        no_obs_msg = i18n.get('messages.no_observations')
        md += f"**{no_obs_msg}**\n\n"
    else:
        md += '```\n'
        
        for obs in observations:
            line = _kurzausgabe(obs)
            md += line + '\n'
        
        md += '```\n\n'
    
    # Footer with observer locations
    md += f"## {i18n.get('observers.table_primary_site')}\n"
    md += f"{data['observer_hbort']}\n\n"
    md += f"## {i18n.get('observers.table_secondary_site')}\n"
    md += f"{data['observer_nbort']}\n"
    
    return md


@api_blueprint.route('/monthly-report', methods=['GET'])
def get_monthly_report() -> Dict[str, Any]:
    """Generate monthly report (Monatsmeldung) for a specific observer and month.
    
    Query parameters:
        kk: Observer code (required)
        mm: Month 1-12 (required)
        jj: Year 0-99 (required)
    """
    kk = request.args.get('kk', '').strip()
    mm = request.args.get('mm', '').strip()
    jj = request.args.get('jj', '').strip()
    
    if not all([kk, mm, jj]):
        return jsonify({'error': 'Missing required parameters: kk, mm, jj'}), 400
    
    try:
        kk_int = int(kk)
        mm_int = int(mm)
        jj_int = int(jj)
        
        if mm_int < 1 or mm_int > 12:
            return jsonify({'error': 'Invalid month (1-12)'}), 400

        # Accept both 2-digit and 4-digit years, normalize to 4-digit
        if 0 <= jj_int <= 99:
            jj_int = jj_to_full_year(jj_int)
        elif jj_int < YEAR_MIN or jj_int > YEAR_MAX:
            return jsonify({'error': f'Invalid year (0-99 or {YEAR_MIN}-{YEAR_MAX})'}), 400

    except ValueError:
        return jsonify({'error': 'Invalid numeric parameters'}), 400
    
    # Load observations - CLOUD MODE: Filter in SQL, LOCAL MODE: Filter in memory
    if is_cloud_mode():
        # Layer 3b: Direct database query with SQL filtering
        filtered_obs = obs_db.load_filtered(kk=kk_int, mm=mm_int, jj=jj_int)
    else:
        # Local Mode: Load from memory cache, filter in Python
        observations = current_app.config.get('OBSERVATIONS', [])
        if not observations:
            return jsonify({'error': 'No observations loaded. Please load a file first.'}), 400
        
        filtered_obs = [obs for obs in observations 
                        if _int(obs, 'KK') == kk_int and _int(obs, 'MM') == mm_int and _int(obs, 'JJ') == jj_int]
        
        # Local Mode: Sort with Python (Cloud Mode already sorted by SQL ORDER BY)
        filtered_obs.sort(key=lambda o: (_int(o, 'TT'), _int(o, 'ZS'), _int(o, 'ZM')))
    
    # Get observer info - find the record valid for this month/year
    if is_cloud_mode():
        # Layer 3b: Query database for observer records
        observers = observer_db.load_filtered(kk=kk_int)
    else:
        # Local Mode: Load from memory cache
        observers = current_app.config.get('OBSERVERS', [])
    
    observer_name = ''
    observer_hbort = ''
    observer_nbort = ''
    observer_gh = ''
    observer_gn = ''
    
    # Create sortable seit value for this month/year: YYYYMM
    obs_year = jj_to_full_year(jj_int)
    month_year_comparable = obs_year * 100 + mm_int
    
    # Find the observer record valid for this month/year
    candidates = []
    for obs_rec in observers:
        rec_kk = obs_rec.get('KK', '')
        try:
            rec_kk_int = int(rec_kk)
        except (ValueError, TypeError):
            continue
        
        if rec_kk_int == kk_int:
            try:
                seit_str = obs_rec.get('seit', '')
                seit_parts = seit_str.split('/')
                seit_month = int(seit_parts[0])
                seit_year_2digit = int(seit_parts[1])
                seit_year = jj_to_full_year(seit_year_2digit)
                rec_seit_comparable = seit_year * 100 + seit_month
                
                if rec_seit_comparable <= month_year_comparable:
                    candidates.append((rec_seit_comparable, obs_rec))
            except (ValueError, IndexError, AttributeError):
                pass
    
    if candidates:
        # Use the record with the most recent seit date
        candidates.sort(key=lambda x: x[0], reverse=True)
        obs_rec = candidates[0][1]
        
        vname = obs_rec.get('VName', '')
        nname = obs_rec.get('NName', '')
        observer_name = f"{vname} {nname}".strip()
        observer_hbort = obs_rec.get('HbOrt', '')
        observer_nbort = obs_rec.get('NbOrt', '')
        
        try:
            gh_str = obs_rec.get('GH', '')
            gn_str = obs_rec.get('GN', '')
            gh_idx = int(gh_str) if gh_str else 0
            gn_idx = int(gn_str) if gn_str else 0
        except (ValueError, TypeError):
            gh_idx = 0
            gn_idx = 0
    else:
        gh_idx = 0
        gn_idx = 0
    
    # Get region names from i18n
    regions = g.i18n.get_array('geographic_regions') if hasattr(g, 'i18n') else {}
    
    observer_gh = regions.get(str(gh_idx), '') if gh_idx > 0 else ''
    observer_gn = regions.get(str(gn_idx), '') if gn_idx > 0 else ''
    # Combine site and region
    observer_hbort = f"{observer_hbort} ({observer_gh})" if observer_gh else observer_hbort
    observer_nbort = f"{observer_nbort} ({observer_gn})" if observer_gn else observer_nbort
    
    # Build data structure
    data = {
        'kk': kk_int,
        'mm': mm_int,
        'jj': jj_int,
        'observer_name': observer_name,
        'observer_hbort': observer_hbort,
        'observer_nbort': observer_nbort,
        'observer_gh': observer_gh,
        'observer_gn': observer_gn,
        'observations': [_obs_to_json(obs) for obs in filtered_obs],
        'count': len(filtered_obs)
    }
    
    # Check requested format
    output_format = request.args.get('format', 'json').lower()
    
    if output_format in ['json', 'html']:
        # JSON format and HTML format both return data; HTML is formatted client-side
        return jsonify(data)
    elif output_format in ['text', 'markdown']:
        # Get i18n for formatting
        i18n = get_i18n()
        
        if output_format == 'text':
            content = _format_monthly_report_text(data, i18n)
            return Response(content, mimetype='text/plain; charset=utf-8')
        elif output_format == 'markdown':
            content = _format_monthly_report_markdown(data, i18n)
            return Response(content, mimetype='text/markdown; charset=utf-8')
    else:
        return jsonify({'error': f'Invalid format: {output_format}. Use json, text, or markdown.'}), 400



def _format_monthly_stats_text(data: Dict[str, Any], month_name: str, year: str, i18n) -> str:
    """Format monthly statistics as plain text with pseudographic tables."""
    lines = []
    
    
    # Table 1: Observer Overview
    if data.get('observer_overview'):
        lines.append('╔' + '═' * 86 + '╗')
        header = f"{i18n.get('monthly_stats.observer_overview')} {month_name} {year}"
        padding = max(0, (86 - len(header)) // 2)
        lines.append('║' + ' ' * padding + header + ' ' * (86 - padding - len(header)) + '║')
        lines.append('╠════╦══════════╦══════════╦══════════╦══════════╦══════════╦════════════╦═════════════╣')
        lines.append('║KKGG║ 1   3   5║   7   9  ║11  13  15║  17  19  ║21  23  25║  27  29  31║ 1) 2) 3) 4) ║')
        lines.append('║    ║   2   4  ║ 6   8  10║  12  14  ║16  18  20║  22  24  ║26  28  30  ║             ║')
        lines.append('╠════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════════════╣')
        
        row_count = 0
        for obs in data['observer_overview']:
            kk = str(obs['kk']).zfill(2)
            gg = '//' if obs['region'] == 39 else str(obs['region']).zfill(2)
            line = f'║{kk}{gg}║'
            
            # Days 1-31 in groups of 5
            for day in range(1, 32):
                day_data = obs['days'].get(str(day), {})
                solar = day_data.get('solar', 0)
                lunar = day_data.get('lunar', False)
                
                if solar > 0 and lunar:
                    cell = '_' + str(solar)
                elif solar > 0:
                    cell = f'{solar:2d}'
                elif lunar:
                    cell = ' X'
                else:
                    cell = '  '
                
                line += cell
                if day % 5 == 0 and day != 30:
                    line += '║'
            
            line += '║'
            line += f"{obs['total_solar']:3d} "
            line += f"{obs['days_solar']:2d} "
            line += f"{obs['days_lunar']:2d} "
            line += f"{obs['total_days']:2d} "
            line += '║'
            lines.append(line)
            
            row_count += 1
            if row_count % 5 == 0 and row_count < len(data['observer_overview']):
                lines.append('╠════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════════════╣')
        
        footnote = i18n.get('statistics.footnote_ee_days').replace('&nbsp;', ' ')
        footnote = footnote.replace('<br>', '\n║  ')
        lines.append('╠════╩══════════╩══════════╩══════════╩══════════╩══════════╩════════════╩═════════════╣')
        # Calculate correct padding: total width = 88, borders = 2, content = 86, indent = 2
        footnote_with_indent = '  ' + footnote
        padding = ' ' * (86 - len(footnote_with_indent))
        lines.append('║' + footnote_with_indent + padding + '║')
        lines.append('╚' + '═' * 86 + '╝')
        lines.append('')
    
    # Table 2: EE Overview
    if data.get('ee_overview'):
        lines.append('    ╔' + '═' * 76 + '╗')
        header = f"{i18n.get('monthly_stats.ee_overview')} {month_name} {year}"
        padding = max(0, (76 - len(header)) // 2)
        lines.append('    ║' + ' ' * padding + header + ' ' * (76 - padding - len(header)) + '║')
        lines.append('    ╠══╦══════════╦══════════╦══════════╦══════════╦══════════╦════════════╦═════╣')
        lines.append('    ║EE║ 1   3   5║   7   9  ║11  13  15║  17  19  ║21  23  25║  27  29  31║ ges ║')
        lines.append('    ║  ║   2   4  ║ 6   8  10║  12  14  ║16  18  20║  22  24  ║26  28  30  ║     ║')
        lines.append('    ╠══╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣')
        
        row_count = 0
        for ee_row in data['ee_overview']:
            ee = f"{ee_row['ee']:02d}"
            line = f'    ║{ee}║'
            
            for day in range(1, 32):
                count = ee_row['days'].get(str(day), 0)
                cell = f'{count:2d}' if count > 0 else '  '
                line += cell
                if day % 5 == 0 and day != 30:
                    line += '║'
            
            line += '║'
            line += f"{ee_row['total']:4d} ║"
            lines.append(line)
            
            row_count += 1
            current_ee = ee_row['ee']
            is_last = row_count >= len(data['ee_overview'])
            is_before_group567 = current_ee == 5 or current_ee == 6
            
            if not is_last and not is_before_group567:
                lines.append('    ╠══╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣')
        
        # Daily totals row
        lines.append('    ╠══╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣')
        line = '    ║Σ ║'
        for day in range(1, 32):
            count = data['daily_totals'].get(str(day), 0)
            cell = f'{count:2d}' if count > 0 else '  '
            line += cell
            if day % 5 == 0 and day != 30:
                line += '║'
        line += '║'
        line += f"{data['grand_total']:4d} ║"
        lines.append(line)
        lines.append('    ╚══╩══════════╩══════════╩══════════╩══════════╩══════════╩════════════╩═════╝')
        lines.append('')
    
    # Table 3: Rare Halos
    lines.append('    ╔' + '═' * 77 + '╗')
    header = i18n.get('monthly_stats.rare_halos')
    padding = max(0, (77 - len(header)) // 2)
    lines.append('    ║' + ' ' * padding + header + ' ' * (77 - padding - len(header)) + '║')
    
    if not data.get('rare_halos'):
        lines.append('    ╠' + '═' * 77 + '╣')
        msg = i18n.get('monthly_stats.rare_halos_none').replace('{month}', month_name)
        padding = max(0, (77 - len(msg)) // 2)
        lines.append('    ║' + ' ' * padding + msg + ' ' * (77 - padding - len(msg)) + '║')
        lines.append('    ╚' + '═' * 77 + '╝')
    else:
        lines.append('    ╠════════════╦════════════╦════════════╦════════════╦════════════╦════════════╣')
        lines.append('    ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║')
        lines.append('    ╠════════════╬════════════╬════════════╬════════════╬════════════╬════════════╣')
        
        # Insert empty slots when day changes
        displayed_items = []
        last_day = None
        for halo in data['rare_halos']:
            if last_day is not None and halo['tt'] != last_day:
                displayed_items.append(None)
            displayed_items.append(halo)
            last_day = halo['tt']
        
        items_per_column = (len(displayed_items) + 5) // 6
        for row in range(items_per_column):
            line = '    ║'
            for col in range(6):
                idx = col * items_per_column + row
                if idx < len(displayed_items) and displayed_items[idx] is not None:
                    h = displayed_items[idx]
                    tt_str = f"{h['tt']:2d}"
                    ee_str = f"{h['ee']:02d}"
                    line += f" {tt_str} {ee_str} {h['kk']}{h['gg']} ║"
                else:
                    line += '            ║'
            lines.append(line)
        
        lines.append('    ╚════════════╩════════════╩════════════╩════════════╩════════════╩════════════╝')
    
    lines.append('')
    
    # Table 4: Activity
    if data.get('activity_real') and data.get('activity_relative'):
        lines.append('╔' + '═' * 86 + '╗')
        header = f"{i18n.get('monthly_stats.activity_title')} {month_name} {year}"
        padding = max(0, (86 - len(header)) // 2)
        lines.append('║' + ' ' * padding + header + ' ' * (86 - padding - len(header)) + '║')
        lines.append('╠═════╦════════════════════════╦════════════════════════╦════════════════════════╦═════╣')
        
        # First table: Days 1-16
        day_label = i18n.get('statistics.table_day')
        lines.append(f'║ {day_label:3s} ║  1.   2.   3.   4.   5.║  6.   7.   8.   9.  10.║ 11.  12.  13.  14.  15.║ 16. ║')
        lines.append('╠═════╬════════════════════════╬════════════════════════╬════════════════════════╬═════╣')
        
        # Real activity (days 1-16)
        line = '║ real║'
        for d in range(1, 17):
            val = data['activity_real'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 16:
                line += ' ║'
            else:
                line += ' '
        lines.append(line)
        
        lines.append('╠═════╬════════════════════════╬════════════════════════╬════════════════════════╬═════╣')
        
        # Relative activity (days 1-16)
        line = '║ rel.║'
        for d in range(1, 17):
            val = data['activity_relative'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 16:
                line += ' ║'
            else:
                line += ' '
        lines.append(line)
        lines.append('╚═════╩════════════════════════╩════════════════════════╩════════════════════════╩═════╝')
        
        # Second table: Days 17-31
        lines.append('╔═════╦═══════════════════╦════════════════════════╦════════════════════════╦════╦═════╗')
        lines.append(f'║ {day_label:3s} ║ 17.  18.  19.  20.║ 21.  22.  23.  24.  25.║ 26.  27.  28.  29.  30.║ 31.║ ges ║')
        lines.append('╠═════╬═══════════════════╬════════════════════════╬════════════════════════╬════╬═════╣')
        
        # Real activity (days 17-31)
        line = '║ real║'
        for d in range(17, 32):
            val = data['activity_real'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 31:
                line += '║'
            else:
                line += ' '
        total_real = data['activity_totals']['real']
        line += f'{total_real:5.1f}║'
        lines.append(line)
        
        lines.append('╠═════╬═══════════════════╬════════════════════════╬════════════════════════╬════╬═════╣')
        
        # Relative activity (days 17-31)
        line = '║ rel.║'
        for d in range(17, 32):
            val = data['activity_relative'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 31:
                line += '║'
            else:
                line += ' '
        total_rel = data['activity_totals']['relative']
        line += f'{total_rel:5.1f}║'
        lines.append(line)
        lines.append('╚═════╩═══════════════════╩════════════════════════╩════════════════════════╩════╩═════╝')
    
    return '\n'.join(lines)


def _format_monthly_stats_markdown(data: Dict[str, Any], month_name: str, year: str, i18n) -> str:
    """Format monthly statistics as Markdown with pipe tables."""
    lines = []
    
    # Table 1: Observer Overview
    if data.get('observer_overview'):
        lines.append(f"## {i18n.get('monthly_stats.observer_overview')} {month_name} {year}")
        lines.append('')
        
        # Header row
        header = '| KKGG |'
        for d in range(1, 32):
            header += f' {d} |'
        header += ' 1) | 2) | 3) | 4) |'
        lines.append(header)
        
        # Separator row
        separator = '|:---:|'
        for d in range(1, 32):
            separator += ':---:|'
        separator += ':---:|---:|---:|---:|'
        lines.append(separator)
        
        # Data rows
        for obs in data['observer_overview']:
            kk = str(obs['kk']).zfill(2)
            gg = '//' if obs['region'] == 39 else str(obs['region']).zfill(2)
            row = f'| {kk}{gg} |'
            
            for day in range(1, 32):
                day_data = obs['days'].get(str(day), {})
                solar = day_data.get('solar', 0)
                lunar = day_data.get('lunar', False)
                
                if solar > 0 and lunar:
                    cell = f'_{solar}'
                elif solar > 0:
                    cell = str(solar)
                elif lunar:
                    cell = 'X'
                else:
                    cell = ''
                
                row += f' {cell} |'
            
            row += f" {obs['total_solar']} |"
            row += f" {obs['days_solar']} |"
            row += f" {obs['days_lunar']} |"
            row += f" {obs['total_days']} |"
            lines.append(row)
        
        footnote = i18n.get('statistics.footnote_ee_days').replace('<br>', ' ')
        footnote = footnote.replace('&nbsp;', ' ')
        lines.append('')
        lines.append(f'_{footnote}_')
        lines.append('')
    
    # Table 2: EE Overview
    if data.get('ee_overview'):
        lines.append(f"## {i18n.get('monthly_stats.ee_overview')} {month_name} {year}")
        lines.append('')
        
        # Header row
        header = '| EE |'
        for d in range(1, 32):
            header += f' {d} |'
        header += ' ges |'
        lines.append(header)
        
        # Separator row
        separator = '|:---:|'
        for d in range(1, 32):
            separator += ':---:|'
        separator += '---:|'
        lines.append(separator)
        
        # Data rows
        for ee_row in data['ee_overview']:
            ee = f"{ee_row['ee']:02d}"
            row = f'| {ee} |'
            
            for day in range(1, 32):
                count = ee_row['days'].get(str(day), 0)
                cell = str(count) if count > 0 else ''
                row += f' {cell} |'
            
            row += f" {ee_row['total']} |"
            lines.append(row)
        
        # Totals row
        row = '| **Σ** |'
        for day in range(1, 32):
            count = data['daily_totals'].get(str(day), 0)
            cell = str(count) if count > 0 else ''
            row += f' {cell} |'
        row += f" **{data['grand_total']}** |"
        lines.append(row)
        lines.append('')
    
    # Table 3: Rare Halos
    lines.append(f"## {i18n.get('monthly_stats.rare_halos')}")
    lines.append('')
    
    if not data.get('rare_halos'):
        msg = i18n.get('monthly_stats.rare_halos_none').replace('{month}', month_name)
        lines.append(f'*{msg}*')
    else:
        lines.append('| TT | EE | KKGG |')
        lines.append('|---:|:---|:-----|')
        
        for halo in data['rare_halos']:
            lines.append(f"| {halo['tt']} | {halo['ee']:02d} | {halo['kk']}{halo['gg']} |")
    
    lines.append('')
    
    # Table 4: Activity
    if data.get('activity_real') and data.get('activity_relative'):
        lines.append(f"## {i18n.get('monthly_stats.activity_title')} {month_name} {year}")
        lines.append('')
        
        day_label = i18n.get('statistics.table_day')
        
        # Header row
        header = f'| {day_label} |'
        for d in range(1, 32):
            header += f' {d} |'
        header += ' ges |'
        lines.append(header)
        
        # Separator row
        separator = '|:---:|'
        for d in range(1, 32):
            separator += '---:|'
        separator += '---:|'
        lines.append(separator)
        
        # Real activity row
        row = '| real |'
        for d in range(1, 32):
            val = data['activity_real'].get(str(d), 0.0)
            row += f' {val:.1f} |'
        total_real = data['activity_totals']['real']
        row += f' {total_real:.1f} |'
        lines.append(row)
        
        # Relative activity row
        row = '| rel. |'
        for d in range(1, 32):
            val = data['activity_relative'].get(str(d), 0.0)
            row += f' {val:.1f} |'
        total_rel = data['activity_totals']['relative']
        row += f' {total_rel:.1f} |'
        lines.append(row)
        lines.append('')
    
    return '\n'.join(lines)


@api_blueprint.route('/monthly-stats', methods=['GET'])
def get_monthly_stats() -> Dict[str, Any]:
    """Generate monthly statistics (Monatsstatistik) for a specific month.
    
    Query parameters:
        mm: Month 1-12 (required)
        jj: Year 0-99 (required)
        format: Output format - 'json' (default), 'html', 'text', or 'markdown'
    
    Returns observer overview table with:
    - Days 1-31 as columns
    - Active observers as rows
    - Cell values: number of solar halo types, or 'X' for lunar only, or '_N' for both
    - Summary columns: total solar halos, days with solar, days with lunar, total days
    
    Note: Combined halo types (e.g., EE 04 = both 22° parhelia) are resolved to
    their individual components (EE 02 + EE 03) for statistical counting.
    """
    
    mm = request.args.get('mm', '').strip()
    jj = request.args.get('jj', '').strip()
    
    if not all([mm, jj]):
        return jsonify({'error': 'Missing required parameters: mm, jj'}), 400
    
    try:
        mm_int = int(mm)
        jj_int = int(jj)
        
        if mm_int < 1 or mm_int > 12:
            return jsonify({'error': 'Invalid month (1-12)'}), 400

        # Accept both 2-digit and 4-digit years, normalize to 4-digit
        if 0 <= jj_int <= 99:
            jj_int = jj_to_full_year(jj_int)
        elif jj_int < YEAR_MIN or jj_int > YEAR_MAX:
            return jsonify({'error': f'Invalid year (0-99 or {YEAR_MIN}-{YEAR_MAX})'}), 400

    except ValueError:
        return jsonify({'error': 'Invalid numeric parameters'}), 400
    
    # Load observations - CLOUD MODE: Filter in SQL, LOCAL MODE: Filter in memory
    if is_cloud_mode():
        # Layer 3b: Direct database query with SQL filtering
        filtered_obs = obs_db.load_filtered(mm=mm_int, jj=jj_int)
        observers = observer_db.load_all()
        active_observers_only = False  # In Cloud Mode, admin can see all
    else:
        # Local Mode: Load from memory cache, filter in Python
        observations = current_app.config.get('OBSERVATIONS', [])
        if not observations:
            return jsonify({'error': 'No observations loaded. Please load a file first.'}), 400
        
        filtered_obs = [obs for obs in observations 
                        if _int(obs, 'MM') == mm_int and _int(obs, 'JJ') == jj_int]
        observers = current_app.config.get('OBSERVERS', [])
        active_observers_only = bool(current_app.config.get('ACTIVE_OBSERVERS_ONLY', False))
    
    # Get all active observers at the end of this month/year (SEIT <= MMJJ)
    # Build SEIT value for comparison using same formula as _parse_seit: mm + 13 * jj
    # Handle century boundary: years 00-79 are 2000-2079, must add 100 (same as _parse_seit)
    jj_2digit = jj_int % 100
    jj_adjusted = jj_2digit
    if jj_2digit < (YEAR_MIN - 1900):
        jj_adjusted = jj_2digit + 100
    month_year_value = mm_int + 13 * jj_adjusted
    
    # Get unique active observers up to this month/year
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
        # 1. They started before or during this month (seit <= month_year_value)
        # 2. If active_observers_only is True, they must be marked as active (aktiv == 1)
        #    If active_observers_only is False, include all observers (matches Pascal: aktbeob<>'J')
        if seit <= month_year_value:
            if not active_observers_only or aktiv == 1:
                # Keep the most recent record for each KK
                kk_seit_str = active_observers.get(kk, {}).get('seit', '') if kk in active_observers else None
                if kk not in active_observers or seit > _parse_seit(kk_seit_str if kk_seit_str else ''):
                    active_observers[kk] = obs_record
    
    # Build observer overview table
    # Structure: observer_data[KK] = {
    #   'days': {1..31: {'solar_ee': set of EE, 'lunar': has_lunar}},
    #   'total_solar': count,
    #   'days_solar': count,
    #   'days_lunar': count,
    #   'total_days': count,
    #   'region': GG
    # }
    observer_data = {}
    
    # Initialize all active observers with empty data
    for kk, obs_record in active_observers.items():
        gh_str = obs_record.get('GH', '')
        observer_data[kk] = {
            'days': {},
            'total_solar': 0,
            'days_solar': 0,
            'days_lunar': 0,
            'total_days': 0,
            'region': int(gh_str) if gh_str else 0  # GH (home region)
        }
    
    # Process each observation to fill in observation data
    for obs in filtered_obs:
        kk = str(_int(obs, 'KK')).zfill(2)  # Ensure KK is string with leading zero (e.g., "06")
        tt = _int(obs, 'TT')
        o = _int(obs, 'O')  # 1=solar, 2=lunar
        ee = _int(obs, 'EE')  # Halo type
        
        # Only process observations from active observers (skip inactive observers' data)
        if kk not in observer_data:
            continue
        
        # Initialize day data if needed
        if tt not in observer_data[kk]['days']:
            observer_data[kk]['days'][tt] = {'solar_ee': set(), 'lunar': False}
        
        # Track unique solar halo types (O=1)
        # Combined halo types are resolved to individual components
        # Example: EE 04 (both 22° parhelia) → EE 02 + EE 03
        if o == 1:
            for individual_ee in resolve_halo_type(ee):
                observer_data[kk]['days'][tt]['solar_ee'].add(individual_ee)
        
        # Mark if lunar halos observed (O=2)
        if o == 2:
            observer_data[kk]['days'][tt]['lunar'] = True
    
    # Calculate summary statistics and determine predominant region per observer
    for kk in observer_data:
        days_with_solar = set()
        days_with_lunar = set()
        region_counts = {}
        total_unique_solar_ee = 0
        
        for tt in observer_data[kk]['days']:
            day_data = observer_data[kk]['days'][tt]
            
            # Count unique solar halo types for this day
            num_unique_ee = len(day_data['solar_ee'])
            if num_unique_ee > 0:
                days_with_solar.add(tt)
                total_unique_solar_ee += num_unique_ee
            
            if day_data['lunar']:
                days_with_lunar.add(tt)
        
        observer_data[kk]['total_solar'] = total_unique_solar_ee
        
        # Determine predominant region based on where most observations were made
        # Logic: Count observation days by site indicator (g)
        #   g=0: primary site (HbOrt) -> use GH from observer record
        #   g=1: other location -> display as // (region 39)
        #   g=2: secondary site (NbOrt) -> use GN from observer record
        obs_for_kk = [obs for obs in filtered_obs if str(_int(obs, 'KK')).zfill(2) == kk]
        
        # Track which days have observations at which site (g value)
        site_days = {0: set(), 1: set(), 2: set()}  # g -> set of days
        for obs in obs_for_kk:
            g = _int(obs, 'g') if 'g' in obs and _int(obs, 'g') in [0, 1, 2] else 0
            site_days[g].add(_int(obs, 'TT'))
        
        # Find site (g value) with most observation days
        max_site = max(site_days.items(), key=lambda x: len(x[1]))
        predominant_g = max_site[0]
        
        # Determine region based on predominant site:
        if predominant_g == 1:
            # Most observations at "other" location -> display //
            predominant_region = 39
        elif predominant_g == 0:
            # Most observations at primary site -> use GH from observer record
            gh_str = active_observers[kk].get('GH', '')
            predominant_region = int(gh_str) if gh_str else 39
        elif predominant_g == 2:
            # Most observations at secondary site -> use GN from observer record
            gn_str = active_observers[kk].get('GN', '')
            predominant_region = int(gn_str) if gn_str else 39
        else:
            # Fallback
            gh_str = active_observers[kk].get('GH', '')
            predominant_region = int(gh_str) if gh_str else 39
        
        observer_data[kk]['region'] = predominant_region
        
        observer_data[kk]['days_solar'] = len(days_with_solar)
        observer_data[kk]['days_lunar'] = len(days_with_lunar)
        observer_data[kk]['total_days'] = len(set(list(days_with_solar) + list(days_with_lunar)))
    
    # Build observer list with all active observers (including those with no observations)
    # Sort by region then KK
    observer_list = []
    for kk, data in observer_data.items():
        # Convert solar_ee sets to counts for JSON serialization
        days_dict = {}
        for tt, day_data in data['days'].items():
            days_dict[str(tt)] = {  # Convert day number to string for JSON compatibility
                'solar': len(day_data['solar_ee']),  # Count unique EE values
                'lunar': day_data['lunar']
            }
        
        observer_list.append({
            'kk': kk,
            'region': data['region'],
            'days': days_dict,
            'total_solar': data['total_solar'],
            'days_solar': data['days_solar'],
            'days_lunar': data['days_lunar'],
            'total_days': data['total_days']
        })
    
    # Sort by region, then by KK
    observer_list.sort(key=lambda x: (x['region'], x['kk']))
    
    # Build EE overview table (Ergebnisübersicht Sonnenhalos)
    # Structure: ee_overview[EE] = {1..31: count_of_observers}
    # Count how many observers saw each halo type on each day
    # Note: Same observer seeing same EE multiple times on same day counts only once
    ee_overview = {}
    
    for obs in filtered_obs:
        if _int(obs, 'O') != 1:  # Only solar halos (O=1)
            continue
        
        kk = str(_int(obs, 'KK')).zfill(2)
        tt = _int(obs, 'TT')
        ee = _int(obs, 'EE')
        
        # Skip if observer not in active list
        if kk not in observer_data:
            continue
        
        # Resolve combined halo types to individual components
        for individual_ee in resolve_halo_type(ee):
            if individual_ee not in ee_overview:
                ee_overview[individual_ee] = {}
            
            if tt not in ee_overview[individual_ee]:
                ee_overview[individual_ee][tt] = set()
            
            # Add observer to set (ensures same observer counts only once per day)
            ee_overview[individual_ee][tt].add(kk)
    
    # Convert sets to counts and calculate totals
    # Filter to only show specific EE types: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12
    allowed_ee_types = {1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12}
    
    ee_list = []
    for ee in sorted(ee_overview.keys()):
        # Skip EE types not in the allowed list
        if ee not in allowed_ee_types:
            continue
            
        days_dict = {}
        total_count = 0
        
        for tt in range(1, 32):  # Days 1-31
            if tt in ee_overview[ee]:
                count = len(ee_overview[ee][tt])
                days_dict[str(tt)] = count
                total_count += count
            else:
                days_dict[str(tt)] = 0
        
        ee_list.append({
            'ee': ee,
            'days': days_dict,
            'total': total_count
        })
    
    # Calculate daily totals (sum across allowed EE types only for each day)
    daily_totals = {}
    for tt in range(1, 32):
        daily_totals[tt] = sum(
            len(ee_overview[ee].get(tt, set())) 
            for ee in ee_overview
            if ee in allowed_ee_types
        )
    
    # Calculate grand total
    grand_total = sum(daily_totals.values())
    
    # Collect rare halos (EE > 12) for third table
    # Structure: rare_halos = [{tt, ee, kk, gg}, ...] sorted by day, then EE, then KK
    rare_halos = []
    
    for obs in filtered_obs:
        if _int(obs, 'O') != 1:  # Only solar halos (O=1)
            continue
        
        kk = str(_int(obs, 'KK')).zfill(2)
        
        # Skip if observer not in active list
        if kk not in observer_data:
            continue
        
        # Resolve combined halo types to check for rare halos
        for individual_ee in resolve_halo_type(_int(obs, 'EE')):
            if individual_ee > 12:
                # Use GG directly from observation record
                gg = _int(obs, 'GG')
                
                rare_halos.append({
                    'tt': _int(obs, 'TT'),
                    'ee': individual_ee,
                    'kk': kk,
                    'gg': str(gg).zfill(2) if gg != 39 else '//'
                })
    
    # Sort rare halos by day, then EE, then KK
    rare_halos.sort(key=lambda x: (x['tt'], x['ee'], x['kk']))
    
    # Calculate halo activity (real and relative)
    # Get all observations for the month (not just solar)
    activity_data = calculate_halo_activity(
        observations=filtered_obs,
        observers=active_observers,  # Pass the dict, not the raw list
        mm=mm_int,
        jj=jj_int,
        active_observers_only=active_observers_only
    )
    
    # Apply 30-day normalization (Pascal: aktf[i] * 30 / tprom[mm])
    # This ensures activity values are comparable across months of different lengths
    days_in_month = get_days_in_month(mm_int, jj_int)
    normalization_factor = 30.0 / days_in_month
    
    # Apply normalization to daily and total activity values
    # Convert keys to strings for consistency with formatting functions
    normalized_real = {str(day): value * normalization_factor for day, value in activity_data['real'].items()}
    normalized_relative = {str(day): value * normalization_factor for day, value in activity_data['relative'].items()}
    normalized_total_real = activity_data['total_real'] * normalization_factor
    normalized_total_relative = activity_data['total_relative'] * normalization_factor
    
    # Build data structure
    data = {
        'mm': mm_int,
        'jj': jj_int,
        'observer_overview': observer_list,
        'ee_overview': ee_list,
        'daily_totals': daily_totals,
        'grand_total': grand_total,
        'rare_halos': rare_halos,
        'activity_real': normalized_real,
        'activity_relative': normalized_relative,
        'activity_totals': {
            'real': normalized_total_real,
            'relative': normalized_total_relative
        },
        'activity_count': activity_data['active_count'],
        'activity_observation_count': activity_data['observation_count'],
        'count': len(filtered_obs)
    }
    
    # Check requested format
    output_format = request.args.get('format', 'json').lower()
    
    if output_format in ['json', 'html']:
        # JSON format and HTML format both return data; HTML is formatted client-side
        return jsonify(data)
    elif output_format in ['text', 'markdown']:
        # Get month name and formatted year for display
        i18n = get_i18n()
        month_name = i18n.get(f'months.{mm_int}')
        year = str(jj_to_full_year(jj_int))
        
        if output_format == 'text':
            content = _format_monthly_stats_text(data, month_name, year, i18n)
            return Response(content, mimetype='text/plain; charset=utf-8')
        elif output_format == 'markdown':
            content = _format_monthly_stats_markdown(data, month_name, year, i18n)
            return Response(content, mimetype='text/markdown; charset=utf-8')
    elif output_format == 'linegraph':
        # Generate PNG line chart
        i18n = get_i18n()
        img_data = _generate_monthly_stats_chart(data, mm_int, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    elif output_format == 'bargraph':
        # Generate PNG bar chart
        i18n = get_i18n()
        img_data = _generate_monthly_stats_bar_chart(data, mm_int, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    else:
        return jsonify({'error': f'Invalid format: {output_format}. Use json, text, markdown, linegraph, or bargraph.'}), 400


def _generate_monthly_stats_chart(data: Dict[str, Any], mm: int, jj: int, i18n) -> bytes:
    """Generate activity chart as PNG image using matplotlib.
    
    Creates a line chart with:
    - Red line: Real activity (normalized)
    - Green line: Relative activity (normalized)
    - Days 1-31 on x-axis
    - Title and subtitle with month/year and observation count
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - days 1-31
    days = list(range(1, 32))
    real_data = [data.get('activity_real', {}).get(str(d), 0) for d in days]
    relative_data = [data.get('activity_relative', {}).get(str(d), 0) for d in days]
    
    # Get month name and year for title
    month_name = i18n.get(f'months.{mm}')
    year = str(jj_to_full_year(jj))
    observation_count = data.get('activity_observation_count', 0)
    
    # Get labels from i18n
    label_real = i18n.get('monthly_stats.activity_real')
    label_relative = i18n.get('monthly_stats.activity_relative')
    x_axis_label = i18n.get('monthly_stats.x_axis')
    y_axis_label = i18n.get('monthly_stats.y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Create smooth spline interpolation (like Chart.js tension: 0.4)
    days_smooth = np.linspace(1, 31, 300)  # 300 points for smooth curve
    
    # Smooth interpolation for real data
    if max(real_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        real_smooth = np.interp(days_smooth, days, real_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        real_smooth = np.convolve(real_smooth, kernel, mode='same')
        real_smooth = np.maximum(real_smooth, 0)  # Clip to [0, inf)
        ax.plot(days_smooth, real_smooth, color='#dc3545', linewidth=2, label=label_real)
    else:
        ax.plot(days, real_data, color='#dc3545', linewidth=2, label=label_real)
    
    # Smooth interpolation for relative data
    if max(relative_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        relative_smooth = np.interp(days_smooth, days, relative_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        relative_smooth = np.convolve(relative_smooth, kernel, mode='same')
        relative_smooth = np.maximum(relative_smooth, 0)  # Clip to [0, inf)
        ax.plot(days_smooth, relative_smooth, color='#28a745', linewidth=2, label=label_relative)
    else:
        ax.plot(days, relative_data, color='#28a745', linewidth=2, label=label_relative)
    
    # Add data points as markers
    ax.plot(days, real_data, 'o', color='#dc3545', markersize=4, markerfacecolor='#dc3545')
    ax.plot(days, relative_data, 'o', color='#28a745', markersize=4, markerfacecolor='#28a745')
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xlim(0.5, 31.5)
    ax.set_ylim(bottom=0)
    ax.set_xticks(range(1, 32))
    ax.grid(True, alpha=0.3, linestyle='--')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title and subtitle
    title = i18n.get('monthly_stats.chart_title').replace('{month}', month_name).replace('{year}', year)
    subtitle = i18n.get('monthly_stats.chart_subtitle').replace('{count}', str(observation_count))
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    ax.text(0.5, 1.02, subtitle, transform=ax.transAxes, 
            ha='center', va='bottom', fontsize=10, style='italic')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.96])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _generate_monthly_stats_bar_chart(data: Dict[str, Any], mm: int, jj: int, i18n) -> bytes:
    """Generate activity bar chart as PNG image using matplotlib.
    
    Creates a bar chart with:
    - Two side-by-side bars for each day: red (real) and green (relative)
    - Days 1-31 on x-axis
    - Title and subtitle with month/year and observation count
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - days 1-31
    days = list(range(1, 32))
    real_data = [data.get('activity_real', {}).get(str(d), 0) for d in days]
    relative_data = [data.get('activity_relative', {}).get(str(d), 0) for d in days]
    
    # Get month name and year for title
    month_name = i18n.get(f'months.{mm}')
    year = str(jj_to_full_year(jj))
    observation_count = data.get('activity_observation_count', 0)
    
    # Get labels from i18n
    label_real = i18n.get('monthly_stats.activity_real')
    label_relative = i18n.get('monthly_stats.activity_relative')
    x_axis_label = i18n.get('monthly_stats.x_axis')
    y_axis_label = i18n.get('monthly_stats.y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(14, 6))
    
    # Set up bar positions
    bar_width = 0.35
    x_pos = np.arange(len(days))
    
    # Create bars
    bars1 = ax.bar(x_pos - bar_width/2, real_data, bar_width, 
                   label=label_real, color='#dc3545', alpha=0.8)
    bars2 = ax.bar(x_pos + bar_width/2, relative_data, bar_width,
                   label=label_relative, color='#28a745', alpha=0.8)
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(days)
    ax.set_ylim(bottom=0)
    ax.grid(True, alpha=0.3, linestyle='--', axis='y')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title and subtitle
    title = i18n.get('monthly_stats.chart_title').replace('{month}', month_name).replace('{year}', year)
    subtitle = i18n.get('monthly_stats.chart_subtitle').replace('{count}', str(observation_count))
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    ax.text(0.5, 1.02, subtitle, transform=ax.transAxes, 
            ha='center', va='bottom', fontsize=10, style='italic')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.96])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _generate_annual_stats_chart(data: Dict[str, Any], jj: int, i18n) -> bytes:
    """Generate annual activity chart as PNG image using matplotlib.
    
    Creates a line chart with:
    - Red line: Real activity (normalized)
    - Green line: Relative activity (normalized)
    - Months 1-12 on x-axis
    - Title with year
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - months 1-12
    months = list(range(1, 13))
    real_data = [data.get('monthly_stats', {}).get(str(m), {}).get('real', 0) for m in months]
    relative_data = [data.get('monthly_stats', {}).get(str(m), {}).get('relative', 0) for m in months]
    
    # Get month names and year for labels
    month_labels = [i18n.get(f'months.{m}')[:3] for m in months]  # Use first 3 chars (Jan, Feb, etc.)
    year = str(jj_to_full_year(jj))
    
    # Get labels from i18n
    label_real = i18n.get('annual_stats.chart_real')
    label_relative = i18n.get('annual_stats.chart_relative')
    x_axis_label = i18n.get('annual_stats.chart_x_axis')
    y_axis_label = i18n.get('annual_stats.chart_y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Create smooth spline interpolation (like Chart.js tension: 0.4)
    months_smooth = np.linspace(1, 12, 120)  # 120 points for smooth curve
    
    # Smooth interpolation for real data
    if max(real_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        real_smooth = np.interp(months_smooth, months, real_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        real_smooth = np.convolve(real_smooth, kernel, mode='same')
        real_smooth = np.maximum(real_smooth, 0)  # Clip to [0, inf)
        ax.plot(months_smooth, real_smooth, color='#dc3545', linewidth=2, label=label_real)
    else:
        ax.plot(months, real_data, color='#dc3545', linewidth=2, label=label_real)
    
    # Smooth interpolation for relative data
    if max(relative_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        relative_smooth = np.interp(months_smooth, months, relative_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        relative_smooth = np.convolve(relative_smooth, kernel, mode='same')
        relative_smooth = np.maximum(relative_smooth, 0)  # Clip to [0, inf)
        ax.plot(months_smooth, relative_smooth, color='#28a745', linewidth=2, label=label_relative)
    else:
        ax.plot(months, relative_data, color='#28a745', linewidth=2, label=label_relative)
    
    # Add data points as markers
    ax.plot(months, real_data, 'o', color='#dc3545', markersize=4, markerfacecolor='#dc3545')
    ax.plot(months, relative_data, 'o', color='#28a745', markersize=4, markerfacecolor='#28a745')
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xlim(0.5, 12.5)
    ax.set_ylim(bottom=0)
    ax.set_xticks(months)
    ax.set_xticklabels(month_labels)
    ax.grid(True, alpha=0.3, linestyle='--')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title
    title_template = i18n.get('annual_stats.chart_title')
    title = title_template.replace('{year}', year)
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    
    # Add subtitle with observation count
    total_ee = data.get('totals', {}).get('total_ee', 0)
    subtitle = i18n.get('annual_stats.chart_subtitle').replace('{count}', str(total_ee))
    fig.text(0.5, 0.91, subtitle, ha='center', fontsize=10, color='#666')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.89])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _generate_annual_stats_bar_chart(data: Dict[str, Any], jj: int, i18n) -> bytes:
    """Generate annual activity bar chart as PNG image using matplotlib.
    
    Creates a bar chart with:
    - Two side-by-side bars for each month: red (real) and green (relative)
    - Months 1-12 on x-axis
    - Title with year
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - months 1-12
    months = list(range(1, 13))
    real_data = [data.get('monthly_stats', {}).get(str(m), {}).get('real', 0) for m in months]
    relative_data = [data.get('monthly_stats', {}).get(str(m), {}).get('relative', 0) for m in months]
    
    # Get month names and year for labels
    month_labels = [i18n.get(f'months.{m}')[:3] for m in months]  # Use first 3 chars (Jan, Feb, etc.)
    year = str(jj_to_full_year(jj))
    
    # Get labels from i18n
    label_real = i18n.get('annual_stats.chart_real')
    label_relative = i18n.get('annual_stats.chart_relative')
    x_axis_label = i18n.get('annual_stats.chart_x_axis')
    y_axis_label = i18n.get('annual_stats.chart_y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Set up bar positions
    bar_width = 0.35
    x_pos = np.arange(len(months))
    
    # Create bars
    bars1 = ax.bar(x_pos - bar_width/2, real_data, bar_width,
                   label=label_real, color='#dc3545', alpha=0.8)
    bars2 = ax.bar(x_pos + bar_width/2, relative_data, bar_width,
                   label=label_relative, color='#28a745', alpha=0.8)
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(month_labels)
    ax.set_ylim(bottom=0)
    ax.grid(True, alpha=0.3, linestyle='--', axis='y')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title and subtitle
    title_template = i18n.get('annual_stats.chart_title')
    title = title_template.replace('{year}', year)
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    
    # Add subtitle with observation count
    total_ee = data.get('totals', {}).get('total_ee', 0)
    subtitle = i18n.get('annual_stats.chart_subtitle').replace('{count}', str(total_ee))
    ax.text(0.5, 1.02, subtitle, transform=ax.transAxes, 
            ha='center', va='bottom', fontsize=10, style='italic')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.96])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _format_annual_stats_text(data: Dict[str, Any], year: str, i18n) -> str:
    """Format annual statistics as pseudographic text with box-drawing characters.
    
    Ported from client-side JavaScript rendering functions in annual_stats.js:
    - renderObserverDistribution()
    - renderEEObservations()
    - renderEETable()
    - renderPhenomena()
    - renderMonthlyActivity()
    """
    lines = []
    
    # ============================================================================
    # Main Title
    # ============================================================================
    title = i18n.get('annual_stats.title') + ' ' + year
    title_padding = max(0, (73 - len(title)) // 2)
    lines.append(' ' * title_padding + title)
    lines.append(' ' * title_padding + '═' * len(title))
    lines.append('')
    
    # ============================================================================
    # Section 1: Monthly Activity Table (FIRST!)
    # ============================================================================
    monthly_stats = data.get('monthly_stats', {})
    totals = data.get('totals', {})
    
    if monthly_stats:
        lines.append('╔═══════════╦══════════════╦══════════════╦══════════════╦══════════════╗')
        lines.append('║           ║     ' + i18n.get('annual_stats.table_sun').ljust(9)[:9] + '║     ' + i18n.get('annual_stats.table_moon').ljust(9)[:9] + '║    ' + i18n.get('annual_stats.table_totals').ljust(10)[:10] + '║  ' + i18n.get('annual_stats.table_activity').ljust(11)[:11] +  ' ║')
        lines.append('║   ' + i18n.get('annual_stats.table_month').ljust(8)[:8] + '║   ' + i18n.get('annual_stats.table_ee') + '   ' + i18n.get('annual_stats.table_days') + '  ║   ' + i18n.get('annual_stats.table_ee') + '   ' + i18n.get('annual_stats.table_days') + '  ║   ' + i18n.get('annual_stats.table_ee') + '   ' + i18n.get('annual_stats.table_days') + '  ║  ' + i18n.get('annual_stats.table_real').ljust(6)[:6] + i18n.get('annual_stats.table_relative').ljust(5)[:5] + ' ║')
        lines.append('╠═══════════╬══════════════╬══════════════╬══════════════╬══════════════╣')
        
        # 12 month rows
        for m in range(1, 13):
            month_key = str(m)
            month_data = monthly_stats.get(month_key, {})
            month_name = i18n.get(f'months.{m}', f'M{m}')
            
            sun_ee = month_data.get('sun_ee', 0)
            sun_days = month_data.get('sun_days', 0)
            moon_ee = month_data.get('moon_ee', 0)
            moon_days = month_data.get('moon_days', 0)
            total_ee = month_data.get('total_ee', 0)
            total_days = month_data.get('total_days', 0)
            real_activity = month_data.get('real', 0.0)
            relative_activity = month_data.get('relative', 0.0)
            
            row = f"║ {month_name.ljust(9)[:9]} ║  {sun_ee:4d}  {sun_days:3d}   ║  {moon_ee:4d}  {moon_days:3d}   ║  {total_ee:4d}  {total_days:3d}   ║ {real_activity:6.1f} {relative_activity:5.1f} ║"
            lines.append(row)
        
        # Totals row with separator
        lines.append('╠═══════════╬══════════════╬══════════════╬══════════════╬══════════════╣')
        
        total_sun_ee = totals.get('sun_ee', 0)
        total_sun_days = totals.get('sun_days', 0)
        total_moon_ee = totals.get('moon_ee', 0)
        total_moon_days = totals.get('moon_days', 0)
        total_total_ee = totals.get('total_ee', 0)
        total_total_days = totals.get('total_days', 0)
        total_real = totals.get('real', 0.0)
        total_relative = totals.get('relative', 0.0)
        
        totals_label = i18n.get('annual_stats.table_totals')
        totals_row = f"║ {totals_label.ljust(9)[:9]} ║  {total_sun_ee:4d}  {total_sun_days:3d}   ║  {total_moon_ee:4d}  {total_moon_days:3d}   ║  {total_total_ee:4d}  {total_total_days:3d}   ║ {total_real:6.1f} {total_relative:5.1f} ║"
        lines.append(totals_row)
        
        # Bottom border
        lines.append('╚═══════════╩══════════════╩══════════════╩══════════════╩══════════════╝')
        lines.append('')
    
    # ============================================================================
    # Section 2: Observer Distribution
    # ============================================================================
    observer_data = data.get('observer_distribution', [])
    if observer_data:
        title_line = i18n.get('annual_stats.observer_dist_title')
        title_padding = max(0, (73 - len(title_line)) // 2)
        lines.append(' ' * title_padding + title_line)
        lines.append(' ' * title_padding + '═' * len(title_line))
        lines.append('')
        
        # Table header - top border
        lines.append('╔══╦═════╦══════╦═════╦══════╦═════╦══════╦═════╦══════╦═════╦═════╦══════╗')
        
        # Header row
        header = '║' + i18n.get('annual_stats.observer_dist_kk').ljust(2)[:2] + '║'
        header += i18n.get('annual_stats.observer_dist_ee01').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee02').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee03').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee567').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee17').ljust(5)[:5] + '║'
        header += i18n.get('annual_stats.observer_dist_ee_so').ljust(5)[:5] + '║'
        header += i18n.get('annual_stats.observer_dist_ht_ges').ljust(6)[:6] + '║'
        lines.append(header)
        
        # Header separator
        lines.append('╠══╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬═════╬══════╣')
        
        # Data rows with separators every 5 rows
        for i, obs in enumerate(observer_data):
            row = '║' + str(obs['kk']).zfill(2) + '║'
            row += str(obs['ee01']).rjust(4) + ' ║'
            row += str(round(obs['pct01'], 1)).rjust(5) + ' ║'
            row += str(obs['ee02']).rjust(4) + ' ║'
            row += str(round(obs['pct02'], 1)).rjust(5) + ' ║'
            row += str(obs['ee03']).rjust(4) + ' ║'
            row += str(round(obs['pct03'], 1)).rjust(5) + ' ║'
            row += str(obs['ee567']).rjust(4) + ' ║'
            row += str(round(obs['pct567'], 1)).rjust(5) + ' ║'
            row += str(obs['ee17']).rjust(4) + ' ║'
            row += str(obs['total_sun_ee']).rjust(4) + ' ║'
            row += str(obs['total_days']).rjust(5) + ' ║'
            lines.append(row)
            
            # Add separator line every 5 rows (except last row)
            if (i + 1) % 5 == 0 and i < len(observer_data) - 1:
                lines.append('╠══╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬═════╬══════╣')
        
        # Bottom border
        lines.append('╚══╩═════╩══════╩═════╩══════╩═════╩══════╩═════╩══════╩═════╩═════╩══════╝')
        lines.append('')
    
    # ============================================================================
    # Section 3: EE Observations (Sun and Moon)
    # ============================================================================
    sun_ee_counts = data.get('sun_ee_counts', {})
    moon_ee_counts = data.get('moon_ee_counts', {})
    
    if sun_ee_counts or moon_ee_counts:
        title_line = i18n.get('annual_stats.ee_observed_title')
        title_padding = max(0, (73 - len(title_line)) // 2)
        lines.append(' ' * title_padding + title_line)
        lines.append(' ' * title_padding + '═' * len(title_line))
        lines.append('')
        
        # Sun halos table
        if sun_ee_counts:
            lines.append(_format_ee_table(i18n.get('annual_stats.ee_sun_label'), sun_ee_counts, i18n))
            lines.append('')
        
        # Moon halos table
        if moon_ee_counts:
            lines.append(_format_ee_table(i18n.get('annual_stats.ee_moon_label'), moon_ee_counts, i18n))
            lines.append('')
    
    # ============================================================================
    # Section 4: Phenomena (observations with 5+ EE types marked with '*')
    # ============================================================================
    phenomena_list = data.get('phenomena', [])
    lines.append('')
    title_line = i18n.get('annual_stats.phenomena_title')
    title_padding = max(0, (74 - len(title_line)) // 2)
    lines.append(' ' * title_padding + title_line)
    lines.append(' ' * title_padding + '═' * len(title_line))
    
    if not phenomena_list:
        lines.append('')
        phenomena_none_text = i18n.get('annual_stats.phenomena_none')
        # Center relative to title, not fixed width
        phenomena_padding = max(0, (len(title_line) - len(phenomena_none_text)) // 2 + title_padding)
        lines.append(' ' * phenomena_padding + phenomena_none_text)
    else:
        lines.append('╔═══════╦═══════╦═════════╦═══╦══════════════════════════════════════════╗')
        
        # Header row - calculate column widths dynamically from border structure
        # Column widths: Date=7, Observer=7, Time=9, O=3, EE=46
        date_text = i18n.get('annual_stats.phenomena_date')
        time_text = i18n.get('annual_stats.phenomena_time')
        other_ee_text = i18n.get('annual_stats.phenomena_other_ee')
        
        header = '║ ' + date_text.ljust(5) + ' ║ KK GG ║ '
        header += time_text.ljust(7) + ' ║ O ║ '
        header += '01 02 03 05 06 07 08 09 11 12 ' + other_ee_text
        while len(header) < 73:
            header += ' '
        header += '║'
        lines.append(header)
        
        # Separator after header
        lines.append('╠═══════╬═══════╬═════════╬═══╬══════════════════════════════════════════╣')
        
        last_month = None
        
        for phenom in phenomena_list:
            # Add month separator if month changed
            if last_month is not None and phenom['mm'] != last_month:
                lines.append('╠═══════╬═══════╬═════════╬═══╬══════════════════════════════════════════╣')
            last_month = phenom['mm']
            
            # Format date: DD.MM
            date_str = f"{phenom['tt']:02d}.{phenom['mm']:02d}"
            
            # Format observer: KK GG
            kkgg = f"{phenom['kk']:02d} {phenom['gg']:02d}"
            
            # Format time: HHh MMm
            time_str = f"{phenom['zs']:2d}h {phenom['zm']:02d}m"
            
            # Object (1 or 2)
            o_str = str(phenom['o'])
            
            # Build data row
            row = f"║ {date_str} ║ {kkgg} ║ {time_str} ║ {o_str} ║"
            
            # EE types 01-12 (show X where present)
            ee12 = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12]
            for ee in ee12:
                if ee in phenom.get('ee_types', []):
                    row += ' X '
                else:
                    row += '   '
            
            # Further EE (beyond 12) - split into groups of 4
            further_ee = sorted([ee for ee in phenom.get('ee_types', []) if ee > 12])
            further_ee_str = [f"{ee:02d}" for ee in further_ee]
            
            if len(further_ee_str) <= 4:
                # All fit on one line
                row += ' '.join(further_ee_str)
                while len(row) < 73:
                    row += ' '
                row += '║'
                lines.append(row)
            else:
                # Split into multiple lines (4 EE per line)
                first_group = further_ee_str[:4]
                row += ' '.join(first_group)
                while len(row) < 73:
                    row += ' '
                row += '║'
                lines.append(row)
                
                # Add continuation rows for remaining EE
                idx = 4
                while idx < len(further_ee_str):
                    group = further_ee_str[idx:idx+4]
                    cont_row = '║       ║       ║         ║   ║                              ' + ' '.join(group)
                    while len(cont_row) < 73:
                        cont_row += ' '
                    cont_row += '║'
                    lines.append(cont_row)
                    idx += 4
        
        # Bottom border
        lines.append('╚═══════╩═══════╩═════════╩═══╩══════════════════════════════════════════╝')
    
    lines.append('')
    
    return '\n'.join(lines)



def _format_ee_table(label: str, ee_counts: Dict[int, int], i18n) -> str:
    """Format single EE table (sun or moon) with proper box-drawing characters."""
    lines = []
    
    # Sort EE numbers
    ee_numbers = sorted([int(ee) for ee in ee_counts.keys()])
    
    # Split into rows of 9 EE types (10 columns including header)
    row_size = 9
    start_idx = 0
    
    while start_idx < len(ee_numbers):
        row_ees = ee_numbers[start_idx:start_idx + row_size]
        
        # Top border
        lines.append('   ╔═════════════' + '╦═════' * len(row_ees) + '╗')
        
        # First row: add label
        if start_idx == 0:
            line = '   ║ ' + label.ljust(8)[:8] + 'EE  ║'
        else:
            line = '   ║        EE   ║'
        
        # EE numbers
        for ee in row_ees:
            line += '  ' + str(ee).rjust(2) + ' ║'
        
        lines.append(line)
        
        # Separator line
        lines.append('   ╠═════════════╬' + '═════╬' * (len(row_ees) - 1) + '═════╣')
        
        # Counts
        line = '   ║      ' + i18n.get('annual_stats.ee_count_label').ljust(7)[:7] + '║'
        for ee in row_ees:
            count = ee_counts.get(ee, 0)
            line += str(count).rjust(4) + ' ║'
        
        lines.append(line)
        
        # Bottom border
        lines.append('   ╚═════════════' + '╩═════' * len(row_ees) + '╝')
        
        start_idx += row_size
        
        # Add spacing between rows (except last)
        if start_idx < len(ee_numbers):
            lines.append('')
    
    return '\n'.join(lines)



def _format_annual_stats_markdown(data: Dict[str, Any], year: str, i18n) -> str:
    """Format annual statistics as markdown tables.
    
    Ported from client-side JavaScript: buildMarkdownAnnualStats()
    """
    lines = []
    
    title = i18n.get('annual_stats.title_with_year').replace('{year}', year)
    lines.append(f'# {title}')
    lines.append('')
    
    # ============================================================================
    # Table 1: Monthly Activity
    # ============================================================================
    monthly_stats = data.get('monthly_stats', {})
    totals = data.get('totals', {})
    
    if monthly_stats and totals:
        table_month = i18n.get('annual_stats.table_month')
        table_sun = i18n.get('annual_stats.table_sun')
        table_moon = i18n.get('annual_stats.table_moon')
        table_total = i18n.get('annual_stats.table_totals')
        table_days = i18n.get('annual_stats.table_days')
        table_real = i18n.get('annual_stats.table_real')
        table_relative = i18n.get('annual_stats.table_relative')
        
        lines.append(f'| {table_month} | {table_sun} EE | {table_sun} {table_days} | {table_moon} EE | {table_moon} {table_days} | {table_total} EE | {table_total} {table_days} | {table_real} | {table_relative} |')
        lines.append('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
        
        for mm in range(1, 13):
            mm_str = str(mm)
            month_data = monthly_stats.get(mm_str, {})
            month_name = i18n.get(f'months.{mm}', f'M{mm}')
            
            line = f'| {month_name} | '
            line += f"{month_data.get('sun_ee', 0)} | {month_data.get('sun_days', 0)} | "
            line += f"{month_data.get('moon_ee', 0)} | {month_data.get('moon_days', 0)} | "
            line += f"{month_data.get('total_ee', 0)} | {month_data.get('total_days', 0)} | "
            line += f"{round(month_data.get('real', 0), 1)} | {round(month_data.get('relative', 0), 1)} |"
            lines.append(line)
        
        # Totals row
        line = f'| **{table_total}** | '
        line += f"**{totals.get('sun_ee', 0)}** | **{totals.get('sun_days', 0)}** | "
        line += f"**{totals.get('moon_ee', 0)}** | **{totals.get('moon_days', 0)}** | "
        line += f"**{totals.get('total_ee', 0)}** | **{totals.get('total_days', 0)}** | "
        line += f"**{round(totals.get('real', 0), 1)}** | **{round(totals.get('relative', 0), 1)}** |"
        lines.append(line)
        lines.append('')
    
    # ============================================================================
    # Table 2: EE Observations (Sun and Moon)
    # ============================================================================
    sun_ee_counts = data.get('sun_ee_counts', {})
    moon_ee_counts = data.get('moon_ee_counts', {})
    
    if sun_ee_counts or moon_ee_counts:
        ee_observed_title = i18n.get('annual_stats.ee_observed_title')
        lines.append(f'## {ee_observed_title}')
        lines.append('')
        
        # Sun halos
        if sun_ee_counts:
            ee_sun_label = i18n.get('annual_stats.ee_sun_label')
            lines.append(f'### {ee_sun_label}')
            lines.append('')
            
            sun_ees = sorted([int(ee) for ee in sun_ee_counts.keys()])
            header = '| EE |'
            for ee in sun_ees:
                header += f' {ee:02d} |'
            lines.append(header)
            
            separator = '|---|'
            for _ in sun_ees:
                separator += '---:|'
            lines.append(separator)
            
            ee_count_label = i18n.get('annual_stats.ee_count_label')
            row = f'| {ee_count_label} |'
            for ee in sun_ees:
                row += f' {sun_ee_counts.get(ee, 0)} |'
            lines.append(row)
            lines.append('')
        
        # Moon halos
        if moon_ee_counts:
            ee_moon_label = i18n.get('annual_stats.ee_moon_label')
            lines.append(f'### {ee_moon_label}')
            lines.append('')
            
            moon_ees = sorted([int(ee) for ee in moon_ee_counts.keys()])
            header = '| EE |'
            for ee in moon_ees:
                header += f' {ee:02d} |'
            lines.append(header)
            
            separator = '|---|'
            for _ in moon_ees:
                separator += '---:|'
            lines.append(separator)
            
            ee_count_label = i18n.get('annual_stats.ee_count_label')
            row = f'| {ee_count_label} |'
            for ee in moon_ees:
                row += f' {moon_ee_counts.get(ee, 0)} |'
            lines.append(row)
            lines.append('')
    
    # ============================================================================
    # Table 3: Observer Distribution
    # ============================================================================
    observer_distribution = data.get('observer_distribution', [])
    
    if observer_distribution:
        observer_dist_title = i18n.get('annual_stats.observer_dist_title')
        lines.append(f'## {observer_dist_title}')
        lines.append('')
        
        observer_dist_kk = i18n.get('annual_stats.observer_dist_kk')
        observer_dist_ee01 = i18n.get('annual_stats.observer_dist_ee01')
        observer_dist_ee02 = i18n.get('annual_stats.observer_dist_ee02')
        observer_dist_ee03 = i18n.get('annual_stats.observer_dist_ee03')
        observer_dist_ee567 = i18n.get('annual_stats.observer_dist_ee567')
        observer_dist_ee17 = i18n.get('annual_stats.observer_dist_ee17')
        observer_dist_ee_so = i18n.get('annual_stats.observer_dist_ee_so')
        observer_dist_ht_ges = i18n.get('annual_stats.observer_dist_ht_ges')
        observer_dist_percent = i18n.get('annual_stats.observer_dist_percent')
        
        header = f'| {observer_dist_kk} | {observer_dist_ee01} | {observer_dist_percent} | '
        header += f'{observer_dist_ee02} | {observer_dist_percent} | {observer_dist_ee03} | '
        header += f'{observer_dist_percent} | {observer_dist_ee567} | {observer_dist_percent} | '
        header += f'{observer_dist_ee17} | {observer_dist_ee_so} | {observer_dist_ht_ges} |'
        lines.append(header)
        lines.append('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
        
        for obs in observer_distribution:
            row = f"| {obs['kk']:02d} | {obs['ee01']} | {round(obs['pct01'], 1)} | "
            row += f"{obs['ee02']} | {round(obs['pct02'], 1)} | {obs['ee03']} | "
            row += f"{round(obs['pct03'], 1)} | {obs['ee567']} | {round(obs['pct567'], 1)} | "
            row += f"{obs['ee17']} | {obs['total_sun_ee']} | {obs['total_days']} |"
            lines.append(row)
        lines.append('')
    
    # ============================================================================
    # Table 4: Phenomena
    # ============================================================================
    phenomena_list = data.get('phenomena', [])
    phenomena_title = i18n.get('annual_stats.phenomena_title')
    
    if phenomena_list:
        lines.append(f'## {phenomena_title}')
        lines.append('')
        
        phenomena_date = i18n.get('annual_stats.phenomena_date')
        phenomena_time = i18n.get('annual_stats.phenomena_time')
        phenomena_other_ee = i18n.get('annual_stats.phenomena_other_ee')
        
        header = f'| {phenomena_date} | KK | GG | {phenomena_time} | O |'
        ee_columns = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12]
        for ee in ee_columns:
            header += f' EE{ee:02d} |'
        header += f' {phenomena_other_ee} |'
        lines.append(header)
        
        separator = '|---|---:|---:|---|---:|'
        for _ in ee_columns:
            separator += '---:|'
        separator += '---|'
        lines.append(separator)
        
        for phenom in phenomena_list:
            row = f"| {phenom['tt']:02d}.{phenom['mm']:02d} | {phenom['kk']:02d} | {phenom['gg']:02d} | "
            row += f"{phenom['zs']:2d}h {phenom['zm']:02d}m | {phenom['o']} |"
            
            # EE types 01-12
            for ee in ee_columns:
                if ee in phenom.get('ee_types', []):
                    row += ' X |'
                else:
                    row += ' |'
            
            # Further EE (beyond 12)
            further_ee = sorted([ee for ee in phenom.get('ee_types', []) if ee > 12])
            further_ee_str = ' '.join([f'{ee:02d}' for ee in further_ee])
            row += f' {further_ee_str} |'
            lines.append(row)
        lines.append('')
    else:
        lines.append(f'## {phenomena_title}')
        lines.append('')
        phenomena_none = i18n.get('annual_stats.phenomena_none')
        lines.append(phenomena_none)
        lines.append('')
    
    return '\n'.join(lines)
