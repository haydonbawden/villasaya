You are an expert full-stack React Native architect and senior mobile developer.

Your job is to build a full, production-ready cross-platform app called VillaSaya, using the template in this repo.

Use this template as the foundation and extend it significantly according to the specifications below.

---

# APP OVERVIEW

VillaSaya is a villa operations and staff management app for:

* Tenant (main user)
* Villa Staff (cleaner, gardener, handyman, maid, security, etc.)
* Landlord (i.e. villa owner)
* Property Agent (i.e. landlord's agent/representative)
* Contractors/Suppliers (optional, limited-role access)

The goal: run a Bali villa smoothly with tasks, workflows, expenses, chat, contracts, rosters, and shared calendars.

---

#  UI REQUIREMENTS

* Follow the visual language of the Asana mobile app: clean, modern, calm colours, minimalistic typography, intuitive navigation.
* Use:

  * React Navigation
  * Styled components or template’s styling system
  * Reusable UI components
  * Dark/Light modes
  * Bottom-tab + nested stack navigation
* Include support for offline mode and background sync.

---

#  TECH STACK & FOUNDATIONAL REQUIREMENTS

* React Native (TypeScript)
* Extend thecodingmachine/react-native-boilerplate structure
* Modular folder structure:

  ```
  /src  
    /modules
      /auth  
      /users  
      /staff  
      /tasks  
      /claims  
      /chat  
      /calendar  
      /contacts  
      /documents  
      /notifications  
      /analytics  
    /components/ui  
    /components/forms  
    /providers  
    /theme  
    /utils  
    /services/api  
  ```
* Backend: produce API schemas (REST), mock API service, typed interfaces, and state management (Redux Toolkit or Zustand).

---

# USER ROLES & PERMISSIONS

### Tenant

Full access to villa operations and management workflows.

### Villa Staff

Access to:

* Tasks
* Roster
* Calendar
* Submitting expenses
* Chat
* Documents relevant to them
* Attendance / check-in

### Landlord

Access to:

* Lease contract
* Approve tenant’s reimbursement claims
* Chat
* Expense history

### Property Manager

Access to:

* Lease metadata editing
* Approve expenses
* Upload documents
* Chat
* Oversee tasks if enabled

### Contractors / Suppliers

* Limited “guest task access”
* Can receive assigned tasks
* Upload completion photos
* Send chat messages in limited channels only

Implement RBAC (role-based access control).

---

#  ENHANCED FEATURE SET (INCLUDE ALL OF THESE)

### 1. Staff Profiles

* Employment details
* Bank details
* Contract upload
* Leave requests
* Roster view
* Attendance / GPS check-in

### 2. Lease & Property Management

* Landlord/manager can upload signed lease
* Store metadata: start date, end date, rent, due date, villa address
* Editable only by landlord/manager

### 3. Expense & Reimbursement Claims

* Staff → Tenant (primary approval)
* Tenant → Landlord (secondary approval)
* OCR receipt extraction: date, merchant, category, amount
* Photo uploads
* Status history
* Export PDF reports

### 4. Shared Calendar

* Roster
* Public holidays
* Special events
* Maintenance schedule
* Auto-color coding for roles

### 5. Task Assignment System

* Assign tasks to individual staff or groups
* Recurring tasks
* Workflow templates (e.g., guest check-in, deep cleaning)
* Checklists
* Completion reports
* Required completion photo toggle
* SLA timers (due time + overdue alerts)

### 6. Chat / Messaging

* Direct messages
* Group chats
* Typing indicators
* Read receipts
* Voice messages
* @mentions & threaded replies

### 7. Contacts Directory

* Contractors, suppliers, villa-related contacts
* Shared across all users

### 8. Document Vault

* Staff contracts
* Lease
* Manuals (e.g., pump, appliances)
* Emergency instructions
* Category folders

### 9. Incident Reporting

* Staff can log problems with photos/videos
* Severity level
* Assign follow-up tasks

### 10. Analytics Dashboard

Generate monthly “Villa Health” insights:

* Task completion %
* Expense trends
* Attendance reliability
* Issue reports summary
* Overdue tasks heatmap

---

#  ALL EXPECTED USER WORKFLOWS (INCLUDE ALL)

Below is a complete list of workflows that must be fully implemented.

---

## A. Authentication & Profile Setup

### Workflow:

1. User signs up → chooses role.
2. Email/phone verification.
3. System requests additional info based on role.
4. User lands on dashboard.

### Required Screens:

* Welcome / Onboarding intro
* Signup / Login
* Role selection
* Profile setup forms
* First-time configuration wizard

---

## B. Staff Management

### Workflow:

1. Tenant adds staff member
2. Uploads profile & contract
3. Sets work days and shifts
4. Staff logs attendance (GPS-enabled)

### Required Screens:

* Staff list
* Staff profile (view/edit)
* Employment details modal
* Add staff form
* Attendance check-in UI
* Staff schedules
* Leave request system
* Leave manager for tenant

---

## C. Roster & Calendar

### Workflow:

1. Tenant defines recurring roster pattern
2. Auto-generate monthly roster
3. Staff view their schedule
4. Leave conflicts flagged
5. Add villa events & holidays

### Required Screens:

* Calendar (month/week/day views)
* Roster builder
* Auto-scheduler wizard
* Event details modal
* Holiday list

---

## D. Tasks & Workflows

### Workflow:

1. Create task or apply a template
2. Assign staff / groups
3. Staff completes task
4. Uploads photo/video if required
5. Tenant reviews & closes task

### Required Screens:

* Task list
* Task detail page
* Task creation form
* Checklist UI
* Photo uploader modal
* Workflow templates library
* Recurring task setup

---

## E. Expense Claims

### Workflow:

1. Staff uploads receipt → OCR extracts data
2. Tenant reviews & approves
3. Tenant can submit claim to landlord
4. Landlord approves or rejects
5. Status notifications sent

### Required Screens:

* Claims list
* Submit claim form
* Receipt scanner
* Approval UI
* Claim detail page
* Export reports modal

---

## F. Chat / Messaging

### Workflow:

1. User joins chats based on role
2. Can DM or create group chats
3. Send text, photo, file, voice
4. Search messages
5. Threaded replies

### Required Screens:

* Chat list
* Chat room
* Group creation modal
* Voice recording sheet
* Media attachments panel

---

## G. Contacts Directory

### Workflow:

1. Tenant adds contractor
2. Contact appears for all staff
3. Staff can call, message, or assign tasks

### Required Screens:

* Contact list
* Contact detail page
* Add/edit contact form

---

## H. Documents Vault

### Workflow:

1. Upload villa documents
2. Categorise into folders
3. Grant permissions by role
4. Staff/Admin downloads/view files

### Required Screens:

* Document categories
* Document list
* Upload modal
* PDF/image viewer

---

## I. Incident Reporting

### Workflow:

1. Staff detects issue
2. Takes photos/videos
3. Submits severity rating
4. Tenant converts report → task

### Required Screens:

* Incident list
* Incident detail
* Submit incident form
* Media capture modal

---

## J. Analytics

### Workflow:

1. System generates monthly insights
2. Tenant views organised metrics
3. Export to PDF

### Required Screens:

* Analytics dashboard
* Monthly report viewer
* PDF export view

---

#  **DATABASE SCHEMA (POSTGRES / SUPABASE)**

#  **1. USERS & AUTH**

> **Authentication is handled by Supabase Auth.**
> This table stores app-specific profile data for each user.

### **`profiles`**

Stores all user information after signup.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  full_name text,
  photo_url text,

  -- Roles: tenant / staff / landlord / manager / contractor
  role text check (role in ('tenant', 'staff', 'landlord', 'manager', 'contractor')),

  phone text,
  email text,

  -- Relationship to villas (a landlord could own many, staff work for one)
  default_villa_id uuid references villas(id),

  -- Staff-specific details
  bank_details jsonb,
  employment_start date,
  employment_end date,
  position text,           -- cleaner / gardener / maid / etc.

  -- For soft deletes
  is_active boolean default true
);
```

---

#  **2. VILLA MANAGEMENT TABLES**

### **`villas`**

Represents each villa.

```sql
create table villas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  name text,
  address text,
  tenant_id uuid references profiles(id),   -- primary tenant
  landlord_id uuid references profiles(id),
  manager_id uuid references profiles(id),

  photo_url text,
  timezone text default 'Asia/Makassar'
);
```

---

### **`villa_staff`**

Which staff work at which villa.

```sql
create table villa_staff (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id) on delete cascade,
  staff_id uuid references profiles(id) on delete cascade,

  role text,  -- cleaner, gardener, etc.
  notes text,

  unique (villa_id, staff_id)
);
```

---

#  **3. LEASE & DOCUMENTS**

### **`leases`**

```sql
create table leases (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id) on delete cascade,

  start_date date,
  end_date date,
  rent_amount numeric(12,2),
  rent_due_day integer check (rent_due_day between 1 and 31),

  contract_file_url text,
  property_manager_id uuid references profiles(id),

  created_at timestamptz default now()
);
```

---

### **`documents`**

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),

  uploader_id uuid references profiles(id),
  category text,  -- lease, staff_contract, manual, emergency, etc.
  title text,
  file_url text,

  created_at timestamptz default now()
);
```

