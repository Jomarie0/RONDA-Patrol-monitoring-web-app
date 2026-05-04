"""
Health Check Endpoints for RONDA System
Provides comprehensive service health monitoring for UptimeRobot and internal monitoring
"""

from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt
from django.db import connection
from django.conf import settings
from django.core.cache import cache
from datetime import datetime, timedelta
import json
import time


@require_GET
@csrf_exempt
def health_check(request):
    """
    Basic health check for UptimeRobot
    Returns 200 OK if service is running
    """
    return HttpResponse("OK", status=200)


@require_GET
def health_detailed(request):
    """
    Detailed health check with component status
    Returns comprehensive system health information
    """
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "environment": getattr(settings, 'DEBUG', False) and "development" or "production",
            "components": {
                "database": check_database_health(),
                "cache": check_cache_health(),
                "gps_service": check_gps_service_health(),
                "auth_service": check_auth_service_health(),
                "websocket_service": check_websocket_health()
            },
            "metrics": get_system_metrics(),
            "uptime": get_uptime()
        }
        
        # Determine overall status
        component_statuses = [comp.get("status", "unhealthy") for comp in health_status["components"].values()]
        if "unhealthy" in component_statuses:
            health_status["status"] = "unhealthy"
            return JsonResponse(health_status, status=503)
        elif "degraded" in component_statuses:
            health_status["status"] = "degraded"
            return JsonResponse(health_status, status=200)
        
        return JsonResponse(health_status, status=200)
        
    except Exception as e:
        return JsonResponse({
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }, status=503)


def check_database_health():
    """Check database connectivity and performance"""
    start_time = time.time()
    
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        
        response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        if response_time > 5000:  # 5 seconds
            return {
                "status": "degraded",
                "response_time_ms": round(response_time, 2),
                "message": "Database response slow"
            }
        
        return {
            "status": "healthy",
            "response_time_ms": round(response_time, 2),
            "vendor": connection.vendor
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


def check_cache_health():
    """Check cache connectivity"""
    start_time = time.time()
    
    try:
        # Test cache set/get
        test_key = "health_check_test"
        test_value = f"test_{datetime.utcnow().timestamp()}"
        
        cache.set(test_key, test_value, 10)
        retrieved_value = cache.get(test_key)
        
        response_time = (time.time() - start_time) * 1000
        
        if retrieved_value != test_value:
            return {
                "status": "unhealthy",
                "error": "Cache read/write mismatch"
            }
        
        if response_time > 1000:  # 1 second
            return {
                "status": "degraded",
                "response_time_ms": round(response_time, 2),
                "message": "Cache response slow"
            }
        
        return {
            "status": "healthy",
            "response_time_ms": round(response_time, 2)
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


def check_gps_service_health():
    """Check GPS service functionality"""
    try:
        from .models import GPSLog
        
        # Check if we can query GPS logs
        recent_gps = GPSLog.objects.filter(
            timestamp__gte=datetime.utcnow() - timedelta(hours=1)
        ).count()
        
        return {
            "status": "healthy",
            "recent_gps_points_last_hour": recent_gps,
            "message": f"Processed {recent_gps} GPS points in last hour"
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


def check_auth_service_health():
    """Check authentication service"""
    try:
        from .models import User
        
        # Check if we can query users
        active_users = User.objects.filter(is_active=True).count()
        
        return {
            "status": "healthy",
            "active_users": active_users
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


def check_websocket_health():
    """Check WebSocket service (basic check)"""
    try:
        # Basic check - in a real implementation, you might check WebSocket server status
        return {
            "status": "healthy",
            "message": "WebSocket service configured"
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


def get_system_metrics():
    """Get basic system metrics"""
    try:
        from .models import GPSLog, DriverSession, User
        
        return {
            "total_gps_points": GPSLog.objects.count(),
            "active_sessions": DriverSession.objects.filter(is_active=True).count(),
            "total_users": User.objects.count(),
            "active_users": User.objects.filter(is_active=True).count()
        }
        
    except Exception as e:
        return {
            "error": str(e)
        }


def get_uptime():
    """Get application uptime (simplified)"""
    try:
        # In a real implementation, you might track process start time
        return {
            "status": "unknown",
            "message": "Uptime tracking not implemented"
        }
        
    except Exception as e:
        return {
            "error": str(e)
        }


@require_GET
def health_readiness(request):
    """
    Readiness probe - checks if service is ready to accept traffic
    """
    try:
        # Check critical components
        db_health = check_database_health()
        
        if db_health["status"] != "healthy":
            return JsonResponse({
                "status": "not_ready",
                "timestamp": datetime.utcnow().isoformat(),
                "reason": "Database not healthy"
            }, status=503)
        
        return JsonResponse({
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat()
        }, status=200)
        
    except Exception as e:
        return JsonResponse({
            "status": "not_ready",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }, status=503)


@require_GET
def health_liveness(request):
    """
    Liveness probe - checks if service is still alive
    """
    return JsonResponse({
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }, status=200)
