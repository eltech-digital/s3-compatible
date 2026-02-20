import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('admin_token');
            window.location.href = '/login';
        }
        return Promise.reject(err);
    },
);

export const adminApi = {
    login: (username: string, password: string) =>
        api.post('/admin/auth/login', { username, password }),

    getStats: () => api.get('/admin/stats'),

    getKeys: () => api.get('/admin/keys'),
    createKey: (displayName?: string) => api.post('/admin/keys', { displayName }),
    deleteKey: (id: number) => api.delete(`/admin/keys/${id}`),
    toggleKey: (id: number) => api.patch(`/admin/keys/${id}/toggle`),

    getBuckets: () => api.get('/admin/buckets'),
    createBucket: (name: string, region?: string, ownerId?: number, acl?: string) =>
        api.post('/admin/buckets', { name, region, ownerId, acl }),
    deleteBucket: (name: string) => api.delete(`/admin/buckets/${name}`),
    updateBucketAcl: (name: string, acl: string) => api.patch(`/admin/buckets/${name}`, { acl }),
    getObjects: (bucket: string, page = 1, limit = 50, prefix = '') =>
        api.get(`/admin/buckets/${bucket}/objects`, { params: { page, limit, prefix } }),
    deleteObject: (bucket: string, key: string) =>
        api.delete(`/admin/buckets/${bucket}/objects/${key}`),
};

export default api;
