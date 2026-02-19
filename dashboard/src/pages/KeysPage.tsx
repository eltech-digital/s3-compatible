import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, ToggleLeft, ToggleRight, Key as KeyIcon, Shield } from 'lucide-react';
import { adminApi } from '../lib/api';

interface AccessKey {
    id: number;
    accessKeyId: string;
    displayName: string;
    isActive: boolean;
    createdAt: string;
}

interface NewKey {
    accessKeyId: string;
    secretAccessKey: string;
    displayName: string;
}

export default function KeysPage() {
    const [keys, setKeys] = useState<AccessKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [createdKey, setCreatedKey] = useState<NewKey | null>(null);
    const [copied, setCopied] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const fetchKeys = async () => {
        try {
            const { data } = await adminApi.getKeys();
            setKeys(data.keys);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { fetchKeys(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleCreate = async () => {
        try {
            const { data } = await adminApi.createKey(newKeyName || undefined);
            setCreatedKey(data);
            setShowCreate(false);
            setNewKeyName('');
            fetchKeys();
            showToast('Access key created');
        } catch {
            showToast('Failed to create key', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this access key? This action cannot be undone.')) return;
        try {
            await adminApi.deleteKey(id);
            fetchKeys();
            showToast('Key deleted');
        } catch {
            showToast('Failed to delete key', 'error');
        }
    };

    const handleToggle = async (id: number) => {
        try {
            await adminApi.toggleKey(id);
            fetchKeys();
        } catch {
            showToast('Failed to toggle key', 'error');
        }
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(''), 2000);
    };

    if (loading) return <div className="empty-state"><p>Loading...</p></div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Access Keys</h1>
                <p className="page-subtitle">Manage S3 API access credentials</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-left">
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{keys.length} key{keys.length !== 1 ? 's' : ''}</span>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    <Plus size={14} /> Generate Key
                </button>
            </div>

            <div className="card">
                {keys.length === 0 ? (
                    <div className="empty-state">
                        <KeyIcon />
                        <p>No access keys yet. Generate one to get started.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Access Key ID</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th style={{ width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map((k) => (
                                    <tr key={k.id}>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{k.displayName}</td>
                                        <td>
                                            <span className="copy-text" onClick={() => copyToClipboard(k.accessKeyId, `key-${k.id}`)}>
                                                <code>{k.accessKeyId}</code>
                                                {copied === `key-${k.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${k.isActive ? 'badge-success' : 'badge-danger'}`}>
                                                {k.isActive ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                            {new Date(k.createdAt).toLocaleDateString()}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn-icon" title={k.isActive ? 'Disable' : 'Enable'} onClick={() => handleToggle(k.id)}>
                                                    {k.isActive ? <ToggleRight size={16} color="var(--success)" /> : <ToggleLeft size={16} />}
                                                </button>
                                                <button className="btn-icon danger" title="Delete" onClick={() => handleDelete(k.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Generate Access Key</h2>
                        <div className="form-group">
                            <label>Display Name (optional)</label>
                            <input
                                type="text"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="e.g. my-app, backup-server"
                                autoFocus
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreate}>Generate</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Created Key Modal */}
            {createdKey && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: 480 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Shield size={20} color="var(--warning)" />
                            <h2 className="modal-title" style={{ margin: 0 }}>Key Created Successfully</h2>
                        </div>
                        <p style={{ color: 'var(--warning)', fontSize: 13, marginBottom: 16 }}>
                            ⚠️ Save the secret key now. It will not be shown again.
                        </p>
                        <div className="form-group">
                            <label>Access Key ID</label>
                            <div className="secret-box" onClick={() => copyToClipboard(createdKey.accessKeyId, 'new-access')}>
                                {createdKey.accessKeyId}
                                {copied === 'new-access' ? ' ✓' : ''}
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Secret Access Key</label>
                            <div className="secret-box" onClick={() => copyToClipboard(createdKey.secretAccessKey, 'new-secret')}>
                                {createdKey.secretAccessKey}
                                {copied === 'new-secret' ? ' ✓' : ''}
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={() => setCreatedKey(null)}>Done, I've saved it</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
