import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Paper, Snackbar, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
  Box,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { api, errMsg, Rol, Usuario } from '../api';
import { useAuth } from '../auth';
import { ROL_LABEL, ROLES } from '../utils/permisos';

interface Fila extends Usuario { _id: string; activo: boolean }
interface Edicion { _id?: string; nombres: string; apellidos: string; username: string; role: Rol; activo: boolean; password: string }
const VACIO: Edicion = { nombres: '', apellidos: '', username: '', role: 'Tecnico', activo: true, password: '' };

export default function UsuariosPage() {
  const { user } = useAuth();
  const [lista, setLista] = useState<Fila[]>([]);
  const [edit, setEdit] = useState<Edicion | null>(null);
  const [error, setError] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(() => {
    api.get('/users').then((r) => { setLista(r.data); setError(''); }).catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!edit) return;
    setErrorForm('');
    try {
      if (edit._id) {
        const body: Record<string, unknown> = { nombres: edit.nombres, apellidos: edit.apellidos, role: edit.role, activo: edit.activo };
        if (edit.password) body.password = edit.password;
        await api.patch(`/users/${edit._id}`, body);
      } else {
        await api.post('/users', edit);
      }
      setEdit(null);
      setAviso('Usuario guardado');
      cargar();
    } catch (e) {
      setErrorForm(errMsg(e));
    }
  };

  const nuevo = !edit?._id;
  const valido = !!edit && edit.nombres.trim() && edit.apellidos.trim() && (nuevo ? edit.username.trim() && edit.password.length >= 8 : !edit.password || edit.password.length >= 8);
  const esYo = (u: Edicion) => u._id === (user as unknown as { id?: string })?.id;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center">
          <Typography variant="h5" sx={{ flex: 1 }}>Usuarios</Typography>
          <Button variant="contained" onClick={() => { setErrorForm(''); setEdit(VACIO); }}>Agregar usuario</Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Paper sx={{ p: 1 }}>
          <Box sx={{ overflowX: 'auto' }}><Table size="small">
            <TableHead><TableRow><TableCell>Nombre</TableCell><TableCell>Usuario</TableCell><TableCell>Rol</TableCell><TableCell>Estado</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {lista.map((u) => (
                <TableRow key={u._id} hover>
                  <TableCell>{u.apellidos}, {u.nombres}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{ROL_LABEL[u.role] ?? u.role}</TableCell>
                  <TableCell><Chip size="small" color={u.activo ? 'success' : 'default'} label={u.activo ? 'Activo' : 'Inactivo'} /></TableCell>
                  <TableCell align="right"><IconButton size="small" aria-label="Editar" onClick={() => { setErrorForm(''); setEdit({ _id: u._id, nombres: u.nombres, apellidos: u.apellidos, username: u.username, role: u.role, activo: u.activo, password: '' }); }}><EditIcon fontSize="small" /></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></Box>
        </Paper>
      </Stack>

      <Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="xs">
        <form onSubmit={guardar}>
          <DialogTitle>{nuevo ? 'Agregar usuario' : 'Editar usuario'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {errorForm && <Alert severity="error">{errorForm}</Alert>}
              <Stack direction="row" spacing={1}>
                <TextField size="small" required label="Nombres" value={edit?.nombres ?? ''} onChange={(e) => setEdit({ ...edit!, nombres: e.target.value })} />
                <TextField size="small" required label="Apellidos" value={edit?.apellidos ?? ''} onChange={(e) => setEdit({ ...edit!, apellidos: e.target.value })} />
              </Stack>
              <TextField size="small" required label="Usuario" disabled={!nuevo} value={edit?.username ?? ''} onChange={(e) => setEdit({ ...edit!, username: e.target.value })} helperText={nuevo ? 'Con este nombre inicia sesión' : 'No se puede cambiar'} />
              <TextField select size="small" label="Rol" value={edit?.role ?? 'Tecnico'} onChange={(e) => setEdit({ ...edit!, role: e.target.value as Rol })}>
                {ROLES.map((r) => <MenuItem key={r} value={r}>{ROL_LABEL[r]}</MenuItem>)}
              </TextField>
              <TextField size="small" type="password" label={nuevo ? 'Contraseña (mínimo 8)' : 'Nueva contraseña (vacío = no cambia)'} required={nuevo} autoComplete="new-password"
                value={edit?.password ?? ''} onChange={(e) => setEdit({ ...edit!, password: e.target.value })}
                error={!!edit?.password && edit.password.length < 8} helperText={edit?.password && edit.password.length < 8 ? 'Mínimo 8 caracteres' : ' '} />
              {!nuevo && <FormControlLabel control={<Switch checked={!!edit?.activo} disabled={!!edit && esYo(edit)} onChange={(e) => setEdit({ ...edit!, activo: e.target.checked })} />} label="Activo" />}
            </Stack>
          </DialogContent>
          <DialogActions><Button onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" variant="contained" disabled={!valido}>Guardar</Button></DialogActions>
        </form>
      </Dialog>
      <Snackbar open={!!aviso} autoHideDuration={3000} onClose={() => setAviso('')} message={aviso} />
    </Container>
  );
}
