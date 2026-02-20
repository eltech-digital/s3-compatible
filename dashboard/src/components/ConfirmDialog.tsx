import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null;

    const isDanger = variant === 'danger';
    const isWarning = variant === 'warning';

    return (
        <div
            className="modal-overlay"
            onClick={onCancel}
            style={{ zIndex: 1000 }}
        >
            <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: 440,
                    animation: 'fadeIn 0.15s ease-out',
                }}
            >
                {/* Icon + Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    {(isDanger || isWarning) && (
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isDanger ? 'rgba(229, 57, 53, 0.12)' : 'rgba(255, 183, 77, 0.12)',
                            flexShrink: 0,
                        }}>
                            <AlertTriangle
                                size={20}
                                color={isDanger ? 'var(--danger, #e53935)' : 'var(--warning, #ffb74d)'}
                            />
                        </div>
                    )}
                    <h2 className="modal-title" style={{ margin: 0 }}>{title}</h2>
                </div>

                {/* Message */}
                <p style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--text-muted)',
                    margin: '0 0 24px 0',
                    whiteSpace: 'pre-line',
                }}>
                    {message}
                </p>

                {/* Actions */}
                <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button
                        className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        style={isDanger ? {
                            background: 'var(--danger, #e53935)',
                            borderColor: 'var(--danger, #e53935)',
                            color: '#fff',
                        } : undefined}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
