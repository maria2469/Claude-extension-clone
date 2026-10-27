/**
 * ApprovalCard — M3: Human-in-the-Loop Safety Approvals
 *
 * Renders an inline confirmation card when the agent wants to perform
 * a sensitive action (buy, submit, delete, etc.).
 */
import React from 'react';

export interface ApprovalRequest {
  approvalId: string;
  summary: string;       // e.g. 'Click "Confirm Order ($49.99)" on amazon.com'
  risk: 'low' | 'sensitive';
  origin: string;        // e.g. 'amazon.com'
  verdict?: string;      // filled in when resolved
}

export interface ApprovalCardProps {
  request: ApprovalRequest;
  onReply: (approvalId: string, allow: boolean, remember: 'none' | 'session' | 'always') => void;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ request, onReply }) => {
  const { approvalId, summary, risk, origin, verdict } = request;

  if (verdict) {
    const allowed = verdict === 'allowed';
    return (
      <div
        style={{
          margin: '8px 0',
          padding: '10px 14px',
          borderRadius: '10px',
          background: allowed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${allowed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: allowed ? '#86efac' : '#fca5a5',
        }}
      >
        <span>{allowed ? '✅' : '🚫'}</span>
        <span>
          {allowed ? 'Action approved' : 'Action denied'}: <em>{summary}</em>
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '8px 0',
        borderRadius: '12px',
        border: `1px solid ${risk === 'sensitive' ? 'rgba(251,146,60,0.5)' : 'rgba(148,163,184,0.3)'}`,
        background:
          risk === 'sensitive'
            ? 'linear-gradient(135deg, rgba(251,146,60,0.08), rgba(239,68,68,0.06))'
            : 'rgba(30,35,50,0.7)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span style={{ fontSize: '16px' }}>{risk === 'sensitive' ? '⚠️' : 'ℹ️'}</span>
        <span
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: risk === 'sensitive' ? '#fb923c' : '#94a3b8',
            letterSpacing: '0.02em',
          }}
        >
          {risk === 'sensitive' ? 'Action Requires Confirmation' : 'Malude wants to proceed'}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px 12px' }}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '13px',
            color: '#cbd5e1',
            lineHeight: 1.5,
          }}
        >
          Malude wants to:{' '}
          <strong style={{ color: '#f1f5f9', fontWeight: 600 }}>{summary}</strong>
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            id={`approval-allow-${approvalId}`}
            onClick={() => onReply(approvalId, true, 'none')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: 'linear-gradient(135deg, #d97757, #c2662d)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = '0.85')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = '1')}
          >
            Allow Once
          </button>

          <button
            id={`approval-allow-session-${approvalId}`}
            onClick={() => onReply(approvalId, true, 'session')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'rgba(255,255,255,0.06)',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.target as HTMLElement;
              el.style.background = 'rgba(255,255,255,0.12)';
              el.style.color = '#e2e8f0';
            }}
            onMouseLeave={(e) => {
              const el = e.target as HTMLElement;
              el.style.background = 'rgba(255,255,255,0.06)';
              el.style.color = '#94a3b8';
            }}
          >
            Always on {origin}
          </button>

          <button
            id={`approval-deny-${approvalId}`}
            onClick={() => onReply(approvalId, false, 'none')}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.target as HTMLElement;
              el.style.background = 'rgba(239,68,68,0.18)';
            }}
            onMouseLeave={(e) => {
              const el = e.target as HTMLElement;
              el.style.background = 'rgba(239,68,68,0.08)';
            }}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
};
