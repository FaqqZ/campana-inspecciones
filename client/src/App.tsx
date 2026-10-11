import { ReactNode } from 'react';
import { Navigate, Route, Routes, NavLink, Outlet } from 'react-router-dom';
import { AppBar, Avatar, Box, Button, Chip, CircularProgress, Stack, Toolbar, Typography } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import { SIN_LOGIN, useAuth } from './auth';
import Login from './pages/Login';
import MapaPage from './pages/MapaPage';
import EdificiosPage from './pages/EdificiosPage';
import ImportarPage from './pages/ImportarPage';
import CatalogosPage from './pages/CatalogosPage';
import InfraccionesPage from './pages/InfraccionesPage';
import UsuariosPage from './pages/UsuariosPage';
import KpisPage from './pages/KpisPage';
import NotificadosPage from './pages/NotificadosPage';
import { Accion, can } from './utils/permisos';

function Private({ children, accion }: { children: ReactNode; accion?: Accion }) {
  const { user, loading } = useAuth();
  if (loading) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  if (accion && !can(user.role, accion)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const link = ({ isActive }: { isActive: boolean }) => ({
  color: '#fff',
  textDecoration: 'none',
  padding: '7px 14px',
  borderRadius: 8,
  background: isActive ? 'rgba(255,255,255,.12)' : 'transparent',
  boxShadow: isActive ? 'inset 0 -3px 0 #e8a317' : 'none',
  fontSize: 14,
  fontWeight: isActive ? 600 : 400,
  whiteSpace: 'nowrap' as const,
});

function Layout() {
  const { user, logout } = useAuth();
  const rol = user!.role;
  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" elevation={0} sx={{ background: 'linear-gradient(115deg, #050d1f 0%, #0b1f4a 55%, #123572 100%)' }}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: { xs: 1, md: 0 } }}>
          <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mr: { xs: 0, md: 2 } }}>
            <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#e8a317', color: '#2a1d00' }}>
              <MapIcon fontSize="small" />
            </Box>
            <Typography variant="h6" sx={{ fontSize: { xs: 16, md: 20 } }}>Campaña de Inspecciones</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, order: { xs: 3, md: 0 }, flexBasis: { xs: '100%', md: 'auto' }, overflowX: 'auto', pb: { xs: 0.5, md: 0 } }}>
            <NavLink to="/" end style={link}>Mapa</NavLink>
            <NavLink to="/edificios" style={link}>Edificios</NavLink>
            <NavLink to="/infracciones" style={link}>Infracciones</NavLink>
            <NavLink to="/notificados" style={link}>Notificados</NavLink>
            <NavLink to="/kpis" style={link}>Indicadores</NavLink>
            {can(rol, 'importar') && <NavLink to="/importar" style={link}>Importar</NavLink>}
            <NavLink to="/catalogos" style={link}>Catálogos</NavLink>
            {can(rol, 'usuarios') && <NavLink to="/usuarios" style={link}>Usuarios</NavLink>}
          </Stack>
          <Chip size="small" avatar={<Avatar sx={{ bgcolor: '#e8a317 !important', color: '#2a1d00 !important' }}>{user!.nombres[0]}</Avatar>}
            label={`${user!.apellidos}, ${user!.nombres} · ${rol}`} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.14)', maxWidth: { xs: 190, md: 'none' } }} />
          <Button color="inherit" onClick={logout}>Salir</Button>
        </Toolbar>
      </AppBar>
      {SIN_LOGIN && <Box sx={{ bgcolor: '#e8a317', color: '#2a1d00', textAlign: 'center', py: 0.5, fontSize: 13 }}>Modo demostración: datos ficticios, los cambios no se guardan.</Box>}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={<MapaPage />} />
        <Route path="edificios" element={<EdificiosPage />} />
        <Route path="infracciones" element={<InfraccionesPage />} />
        <Route path="notificados" element={<NotificadosPage />} />
        <Route path="kpis" element={<KpisPage />} />
        <Route path="importar" element={<Private accion="importar"><ImportarPage /></Private>} />
        <Route path="catalogos" element={<CatalogosPage />} />
        <Route path="usuarios" element={<Private accion="usuarios"><UsuariosPage /></Private>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
