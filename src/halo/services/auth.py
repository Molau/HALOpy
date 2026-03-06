"""
Authentication Service for HALOpy Cloud Mode

Handles user authentication against AWS Parameter Store.
Passwords are stored as bcrypt hashes in AWS SSM Parameter Store.
"""

import re

import bcrypt
from typing import Optional, Tuple
from halo.config import is_cloud_mode
from halo.models.constants import PASSWORD_MIN_LENGTH, PASSWORD_REQUIRE_CATEGORIES


class AuthService:
    """Authentication service for cloud mode."""
    
    # Admin user credentials
    ADMIN_USERNAME = 'admin'
    
    @staticmethod
    def validate_password(password: str) -> Tuple[bool, Optional[str]]:
        """Validate password against the central password policy."""
        if len(password) < PASSWORD_MIN_LENGTH:
            return False, "error_password_too_short"
        
        categories_matched = sum([
            bool(re.search(r'[a-z]', password)),
            bool(re.search(r'[A-Z]', password)),
            bool(re.search(r'[0-9]', password)),
            bool(re.search(r'[^a-zA-Z0-9]', password)),
        ])
        if categories_matched < PASSWORD_REQUIRE_CATEGORIES:
            return False, "error_password_complexity"
        
        return True, None
    
    @staticmethod
    def verify_password(username: str, password: str) -> Tuple[bool, Optional[str]]:
        """
        Verify username and password.
        
        Args:
            username: Username (KK number as string, or 'admin')
            password: Plain text password
        
        Returns:
            Tuple of (success: bool, observer_kk: Optional[str])
            - For regular users: (True, 'KK') on success
            - For admin: (True, None) on success
            - On failure: (False, None)
        """
        if not is_cloud_mode():
            # In local mode, authentication is disabled
            return True, None
        
        try:
            # Check if admin user
            if username == AuthService.ADMIN_USERNAME:
                hash_from_store = AuthService._get_password_hash_from_aws(username)
                if hash_from_store and AuthService._verify_bcrypt(password, hash_from_store):
                    return True, None  # Admin has no fixed observer
                return False, None
            
            # Regular observer user - username must be a valid KK number
            try:
                kk_num = int(username)
                if kk_num < 1 or kk_num > 999:
                    return False, None
            except ValueError:
                return False, None
            
            # Verify password against AWS Parameter Store
            hash_from_store = AuthService._get_password_hash_from_aws(username)
            if hash_from_store and AuthService._verify_bcrypt(password, hash_from_store):
                return True, username  # Return KK as fixed observer
            
            return False, None
            
        except Exception as e:
            print(f"Authentication error: {e}")
            return False, None
    
    @staticmethod
    def _get_password_hash_from_aws(username: str) -> Optional[str]:
        """
        Retrieve bcrypt password hash from AWS Parameter Store.
        
        Parameter name format: /halopy/passwords/kk{xx} (e.g., /halopy/passwords/kk44, /halopy/passwords/admin)
        
        Args:
            username: Username (KK or 'admin')
        
        Returns:
            Bcrypt hash string or None if not found
        """
        try:
            import boto3
            
            # Create SSM client
            ssm = boto3.client('ssm', region_name='eu-central-1')  # Frankfurt region
            
            # Construct parameter name
            if username == AuthService.ADMIN_USERNAME:
                param_name = f'/halopy/passwords/admin'
            else:
                # Format KK with leading zero (e.g., kk04, kk44)
                param_name = f'/halopy/passwords/kk{int(username):02d}'
            
            # Get parameter value
            response = ssm.get_parameter(
                Name=param_name,
                WithDecryption=True  # Use KMS decryption if parameter is encrypted
            )
            
            return response['Parameter']['Value']
            
        except ssm.exceptions.ParameterNotFound:
            print(f"AWS SSM Parameter not found: {param_name}")
            return None
        except Exception as e:
            print(f"Error accessing AWS SSM: {e}")
            return None
    
    @staticmethod
    def _verify_bcrypt(password: str, hash_string: str) -> bool:
        """
        Verify password against bcrypt hash.
        
        Args:
            password: Plain text password
            hash_string: Bcrypt hash from Parameter Store
        
        Returns:
            True if password matches hash
        """
        try:
            return bcrypt.checkpw(
                password.encode('utf-8'),
                hash_string.encode('utf-8')
            )
        except Exception as e:
            print(f"Bcrypt verification error: {e}")
            return False
    
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Create bcrypt hash from password.
        Helper function for initially setting up passwords in AWS Parameter Store.
        
        Args:
            password: Plain text password
        
        Returns:
            Bcrypt hash string
        """
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    @staticmethod
    def change_password(username: str, current_password: str, new_password: str, admin_bypass: bool = False) -> Tuple[bool, Optional[str]]:
        """
        Change user password in AWS Parameter Store.
        
        Args:
            username: Username (KK or 'admin')
            current_password: Current password for verification (ignored if admin_bypass=True)
            new_password: New password to set
            admin_bypass: If True, skip current password verification (admin setting password for others)
        
        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        if not is_cloud_mode():
            return False, "cloud_mode_required"
        
        # Verify current password (unless admin bypass)
        if not admin_bypass:
            success, _ = AuthService.verify_password(username, current_password)
            if not success:
                return False, "error_current_password_wrong"
        
        # Validate new password against central policy
        valid, error = AuthService.validate_password(new_password)
        if not valid:
            return False, error
        
        try:
            import boto3
            
            # Create new hash
            new_hash = AuthService.hash_password(new_password)
            
            # Update in AWS Parameter Store
            ssm = boto3.client('ssm', region_name='eu-central-1')
            if username == AuthService.ADMIN_USERNAME:
                param_name = f'/halopy/passwords/admin'
            else:
                # Format KK with leading zero (e.g., kk04, kk44)
                param_name = f'/halopy/passwords/kk{int(username):02d}'
            
            ssm.put_parameter(
                Name=param_name,
                Value=new_hash,
                Type='SecureString',
                Overwrite=True
            )
            
            return True, None
            
        except Exception as e:
            print(f"Error changing password in AWS: {e}")
            return False, f"Error updating password: {str(e)}"