---

#  **4. STAFF SCHEDULING, ROSTER & ATTENDANCE**

### **`staff_roster`**

```sql
create table staff_roster (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),
  staff_id uuid references profiles(id),

  work_date date,
  shift_start time,
  shift_end time,

  created_at timestamptz default now(),
  unique (staff_id, work_date)
);
```

---

### **`staff_attendance`**

```sql
create table staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id),
  villa_id uuid references villas(id),

  check_in timestamptz,
  check_out timestamptz,

  gps_check_in jsonb,
  gps_check_out jsonb,

  work_date date generated always as (date(check_in)) stored
);
```

---

### **`staff_leave_requests`**

```sql
create table staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id),
  villa_id uuid references villas(id),

  start_date date,
  end_date date,
  reason text,

  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  reviewed_by uuid references profiles(id),

  created_at timestamptz default now()
);
```

---

#  **5. CALENDAR / EVENTS**

### **`calendar_events`**

```sql
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),

  created_by uuid references profiles(id),

  title text,
  description text,
  event_date date,
  start_time time,
  end_time time,

  event_type text, -- roster, holiday, maintenance, general
  color text,

  created_at timestamptz default now()
);
```

---

#  **6. TASKS & WORKFLOWS**

### **`tasks`**

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),

  created_by uuid references profiles(id),
  title text,
  description text,

  due_date date,
  due_time time,
  priority text check (priority in ('low', 'medium', 'high')),
  status text check (status in ('open', 'in_progress', 'completed', 'overdue')) default 'open',

  requires_completion_photo boolean default false,
  recurrence_rule text,  -- iCal string for repeating tasks

  created_at timestamptz default now()
);
```

---

### **`task_assignees`**

```sql
create table task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  staff_id uuid references profiles(id)
);
```

---

### **`task_checklist_items`**

```sql
create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  text text,
  is_completed boolean default false
);
```

---

### **`task_completion_reports`**

```sql
create table task_completion_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id),
  staff_id uuid references profiles(id),

  notes text,
  photo_url text,
  submitted_at timestamptz default now()
);
```

---

# 💸] **7. EXPENSE & REIMBURSEMENT CLAIMS**

### **`expense_claims`**

```sql
create table expense_claims (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),

  submitted_by uuid references profiles(id),
  submitted_to uuid references profiles(id), -- tenant or landlord

  amount numeric(12,2),
  category text,
  description text,

  receipt_photo_url text,
  ocr_data jsonb,

  status text check (
    status in ('pending', 'approved', 'rejected', 'forwarded')
  ) default 'pending',

  forwarded_to uuid references profiles(id),  -- for landlord escalation

  created_at timestamptz default now()
);
```

---

#  **8. CHAT & MESSAGING SYSTEM**

### **`chat_rooms`**

```sql
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean default false,
  created_by uuid references profiles(id),
  villa_id uuid references villas(id),

  created_at timestamptz default now()
);
```

---

### **`chat_room_members`**

```sql
create table chat_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references chat_rooms(id) on delete cascade,
  user_id uuid references profiles(id)
);
```

---

### **`messages`**

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references chat_rooms(id) on delete cascade,
  sender_id uuid references profiles(id),

  content text,
  media_url text,
  voice_note_url text,
  reply_to uuid references messages(id),

  created_at timestamptz default now()
);
```

