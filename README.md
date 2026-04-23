# whenever — AI-Powered Event Planner

> A smart personal scheduler that lets you add events in plain English, auto-categorizes them, and acts on your behalf — like a real assistant.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Features Built (Week 1)](#features-built-week-1)
- [File Breakdown](#file-breakdown)
- [Roadmap](#roadmap)
- [Deployment](#deployment)

---

## Project Overview

**whenever** is a web application that helps users manage their personal events across five categories — Work, Family, Call, Travel, and Personal. The long-term vision is a natural language AI scheduler where you type something like *"remind me to call John tomorrow at 3pm"* and the app parses, categorizes, and schedules it automatically — then acts on it (e.g. opens the dialer) with a pre-event confirmation prompt.

Week 1 establishes the full foundation: authentication, database, and complete CRUD event management.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + Vite | UI framework and build tool |
| Routing | React Router DOM | Multi-page navigation |
| Backend / Database | Supabase (PostgreSQL) | Stores all event data |
| Authentication | Supabase Auth | User signup, login, session management |
| Deployment | Vercel | Hosting and CI/CD |
| Future: AI | Claude API (Anthropic) | Natural language event parsing |
| Future: Notifications | Upstash QStash | Scheduled push notifications |

---

## Project Structure

```
whenever/
├── public/
├── src/
│   ├── context/
│   │   └── AuthContext.jsx       # Global auth state management
│   ├── pages/
│   │   ├── Login.jsx             # Login page
│   │   ├── Signup.jsx            # Signup page
│   │   └── Dashboard.jsx         # Main app page (CRUD events)
│   ├── App.jsx                   # Routing and route protection
│   ├── main.jsx                  # App entry point, wraps with AuthProvider
│   ├── supabaseClient.js         # Supabase connection initializer
│   └── index.css                 # Global styles
├── .env                          # Environment variables (never commit this)
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

---

## Environment Variables

Create a `.env` file in the root of your project with the following:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

**Where to find these:**
1. Go to your Supabase project dashboard
2. Click **Project Settings** → **API**
3. Copy the **Project URL** and **anon public** key

> ⚠️ Never use the `service_role` key in frontend code. It has full admin access and must never be exposed.

> ⚠️ Never commit your `.env` file to GitHub. It is already listed in `.gitignore`.

---

## Getting Started

### Prerequisites

- Node.js (LTS) — [nodejs.org](https://nodejs.org)
- VS Code — [code.visualstudio.com](https://code.visualstudio.com)
- Git — [git-scm.com](https://git-scm.com)
- A Supabase account — [supabase.com](https://supabase.com)
- A Vercel account — [vercel.com](https://vercel.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/whenever.git

# Navigate into the project
cd whenever

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open your browser at `http://localhost:5173`

---

## Database Schema

The app uses a single table in Supabase called `events`.

### Table: `events`

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `id` | uuid | gen_random_uuid() | No | Primary key, auto-generated |
| `created_at` | timestamptz | now() | No | Timestamp of creation |
| `user_id` | uuid | auth.uid() | No | Links event to the logged-in user |
| `title` | text | untitled | No | Name of the event |
| `category` | text | personal | No | One of: work, family, call, travel, personal |
| `date` | date | 2026-01-01 | No | Date of the event |
| `time` | time | 09:00:00 | No | Time of the event |
| `notify_before` | int4 | 15 | No | Minutes before event to send reminder |
| `action` | text | none | Yes | Optional action: e.g. "call" |
| `action_data` | text | none | Yes | Data for action: e.g. phone number |
| `status` | text | upcoming | No | Event status: upcoming, cancelled, done |

### Row Level Security (RLS) Policies

RLS is enabled on the `events` table. The following policies are applied:

| Policy Name | Command | Expression |
|-------------|---------|------------|
| Users can read own events | SELECT | `auth.uid() = user_id` |
| Users can insert own events | INSERT | `auth.uid() = user_id` |
| Users can delete own events | DELETE | `auth.uid() = user_id` |

> These policies ensure that every user can only see and manage their own events. No user can access another user's data.

---

## Authentication

Authentication is handled entirely by **Supabase Auth**.

### How It Works

1. User signs up with email and password via `supabase.auth.signUp()`
2. Supabase sends a confirmation email (can be disabled in development)
3. User logs in via `supabase.auth.signInWithPassword()`
4. Supabase returns a session which is stored and managed automatically
5. `AuthContext.jsx` listens to auth state changes and keeps the app in sync
6. Protected routes in `App.jsx` redirect unauthenticated users to `/login`
7. User logs out via `supabase.auth.signOut()`

### AuthContext

`src/context/AuthContext.jsx` provides:

- `user` — the currently authenticated user object (or `null`)
- `loading` — boolean, true while Supabase is checking session on load
- `useAuth()` — a custom hook any component can use to access the above

```jsx
// Example usage in any component
import { useAuth } from '../context/AuthContext'

const { user } = useAuth()
console.log(user.email) // logged in user's email
```

---

## Features Built (Week 1)

### ✅ Signup
- Route: `/signup`
- User enters email and password
- Account is created via Supabase Auth
- Confirmation email is sent (toggle in Supabase Auth settings)

### ✅ Login
- Route: `/login`
- User enters email and password
- Session is created and stored
- User is redirected to the dashboard

### ✅ Logout
- Button on the dashboard
- Clears the Supabase session
- User is redirected to `/login`

### ✅ Protected Routes
- The `/` route checks if a user is logged in
- If logged in → shows Dashboard
- If not logged in → redirects to `/login`

### ✅ Create Event
- Form on the dashboard
- Fields: title, category (dropdown), date, time
- Saves to Supabase `events` table
- Event appears in the list immediately after saving

### ✅ Read Events
- Events are fetched from Supabase on page load
- Filtered by the logged-in user's `user_id`
- Sorted by date ascending
- Displayed as a list with title, category, date and time

### ✅ Update Event
- Each event has an Edit button
- Clicking Edit expands an inline form pre-filled with current values
- User can change title, category, date or time
- Clicking Save updates the record in Supabase and refreshes the list
- Clicking Cancel closes the form without saving

### ✅ Delete Event
- Each event has a Delete button
- Clicking Delete removes the record from Supabase
- Event disappears from the list immediately

---

## File Breakdown

### `src/supabaseClient.js`
Initializes the Supabase client using environment variables. Exported as `supabase` and imported by any file that needs to talk to the database or auth system.

### `src/context/AuthContext.jsx`
Creates a React context that tracks the logged-in user across the entire app. Uses `supabase.auth.getSession()` on load and `supabase.auth.onAuthStateChange()` to listen for login/logout events in real time.

### `src/main.jsx`
The entry point of the app. Wraps the entire `<App />` with `<AuthProvider>` so every page has access to the auth context.

### `src/App.jsx`
Sets up React Router with three routes: `/login`, `/signup`, and `/` (dashboard). The dashboard route is protected — it checks `user` from `useAuth()` and redirects to login if no session exists.

### `src/pages/Signup.jsx`
A simple form that calls `supabase.auth.signUp()` with the user's email and password. Shows a success message asking the user to confirm their email.

### `src/pages/Login.jsx`
A form that calls `supabase.auth.signInWithPassword()`. On success, the `AuthContext` detects the new session and `App.jsx` automatically redirects the user to the dashboard.

### `src/pages/Dashboard.jsx`
The main page of the app. Contains:
- Event list (fetched from Supabase, filtered by `user_id`)
- Inline edit form per event
- Delete button per event
- `AddEventForm` component at the bottom for creating new events
- Logout button

---

## Roadmap

### ✅ Week 1 — Auth + CRUD
Foundation: user accounts, database, full event management.

### 🔲 Week 2 — GitHub + Vercel Deployment
Push code to GitHub. Connect to Vercel for live deployment with automatic deploys on every push.

### 🔲 Week 3 — AI Natural Language Input
Integrate Claude API to parse plain English into structured events. User types *"dentist appointment next Tuesday at 10am"* and the app fills in all fields automatically.

### 🔲 Week 4 — Push Notifications + Scheduling
Add service worker and Web Push API for browser notifications. Use Upstash QStash to schedule server-side jobs that fire X minutes before each event. Pre-event confirmation prompt lets users cancel or act.

### 🔲 Week 5 — Calendar View + Daily Digest
Add a monthly calendar view alongside the list view. Send a morning summary of the day's events via email or notification.

### 🔲 Week 6 — Polish + PWA
Apply the full UI design (dark editorial theme). Add PWA support (manifest.json + service worker) so the app is installable on mobile. Add conflict detection — warn when two events overlap.

### 🔲 Future — Google Calendar Sync
OAuth integration with Google Calendar API and Microsoft Graph API for two-way event sync.

---

## Deployment

The app is deployed on **Vercel**.

### Steps to Deploy

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repository
4. Add environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click Deploy

Every time you push to the `main` branch, Vercel automatically redeploys the app.

---

## Notes for Developers

- The `.env` file is excluded from Git via `.gitignore`. Always add environment variables manually in Vercel's dashboard when deploying.
- During development, you can disable email confirmation in Supabase under **Authentication → Providers → Email** to speed up testing.
- RLS policies must be set correctly on the `events` table or all database operations will return a 403 error.
- The `user_id` column uses `auth.uid()` as its default value, which automatically links every new event to the currently logged-in user.

---

*Built with React, Vite, and Supabase. Designed to grow into a full AI-powered personal assistant.*