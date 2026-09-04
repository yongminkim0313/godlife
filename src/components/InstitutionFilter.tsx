import { INSTITUTION_LABEL } from '../types';
import type { InstitutionKind } from '../types';
import { useApp } from '../store/AppStore';

const ORDER: InstitutionKind[] = ['kindergarten', 'daycare', 'home'];

/** 기관 필터 (기획서 핵심요구 5). 홈·달력이 같은 필터 상태를 공유한다. */
export function InstitutionFilter() {
  const { settings, toggleInstitution } = useApp();
  return (
    <div className="chip-row" role="group" aria-label="기관 필터">
      {ORDER.map((kind) => {
        const on = settings.institutionFilter.includes(kind);
        return (
          <button key={kind} className={`chip ${on ? 'on' : ''}`} onClick={() => toggleInstitution(kind)} aria-pressed={on}>
            {INSTITUTION_LABEL[kind]}
          </button>
        );
      })}
    </div>
  );
}
