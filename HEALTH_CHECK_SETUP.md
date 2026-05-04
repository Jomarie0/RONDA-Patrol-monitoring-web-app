# Health Check Setup Guide

## 🔍 **Health Check Endpoints Added**

### **Basic Health Check (For UptimeRobot)**
```
GET /api/health/
```
- Returns: `OK` (200 status)
- Purpose: Simple up/down monitoring
- Use this for UptimeRobot

### **Detailed Health Check**
```
GET /api/health/detailed/
```
- Returns: JSON with component status
- Purpose: Detailed system health monitoring
- Components: Database, Cache, GPS Service, Auth Service, WebSocket

### **Readiness Probe**
```
GET /api/health/ready/
```
- Returns: Service readiness status
- Purpose: Check if service is ready to accept traffic

### **Liveness Probe**
```
GET /api/health/live/
```
- Returns: Service liveness status
- Purpose: Check if service is still alive

## 🤖 **UptimeRobot Setup**

### **1. Basic Monitoring**
- **Monitor Type**: HTTP(s)
- **URL**: `https://your-domain.com/api/health/`
- **Interval**: 1 minute
- **Alert Threshold**: 2 consecutive failures

### **2. Advanced Monitoring (Optional)**
- **Monitor Type**: HTTP(s)
- **URL**: `https://your-domain.com/api/health/detailed/`
- **Keywords**: `"status": "healthy"`
- **Interval**: 5 minutes
- **Alert Threshold**: 1 failure

## 📊 **What Each Endpoint Checks**

### **Basic Health (`/api/health/`)**
- ✅ Service is running
- ✅ Can respond to requests

### **Detailed Health (`/api/health/detailed/`)**
- ✅ Database connectivity & response time
- ✅ Cache functionality
- ✅ GPS service processing
- ✅ Authentication service
- ✅ WebSocket service
- ✅ System metrics (GPS points, sessions, users)

### **Response Examples**

#### Healthy Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-05-04T15:25:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "components": {
    "database": {
      "status": "healthy",
      "response_time_ms": 45.2,
      "vendor": "postgresql"
    },
    "cache": {
      "status": "healthy", 
      "response_time_ms": 12.8
    },
    "gps_service": {
      "status": "healthy",
      "recent_gps_points_last_hour": 127
    }
  },
  "metrics": {
    "total_gps_points": 45231,
    "active_sessions": 3,
    "total_users": 15,
    "active_users": 8
  }
}
```

#### Degraded Response:
```json
{
  "status": "degraded",
  "components": {
    "database": {
      "status": "degraded",
      "response_time_ms": 5200.0,
      "message": "Database response slow"
    }
  }
}
```

## 🚀 **Benefits**

### **For UptimeRobot:**
- **Simple monitoring** - Basic endpoint for up/down status
- **Advanced monitoring** - Detailed endpoint for component health
- **Keyword alerts** - Get notified when components fail

### **For Development:**
- **Debugging** - Detailed component status
- **Performance monitoring** - Response times and metrics
- **Proactive alerts** - Catch issues before they cause downtime

## 🔧 **Testing**

### **Test the endpoints:**
```bash
# Basic health check
curl https://your-domain.com/api/health/

# Detailed health check
curl https://your-domain.com/api/health/detailed/

# Readiness check
curl https://your-domain.com/api/health/ready/

# Liveness check
curl https://your-domain.com/api/health/live/
```

## 📝 **Monitoring Best Practices**

1. **Use basic endpoint for UptimeRobot** - `/api/health/`
2. **Monitor detailed endpoint separately** - `/api/health/detailed/`
3. **Set appropriate alert thresholds** - Don't alert on single failures
4. **Monitor response times** - Slow responses indicate issues
5. **Track metrics over time** - GPS points, active sessions, etc.

## 🎯 **Next Steps**

1. **Deploy the health endpoints** (already done)
2. **Set up UptimeRobot monitoring**
3. **Test alert notifications**
4. **Monitor dashboard regularly**
5. **Add custom alerts if needed**

The health checks are now ready and will complement your UptimeRobot monitoring perfectly!
