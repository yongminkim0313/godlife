import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { NotificationInbox } from './components/NotificationInbox';
import { useApp } from './store/AppStore';
import { Splash } from './screens/Splash';
import { Login } from './screens/Login';
import { Home } from './screens/Home';
import { CalendarScreen } from './screens/CalendarScreen';
import { ScheduleForm } from './screens/ScheduleForm';
import { ScheduleDetail } from './screens/ScheduleDetail';
import { MailImportScreen } from './screens/MailImportScreen';
import { AiReview } from './screens/AiReview';
import { NotificationSettings } from './screens/NotificationSettings';
import { SettingsScreen } from './screens/SettingsScreen';
import { WidgetPreview } from './screens/WidgetPreview';

const CHROME_LESS = ['/', '/login', '/widget'];

export default function App() {
  const location = useLocation();
  const { online, inbox } = useApp();
  const bare = CHROME_LESS.includes(location.pathname);

  return (
    <div className={`app ${inbox.length > 0 && !bare ? 'has-inbox' : ''}`}>
      {!online && <div className="offline-bar">오프라인 · 저장된 일정으로 보고 있어요</div>}
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/calendar" element={<CalendarScreen />} />
        <Route path="/schedule/new" element={<ScheduleForm />} />
        <Route path="/schedule/:id/edit" element={<ScheduleForm />} />
        <Route path="/schedule/:id/:date" element={<ScheduleDetail />} />
        <Route path="/schedule/:id/:date/notifications" element={<NotificationSettings />} />
        <Route path="/mail" element={<MailImportScreen />} />
        <Route path="/mail/:id/review" element={<AiReview />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/widget" element={<WidgetPreview />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {!bare && <NotificationInbox />}
      {!bare && <BottomNav />}
    </div>
  );
}
