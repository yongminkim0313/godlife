import type { Preparation } from '../types';

interface Props {
  preparations: Preparation[];
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
}

/** 준비물 목록 (기획서 3.4). 상세 화면에서 체크하고, 하루 전 알림에 첨부된다. */
export function PreparationList({ preparations, onToggle, onRemove }: Props) {
  if (preparations.length === 0) return <p className="muted small">등록된 준비물이 없습니다.</p>;
  return (
    <div>
      {preparations.map((prep) => (
        <div key={prep.id} className={`prep ${prep.checked ? 'checked' : ''}`}>
          <input
            type="checkbox"
            checked={prep.checked}
            onChange={() => onToggle?.(prep.id)}
            disabled={!onToggle}
            aria-label={`${prep.text} 준비 완료`}
          />
          <span className="grow">{prep.text}</span>
          {onRemove && (
            <button className="icon-btn" onClick={() => onRemove(prep.id)} aria-label={`${prep.text} 삭제`}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
