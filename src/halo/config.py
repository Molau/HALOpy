"""
HALOpy Configuration Module

Detects deployment mode (local vs cloud) and provides configuration settings.
"""

import os


def _has_aws_parameter_store_access():
    """
    Check if AWS Parameter Store is accessible (indicates cloud deployment).
    
    Returns:
        bool: True if Parameter Store is accessible, False otherwise
    """
    try:
        # NOTE: Inline import required here (Decision #030 exception)
        # boto3 is an OPTIONAL dependency only needed for cloud deployment.
        # Importing at module level would break local installations without boto3.
        import boto3  # type: ignore
        from botocore.exceptions import BotoCoreError, ClientError  # type: ignore
        
        # Try to access Parameter Store with a quick test
        ssm = boto3.client('ssm')
        # Attempt to read a parameter (we don't need the value, just check access)
        ssm.get_parameter(Name='/halopy/passwords/admin', WithDecryption=True)
        return True
    except ImportError:
        # boto3 not available (local installation)
        return False
    except Exception:
        # Any other error (no AWS credentials, Parameter Store not accessible, etc.)
        return False


def get_deployment_mode():
    """
    Determine if running locally or in cloud.
    
    Returns:
        str: 'local' or 'cloud'
    
    Detection Order:
        1. HALOPY_DEPLOYMENT environment variable (manual override)
        2. Automatic AWS Parameter Store access check
        3. Default to 'local' if neither applies
    
    Environment Variable:
        HALOPY_DEPLOYMENT: Set to 'cloud', 'server', or 'production' for cloud mode.
                          Set to 'local' to force local mode even with AWS access.
    
    Examples:
        Local (default): No environment variable needed, no AWS access
        Cloud (manual): Set HALOPY_DEPLOYMENT=cloud
        Cloud (auto): AWS Parameter Store accessible (detected automatically)
    """
    # 1. Check environment variable first (allows manual override)
    mode = os.environ.get('HALOPY_DEPLOYMENT', '').lower()
    if mode in ['cloud', 'server', 'production']:
        return 'cloud'
    if mode == 'local':
        return 'local'
    
    # 2. Auto-detect AWS Parameter Store access
    if _has_aws_parameter_store_access():
        return 'cloud'
    
    # 3. Default to local
    return 'local'


def is_cloud_mode():
    """
    Check if running in cloud mode.
    
    Returns:
        bool: True if running in cloud, False if local
    """
    return get_deployment_mode() == 'cloud'


def is_local_mode():
    """
    Check if running in local mode.
    
    Returns:
        bool: True if running locally, False if cloud
    """
    return get_deployment_mode() == 'local'


def get_cloud_server_url():
    """
    Get the cloud server base URL for upload/download operations.
    
    Returns:
        str: Cloud server URL (e.g., 'https://halo.online')
    
    Environment Variable:
        HALOPY_CLOUD_SERVER_URL: Override default cloud server URL
    
    Default:
        https://halo.online
    """
    return os.environ.get('HALOPY_CLOUD_SERVER_URL', 'https://halo.online')
