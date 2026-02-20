import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Plus } from 'lucide-react';
import { adminApi } from '../lib/api';

interface BucketInfo {
    id: number;
    name: string;
    region: string;
    acl: string;
    createdAt: string;
    objectCount: number;
    totalSize: number;
    maxSize: number;
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

    const [creating, setCreating] = useState(false);
    const [newBucketAcl, setNewBucketAcl] = useState('private');
    const [newBucketMaxSize, setNewBucketMaxSize] = useState(0);
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



    const handleCreate = async () => {
        if (!newBucketName.trim()) return;
        setCreating(true);
        try {
            await adminApi.createBucket(newBucketName.trim(), newBucketRegion, newBucketAcl, newBucketMaxSize);
            setShowCreate(false);
            setNewBucketName('');
            setNewBucketRegion('us-east-1');
            setNewBucketAcl('private');
            setNewBucketMaxSize(0);

            fetchBuckets();
            showToast('Bucket created successfully');
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to create bucket';
            showToast(msg, 'error');
        } finally {
            setCreating(false);
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
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
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
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        {b.maxSize > 0 ? `/ ${formatBytes(b.maxSize)}` : 'Size'}
                                    </div>
                                </div>
                            </div>
                            {b.maxSize > 0 && (
                                <div style={{ marginTop: 10, height: 4, background: 'var(--bg-secondary)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${Math.min(100, (b.totalSize / b.maxSize) * 100)}%`,
                                        background: (b.totalSize / b.maxSize) > 0.9 ? 'var(--danger, #e53935)' : 'var(--accent)',
                                        borderRadius: 2,
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                            )}
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
                        <div className="form-group">
                            <label>Storage Quota</label>
                            <select value={newBucketMaxSize} onChange={(e) => setNewBucketMaxSize(Number(e.target.value))}>
                                <option value={0}>♾️ Unlimited</option>
                                <option value={1073741824}>1 GB</option>
                                <option value={10737418240}>10 GB</option>
                                <option value={107374182400}>100 GB</option>
                                <option value={536870912000}>500 GB</option>
                                <option value={1099511627776}>1 TB</option>
                                <option value={5497558138880}>5 TB</option>
                                <option value={10995116277760}>10 TB</option>
                            </select>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreate}
                                disabled={creating || newBucketName.length < 3}
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
