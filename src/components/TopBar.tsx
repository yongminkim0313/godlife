import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  back?: boolean;
  actions?: ReactNode;
}

export function TopBar({ title, subtitle, back, actions }: Props) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="뒤로">
          ←
        </button>
      )}
      <div className="grow">
        <h1>{title}</h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