---

#  **9. CONTACTS DIRECTORY**

### **`contacts`**

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),

  name text,
  phone text,
  email text,
  company text,
  notes text,
  created_by uuid references profiles(id),

  created_at timestamptz default now()
);
```

---

#  **10. INCIDENT REPORTING**

### **`incidents`**

```sql
create table incidents (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid references villas(id),
  reported_by uuid references profiles(id),

  title text,
  description text,

  severity text check (severity in ('low', 'medium', 'high', 'critical')),
  photos jsonb,  -- array of URLs
  videos jsonb,

  status text check (status in ('open', 'in_review', 'converted_to_task', 'closed'))
       default 'open',

  created_at timestamptz default now()
);
```

---

# 📈 **11. ANALYTICS / LOGS**

### **`task_history_log`**

```sql
create table task_history_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id),
  changed_by uuid references profiles(id),

  previous_status text,
  new_status text,
  changed_at timestamptz default now()
);
```

---

### **`expense_history_log`**

```sql
create table expense_history_log (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references expense_claims(id),
  changed_by uuid references profiles(id),

  previous_status text,
  new_status text,
  changed_at timestamptz default now()
);
```

---

# 🧭 **12. ROLE-BASED ACCESS CONTROL (OPTIONAL ADVANCED)**

### **`role_permissions`**

```sql
create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text,
  permission text
);
```

---

#  **13. FULLTEXT SEARCH COMPATIBILITY**

Recommended indexes:

```sql
create extension if not exists pg_trgm;

create index idx_tasks_title_trgm ON tasks USING gin (title gin_trgm_ops);
create index idx_messages_search ON messages USING gin (content gin_trgm_ops);
create index idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);
```

---

#  DELIVERABLES THE AGENT MUST OUTPUT

### 1. Project scaffold

Extended from thecodingmachine/react-native-boilerplate with all modules, navigation, folders, and TypeScript interfaces.

### 2. Full screen directory with basic JSX and navigation

Every screen listed above should be generated.

### 3. API schemas (mock)

Endpoints + models for all workflows.

### 4. UI component library

Buttons, inputs, lists, cards, tabs, avatars, uploaders, calendars, etc.

### 5. Role-based permission guards

### 6. Placeholder logic for OCR, GPS check-in, offline sync

### 7. Database schema (use as blueprint for the backend API)

### 8. Documentation

A README describing:

* Setup
* Build process
* Adding features
* Code architecture
* Contribution guidelines


