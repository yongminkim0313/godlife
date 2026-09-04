import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/home', icon: '🏠', label: '홈' },
  { to: '/calendar', icon: '📅', label: '달력' },
  { to: '/schedule/new', icon: '➕', label: '등록' },
  { to: '/mail', icon: '📩', label: '메일' },
  { to: '/settings', icon: '⚙️', label: '설정' },
];

export function BottomNav() {
  return (
    <nav className="nav">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ic">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
