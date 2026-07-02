import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('trigen_user');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    function handleExpiredAuth() {
      setUser(null);
    }

    window.addEventListener('trigen-auth-expired', handleExpiredAuth);

    if (localStorage.getItem('trigen_token')) {
      apiRequest('/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => {});
    }

    return () => window.removeEventListener('trigen-auth-expired', handleExpiredAuth);
  }, []);

  async function login(email, password, role = 'user') {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password, role } });
    localStorage.setItem('trigen_token', data.token);
    localStorage.setItem('trigen_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function register(name, email, password) {
    const data = await apiRequest('/auth/register', { method: 'POST', body: { name, email, password } });
    localStorage.setItem('trigen_token', data.token);
    localStorage.setItem('trigen_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function loginWithGoogle(credential) {
    const data = await apiRequest('/auth/google', { method: 'POST', body: { credential } });
    localStorage.setItem('trigen_token', data.token);
    localStorage.setItem('trigen_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('trigen_token');
    localStorage.removeItem('trigen_user');
    localStorage.removeItem('trigen_project_id');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, loginWithGoogle, register, logout, isAdmin: user?.role === 'admin' }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
