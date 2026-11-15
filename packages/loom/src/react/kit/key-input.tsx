import { useState, type CSSProperties, type FC } from 'react';
import { COLORS } from './tokens.js';

const clashStyle: CSSProperties = { fontSize: 12, color: COLORS.danger };

// A name another entry has is kept on screen, marked, and not written: the
// entry is renamed once what is typed no longer clashes, and leaving the field
// shows the stored name again.
export const KeyInput: FC<{
  value: string;
  isTaken: (name: string) => boolean;
  onRename: (name: string) => void;
  placeholder?: string;
  style?: CSSProperties;
}> = ({ value, isTaken, onRename, placeholder, style }) => {
  const [clash, setClash] = useState<string | undefined>(undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <input
        value={clash ?? value}
        placeholder={placeholder}
        aria-invalid={clash !== undefined}
        onChange={(event) => {
          const name = event.target.value;
          if (name !== value && isTaken(name)) {
            setClash(name);
            return;
          }
          setClash(undefined);
          if (name !== value) onRename(name);
        }}
        onBlur={() => setClash(undefined)}
        style={clash === undefined ? style : { ...style, borderColor: COLORS.danger }}
      />
      {clash !== undefined ? <span role="alert" style={clashStyle}>{`"${clash}" is already a key`}</span> : null}
    </div>
  );
};
