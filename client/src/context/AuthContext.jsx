import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { TOKEN_KEY } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [socket, setSocket] = useState(null);

  const applySession = useCallback(({ token: nextToken, user: nextUser }) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken || null);
    setUser(nextUser || null);
  }, []);

  // Load the current user whenever the token changes.
  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setUser(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Keep one authenticated socket for the session.
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      return undefined;
    }

    const next = connectSocket(token);
    setSocket(next);

    return () => {
      disconnectSocket();
      setSocket(null);
    };
  }, [token]);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    applySession(data);
    return data.user;
  }, [applySession]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    applySession(data);
    return data.user;
  }, [applySession]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    disconnectSocket();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = {
    user,
    token,
    socket,
    loading,
    isAuthenticated: Boolean(token && user),
    login,
    register,
    logout,
    refreshUser,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
