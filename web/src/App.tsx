import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.tsx';
import { Spinner } from './components/ui.tsx';
import { VillaLayout } from './components/VillaLayout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { AcceptInvitePage } from './pages/AcceptInvitePage.tsx';
import { VillaPickerPage } from './pages/VillaPickerPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { TasksPage } from './pages/TasksPage.tsx';
import { RosterPage } from './pages/RosterPage.tsx';
import { LeavePage } from './pages/LeavePage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { MessagesPage } from './pages/MessagesPage.tsx';
import { PeoplePage } from './pages/PeoplePage.tsx';
import { RolesPage } from './pages/RolesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';

export function App() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Opening your workspace" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        {/* Anything else bounces to sign-in, preserving where they were headed. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/" element={<VillaPickerPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/villas/:villaId" element={<VillaLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:taskId" element={<TasksPage />} />
        <Route path="roster" element={<RosterPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="expenses/:claimId" element={<ExpensesPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:channelId" element={<MessagesPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
