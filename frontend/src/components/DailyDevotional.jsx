import { useState, useEffect } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';

const API_URL = 'https://micromab.com/wp-json/openheavens/v1/today';

export default function DailyDevotional() {
  const [devotional, setDevotional] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDevotional = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDevotional(data);
    } catch {
      setError('Could not load today\'s devotional. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevotional();
  }, []);

  if (loading) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(10px)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid rgba(99,102,241,0.15)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '3px solid #e2e8f0',
          borderTopColor: '#6366f1',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 8px',
        }} />
        <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Loading today\'s devotional...</p>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(10px)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid rgba(234,179,8,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <BookOpen size={18} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Open Heavens Devotional</span>
        </div>
        <p style={{ fontSize: 12, color: '#92400e', marginBottom: 10 }}>{error}</p>
        <button
          onClick={fetchDevotional}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#f59e0b',
            color: '#fff',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const title = devotional?.title || devotional?.topic || 'Open Heavens';
  const date = devotional?.date || new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const content = devotional?.content || devotional?.body || devotional?.message || '';
  const bibleReading = devotional?.bible_reading || devotional?.scripture || '';

  // Truncate content for compact display
  const shortContent = content.length > 300 ? content.substring(0, 300) + '...' : content;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)',
      borderRadius: 16,
      padding: 18,
      border: '1px solid rgba(99,102,241,0.12)',
      maxWidth: 420,
      animation: 'fadeInUp 0.6s ease both',
    }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(15px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}>
            <BookOpen size={17} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1.2 }}>
              RCCG Open Heavens
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, fontWeight: 500 }}>{date}</p>
          </div>
        </div>
        <button
          onClick={fetchDevotional}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            padding: 4,
            borderRadius: 6,
          }}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: 16,
        fontWeight: 800,
        color: '#4338ca',
        margin: '0 0 6px 0',
        lineHeight: 1.3,
      }}>
        {title}
      </h3>

      {/* Bible Reading */}
      {bibleReading && (
        <p style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#059669',
          background: '#ecfdf5',
          padding: '5px 10px',
          borderRadius: 8,
          marginBottom: 10,
          display: 'inline-block',
        }}>
          {bibleReading}
        </p>
      )}

      {/* Content */}
      <div style={{
        fontSize: 13,
        color: '#475569',
        lineHeight: 1.6,
        maxHeight: 150,
        overflowY: 'auto',
        paddingRight: 4,
      }}>
        {shortContent}
      </div>
    </div>
  );
}
