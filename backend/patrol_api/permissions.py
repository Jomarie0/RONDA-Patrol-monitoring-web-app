"""
R.O.N.D.A. — Role-based permissions.
- SUPER_ADMIN: full access.
- BRANCH_ADMIN: only their branch (sessions, vehicles, users of their branch; can create only DRIVER accounts for their branch).
- DRIVER: only their own session and related data.
"""

from rest_framework import permissions


class IsSuperAdmin(permissions.BasePermission):
    """Allow only Super Admin."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'SUPER_ADMIN'


class IsBranchAdmin(permissions.BasePermission):
    """Allow Branch Admin (and Super Admin)."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.role in ('SUPER_ADMIN', 'BRANCH_ADMIN')


class IsDriver(permissions.BasePermission):
    """Allow Driver (and above) for driver-scoped actions."""

    def has_permission(self, request, view):
        return request.user.is_authenticated


class BranchScopedPermission(permissions.BasePermission):
    """
    Object-level: user can access only objects belonging to their scope.
    - SUPER_ADMIN: all.
    - BRANCH_ADMIN: branch_id == request.user.branch_id.
    - DRIVER: session.driver_id == request.user.id (for session-related objects).
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == 'SUPER_ADMIN':
            return True
        if user.role == 'BRANCH_ADMIN':
            branch_id = getattr(obj, 'branch_id', None) or getattr(obj, 'branch', None)
            if branch_id is None and hasattr(obj, 'session'):
                branch_id = obj.session.branch_id
            if branch_id is None and hasattr(obj, 'driver'):
                branch_id = obj.driver.branch_id
            return branch_id == user.branch_id
        if user.role == 'DRIVER':
            driver_id = getattr(obj, 'driver_id', None) or (getattr(obj.driver, 'id', None) if hasattr(obj, 'driver') else None)
            if driver_id is None and hasattr(obj, 'session'):
                driver_id = obj.session.driver_id
            return driver_id == user.id
        return False


class UserManagementPermission(permissions.BasePermission):
    """
    Who can create/update users:
    - SUPER_ADMIN: can create any role (BRANCH_ADMIN, DRIVER, SUPER_ADMIN) and assign any branch.
    - BRANCH_ADMIN: can only create DRIVER accounts for their own branch (and manage those drivers).
    """

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.role == 'SUPER_ADMIN':
            return True
        if request.user.role == 'BRANCH_ADMIN':
            return view.action in ('list', 'retrieve', 'create', 'update', 'partial_update', 'destroy')
        return False

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == 'SUPER_ADMIN':
            return True
        if user.role == 'BRANCH_ADMIN':
            # Can only manage users of their branch and only drivers (or self as branch admin)
            if obj.branch_id != user.branch_id:
                return False
            return obj.role == 'DRIVER' or obj.id == user.id
        return False
