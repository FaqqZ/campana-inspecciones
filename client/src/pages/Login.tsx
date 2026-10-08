import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../auth';
import { errMsg } from '../api';

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper component="form" onSubmit={enviar} sx={{ p: 4, width: 380, maxWidth: '100%' }}>
        <Stack spacing={2}>
          <Typography variant="h5">Campaña de Inspecciones</Typography>
          <Typography variant="body2" color="text.secondary">Ingresá con tu usuario</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Button type="submit" variant="contained" disabled={busy || !username || !password}>Ingresar</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
