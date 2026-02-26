# R.O.N.D.A. — Patrol Monitoring & Driver Session Management

Mobile-based GPS patrol monitoring and driver session management system: **41 branches**, **1 Main Branch (Super Admin)**, **Branch Admins** and **Drivers** with role-based access.

---

## Project structure

```
Progressive-Patrol-Monitoring-Project/
├── backend/                 # Django REST API (Python 3.10+)
├── pnp-patrol-web/          # React web dashboard (Super Admin / Branch Admin)
├── PNP-Patrol-App/          # React Native (Expo) driver app
└── README.md                # This file
```

---

## 1. Backend (Django)

**Python:** 3.10+  
**Stack:** Django, Django REST Framework, Simple JWT, PostgreSQL (or SQLite for dev), CORS, Pillow.

### Setup

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### Database

- **Development:** SQLite (default). No extra config.
- **Production:** Set PostgreSQL in `backend/settings.py` and run:

```bash
python manage.py migrate
python manage.py createsuperuser   # Optional: first Super Admin
```

### Run

```bash
python manage.py runserver
```

API base: **http://localhost:8000/api/**

### Main API endpoints

| Endpoint | Description |
|---------|-------------|
| `POST /api/auth/token/` | Login (JWT access + refresh) |
| `POST /api/auth/token/refresh/` | Refresh access token |
| `GET /api/sessions/live/` | Live vehicle locations (last GPS per active session) |
| `GET /api/sessions/` | Session list (role-scoped) |
| `POST /api/sessions/start/` | Driver: start session |
| `POST /api/sessions/<id>/stop/` | Driver: stop session |
| `POST /api/gps-logs/` | Driver: submit GPS (session must be active) |
| `GET /api/branches/` | Branches (Super Admin: all; Branch Admin: own) |
| `GET /api/gps-logs/?session=<id>` | GPS logs for a session (route playback) |

### Roles

- **SUPER_ADMIN** — Full access; can create any user and assign any branch.
- **BRANCH_ADMIN** — Own branch only; can create/manage **Driver** accounts for their branch.
- **DRIVER** — Own session only; start/stop session, send GPS every 60s.

### Sample test data (optional)

From `backend`:

```bash
venv\Scripts\activate
cd backend
python manage.py shell
```

Then run:

```python
from patrol_api.models import Branch, User, Vehicle, Role

# Branches
main, _ = Branch.objects.get_or_create(
    code="MAIN",
    defaults={"name": "Main Branch", "is_main": True},
)
b1, _ = Branch.objects.get_or_create(
    code="B001",
    defaults={"name": "Branch 1"},
)

# SUPER_ADMIN (web dashboard)
super_admin, created = User.objects.get_or_create(
    username="superadmin",
    defaults={
        "email": "superadmin@example.com",
        "role": Role.SUPER_ADMIN,
        "is_staff": True,
        "is_superuser": True,
    },
)
if created:
    super_admin.set_password("SuperAdmin123!")
    super_admin.save()

# BRANCH_ADMIN (web dashboard, Branch 1)
branch_admin1, created = User.objects.get_or_create(
    username="branchadmin1",
    defaults={
        "email": "branchadmin1@example.com",
        "role": Role.BRANCH_ADMIN,
        "branch": b1,
        "is_staff": True,
    },
)
if created:
    branch_admin1.set_password("BranchAdmin123!")
    branch_admin1.save()

# DRIVER (mobile app, Branch 1)
driver1, created = User.objects.get_or_create(
    username="driver1",
    defaults={
        "email": "driver1@example.com",
        "role": Role.DRIVER,
        "branch": b1,
    },
)
if created:
    driver1.set_password("Driver123!")
    driver1.save()

# Vehicle for Branch 1 (required for driver sessions)
Vehicle.objects.get_or_create(
    branch=b1,
    defaults={"plate_number": "PNP-B001-01", "name": "Branch 1 Patrol Vehicle"},
)
```

You can then log in with:

- **SUPER_ADMIN (web):** `superadmin / SuperAdmin123!`
- **BRANCH_ADMIN (web):** `branchadmin1 / BranchAdmin123!`
- **DRIVER (mobile app):** `driver1 / Driver123!`

---

## 2. Web dashboard (React)

**For:** Super Admin, Branch Admin.

**Stack:** React, React Router, Axios, Leaflet, JWT in `localStorage`.

### Setup

```bash
cd pnp-patrol-web
npm install
```

### Run

```bash
npm start
```

Optional: set **API base URL** (if not same host):

- Create `.env` with: `REACT_APP_API_URL=http://localhost:8000/api`
- Or set before start: `set REACT_APP_API_URL=http://localhost:8000/api` (Windows) / `export REACT_APP_API_URL=...` (macOS/Linux).

### Features

- Login (JWT); only Super Admin and Branch Admin can access.
- **Dashboard** — Active vehicles, session counts, recent live list.
- **Live Map** — Patrol markers, refresh every 60s; branch filter (Super Admin).
- **Session Logs** — Table: driver, branch, start/end time, duration, status.
- **Route History** — Select session, draw GPS polyline on map.
- **User Management (Super Admin):** `/users` page to list and create users (web). Branch Admins are limited to drivers in their branch (enforced by backend).

---

## 3. Driver app (React Native / Expo)

**For:** Drivers only.

**Stack:** Expo, expo-location, Axios, AsyncStorage, JWT.

### Setup

```bash
cd PNP-Patrol-App
npm install
npx expo install @react-native-async-storage/async-storage axios expo-location expo-task-manager
```

### Run

```bash
npx expo start
```

Use **Expo Go** on your device and scan the QR code.

Optional: set **API base URL** (replace with your machine’s IP if testing on device):

- Create `.env` with: `EXPO_PUBLIC_API_URL=http://YOUR_IP:8000/api`
- Or in `app.json` / environment.

### Features

- Login (JWT); only Driver role can use the app.
- **Home** — Driver name, branch, vehicle, session status.
- **Start Session** / **Stop Session** — One active session per driver.
- **GPS** — Every 60s while session is active; sent to backend (or queued if offline).
- **Offline** — GPS stored locally when offline; synced when connection is back.

### CORS and network

- Backend must allow the Expo/React Native origin (e.g. `CORS_ALLOW_ALL_ORIGINS = True` in dev).
- On a real device, use your computer’s IP instead of `localhost` for the API URL.

For local device testing with Expo Go:

1. Start Django bound to all interfaces:

   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```

2. In `backend/settings.py`, include your LAN IP in `ALLOWED_HOSTS`, for example:

   ```python
   ALLOWED_HOSTS = ["127.0.0.1", "localhost", "192.168.1.60"]
   ```

3. Start Expo with the same IP:

   ```bash
   set EXPO_PUBLIC_API_URL=http://192.168.1.60:8000/api
   npx expo start
   ```

4. Scan the QR in Expo Go. The driver app will now reach the backend from the device.

---

## Quick start (local)

1. **Backend:** `cd backend` → `venv` → `pip install -r requirements.txt` → `python manage.py migrate` → `python manage.py runserver`
2. **Web:** `cd pnp-patrol-web` → `npm install` → `npm start`
3. **Mobile:** `cd PNP-Patrol-App` → `npm install` → `npx expo start` → open in Expo Go

Create a **Super Admin** and **Branch** + **Driver** users via Django admin:  
**http://localhost:8000/admin/** (after `createsuperuser`).

---

## License

Private / internal use as needed.
