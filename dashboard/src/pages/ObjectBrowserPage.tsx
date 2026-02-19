import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { File, Folder, Trash2, Download, Search, ChevronRight, ArrowLeft, FileText } from 'lucide-react';
import { adminApi } from '../lib/api';

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
    const [objects, setObjects] = useState<ObjectInfo[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [prefix, setPrefix] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const fetchObjects = async (page = 1, pfx = prefix) => {
        if (!bucket) return;
        setLoading(true);
        try {
            const { data } = await adminApi.getObjects(bucket, page, 50, pfx);
            setObjects(data.objects);
            setPagination(data.pagination);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { fetchObjects(); }, [bucket, prefix]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleDelete = async (key: string) => {
        if (!bucket || !confirm(`Delete "${key}"? This cannot be undone.`)) return;
        try {
            await adminApi.deleteObject(bucket, key);
            fetchObjects(pagination.page);
            showToast('Object deleted');
        } catch {
            showToast('Failed to delete object', 'error');
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPrefix(searchInput);
    };

    const navigateToPrefix = (newPrefix: string) => {
        setPrefix(newPrefix);
        setSearchInput(newPrefix);
    };

    // Compute breadcrumb parts from prefix
    const breadcrumbParts = prefix ? prefix.split('/').filter(Boolean) : [];

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Link to="/buckets" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={20} /></Link>
                    {bucket}
                </h1>
                <p className="page-subtitle">{pagination.total} object{pagination.total !== 1 ? 's' : ''}</p>
            </div>

            {/* Breadcrumb */}
            {prefix && (
                <div className="breadcrumb">
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
            )}

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
                {loading ? (
                    <div className="empty-state"><p>Loading...</p></div>
                ) : objects.length === 0 ? (
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
                                        <th>Content Type</th>
                                        <th>Last Modified</th>
                                        <th style={{ width: 100 }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {objects.map((obj) => {
                                        const shortKey = prefix ? obj.key.slice(prefix.length) : obj.key;
                                        const isFolder = shortKey.includes('/');
                                        const folderName = isFolder ? shortKey.split('/')[0] + '/' : null;
                                        return (
                                            <tr key={obj.id}>
                                                <td style={{ width: 40, textAlign: 'center' }}>
                                                    {isFolder ? <Folder size={16} color="var(--accent)" /> : <span>{getFileIcon(obj.contentType)}</span>}
                                                </td>
                                                <td>
                                                    {isFolder && folderName ? (
                                                        <a href="#" onClick={(e) => { e.preventDefault(); navigateToPrefix(prefix + folderName); }} style={{ fontWeight: 500 }}>
                                                            {folderName}
                                                        </a>
                                                    ) : (
                                                        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{shortKey}</span>
                                                    )}
                                                </td>
                                                <td className="file-size">{formatBytes(obj.size)}</td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{obj.contentType}</td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                                    {new Date(obj.lastModified).toLocaleString()}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button className="btn-icon danger" title="Delete" onClick={() => handleDelete(obj.key)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="pagination">
                                <button
                                    className="btn btn-ghost btn-sm"
                                    disabled={pagination.page <= 1}
                                    onClick={() => fetchObjects(pagination.page - 1)}
                                >
                                    Previous
                                </button>
                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => fetchObjects(pagination.page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
