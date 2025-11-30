# VillaSaya Mobile App

VillaSaya is a cross-platform React Native application for running Bali villas with collaborative tasking, roster management, expense workflows, chat, documents, and analytics. The project extends thecodingmachine/react-native-boilerplate with a modular domain structure, mock API schemas, and role-based access controls.

## Features
- **Authentication & onboarding** with role selection, profile setup, and first-time configuration wizard.
- **Staff operations**: profiles, contracts, bank details, GPS attendance, leave management, and rostered schedules.
- **Tasks & workflows**: recurring tasks, templates, checklists, SLA timers, completion photos, and contractor guest access.
- **Expense claims**: OCR receipt extraction, multi-step approvals (staff → tenant → landlord), history logs, and PDF exports.
- **Calendar & roster**: month/week/day calendar, roster builder, auto-scheduler, event details, and holiday tracking.
- **Messaging**: direct and group chat with media, voice notes, mentions, and threading placeholders.
- **Documents & contacts**: document vault with categories and permissions plus shared contractor directory.
- **Incident reporting**: media capture, severity ratings, and conversion to tasks.
- **Analytics**: monthly “Villa Health” dashboard with exportable reports.
- **Offline-first helpers**: mock sync queue and background sync simulation for queued operations.

## Project Structure
```
template/src
  App.tsx
  components/
    ui/                # Reusable primitives (cards, buttons, placeholder sections)
    forms/             # Form field helpers
  modules/
    auth/              # Welcome, login, role selection, profile setup, wizard
    users/             # Dashboard and lease management
    staff/             # Profiles, attendance, leave, roster views
    tasks/             # Task board, detail, creation, templates, recurring
    claims/            # Expense claims, approval, OCR scanner, exports
    chat/              # Chat list, rooms, media, voice
    calendar/          # Calendar views, roster builder, scheduler, events, holidays
    contacts/          # Directory list/detail/form
    documents/         # Categories, vault, upload, viewer
    notifications/     # Incident reporting and media capture
    analytics/         # Dashboards and PDF exports
  navigation/          # Bottom tabs + nested stacks and path definitions
  providers/           # Role provider and RBAC helpers
  services/api/        # Mock REST schemas and data fetchers
  utils/               # Permissions, OCR, GPS, offline sync utilities
```

## Setup
1. Install dependencies (Node >= 20):
   ```bash
   cd template
   yarn install
   ```
2. Start Metro bundler:
   ```bash
   yarn start
   ```
3. Run the app:
   ```bash
   yarn ios   # or yarn android
   ```

## Development Notes
- **Navigation** uses React Navigation with a bottom-tab layout and nested stacks for each domain.
- **Theming** leverages the boilerplate ThemeProvider with dark/light variants; UI primitives consume shared typography, colors, and spacing tokens.
- **RBAC** is provided through `RoleProvider` plus permission helpers in `src/utils/permissions.ts`.
- **API layer** contains typed schemas and mock services (`src/services/api`) aligned with the provided Postgres blueprint; replace with live endpoints as needed.
- **Offline & background sync** helpers live in `src/utils/offlineSync.ts`, with OCR and GPS placeholders in `src/utils/ocr.ts` and `src/utils/gps.ts`.
- **Testing & linting**:
  ```bash
  cd template
  yarn lint
  yarn test
  ```

## Adding Features
- Reuse UI primitives from `components/ui` and follow existing module boundaries.
- Add new screens inside the appropriate module directory and register routes in `navigation/paths.ts` and `navigation/Application.tsx`.
- Extend mock API types in `services/api/schemas.ts` and stub data in `services/api/mockApi.ts` before wiring live integrations.
- Update RBAC rules in `providers/RoleProvider.tsx` and `utils/permissions.ts` when introducing new permissions.

## Contribution Guidelines
- Keep changes scoped and consistent with the Asana-inspired visual language.
- Prefer typed interfaces, descriptive naming, and boilerplate design tokens.
- Maintain offline resilience by queuing network-dependent operations via `offlineSync` helpers when applicable.
