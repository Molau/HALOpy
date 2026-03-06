"""Flask extensions (shared instances to avoid circular imports)."""

from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect()
