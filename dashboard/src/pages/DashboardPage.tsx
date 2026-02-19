import { useEffect, useState } from 'react';
import { Database, Package, HardDrive, Key, Clock, FileText } from 'lucide-react';
import { adminApi } from '../lib/api';

interface Stats {
    totalBuckets: number;
    totalObjects: number;
    totalStorageBytes: number;
    totalKeys: number;
    recentUploads: {
        key: string;
        bucket: string;
        size: number;
        contentType: string;
        createdAt: string;
    }[];
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        adminApi.getStats().then(({ data }) => {
            setStats(data);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    if (loading) return <div className="empty-state"><p>Loading...</p></div>;
    if (!stats) return <div className="empty-state"><p>Failed to load stats</p></div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Overview of your S3-compatible storage</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon accent"><Database size={20} /></div>
                    <div className="stat-value">{stats.totalBuckets}</div>
                    <div className="stat-label">Total Buckets</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Package size={20} /></div>
                    <div className="stat-value">{stats.totalObjects.toLocaleString()}</div>
                    <div className="stat-label">Total Objects</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warning"><HardDrive size={20} /></div>
                    <div className="stat-value">{formatBytes(stats.totalStorageBytes)}</div>
                    <div className="stat-label">Storage Used</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon danger"><Key size={20} /></div>
                    <div className="stat-value">{stats.totalKeys}</div>
                    <div className="stat-label">Access Keys</div>
                </div>
            </div>

            <div className="card">
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} /> Recent Uploads
                </h3>
                {stats.recentUploads.length === 0 ? (
                    <div className="empty-state">
                        <FileText />
                        <p>No recent uploads</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Bucket</th>
                                    <th>Size</th>
                                    <th>Type</th>
                                    <th>Uploaded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentUploads.map((u, i) => (
                                    <tr key={i}>
                                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{u.key}</td>
                                        <td><span className="badge badge-accent">{u.bucket}</span></td>
                                        <td className="file-size">{formatBytes(u.size)}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{u.contentType}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{timeAgo(u.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
