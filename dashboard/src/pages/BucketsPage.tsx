import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Plus, Trash2, Lock, Globe } from 'lucide-react';
import { adminApi } from '../lib/api';

interface BucketInfo {
    id: number;
    name: string;
    region: string;
    acl: string;
    createdAt: string;
    objectCount: number;
    totalSize: number;
}

interface AccessKeyOption {
    id: number;
    accessKeyId: string;
    displayName: string;
    isActive: boolean;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function BucketsPage() {
    const [buckets, setBuckets] = useState<BucketInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newBucketName, setNewBucketName] = useState('');
    const [newBucketRegion, setNewBucketRegion] = useState('us-east-1');
    const [selectedKeyId, setSelectedKeyId] = useState<number | ''>('');
    const [availableKeys, setAvailableKeys] = useState<AccessKeyOption[]>([]);
    const [creating, setCreating] = useState(false);
    const [newBucketAcl, setNewBucketAcl] = useState('private');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const navigate = useNavigate();

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchBuckets = async () => {
        try {
            const { data } = await adminApi.getBuckets();
            setBuckets(data.buckets);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { fetchBuckets(); }, []);

    const openCreateModal = async () => {
        setShowCreate(true);
        try {
            const { data } = await adminApi.getKeys();
            const keys = (data.keys as AccessKeyOption[]).filter(k => k.isActive);
            setAvailableKeys(keys);
            if (keys.length > 0) setSelectedKeyId(keys[0]!.id);
        } catch { /* ignore */ }
    };

    const handleCreate = async () => {
        if (!newBucketName.trim() || !selectedKeyId) return;
        setCreating(true);
        try {
            await adminApi.createBucket(newBucketName.trim(), newBucketRegion, selectedKeyId as number, newBucketAcl);
            setShowCreate(false);
            setNewBucketName('');
            setNewBucketRegion('us-east-1');
            setNewBucketAcl('private');
            setSelectedKeyId('');
            fetchBuckets();
            showToast('Bucket created successfully');
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to create bucket';
            showToast(msg, 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleToggleAcl = async (name: string, currentAcl: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newAcl = currentAcl === 'public-read' ? 'private' : 'public-read';
        try {
            await adminApi.updateBucketAcl(name, newAcl);
            fetchBuckets();
            showToast(`Bucket "${name}" set to ${newAcl}`);
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Failed to update ACL', 'error');
        }
    };

    const handleDelete = async (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Delete bucket "${name}"? All objects inside will be permanently deleted.`)) return;
        try {
            await adminApi.deleteBucket(name);
            fetchBuckets();
            showToast('Bucket deleted');
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to delete bucket';
            showToast(msg, 'error');
        }
    };

    if (loading) return <div className="empty-state"><p>Loading...</p></div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Buckets</h1>
                <p className="page-subtitle">Browse and manage your storage buckets</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-left">
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{buckets.length} bucket{buckets.length !== 1 ? 's' : ''}</span>
                </div>
                <button className="btn btn-primary" onClick={openCreateModal}>
                    <Plus size={14} /> Create Bucket
                </button>
            </div>

            {buckets.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Database />
                        <p>No buckets yet. Click "Create Bucket" to get started.</p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {buckets.map((b) => (
                        <div
                            key={b.id}
                            className="card"
                            style={{ cursor: 'pointer', transition: 'all var(--transition)', position: 'relative' }}
                            onClick={() => navigate(`/buckets/${b.name}`)}
                            onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {/* ACL toggle button */}
                            <button
                                className="btn-icon"
                                title={b.acl === 'public-read' ? 'Public (click to make private)' : 'Private (click to make public)'}
                                onClick={(e) => handleToggleAcl(b.name, b.acl, e)}
                                style={{ position: 'absolute', top: 14, right: 44 }}
                            >
                                {b.acl === 'public-read' ? <Globe size={14} /> : <Lock size={14} />}
                            </button>
                            {/* Delete button */}
                            <button
                                className="btn-icon danger"
                                title="Delete bucket"
                                onClick={(e) => handleDelete(b.name, e)}
                                style={{ position: 'absolute', top: 14, right: 14 }}
                            >
                                <Trash2 size={14} />
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div className="stat-icon accent"><Database size={18} /></div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>{b.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {b.region}
                                        <span style={{
                                            fontSize: 10,
                                            padding: '1px 6px',
                                            borderRadius: 4,
                                            background: b.acl === 'public-read' ? 'var(--success-subtle, #d4edda)' : 'var(--bg-secondary)',
                                            color: b.acl === 'public-read' ? 'var(--success, #28a745)' : 'var(--text-muted)',
                                            fontWeight: 500,
                                        }}>
                                            {b.acl === 'public-read' ? 'Public' : 'Private'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 700 }}>{b.objectCount.toLocaleString()}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Objects</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatBytes(b.totalSize)}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Size</div>
                                </div>
                            </div>
                            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                                Created {new Date(b.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Bucket Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Create Bucket</h2>
                        <div className="form-group">
                            <label>Bucket Name</label>
                            <input
                                type="text"
                                value={newBucketName}
                                onChange={(e) => setNewBucketName(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
                                placeholder="my-bucket-name"
                                autoFocus
                            />
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                3-63 characters, lowercase letters, numbers, dots, and hyphens only.
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Owner (Access Key)</label>
                            {availableKeys.length === 0 ? (
                                <div style={{ fontSize: 13, color: 'var(--warning)', padding: '10px 14px', background: 'var(--warning-subtle)', borderRadius: 'var(--radius-sm)' }}>
                                    ⚠️ No active access keys. Create one in the Keys page first.
                                </div>
                            ) : (
                                <select value={selectedKeyId} onChange={(e) => setSelectedKeyId(Number(e.target.value))}>
                                    {availableKeys.map((k) => (
                                        <option key={k.id} value={k.id}>
                                            {k.displayName} ({k.accessKeyId})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="form-group">
                            <label>Region</label>
                            <select value={newBucketRegion} onChange={(e) => setNewBucketRegion(e.target.value)}>
                                <option value="us-east-1">us-east-1</option>
                                <option value="us-west-2">us-west-2</option>
                                <option value="eu-west-1">eu-west-1</option>
                                <option value="ap-southeast-1">ap-southeast-1</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Access Control</label>
                            <select value={newBucketAcl} onChange={(e) => setNewBucketAcl(e.target.value)}>
                                <option value="private">🔒 Private — Authentication required</option>
                                <option value="public-read">🌐 Public Read — Anyone can read objects</option>
                            </select>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreate}
                                disabled={creating || newBucketName.length < 3 || !selectedKeyId}
                            >
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
