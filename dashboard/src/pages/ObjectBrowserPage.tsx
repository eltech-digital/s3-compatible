import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    Folder, Trash2, Search, ChevronRight, ArrowLeft, FileText,
    Settings, AlertTriangle, Link2
} from 'lucide-react';
import { adminApi } from '../lib/api';
import ConfirmDialog from '../components/ConfirmDialog';

interface BucketDetails {
    id: number;
    name: string;
    region: string;
    acl: string;
    maxSize: number;
    createdAt: string;
    objectCount: number;
    totalSize: number;
}

interface ObjectInfo {
    id: number;
    key: string;
    size: number;
    etag: string;
    contentType: string;
    lastModified: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(contentType: string) {
    if (contentType.startsWith('image/')) return '🖼️';
    if (contentType.startsWith('video/')) return '🎬';
    if (contentType.startsWith('audio/')) return '🎵';
    if (contentType.includes('pdf')) return '📄';
    if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gz')) return '📦';
    if (contentType.includes('json') || contentType.includes('xml') || contentType.includes('text')) return '📝';
    return '📎';
}

export default function ObjectBrowserPage() {
    const { bucket } = useParams<{ bucket: string }>();
    const navigate = useNavigate();

    // Bucket Details
    const [bucketInfo, setBucketInfo] = useState<BucketDetails | null>(null);
    const [activeTab, setActiveTab] = useState<'files' | 'settings'>('files');

    // Objects / Files Tab
    const [objects, setObjects] = useState<ObjectInfo[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [prefix, setPrefix] = useState('');
    const [searchInput, setSearchInput] = useState('');

    // UI State
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Confirm Dialog State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        confirmText: string;
        variant: 'danger' | 'warning' | 'default';
        onConfirm: () => void;
    }>({ open: false, title: '', message: '', confirmText: 'Confirm', variant: 'default', onConfirm: () => { } });

    const closeDialog = () => setConfirmDialog(prev => ({ ...prev, open: false }));

    // Initial Fetch
    const initPage = async () => {
        if (!bucket) return;
        setLoading(true);
        try {
            const [bRes, oRes] = await Promise.all([
                adminApi.getBucket(bucket),
                adminApi.getObjects(bucket, 1, 50, prefix)
            ]);
            setBucketInfo(bRes.data.bucket);
            setObjects(oRes.data.objects);
            setPagination(oRes.data.pagination);
        } catch {
            showToast('Failed to load bucket details', 'error');
        }
        setLoading(false);
    };

    useEffect(() => { initPage(); }, [bucket]);

    // Fetch Objects when prefix or pagination changes
    const fetchObjects = async (page = 1, pfx = prefix) => {
        if (!bucket) return;
        setRefreshing(true);
        try {
            const { data } = await adminApi.getObjects(bucket, page, 50, pfx);
            setObjects(data.objects);
            setPagination(data.pagination);
        } catch { /* ignore */ }
        setRefreshing(false);
    };

    // Whenever prefix changes, fetch page 1
    useEffect(() => {
        if (!loading) fetchObjects(1, prefix);
    }, [prefix]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // --- Actions ---

    // Object Actions
    const handleDeleteObject = (key: string) => {
        if (!bucket) return;
        setConfirmDialog({
            open: true,
            title: 'Delete Object',
            message: `Are you sure you want to delete "${key}"?\n\nThis action cannot be undone.`,
            confirmText: 'Delete',
            variant: 'danger',
            onConfirm: async () => {
                closeDialog();
                try {
                    await adminApi.deleteObject(bucket, key);
                    fetchObjects(pagination.page);
                    const { data } = await adminApi.getBucket(bucket);
                    setBucketInfo(data.bucket);
                    showToast('Object deleted');
                } catch {
                    showToast('Failed to delete object', 'error');
                }
            },
        });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPrefix(searchInput);
    };

    const handleGetLink = async (key: string) => {
        if (!bucket) return;
        try {
            const { data } = await adminApi.getObjectLink(bucket, key);
            await navigator.clipboard.writeText(data.url);
            showToast(data.expiresIn ? 'Presigned URL copied (expires in 24h)' : 'Public URL copied');
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Failed to get link', 'error');
        }
    };

    const navigateToPrefix = (newPrefix: string) => {
        setPrefix(newPrefix);
        setSearchInput(newPrefix);
    };

    // Settings Actions
    const handleUpdateBucket = async (updates: { acl?: string; maxSize?: number }) => {
        if (!bucket) return;
        try {
            await adminApi.updateBucket(bucket, updates);
            const { data } = await adminApi.getBucket(bucket);
            setBucketInfo(data.bucket);
            showToast('Bucket settings updated');
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Update failed', 'error');
        }
    };

    const handleDeleteBucket = () => {
        if (!bucket) return;
        setConfirmDialog({
            open: true,
            title: 'Delete Bucket',
            message: `Are you sure you want to delete bucket "${bucket}"?\n\nThis will permanently delete ALL objects inside the bucket. This action cannot be undone.`,
            confirmText: 'Delete Bucket',
            variant: 'danger',
            onConfirm: async () => {
                closeDialog();
                try {
                    await adminApi.deleteBucket(bucket);
                    navigate('/buckets');
                } catch (err: any) {
                    showToast(err.response?.data?.error || 'Failed to delete bucket', 'error');
                }
            },
        });
    };

    // --- Renders ---

    const breadcrumbParts = prefix ? prefix.split('/').filter(Boolean) : [];

    if (loading) return <div className="empty-state"><p>Loading...</p></div>;
    if (!bucketInfo) return <div className="empty-state"><p>Bucket not found</p></div>;

    return (
        <div style={{ paddingBottom: 80 }}>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Link to="/buckets" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={20} /></Link>
                        {bucketInfo.name}
                        <span style={{
                            fontSize: 12, padding: '2px 8px', borderRadius: 4,
                            background: bucketInfo.acl === 'public-read' ? 'var(--success-subtle)' : 'var(--bg-secondary)',
                            color: bucketInfo.acl === 'public-read' ? 'var(--success)' : 'var(--text-muted)',
                            fontWeight: 500,
                        }}>
                            {bucketInfo.acl === 'public-read' ? 'Public' : 'Private'}
                        </span>
                    </h1>
                    <p className="page-subtitle">
                        {bucketInfo.region} • Created {new Date(bucketInfo.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{formatBytes(bucketInfo.totalSize)}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {bucketInfo.objectCount.toLocaleString()} objects
                        {bucketInfo.maxSize > 0 && ` / ${formatBytes(bucketInfo.maxSize)} quota`}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                <button
                    onClick={() => setActiveTab('files')}
                    style={{
                        padding: '12px 4px',
                        background: 'none', border: 'none',
                        borderBottom: activeTab === 'files' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === 'files' ? 'var(--foreground)' : 'var(--text-muted)',
                        fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <Folder size={16} /> File Manager
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    style={{
                        padding: '12px 4px',
                        background: 'none', border: 'none',
                        borderBottom: activeTab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === 'settings' ? 'var(--foreground)' : 'var(--text-muted)',
                        fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <Settings size={16} /> Settings
                </button>
            </div>

            {/* TAB CONTENT: FILES */}
            {activeTab === 'files' && (
                <>
                    {/* Breadcrumb */}
                    <div className="breadcrumb" style={{ marginBottom: 16 }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); navigateToPrefix(''); }}>root</a>
                        {breadcrumbParts.map((part, i) => {
                            const path = breadcrumbParts.slice(0, i + 1).join('/') + '/';
                            return (
                                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ChevronRight size={12} />
                                    <a href="#" onClick={(e) => { e.preventDefault(); navigateToPrefix(path); }}>{part}</a>
                                </span>
                            );
                        })}
                    </div>

                    {/* Toolbar */}
                    <div className="toolbar">
                        <form className="toolbar-left" onSubmit={handleSearch}>
                            <div style={{ position: 'relative', maxWidth: 300, flex: 1 }}>
                                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    className="search-input"
                                    placeholder="Search by prefix..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    style={{ paddingLeft: 34 }}
                                />
                            </div>
                        </form>
                    </div>

                    {/* Objects Table */}
                    <div className="card">
                        {refreshing && <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Refreshing...</div>}

                        {objects.length === 0 && !refreshing ? (
                            <div className="empty-state">
                                <FileText />
                                <p>{prefix ? `No objects with prefix "${prefix}"` : 'This bucket is empty'}</p>
                            </div>
                        ) : (
                            <>
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th></th>
                                                <th>Key</th>
                                                <th>Size</th>
                                                <th>Type</th>
                                                <th>Last Modified</th>
                                                <th style={{ width: 60 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const folders = new Map<string, { count: number; totalSize: number }>();
                                                const files: ObjectInfo[] = [];

                                                for (const obj of objects) {
                                                    const shortKey = prefix ? obj.key.slice(prefix.length) : obj.key;
                                                    if (shortKey.includes('/')) {
                                                        const folderName = shortKey.split('/')[0]! + '/';
                                                        const existing = folders.get(folderName);
                                                        if (existing) {
                                                            existing.count++;
                                                            existing.totalSize += obj.size;
                                                        } else {
                                                            folders.set(folderName, { count: 1, totalSize: obj.size });
                                                        }
                                                    } else {
                                                        files.push(obj);
                                                    }
                                                }

                                                const rows: React.JSX.Element[] = [];

                                                // Folders
                                                folders.forEach((info, folderName) => {
                                                    rows.push(
                                                        <tr key={`folder-${folderName}`}>
                                                            <td style={{ width: 40, textAlign: 'center' }}><Folder size={16} color="var(--accent)" /></td>
                                                            <td>
                                                                <a href="#" onClick={(e) => { e.preventDefault(); navigateToPrefix(prefix + folderName); }} style={{ fontWeight: 500 }}>
                                                                    {folderName}
                                                                </a>
                                                            </td>
                                                            <td className="file-size">{formatBytes(info.totalSize)}</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>Folder ({info.count})</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</td>
                                                            <td></td>
                                                        </tr>
                                                    );
                                                });

                                                // Files
                                                files.forEach(obj => {
                                                    const shortKey = prefix ? obj.key.slice(prefix.length) : obj.key;
                                                    rows.push(
                                                        <tr key={obj.id}>
                                                            <td style={{ width: 40, textAlign: 'center' }}><span>{getFileIcon(obj.contentType)}</span></td>
                                                            <td><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{shortKey}</span></td>
                                                            <td className="file-size">{formatBytes(obj.size)}</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{obj.contentType}</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{new Date(obj.lastModified).toLocaleString()}</td>
                                                            <td style={{ display: 'flex', gap: 4 }}>
                                                                <button className="btn-icon" title="Copy Link" onClick={() => handleGetLink(obj.key)}>
                                                                    <Link2 size={14} />
                                                                </button>
                                                                <button className="btn-icon danger" title="Delete" onClick={() => handleDeleteObject(obj.key)}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                });

                                                return rows;
                                            })()}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {pagination.totalPages > 1 && (
                                    <div className="pagination">
                                        <button className="btn btn-ghost btn-sm" disabled={pagination.page <= 1} onClick={() => fetchObjects(pagination.page - 1)}>Previous</button>
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Page {pagination.page} of {pagination.totalPages}</span>
                                        <button className="btn btn-ghost btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchObjects(pagination.page + 1)}>Next</button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}

            {/* TAB CONTENT: SETTINGS */}
            {activeTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* General Settings */}
                    <div className="card">
                        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Settings size={18} /> General Settings
                        </h3>

                        <div className="form-group" style={{ maxWidth: 400 }}>
                            <label>Access Control (ACL)</label>
                            <div className="select-wrapper">
                                <select
                                    value={bucketInfo.acl}
                                    onChange={(e) => handleUpdateBucket({ acl: e.target.value })}
                                >
                                    <option value="private">🔒 Private — Authentication required</option>
                                    <option value="public-read">🌐 Public Read — Anyone can read objects</option>
                                </select>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                                Controls who can access objects in this bucket.
                            </p>
                        </div>

                        <div className="form-group" style={{ maxWidth: 400, marginTop: 20 }}>
                            <label>Storage Quota</label>
                            <div className="select-wrapper">
                                <select
                                    value={bucketInfo.maxSize}
                                    onChange={(e) => handleUpdateBucket({ maxSize: Number(e.target.value) })}
                                >
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
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                                Max storage size allowed for this bucket. Current usage: <strong>{formatBytes(bucketInfo.totalSize)}</strong>
                            </p>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="card" style={{ border: '1px solid var(--danger)', background: 'var(--danger-subtle)' }}>
                        <h3 className="card-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <AlertTriangle size={18} /> Danger Zone
                        </h3>
                        <p style={{ fontSize: 13, marginBottom: 16 }}>
                            Actions here are destructive and cannot be undone.
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>Delete Bucket</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    Permanently delete this bucket and all {bucketInfo.objectCount.toLocaleString()} objects inside.
                                </div>
                            </div>
                            <button className="btn btn-primary danger" onClick={handleDeleteBucket}>
                                <Trash2 size={14} /> Delete Bucket
                            </button>
                        </div>
                    </div>

                </div>
            )}

            <ConfirmDialog
                open={confirmDialog.open}
                title={confirmDialog.title}
                message={confirmDialog.message}
                confirmText={confirmDialog.confirmText}
                variant={confirmDialog.variant}
                onConfirm={confirmDialog.onConfirm}
                onCancel={closeDialog}
            />

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
