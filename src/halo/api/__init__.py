"""REST API package for HALO web application."""

from flask import Blueprint

api_blueprint = Blueprint('api', __name__, url_prefix='/api')

# Import route modules to register their routes on the blueprint.
# These imports MUST come after api_blueprint is created.
from . import auth  # noqa: E402, F401
from . import general  # noqa: E402, F401
from . import observations  # noqa: E402, F401
from . import files  # noqa: E402, F401
from . import config  # noqa: E402, F401
from . import observers  # noqa: E402, F401
from . import statistics  # noqa: E402, F401
from . import analysis  # noqa: E402, F401

__all__ = ['api_blueprint']
