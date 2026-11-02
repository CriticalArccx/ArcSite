import './arcapp.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabaseClient'
import AppShell from './pages/arcapp/AppShell'
import DashboardPage from './pages/arcapp/pages/DashboardPage'
import TodoPage from './pages/arcapp/pages/TodoPage'
import MilestonesPage from './pages/arcapp/pages/MilestonesPage'
import SchedulePage from './pages/arcapp/pages/SchedulePage'
import JointPacksPage from './pages/arcapp/pages/JointPacksPage'
import SubmittalsPage from './pages/arcapp/pages/SubmittalsPage'
import AssetAttributesPage from './pages/arcapp/pages/AssetAttributesPage'
import EquipmentTrackerPage from './pages/arcapp/pages/EquipmentTrackerPage'
import SettingsPage from './pages/arcapp/pages/SettingsPage'
import ChecklistReadyPanel from './pages/arcapp/components/ChecklistReadyPanel'
import IssuesReviewPanel from './pages/arcapp/components/IssuesReviewPanel'
import TamperSealLogPanel from './pages/arcapp/components/TamperSealLogPanel'
import RtftTrackerPanel from './pages/arcapp/components/RtftTrackerPanel'
import NetaTrackerPanel from './pages/arcapp/components/NetaTrackerPanel'

function SetupRequired() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#141718',
        color: '#f3f2ee',
        fontFamily: 'monospace',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>⚠ Supabase isn&apos;t configured yet</h1>
        <p style={{ lineHeight: 1.6, color: '#b5afa2' }}>
          <code>VITE_SUPABASE_URL</code> and/or <code>VITE_SUPABASE_ANON_KEY</code> are missing or
          invalid. This used to cause a blank screen with no explanation — now it shows this
          instead.
        </p>
        <ol style={{ lineHeight: 1.8, color: '#b5afa2' }}>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> in the project root.
          </li>
          <li>
            Fill in real values from your Supabase project&apos;s Settings → API page.
          </li>
          <li>
            Restart <code>npm run dev</code> — Vite only reads <code>.env</code> on startup, not
            on hot-reload.
          </li>
        </ol>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="todo" element={<TodoPage />} />
        <Route path="milestones" element={<MilestonesPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="checklists" element={<ChecklistReadyPanel />} />
        <Route path="issues" element={<IssuesReviewPanel />} />
        <Route path="submittals" element={<SubmittalsPage />} />
        <Route path="jointpacks" element={<JointPacksPage />} />
        <Route path="tamperseals" element={<TamperSealLogPanel />} />
        <Route path="rtft" element={<RtftTrackerPanel />} />
        <Route path="attributes" element={<AssetAttributesPage />} />
        <Route path="netatracker" element={<NetaTrackerPanel />} />
        <Route path="equipmenttracker" element={<EquipmentTrackerPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
