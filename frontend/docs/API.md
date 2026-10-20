# DreamCity Real-Estate Platform — MERN Backend API Documentation

Welcome to the **DreamCity MERN Backend API** documentation. This document details the architectural decisions, database models, role-based access control (RBAC), approval workflows, and complete HTTP endpoint references.

---

## 1. Architecture Overview

- **Runtime**: Node.js (ES Modules, `"type": "module"`)
- **Web Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Stateless JSON Web Tokens (JWT) signed using HMAC-SHA256
- **Password Security**: Bcrypt with adaptive work factor (10 salt rounds)
- **Base URL**: `http://localhost:5000/api`

---

## 2. Seed Accounts & Credentials

The database comes pre-seeded with 6 accounts across 3 role tiers:

| Role | Name | Email | Password | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | Super Admin | `superadmin@dreamcity.in` | `SuperAdmin@123` | `ACTIVE` |
| **ADMIN** | Arun Kumar | `arun@dreamcity.in` | `Admin@123` | `ACTIVE` |
| **ADMIN** | Priya | `priya@dreamcity.in` | `Admin@123` | `ACTIVE` |
| **ADMIN** | Karthik | `karthik@dreamcity.in` | `Admin@123` | `ACTIVE` |
| **ADMIN** | Divya | `divya@dreamcity.in` | `Admin@123` | `ACTIVE` |
| **USER** | Demo Customer | `user@dreamcity.in` | `User@123` | `ACTIVE` |

To reset the database at any time with canonical seed data (6 users, 20 projects, 1,761 plots), run:
```bash
npm run seed
```

---

## 3. Security & Access Control Architecture

### 3.1 Authentication Header
Protected endpoints require an `Authorization` header containing the JWT token received during login or registration:
```http
Authorization: Bearer <your_jwt_token>
```

### 3.2 Role-Based Access Control (RBAC)
- **`USER`**: Can submit public enquiries and book site visits.
- **`ADMIN`**: Manages assigned projects, plots, customer leads, and profile. Strictly isolated so an Admin can never view, mutate, or delete another Admin's projects or leads.
- **`SUPER_ADMIN`**: Complete administrative oversight. Manages administrators, creates/deactivates accounts, reassigns projects, approves new projects and material modifications, archives projects, and views system-wide analytics.

### 3.3 Account Status Guard
If an administrator or user has `status: "INACTIVE"` (e.g. deactivated by Super Admin), any subsequent request with their token immediately returns `403 Forbidden` (`Account is inactive`).

---

## 4. Project Approval & Zero-Downtime Re-Approval Workflow

To guarantee public listing integrity:

1. **New Projects**:
   - An Admin creates a project $\rightarrow$ Status defaults to `PENDING`.
   - Hidden from `/api/public/projects`.
   - Super Admin reviews and calls `PATCH /api/super-admin/projects/:id/approve` $\rightarrow$ Status becomes `APPROVED` and live.

2. **Zero-Downtime Re-Approval on Material Edits**:
   - When an Admin edits an already `APPROVED` project (e.g., changes title, location, price, features):
   - The live document is **NOT** changed immediately.
   - The proposed changes are staged into `project.pendingUpdates` and `project.hasPendingUpdates` is set to `true`.
   - The public website continues serving the original approved information without interruption.
   - Super Admin reviews the proposed changes and calls `PATCH /api/super-admin/projects/:id/approve` $\rightarrow$ `pendingUpdates` merges into the live document, clearing the staged updates.
   - If Super Admin rejects the changes (`PATCH /api/super-admin/projects/:id/reject`), `pendingUpdates` is discarded and the live version remains intact.

3. **Deletion Security**:
   - Normal Admins **cannot** delete `APPROVED` projects (`403 Forbidden`).
   - Only Super Admin can soft-archive an approved project (`DELETE /api/super-admin/projects/:id`), setting `isArchived: true` so it is safely unlisted from the public website while preserving historical data.

---

## 5. API Reference

### 5.1 Authentication (`/api/auth`)

#### `POST /api/auth/register`
Register a new customer account.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "password": "Password@123",
    "phone": "9876543210"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "_id": "67...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "USER",
      "status": "ACTIVE"
    }
  }
  ```

#### `POST /api/auth/login`
Authenticate with email and password.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "arun@dreamcity.in",
    "password": "Admin@123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "_id": "67...",
      "name": "Arun Kumar",
      "email": "arun@dreamcity.in",
      "role": "ADMIN",
      "status": "ACTIVE"
    }
  }
  ```

#### `GET /api/auth/me`
Retrieve profile of currently authenticated user.
- **Access**: Private (Authenticated)

---

### 5.2 Public Exploration (`/api/public`)

