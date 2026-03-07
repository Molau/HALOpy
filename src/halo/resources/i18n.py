"""
Internationalization support for HALO application.
Loads language-specific strings from JSON resource files.
"""

import json
# Force reload for combined_prompt addition
from pathlib import Path
from typing import Dict, Any, Optional

from halo import __version__, __version_date__


class I18n:
    """
    Internationalization manager for loading and accessing localized strings.
    
    Supports multiple languages through JSON resource files.
    Strings are organized hierarchically and accessed with dot notation.
    
    Example:
        i18n = I18n()
        title = i18n.get('app.title')  # Returns "HALO Auswerteprogramm"
        menu = i18n.get('menus.file.title')  # Returns "Datei"
    """
    
    def __init__(self, language: str = 'de'):
        """
        Initialize i18n system with specified language.
        
        Args:
            language: Language code ('de' for German, 'en' for English)
        """
        self.language = language
        self.strings: Dict[str, Any] = {}
        self.resources_path = Path(__file__).parent.parent.parent.parent / 'resources'
        self.load_language(language)
    
    def load_language(self, language: str) -> None:
        """
        Load strings for specified language from JSON file.
        
        Args:
            language: Language code to load
            
        Raises:
            FileNotFoundError: If language file doesn't exist
            json.JSONDecodeError: If JSON file is malformed
        """
        language_file = self.resources_path / f'strings_{language}.json'
        
        if not language_file.exists():
            raise FileNotFoundError(f"Language file not found: {language_file}")
        
        with open(language_file, 'r', encoding='utf-8') as f:
            self.strings = json.load(f)
        
        # Inject version info from single source of truth (halo/__init__.py)
        if 'app' in self.strings:
            self.strings['app']['version'] = '.'.join(__version__.split('.')[:2])
            self.strings['app']['version_date'] = __version_date__
            self.strings['app']['window_title'] = f"HALO {'.'.join(__version__.split('.')[:2])}"
        
        self.language = language
    
    def get(self, key: str, default: Optional[str] = None) -> str:
        """
        Get localized string by key path.
        
        Supports nested keys using dot notation:
        - 'app.title' -> strings['app']['title']
        - 'menus.file.title' -> strings['menus']['file']['title']
        - 'halo_types.1' -> strings['halo_types']['1']
        
        Args:
            key: Dot-separated path to string
            default: Default value if key not found (raises KeyError if None)
            
        Returns:
            Localized string or default value
        
        Raises:
            KeyError: If key not found and no default provided
        """
        keys = key.split('.')
        value = self.strings
        
        try:
            for k in keys:
                value = value[k]
            return str(value)
        except (KeyError, TypeError):
            if default is not None:
                return default
            raise KeyError(f"i18n key not found: '{key}' (language: {self.language})")
    
    def get_array(self, key: str) -> Dict[str, str]:
        """
        Get entire array/dictionary of localized strings.
        
        Useful for populating dropdowns, lists, etc.
        
        Args:
            key: Dot-separated path to array
            
        Returns:
            Dictionary of strings or empty dict if not found
            
        Example:
            months = i18n.get_array('months')
            # Returns {'1': 'Januar', '2': 'Februar', ...}
        """
        keys = key.split('.')
        value = self.strings
        
        try:
            for k in keys:
                value = value[k]
            if isinstance(value, dict):
                return value
            return {}
        except (KeyError, TypeError):
            return {}
    
    def format(self, key: str, **kwargs) -> str:
        """
        Get localized string with placeholder substitution.
        
        Args:
            key: Dot-separated path to string
            **kwargs: Values to substitute for {placeholders}
            
        Returns:
            Formatted string
            
        Example:
            # If string is "Beobachter {kk} erfolgreich hinzugefügt"
            msg = i18n.format('success.observer_added', kk=44)
            # Returns "Beobachter 44 erfolgreich hinzugefügt"
        """
        template = self.get(key)
        try:
            return template.format(**kwargs)
        except KeyError:
            return template


# Global instance for convenient access
_i18n_instance: Optional[I18n] = None


def get_i18n(language: Optional[str] = None, force_reload: bool = False) -> I18n:
    """
    Get global i18n instance (lazy initialization).
    
    Args:
        language: Optional language code to use
        force_reload: Force reload JSON files even if language unchanged
        
    Returns:
        Global I18n instance
    """
    global _i18n_instance
    if _i18n_instance is None:
        _i18n_instance = I18n(language or 'de')
    elif force_reload or (language and _i18n_instance.language != language):
        if _i18n_instance is not None:
            _i18n_instance.load_language(language or _i18n_instance.language)
    return _i18n_instance


def get_string(key: str, default: Optional[str] = None) -> str:
    """
    Convenience function to get localized string.
    
    Args:
        key: Dot-separated path to string
        default: Default value if key not found
        
    Returns:
        Localized string
    """
    return get_i18n().get(key, default)


def set_language(language: str) -> None:
    """
    Change application language and store in Flask session if available.
    
    Args:
        language: Language code ('de' or 'en')
    """
    get_i18n().load_language(language)
    try:
        from flask import session
        session['language'] = language
    except (ImportError, RuntimeError):
        # No Flask context available
        pass


def get_current_language() -> str:
    """
    Get current language from Flask session or i18n instance.
    
    Returns:
        Current language code
    """
    try:
        from flask import session
        return session.get('language', 'de')
    except (ImportError, RuntimeError):
        # No Flask context available
        return get_i18n().language


def get_language() -> str:
    """
    Get current language code (alias for get_current_language).
    
    Returns:
        Current language code
    """
    return get_current_language()
