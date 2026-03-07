"""REST API routes for HALO web application.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""


# Standard library imports
import calendar
import csv
import io
import json
import math
import os
import shutil
import tempfile
import traceback
from collections import Counter, defaultdict
from datetime import datetime
from functools import cmp_to_key
from io import StringIO
from pathlib import Path
from typing import Dict, Any

# Third-party imports
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
from flask import jsonify, request, current_app, Response, session, g, send_file, make_response

from halo import __version__
from halo.web.extensions import csrf, limiter

# Project imports
from halo.config import is_cloud_mode, get_cloud_server_url
from halo.io.csv_handler import ObservationCSV
from halo.models.constants import (
    CIRCULAR_HALOS,
    COMBINED_TO_INDIVIDUAL_HALOS,
    DEFAULT_OBSERVATION_LIMIT,
    YEAR_CUTOFF,
    YEAR_MIN,
    YEAR_MAX,
    jj_to_full_year,
    resolve_halo_type,
    calculate_halo_activity,
)
from halo.resources import I18n, set_language as set_lang
from halo.resources.i18n import get_i18n
from halo.services.auth import AuthService
from halo.services.settings import Settings

# NEW CODE - Using io.observations + io.observations_file + io.observations_db (Layer 2 + Layer 3a + Layer 3b)
import halo.io.observations as obs_logic
import halo.io.observations_file as obs_file
import halo.io.observations_db as obs_db

# NEW CODE - Using io.observers + io.observers_file (Layer 2 + Layer 3a)
import halo.io.observers as observer_logic
import halo.io.observers_file as observer_file

# NEW CODE - Layer 3b: Database operations for cloud mode
import halo.io.observations_db as obs_db
import halo.io.observers_db as observer_db
from halo.io import db_connection

from halo.api import api_blueprint

from ._helpers import (
    _check_cloud_write_auth, _int, _json_int, _format_lp8,
    _obs_to_json, _spaeter, _kurzausgabe, _parse_seit,
    _observer_row_to_dict, calculate_solar_altitude,
    get_observer_coordinates, get_days_in_month,
)
