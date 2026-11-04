import os
import secrets
from datetime import timedelta


def _read_version():
    """Versione: env APP_VERSION, altrimenti il file VERSION, altrimenti 'dev'."""
    env = os.getenv('APP_VERSION')
    if env:
        return env.strip()
    try:
        with open(os.path.join(os.path.dirname(__file__), 'VERSION'), encoding='utf-8') as f:
            return f.read().strip() or 'dev'
    except OSError:
        return 'dev'


class Config:
    """Configurazione base dell'applicazione"""

    # Flask
    # Senza SECRET_KEY se ne genera una a caso a ogni avvio: le sessioni admin
    # non sopravvivono a un riavvio, ma nessuno puo' falsificarle con una chiave nota.
    SECRET_KEY = os.getenv('SECRET_KEY') or secrets.token_hex(32)
    APP_VERSION = _read_version()
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    # CORS
    ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*').split(',')
    
    # Session
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)
    SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Upload
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    
    # Rate limiting
    RATELIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    # App specific
    FLOWS_DIRECTORY = os.getenv('FLOWS_DIRECTORY', 'flows')
    DEFAULT_LANGUAGE = os.getenv('DEFAULT_LANGUAGE', 'it')
    
    # Admin protection
    # ADMIN_MODE=True (default): builder e API di scrittura chiedono il login.
    # ADMIN_MODE=False: chiunque puo' modificare i flussi. Solo per uso locale.
    ADMIN_MODE = os.getenv('ADMIN_MODE', 'True').lower() == 'true'
    # Nessun default: senza ADMIN_PASSWORD (o con un valore d'esempio) il login e' rifiutato.
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', '')

    # Testi del sito (header e footer), tutti opzionali
    SITE_TITLE = os.getenv('SITE_TITLE', 'Flow Manager')
    SITE_SUBTITLE = os.getenv('SITE_SUBTITLE', 'Crea e gestisci flussi decisionali interattivi')
    SITE_TAGLINE = os.getenv('SITE_TAGLINE', 'Flussi decisionali interattivi descritti in YAML.')
    ORG_NAME = os.getenv('ORG_NAME', '')
    ORG_URL = os.getenv('ORG_URL', '')

    # Impostato solo da export_static.py (demo su GitHub Pages, sola lettura)
    STATIC_EXPORT = False