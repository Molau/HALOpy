"""Authentication API endpoints (Cloud Mode).

Routes: /login, /logout, /change-password

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

from typing import Dict, Any

from flask import jsonify, request, session

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.services.auth import AuthService
from halo.web.extensions import limiter


# ============================================================================
# Authentication API (Cloud Mode)
# ============================================================================

@api_blueprint.route('/login', methods=['POST'])
@limiter.limit('10/minute')
def login() -> Dict[str, Any]:
    """
    Authenticate user against AWS Parameter Store.
    
    Request body:
        {
            "username": "44" or "admin",
            "password": "password"
        }
    
    Response:
        {
            "success": true/false,
            "error": "error message" (if failed),
            "observer_kk": "44" (if regular user),
            "is_admin": true/false
        }
    """
    if not is_cloud_mode():
        return jsonify({'success': False, 'error': 'server_unreachable'}), 503
    
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'username_password_required'}), 400
    
    # Verify credentials
    success, observer_kk = AuthService.verify_password(username, password)
    
    if success:
        # Set session variables
        session.permanent = True  # Enable session timeout
        session['authenticated'] = True
        session['username'] = username
        session['observer_kk'] = observer_kk  # None for admin, KK for regular users
        session['is_admin'] = (observer_kk is None)
        
        return jsonify({
            'success': True,
            'observer_kk': observer_kk,
            'is_admin': observer_kk is None
        })
    else:
        return jsonify({
            'success': False,
            'error': 'invalid_credentials'
        }), 401


@api_blueprint.route('/logout', methods=['POST'])
def logout_api() -> Dict[str, Any]:
    """Logout current user."""
    if not is_cloud_mode():
        return jsonify({'success': False, 'error': 'server_unreachable'}), 503
    session.clear()
    return jsonify({'success': True})


@api_blueprint.route('/change-password', methods=['PUT'])
@limiter.limit('5/minute')
def change_password() -> Dict[str, Any]:
    """
    Change user password in AWS Parameter Store.
    
    Regular user mode:
        {
            "current_password": "current",
            "new_password": "new"
        }
    
    Admin mode (admin setting password for any user):
        {
            "target_user": "44" or "admin",
            "new_password": "new",
            "admin_mode": true
        }
    
    Response:
        {
            "success": true/false,
            "error": "error message" (if failed)
        }
    """
    if not is_cloud_mode():
        return jsonify({'success': False, 'error': 'server_unreachable'}), 503
    
    if not session.get('authenticated'):
        return jsonify({'success': False, 'error': 'not_authenticated'}), 401
    
    data = request.get_json()
    is_admin = session.get('is_admin', False)
    admin_mode = data.get('admin_mode', False)
    
    if admin_mode:
        # Admin setting password for any user
        if not is_admin:
            return jsonify({'success': False, 'error': 'admin_privileges_required'}), 403
        
        target_user = data.get('target_user', '')
        new_password = data.get('new_password', '')
        
        if not target_user or not new_password:
            return jsonify({'success': False, 'error': 'target_user_password_required'}), 400
        
        # Admin can set password without knowing current password
        success, error = AuthService.change_password(target_user, '', new_password, admin_bypass=True)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': error or 'password_change_failed'}), 400
    
    else:
        # Regular user changing own password
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not current_password or not new_password:
            return jsonify({'success': False, 'error': 'current_new_password_required'}), 400
        
        username = session.get('username')
        if not username:
            return jsonify({'success': False, 'error': 'session_error'}), 400
        
        # Change password with verification
        success, error = AuthService.change_password(username, current_password, new_password, admin_bypass=False)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': error or 'password_change_failed'}), 400
