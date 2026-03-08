"""Shared helper functions for HALO API routes.

Extracted 1:1 from routes.py.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""


import math
from typing import Dict, Any

from flask import jsonify, session

from halo.config import is_cloud_mode
from halo.models.constants import YEAR_MIN, jj_to_full_year


def _check_cloud_write_auth(target_kk) -> tuple:
    """Check authorization for write operations in Cloud Mode.
    
    In Cloud Mode, mutating operations (create, update, delete) on observations
    or observers are only allowed if:
    - The user is admin (is_admin=True), OR
    - The user's session KK matches the target KK
    
    In Local Mode, no check is performed (returns None).
    
    Args:
        target_kk: The KK of the record being modified (str or int)
    
    Returns:
        tuple: (error_response, status_code) if unauthorized, or None if authorized
    """
    if not is_cloud_mode():
        return None  # Local Mode: no restriction
    
    if not session.get('authenticated', False):
        return jsonify({'error': 'not_authenticated'}), 401
    
    if session.get('is_admin', False):
        return None  # Admin can modify any KK
    
    authenticated_kk = session.get('observer_kk')  # KK from session (str)
    if str(authenticated_kk) == str(target_kk):
        return None  # User modifying their own data
    
    return jsonify({'error': 'unauthorized_kk', 'message': 'You can only modify your own data'}), 403


def calculate_solar_altitude(
    year: int, month: int, day: int, hour: int, minute: int, duration: int,
    longitude: float, latitude: float, altitude_type: str = 'mean', gg: int = 0
) -> int:
    """Calculate solar altitude (sun's elevation above horizon) in degrees."""
    jahr = jj_to_full_year(year)
    
    def calc_altitude_at_time(zeit):
        zeit = zeit % 24
        n = (math.trunc(275 / 9 * month) - 
             math.trunc((month + 9) / 12) * 
             (1 + math.trunc((jahr - 4 * math.trunc(jahr / 4) + 2) / 3)) + 
             day - 30)
        t = n + (zeit - longitude / 15.0) / 24.0
        m = 0.985600 * t - 3.289
        l = m + 1.916 * math.sin(m * math.pi / 180.0) + 0.020 * math.sin(2 * m * math.pi / 180.0) + 282.634
        l = l % 360
        al = 180 * math.atan(0.91746 * math.sin(l * math.pi / 180.0) / math.cos(l * math.pi / 180.0)) / math.pi
        if (l > 90) and (l < 270):
            al = al + 180
        de = 180 * math.asin(0.39782 * math.sin(l * math.pi / 180.0)) / math.pi
        if month > 2:
            jd = math.trunc(30.6001 * (month + 1)) + math.trunc(365.25 * jahr)
        else:
            jd = math.trunc(30.6001 * (month + 13)) + math.trunc(365.25 * (jahr - 1))
        jd = jd + 1720994.5 + 2 - math.trunc(jahr / 100) + math.trunc(jahr / 400) + day + zeit / 24.0
        t2 = (jd - 2451545) / 36525.0
        st0 = 6.697375 + 2400.051337 * t2 + 0.0000359 * t2 * t2
        st = st0 + longitude / 15.0 + 1.002737909 * (zeit - 1)
        sw = (15 * st - al) % 360
        altitude_rad = math.asin(
            math.sin(latitude * math.pi / 180.0) * math.sin(de * math.pi / 180.0) +
            math.cos(sw * math.pi / 180.0) * math.cos(de * math.pi / 180.0) * math.cos(latitude * math.pi / 180.0)
        )
        return altitude_rad / math.pi * 180.0
    
    time_start = hour + minute / 60.0
    if altitude_type == 'mean':
        time_mid = time_start + duration / 120.0
        altitude_deg = calc_altitude_at_time(time_mid)
    else:
        altitude_start = calc_altitude_at_time(time_start)
        time_end = time_start + duration / 60.0
        altitude_end = calc_altitude_at_time(time_end)
        altitude_deg = min(altitude_start, altitude_end) if altitude_type == 'min' else max(altitude_start, altitude_end)
    
    return round(altitude_deg)


def get_observer_coordinates(observer_record: dict, gg: int) -> tuple[float, float]:
    """Extract observer's latitude and longitude from observer record."""
    if gg == 0:
        lon_deg = int(observer_record.get('HLG', 0) or 0)
        lon_min = int(observer_record.get('HLM', 0) or 0)
        lon_ew = observer_record.get('HOW', 'O')
        lat_deg = int(observer_record.get('HBG', 0) or 0)
        lat_min = int(observer_record.get('HBM', 0) or 0)
        lat_ns = observer_record.get('HNS', 'N')
    elif gg == 2:
        lon_deg = int(observer_record.get('NLG', 0) or 0)
        lon_min = int(observer_record.get('NLM', 0) or 0)
        lon_ew = observer_record.get('NOW', 'O')
        lat_deg = int(observer_record.get('NBG', 0) or 0)
        lat_min = int(observer_record.get('NBM', 0) or 0)
        lat_ns = observer_record.get('NNS', 'N')
    else:
        return (0.0, 0.0)
    
    longitude = lon_deg + lon_min / 60.0
    if lon_ew == 'W':
        longitude = -longitude
    latitude = lat_deg + lat_min / 60.0
    if lat_ns == 'S':
        latitude = -latitude
    
    return longitude, latitude


def get_days_in_month(month: int, year: int) -> int:
    """Get number of days in a month, handling leap years.
    
    Args:
        month: Month (1-12)
        year: 2-digit year (0-99)
    
    Returns:
        Number of days in the month (28-31)
    """
    days_per_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    if month < 1 or month > 12:
        return 30  # Fallback
    
    days = days_per_month[month - 1]
    
    # Check for leap year in February
    if month == 2:
        # Convert 2-digit year to 4-digit
        full_year = jj_to_full_year(year)
        # Simple leap year check (divisible by 4)
        if full_year % 4 == 0:
            days = 29
    
    return days


def _format_lp8(e: int, ho: int | None, hu: int | None) -> str:
    """Direct translation of Pascal Kurzausgabe for the 8HO/HU field.

    Pascal reference:
        IF E=8 THEN IF ho=-1 THEN '8////' ELSE '8' + HO + '//'
        ELSE IF E=9 THEN IF hu=-1 THEN '8////' ELSE '8//' + HU
        ELSE IF E=10 THEN '8' + (HO or '//') + (HU or '//')
        ELSE '/////'
    """
    # Treat None the same as -1 (unknown)
    ho_unknown = (ho is None) or (ho == -1)
    hu_unknown = (hu is None) or (hu == -1)

    if e == 8:
        if ho_unknown:
            return '8////'
        return '8' + f"{ho:02d}" + '//'
    elif e == 9:
        if hu_unknown:
            return '8////'
        return '8//' + f"{hu:02d}"
    elif e == 10:
        s = '8'
        s += '//' if ho_unknown else f"{ho:02d}"
        s += '//' if hu_unknown else f"{hu:02d}"
        return s
    else:
        return '/////'


def _int(obs: Dict[str, str], key: str, default: int = 0) -> int:
    """Safely get an integer value from an observation dict.
    
    Handles empty strings, '/', '//' by returning default.
    """
    val = obs.get(key, '')
    if val is None or val == '' or val == '/' or val == '//':
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _json_int(obs: Dict[str, str], key: str) -> int:
    """Get integer value for JSON serialization: '' → None, else int.
    
    Used when sending observation data to the frontend.
    Empty string (not observed) becomes JSON null.
    """
    val = obs.get(key, '')
    if val is None or val == '' or val == '/' or val == '//':
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _obs_to_json(obs: Dict[str, str]) -> Dict[str, Any]:
    """Convert an observation dict (str values) to JSON-friendly dict.
    
    Maps empty strings to None (JSON null) for the frontend.
    Handles the special zz field (99 → 0) and lp8 computed field.
    """
    zz_val = _json_int(obs, 'zz')
    if zz_val == 99:
        zz_val = 0

    ee = _int(obs, 'EE')
    ho = _json_int(obs, 'HO')
    hu = _json_int(obs, 'HU')

    return {
        'KK': _json_int(obs, 'KK'),
        'O': _json_int(obs, 'O'),
        'JJ': _json_int(obs, 'JJ'),
        'MM': _json_int(obs, 'MM'),
        'TT': _json_int(obs, 'TT'),
        'GG': _json_int(obs, 'GG'),
        'ZS': _json_int(obs, 'ZS'),
        'ZM': _json_int(obs, 'ZM'),
        'd': _json_int(obs, 'd'),
        'DD': _json_int(obs, 'DD'),
        'N': _json_int(obs, 'N'),
        'C': _json_int(obs, 'C'),
        'c': _json_int(obs, 'c'),
        'EE': _json_int(obs, 'EE'),
        'H': _json_int(obs, 'H'),
        'F': _json_int(obs, 'F'),
        'V': _json_int(obs, 'V'),
        'f': _json_int(obs, 'f'),
        'zz': zz_val,
        'g': _json_int(obs, 'g'),
        'HO': ho,
        'HU': hu,
        'lp8': _format_lp8(ee, ho, hu),
        'sectors': obs.get('sectors', ''),
        'remarks': obs.get('remarks', ''),
    }


def _spaeter(a, b) -> int:
    """Compare two observations for sort order.
    
    Pascal function spaeter() translation.
    Sort criteria: Year → Month → Day → Hour → Minute → Observer → Type → Source
    Uses jj_to_full_year() for correct century handling (2-digit → 4-digit year).
    
    Returns:
        -1 if a comes before b
         0 if a and b are equal (same position)
         1 if a comes after b
    """
    def _sort_key(obs):
        return (
            jj_to_full_year(_int(obs, 'JJ')),
            _int(obs, 'MM'),
            _int(obs, 'TT'),
            _int(obs, 'ZS'),
            _int(obs, 'ZM'),
            _int(obs, 'KK'),
            _int(obs, 'EE'),
            _int(obs, 'GG'),
        )

    key_a = _sort_key(a)
    key_b = _sort_key(b)

    if key_a < key_b:
        return -1
    elif key_a > key_b:
        return 1
    return 0


def _kurzausgabe(obs) -> str:
    """Format observation as HALO key string (short format).
    
    Ported from monthly_report.js kurzausgabe() function.
    Special values: -1 = ' ' (not observed), -2 = '/' (not present)
    Now works with Dict[str, str] observations.
    """
    KK = _int(obs, 'KK')
    O = _int(obs, 'O')
    JJ = _int(obs, 'JJ')
    MM = _int(obs, 'MM')
    TT = _int(obs, 'TT')
    g = _int(obs, 'g')
    ZS = _int(obs, 'ZS', -1)
    ZM = _int(obs, 'ZM', -1)
    d_val = _int(obs, 'd', -1)
    DD = _int(obs, 'DD', -1)
    N = _int(obs, 'N', -1)
    C = _int(obs, 'C', -1)
    c = _int(obs, 'c', -1)
    EE = _int(obs, 'EE')
    H = _int(obs, 'H', -1)
    F = _int(obs, 'F', -1)
    V = _int(obs, 'V', -1)
    f = _int(obs, 'f', -1)
    zz = _int(obs, 'zz', -1)
    GG = _int(obs, 'GG')
    HO = _int(obs, 'HO', -1)
    HU = _int(obs, 'HU', -1)

    first = ''
    
    # KK - observer code
    if KK < 100:
        first += str(KK // 10) + str(KK % 10)
    else:
        first += chr((KK // 10) + 55) + str(KK % 10)
    
    # O, JJ (2-digit), MM, TT, g
    first += str(O)
    jj2 = JJ % 100
    first += str(jj2 // 10) + str(jj2 % 10)
    first += str(MM // 10) + str(MM % 10)
    first += str(TT // 10) + str(TT % 10)
    first += str(g)
    
    # ZS, ZM - handle -1 (space), 0 is a valid value for sun/moon altitude
    def fmt2(val):
        """Format 2-digit field: -1→'  ', else number (0 is valid!)"""
        if val == -1:
            return '  '  # Not observed
        else:
            return str(val // 10) + str(val % 10)
    
    def fmt2_ho_hu(val):
        """Format 2-digit field for HO/HU: -1→'  ', 0→'//', else number"""
        if val == -1:
            return '  '  # Not observed
        elif val == 0:
            return '//'  # Not applicable
        else:
            return str(val // 10) + str(val % 10)
    
    first += fmt2(ZS)
    first += fmt2(ZM)
    
    # d - single digit field
    def fmt1(val):
        """Format 1-digit field: -1→' ', else number"""
        if val == -1:
            return ' '  # Not observed
        else:
            return str(val)
    
    first += fmt1(d_val)
    first += fmt2(DD)
    
    # N, C, c
    first += fmt1(N)
    first += fmt1(C)
    first += fmt1(c)
    
    # EE
    first += str(EE // 10) + str(EE % 10)
    
    # H, F, V
    first += fmt1(H)
    first += fmt1(F)
    first += fmt1(V)
    
    # f, zz, GG
    first += fmt1(f)
    
    # zz special: 99 means '//', -1 means '  ', -2 means '//'
    if zz == 99:
        first += '//'
    else:
        first += fmt2(zz)
    
    gg = GG if GG != -1 else 0
    first += str(gg // 10) + str(gg % 10)
    
    # Add spaces after every 5 characters
    erg = ''
    for i in range(0, len(first), 5):
        chunk = first[i:i+5]
        if chunk:
            erg += chunk
            if len(chunk) == 5:
                erg += ' '
    
    # 8HHHH - light pillar (HO=0 or HU=0 formatted as '//')
    if EE == 8:
        ho_str = fmt2_ho_hu(HO)
        erg += '8' + ho_str + '//'
    elif EE == 9:
        hu_str = fmt2_ho_hu(HU)
        erg += '8//' + hu_str
    elif EE == 10:
        ho_str = fmt2_ho_hu(HO)
        hu_str = fmt2_ho_hu(HU)
        erg += '8' + ho_str + hu_str
    else:
        erg += '/////'
    
    # Add sectors and remarks - total line must be exactly 69 chars + sectors + remarks
    erg += ' '
    sectors = obs.get('sectors', '')
    sectors = sectors.replace('\r', ' ').replace('\n', ' ')[:15].ljust(15)
    erg += sectors + ' '
    remarks = obs.get('remarks', '')
    remarks = remarks.replace('\r', ' ').replace('\n', ' ').ljust(60)
    erg += remarks
    
    return erg


def _parse_seit(seit_str: str) -> int:
    """Parse 'seit' field from MM/YY format to seit value (month + 13 × year).
    
    Args:
        seit_str: String in format 'MM/YY' (e.g., '01/86', '12/05')
    
    Returns:
        seit value as integer (month + 13 × year)
        
    Note:
        Years 00-((YEAR_MIN-1900)-1) are treated as 2000-20xx (add 100 to year for formula)
        Years (YEAR_MIN-1900)-99 are treated as 19xx (use year as-is)
    """
    try:
        parts = seit_str.split('/')
        if len(parts) == 2:
            month = int(parts[0])
            year = int(parts[1])
            
            # Handle century boundary using (YEAR_MIN-1900)
            if year < (YEAR_MIN-1900):
                year += 100
            
            return month + 13 * year
    except (ValueError, AttributeError):
        pass
    return 0


def _observer_row_to_dict(row: list) -> Dict[str, Any]:
    """Convert observer CSV row (list) to Python field name dict.
    Since database now uses Python field names, return them directly.
    
    Args:
        row: List with 21 elements in CSV format:
             [KK, VName, NName, seit, aktiv, HbOrt, GH, HLG, HLM, HOW, HBG, HBM, HNS,
              NbOrt, GN, NLG, NLM, NOW, NBG, NBM, NNS]
    
    Returns:
        Dict with Python field names as keys (matching database column names)
    """
    return {
        'KK': row[0],
        'VName': row[1],
        'NName': row[2],
        'seit': row[3],
        'aktiv': int(row[4]) if row[4] else 1,
        'HbOrt': row[5],
        'GH': int(row[6]) if row[6] else 0,
        'HLG': int(row[7]) if row[7] else 0,
        'HLM': int(row[8]) if row[8] else 0,
        'HOW': row[9],
        'HBG': int(row[10]) if row[10] else 0,
        'HBM': int(row[11]) if row[11] else 0,
        'HNS': row[12],
        'NbOrt': row[13],
        'GN': int(row[14]) if row[14] else 0,
        'NLG': int(row[15]) if row[15] else 0,
        'NLM': int(row[16]) if row[16] else 0,
        'NOW': row[17],
        'NBG': int(row[18]) if row[18] else 0,
        'NBM': int(row[19]) if row[19] else 0,
        'NNS': row[20]
    }