#### `GET /api/public/projects`
List all live, approved, non-archived projects. Dynamically calculates real plot inventory counters from the `Plot` collection.
- **Access**: Public
- **Query Parameters**:
  - `city`: filter by city regex (e.g. `?city=Dindigul`)
  - `plotType`: filter by plot type (e.g. `?plotType=Residential`)
  - `minPrice` / `maxPrice`: price in lakhs range (e.g. `?minPrice=10&maxPrice=25`)

#### `GET /api/public/projects/:id`
Get single project by `customId` (e.g. `/api/public/projects/1`) or MongoDB `_id`.
- **Access**: Public

#### `GET /api/public/projects/:id/plots`
Get all plots for an approved project.
- **Access**: Public

#### `GET /api/public/plots/:id`
Get single plot by custom ID (e.g. `/api/public/plots/1-1`) or MongoDB `_id`.
- **Access**: Public

#### `POST /api/public/enquiries`
Submit customer enquiry. Automatically resolves and assigns `adminId` from the referenced project.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "mobile": "9876543210",
    "contactMethod": "whatsapp",
    "message": "Interested in corner plot",
    "projectId": "1",
    "plot": "15"
  }
  ```

#### `POST /api/public/site-visits`
Schedule a site visit.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "mobile": "9876543210",
    "preferredDate": "2026-10-15",
    "preferredTime": "10:30 AM",
    "message": "Prefer morning slot",
    "projectId": "1",
    "plot": "15"
  }
  ```

---

### 5.3 Admin Workspace (`/api/admin`)
*All routes require Bearer token with role `ADMIN`.*

#### `GET /api/admin/projects`
List projects owned by the authenticated admin.

#### `POST /api/admin/projects`
Create a new project proposal (defaults to `PENDING`).

#### `GET /api/admin/projects/:id`
Get project details (ownership verified).

#### `PUT /api/admin/projects/:id`
Update project. If project is `APPROVED`, stages edits in `pendingUpdates` for Super Admin re-approval.

#### `DELETE /api/admin/projects/:id`
Delete draft project. Returns `403 Forbidden` if project is `APPROVED`.

#### `GET /api/admin/projects/:id/plots`
List plots belonging to admin's project.

#### `POST /api/admin/projects/:id/plots`
Add a plot to admin's project.

#### `PUT /api/admin/plots/:id`
Update plot details / status (`Available`, `Reserved`, `Sold`).

#### `DELETE /api/admin/plots/:id`
Delete plot.

#### `GET /api/admin/enquiries`
List enquiries assigned to the authenticated admin.

#### `PATCH /api/admin/enquiries/:id/status`
Update enquiry status (`NEW`, `CONTACTED`, `CLOSED`). Ownership verified.

#### `GET /api/admin/site-visits`
List site visits assigned to authenticated admin.

#### `PATCH /api/admin/site-visits/:id/status`
Update site visit status (`Scheduled`, `Confirmed`, `Completed`, `Cancelled`). Ownership verified.

#### `GET /api/admin/profile`
Get admin profile and assigned project metrics.

#### `PUT /api/admin/profile`
Update admin name, mobile, and bio.

#### `PUT /api/admin/profile/password`
Change admin password.

---

### 5.4 Super Admin Management & Oversight (`/api/super-admin`)
*All routes require Bearer token with role `SUPER_ADMIN`.*

#### `GET /api/super-admin/analytics`
Retrieve system-wide aggregated metrics:
- Project counts (total, approved, pending, unassigned)
- Admin counts (total, active, inactive)
- Plot counts (total, available, reserved, sold)
- Enquiries and Site Visits totals
- Admin-wise performance and workload breakdown

#### `GET /api/super-admin/admins`
List all administrators with assigned project count metrics.

#### `POST /api/super-admin/admins`
Create a new administrator account.

#### `PUT /api/super-admin/admins/:id`
Update administrator details.

#### `PATCH /api/super-admin/admins/:id/status`
Toggle administrator status (`ACTIVE` $\leftrightarrow$ `INACTIVE`).

#### `GET /api/super-admin/projects`
List all projects across all administrators.

#### `GET /api/super-admin/projects/pending`
List projects awaiting approval or re-approval.

#### `PATCH /api/super-admin/projects/:id/approve`
Approve new project proposal or merge staged `pendingUpdates`.

#### `PATCH /api/super-admin/projects/:id/reject`
Reject project or staged edits with reason.

#### `PATCH /api/super-admin/projects/:id/assign`
Assign or reassign a project to an administrator.

#### `DELETE /api/super-admin/projects/:id`
Soft-archive an approved project (`isArchived: true`).

#### `GET /api/super-admin/enquiries`
List all customer enquiries across all administrators.

#### `GET /api/super-admin/site-visits`
List all scheduled site visits across all administrators.

---

## 6. Running Server & Verification

```bash
# Start MongoDB (ensure local daemon is active)
# Windows service: net start MongoDB

# Seed canonical data
npm run seed

# Run the 30-scenario test suite
npm run test:e2e

# Start development backend
npm run server

# Start frontend application
npm run dev
```
