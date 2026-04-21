import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function LiveClock({ compact = false }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = now.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateStr = now.toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
      }}>
        <Clock size={14} />
        <span>{timeStr}</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 18px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
        border: '1px solid rgba(99,102,241,0.2)',
        fontSize: 18,
        fontWeight: 700,
        fontFamily: 'monospace',
        color: '#4338ca',
        letterSpacing: 1,
      }}>
        <Clock size={18} style={{ color: '#6366f1' }} />
        <span>{timeStr}</span>
      </div>
      <span style={{
        fontSize: 12,
        fontWeight: 600,
        color: '#64748b',
      }}>
        {dateStr}
      </span>
    </div>
  );
}
