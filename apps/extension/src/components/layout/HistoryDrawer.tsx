/**
 * HistoryDrawer — M7: Session History Drawer
 *
 * A sliding drawer panel listing previous chat sessions grouped by date.
 * Allows viewing, renaming, and deleting past conversations.
 */
import React, { useEffect, useState } from 'react';
import { useHistoryStore, SessionEntry } from '../../store/history';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSession: (session: SessionEntry) => void;
}

function groupSessionsByDate(sessions: SessionEntry[]): Record<string, SessionEntry[]> {
  const now = Date.now();
  const groups: Record<string, SessionEntry[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    Older: [],
  };

  for (const session of sessions) {
    const diffMs = now - session.updatedAt;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 1) groups['Today'].push(session);
    else if (diffDays < 2) groups['Yesterday'].push(session);
    else if (diffDays < 7) groups['Last 7 Days'].push(session);
    else groups['Older'].push(session);
  }

  // Remove empty groups
  for (const key of Object.keys(groups)) {
    if (groups[key].length === 0) delete groups[key];
  }
  return groups;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  onRestoreSession,
}) => {
  const { sessions, loadSessions, deleteSession, renameSession } = useHistoryStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    if (isOpen) loadSessions();
  }, [isOpen]);

  const grouped = groupSessionsByDate(sessions);

  const startRename = (session: SessionEntry) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const commitRename = async () => {
    if (editingId && editTitle.trim()) {
      await renameSession(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 999,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '280px',
          height: '100%',
          background: 'linear-gradient(180deg, #1a1f2e 0%, #141824 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.5)',
          zIndex: 1000,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🕐</span>
            <span
              style={{
                fontWeight: 700,
                fontSize: '14px',
                color: '#f1f5f9',
                letterSpacing: '0.02em',
              }}
            >
              Chat History
            </span>
          </div>
          <button
            id="history-drawer-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: '18px',
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: '4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#94a3b8')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#64748b')}
          >
            ✕
          </button>
        </div>

        {/* Sessions list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {sessions.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#475569',
                fontSize: '13px',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
              <div>No chat history yet.</div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#334155' }}>
                Start a conversation to save sessions.
              </div>
            </div>
          ) : (
            Object.entries(grouped).map(([groupLabel, groupSessions]) => (
              <div key={groupLabel}>
                {/* Group label */}
                <div
                  style={{
                    padding: '8px 14px 4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {groupLabel}
                </div>

                {groupSessions.map((session) => (
                  <div
                    key={session.id}
                    style={{
                      position: 'relative',
                      margin: '1px 8px',
                      borderRadius: '8px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = 'transparent')
                    }
                  >
                    {editingId === session.id ? (
                      /* Inline rename input */
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        style={{
                          width: 'calc(100% - 20px)',
                          margin: '4px 10px',
                          padding: '6px 10px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(217,119,87,0.5)',
                          borderRadius: '6px',
                          color: '#f1f5f9',
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          gap: '8px',
                        }}
                        onClick={() => onRestoreSession(session)}
                      >
                        <span style={{ fontSize: '13px', flex: 1, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session.title || 'Untitled'}
                        </span>

                        {/* Action icons (show on parent hover via CSS workaround) */}
                        <div
                          style={{ display: 'flex', gap: '2px', flexShrink: 0 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            title="Rename"
                            onClick={() => startRename(session)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#475569',
                              fontSize: '11px',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#94a3b8')}
                            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#475569')}
                          >
                            ✏️
                          </button>
                          <button
                            title="Delete"
                            onClick={async () => {
                              if (confirm(`Delete "${session.title}"?`)) {
                                await deleteSession(session.id);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#475569',
                              fontSize: '11px',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#f87171')}
                            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#475569')}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Subtitle: message count + date */}
                    {editingId !== session.id && (
                      <div
                        style={{
                          padding: '0 10px 8px',
                          fontSize: '11px',
                          color: '#334155',
                        }}
                      >
                        {session.messages.length} messages ·{' '}
                        {new Date(session.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};
