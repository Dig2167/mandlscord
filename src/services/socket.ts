import { io, Socket } from 'socket.io-client';

const SOCKET_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? window.location.origin 
  : 'http://localhost:3001';

const API_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? '/api' 
  : 'http://localhost:3001/api';

class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    localStorage.setItem('token', token || '');
  }

  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  connect() {
    const token = this.getToken();
    if (!token) {
      console.error('No token available');
      return null;
    }

    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      if (error.message === 'Invalid token' || error.message === 'Authentication required') {
        this.disconnect();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
      }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.disconnect();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
      throw new Error('Unauthorized');
    }

    return response;
  }

  async checkUsername(username: string): Promise<boolean> {
    const res = await fetch(`${API_URL}/check-username/${username}`);
    const data = await res.json();
    return data.exists;
  }

  async register(data: { username: string; email: string; displayName: string; password: string }) {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    
    const result = await res.json();
    this.setToken(result.token);
    return result;
  }

  async login(username: string, password: string) {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    
    const result = await res.json();
    this.setToken(result.token);
    return result;
  }

  async verifyToken() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await this.fetchWithAuth('/verify');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async searchUsers(query: string) {
    const res = await this.fetchWithAuth(`/users/search/${query}`);
    if (!res.ok) throw new Error('Search failed');
    return await res.json();
  }

  async getUser(username: string) {
    const res = await this.fetchWithAuth(`/users/${username}`);
    if (!res.ok) throw new Error('User not found');
    return await res.json();
  }

  async updateProfile(username: string, updates: Record<string, unknown>) {
    const res = await this.fetchWithAuth(`/users/${username}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Update failed');
    return await res.json();
  }

  async changePassword(oldPassword: string, newPassword: string) {
    const res = await this.fetchWithAuth('/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    return await res.json();
  }

  logout() {
    this.disconnect();
    this.setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

export const socketService = new SocketService();
export default socketService;
