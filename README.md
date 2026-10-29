# AgriTracker Web — Cloud Farm Management SPA

A modern Single-Page Application (SPA) built with **React**, **TypeScript**, **Vite**, and **CSS Modules**, designed for agricultural lifecycle tracking, event-sourced inventory management, weather telemetry, and fractional financial ledger accounting.

---

## Features

1. **Multi-Tenant Authentication & Security**
   - Powered by **Supabase Auth** and PostgreSQL **Row-Level Security (RLS)**.
   - Automatic tenant farm and manager profile provisioning via database triggers upon registration.
   - Protected client-side routing with React Router.

2. **Farm Dashboard & Live Weather Telemetry**
   - Real-time KPI summary cards (Total Asset Batches, Active Batches, Registered Zones, Current Temperature).
   - Live weather station powered by the **Open-Meteo API** with a 7-day forecast and browser GPS coordinate detection.
   - Automated agricultural weather alerts for extreme frost, storms, high winds, and heat stress.
   - Real-time feed of recent field operational events.

3. **Event-Sourced Asset Batch Management**
   - Track both **Crop** (`🌾`) and **Livestock** (`🐄`) batches across farm zones.
   - **Pure Event-Sourcing**: Current batch balances are dynamically computed from immutable operational event logs (`planting`, `feeding`, `medication`, `harvest`, `attrition`, `split`, `sale`) rather than mutable counters.
   - Per-batch **Unit Economics** view displaying allocated supply costs, commercial sales revenue, and net profitability.

4. **Fractional Financial Ledger**
   - **Vault Inventory**: Record bulk supply purchases (feed, fertilizer, seed, medication) with automatic unit-cost calculation.
   - **Cost Allocations**: Allocate vault supplies to specific asset batches with server-side PostgreSQL trigger validation and stock deduction.
   - **Commercial Sales**: Log batch sales in `RON` with automatic revenue calculation and inventory reduction.
   - **Spoilage Logs**: Track expired, spilled, or damaged supplies with automated financial loss write-offs.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript |
| **Build Tool** | Vite 8 |
| **Routing** | React Router v7 (`react-router-dom`) |
| **Styling** | Scoped CSS Modules + Custom CSS Variables |
| **Backend & Database** | Supabase (PostgreSQL, Auth, Row-Level Security, PL/pgSQL Triggers) |
| **Weather Telemetry** | Open-Meteo Forecast API |

---

## Project Structure

```text
src/
├── components/
│   ├── Layout.tsx              # Responsive sidebar shell & navigation
│   ├── Layout.module.css
│   └── ProtectedRoute.tsx      # Auth guard for private routes
├── context/
│   ├── AuthContext.tsx         # Supabase session & auth state provider
│   └── authContextInstance.ts
├── hooks/
│   ├── useAuth.ts              # Auth context consumer hook
│   └── useFarm.ts              # Farm, profile, and zone management hook
├── lib/
│   └── supabase.ts             # Supabase client singleton
├── pages/
│   ├── Auth.module.css
│   ├── LoginPage.tsx           # User sign-in page
│   ├── RegisterPage.tsx        # New farm account registration page
│   ├── DashboardPage.tsx       # KPIs, weather station, zones & recent activity
│   ├── DashboardPage.module.css
│   ├── AssetsPage.tsx          # Batch inventory, event logging & unit economics
│   ├── AssetsPage.module.css
│   ├── LedgerPage.tsx          # Vault supplies, allocations, sales & spoilage
│   └── LedgerPage.module.css
├── services/
│   └── weatherService.ts       # Open-Meteo API integration & alert engine
├── styles/
│   └── global.css              # Global reset & theme design tokens
├── types/
│   └── index.ts                # TypeScript interfaces & domain helpers
├── App.tsx                     # Application router configuration
└── main.tsx                    # React DOM entry point
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18 or newer)
- A **Supabase** project with the AgriTracker schema and RLS migrations applied

### 2. Installation

```bash
cd agri_tracker_web
npm install
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and provide your Supabase project credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run the Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run lint
npm run build
```
