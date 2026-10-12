import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, Usuario } from './api';

interface AuthCtx {
  user: Usuario | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

// Solo para pruebas de la interfaz sin servidor (VITE_SIN_LOGIN=true en el build): entra sin credenciales.
export const SIN_LOGIN = import.meta.env.VITE_SIN_LOGIN === 'true';
// Vista de avance con una copia de solo lectura de los datos reales (VITE_SNAPSHOT=true, junto con VITE_SIN_LOGIN=true).
export const SNAPSHOT = import.meta.env.VITE_SNAPSHOT === 'true';
const USUARIO_PRUEBA: Usuario = { id: 'prueba', nombres: 'Prueba', apellidos: 'Sin login', username: 'prueba', role: 'Administrador' };

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(SIN_LOGIN ? USUARIO_PRUEBA : null);
  const [loading, setLoading] = useState(!SIN_LOGIN && !!getToken());

  useEffect(() => {
    if (SIN_LOGIN || !getToken()) return;
    api
      .get('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const r = await api.post('/auth/login', { username, password });
    setToken(r.data.token);
    setUser(r.data.user);
  };
  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
