import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  MenuItem, Paper, Stack, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { api, Catalogo, errMsg, Estado, Motivo, Oficina, TipoDocumento } from '../api';
import { useAuth } from '../auth';
import { can } from '../utils/permisos';

type Clave = 'motivos' | 'inspectores' | 'estados' | 'oficinas' | 'tipos-documento';
const TABS: { clave: Clave; label: string; ayuda: string }[] = [
  { clave: 'motivos', label: 'Motivos de infracción', ayuda: 'Motivos que se asocian a las infracciones y a las posibles infracciones.' },
  { clave: 'inspectores', label: 'Inspectores', ayuda: 'Inspectores actuantes que se eligen al cargar una infracción o registrar una visita.' },
  { clave: 'estados', label: 'Estados', ayuda: 'Estados por los que pasa una infracción. Marcá cuál es el inicial (con el que nace) y cuál es el final (con el que se cierra al generar el expediente). Los que "requieren comentario" obligan a justificar el pase.' },
  { clave: 'oficinas', label: 'Oficinas', ayuda: 'Oficinas por las que circula una infracción. La oficina inicial es donde se registra.' },
  { clave: 'tipos-documento', label: 'Tipos de documento', ayuda: 'Los papeles que se relevan en cada edificio. Si uno es requerido y falta o está vencido, se sugiere el motivo de infracción asociado.' },
];

type Item = Catalogo & Partial<TipoDocumento> & Partial<Motivo> & Partial<Estado> & Partial<Oficina> & { legajo?: string };
const motivoId = (m: Item['motivoAsociado']) => (m && typeof m === 'object' ? m._id : m || '');

export default function CatalogosPage() {
  const { user } = useAuth();
  const esAdmin = user?.role === 'Administrador';
  const puedeEditar = can(user?.role, 'editarCatalogos');
  const [clave, setClave] = useState<Clave>('motivos');
  const [items, setItems] = useState<Item[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Partial<Item> | null>(null);

  const cargar = useCallback(() => {
    api.get(`/catalogos/${clave}`, { params: { todos: true } }).then((r) => setItems(r.data)).catch((e) => setError(errMsg(e)));
  }, [clave]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { api.get('/catalogos/motivos').then((r) => setMotivos(r.data)).catch(() => {}); }, []);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    try {
      const body = { ...edit, motivoAsociado: motivoId(edit.motivoAsociado) };
      if (edit._id) await api.patch(`/catalogos/${clave}/${edit._id}`, body);
      else await api.post(`/catalogos/${clave}`, body);
      setEdit(null); setError(''); cargar();
    } catch (err) { setError(errMsg(err)); }
  };
  const borrar = async (i: Item) => {
    if (!window.confirm(`¿Eliminar "${i.nombre}"?`)) return;
    try { await api.delete(`/catalogos/${clave}/${i._id}`); setError(''); cargar(); }
    catch (err) { setError(errMsg(err)); }
  };

  const tab = TABS.find((t) => t.clave === clave)!;
  const nuevo = (): Partial<Item> => (clave === 'estados' || clave === 'oficinas' ? { nombre: '', descripcion: '', activo: true, orden: items.length + 1, esInicial: false, requiereComentario: false, esFinal: false } : clave === 'tipos-documento' ? { nombre: '', requerido: true, tieneVencimiento: false, motivoAsociado: '', orden: items.length + 1, activo: true } : { nombre: '', activo: true });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5">Catálogos</Typography>
        <Tabs value={clave} onChange={(_, v) => { setClave(v); setError(''); }}>
          {TABS.map((t) => <Tab key={t.clave} value={t.clave} label={t.label} />)}
        </Tabs>
        <Alert severity="info">{tab.ayuda}</Alert>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        <Paper sx={{ p: 2 }}>
          {puedeEditar && <Stack direction="row" sx={{ mb: 1 }}><Button variant="contained" onClick={() => setEdit(nuevo())}>Agregar</Button></Stack>}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                {clave === 'tipos-documento' && <><TableCell>Requerido</TableCell><TableCell>Vence</TableCell><TableCell>Motivo asociado</TableCell></>}
                {clave === 'inspectores' && <TableCell>Legajo</TableCell>}
                {clave === 'estados' && <TableCell>Reglas</TableCell>}
                {clave === 'oficinas' && <TableCell>Inicial</TableCell>}
                <TableCell>Estado</TableCell><TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i._id} hover>
                  <TableCell>{i.nombre}</TableCell>
                  {clave === 'tipos-documento' && (
                    <>
                      <TableCell>{i.requerido ? 'Sí' : 'No'}</TableCell>
                      <TableCell>{i.tieneVencimiento ? 'Sí' : 'No'}</TableCell>
                      <TableCell>{motivos.find((m) => m._id === motivoId(i.motivoAsociado))?.nombre ?? '—'}</TableCell>
                    </>
                  )}
                  {clave === 'inspectores' && <TableCell>{i.legajo || '—'}</TableCell>}
                  {clave === 'estados' && (
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        {i.esInicial && <Chip size="small" color="primary" label="Inicial" />}
                        {i.esFinal && <Chip size="small" color="success" label="Final" />}
                        {i.requiereComentario && <Chip size="small" color="warning" label="Pide comentario" />}
                      </Stack>
                    </TableCell>
                  )}
                  {clave === 'oficinas' && <TableCell>{i.esInicial ? <Chip size="small" color="primary" label="Inicial" /> : '—'}</TableCell>}
                  <TableCell><Chip size="small" label={i.activo ? 'Activo' : 'Inactivo'} color={i.activo ? 'success' : 'default'} /></TableCell>
                  <TableCell align="right">
                    {puedeEditar && <IconButton size="small" aria-label="Editar" onClick={() => setEdit({ ...i, motivoAsociado: motivoId(i.motivoAsociado) })}><EditIcon fontSize="small" /></IconButton>}
                    {esAdmin && <IconButton size="small" aria-label="Eliminar" onClick={() => borrar(i)}><DeleteIcon fontSize="small" /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>Todavía no hay registros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>

      <Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="xs">
        <form onSubmit={guardar}>
          <DialogTitle>{edit?._id ? 'Editar' : 'Agregar'} — {tab.label}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Nombre" required autoFocus value={edit?.nombre ?? ''} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} />
              {clave === 'inspectores' && <TextField label="Legajo" value={edit?.legajo ?? ''} onChange={(e) => setEdit({ ...edit, legajo: e.target.value })} />}
              {clave === 'motivos' && <TextField label="Descripción" multiline minRows={2} value={edit?.descripcion ?? ''} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} />}
              {(clave === 'estados' || clave === 'oficinas') && (
                <>
                  <TextField label="Descripción" value={edit?.descripcion ?? ''} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} />
                  <FormControlLabel control={<Switch checked={!!edit?.esInicial} onChange={(e) => setEdit({ ...edit, esInicial: e.target.checked })} />} label={clave === 'estados' ? 'Es el estado inicial' : 'Es la oficina inicial'} />
                  {clave === 'estados' && (
                    <>
                      <FormControlLabel control={<Switch checked={!!edit?.esFinal} onChange={(e) => setEdit({ ...edit, esFinal: e.target.checked })} />} label="Es el estado final (al generar el expediente)" />
                      <FormControlLabel control={<Switch checked={!!edit?.requiereComentario} onChange={(e) => setEdit({ ...edit, requiereComentario: e.target.checked })} />} label="El pase a este estado exige un comentario" />
                    </>
                  )}
                  <TextField label="Orden" type="number" value={edit?.orden ?? 0} onChange={(e) => setEdit({ ...edit, orden: Number(e.target.value) })} />
                </>
              )}
              {clave === 'tipos-documento' && (
                <>
                  <FormControlLabel control={<Switch checked={!!edit?.requerido} onChange={(e) => setEdit({ ...edit, requerido: e.target.checked })} />} label="Es requerido" />
                  <FormControlLabel control={<Switch checked={!!edit?.tieneVencimiento} onChange={(e) => setEdit({ ...edit, tieneVencimiento: e.target.checked })} />} label="Tiene vencimiento" />
                  <TextField select label="Motivo de infracción si falta o vence" value={motivoId(edit?.motivoAsociado)} onChange={(e) => setEdit({ ...edit, motivoAsociado: e.target.value })}>
                    <MenuItem value="">Ninguno</MenuItem>
                    {motivos.map((m) => <MenuItem key={m._id} value={m._id}>{m.nombre}</MenuItem>)}
                  </TextField>
                  <TextField label="Orden" type="number" value={edit?.orden ?? 0} onChange={(e) => setEdit({ ...edit, orden: Number(e.target.value) })} />
                </>
              )}
              <FormControlLabel control={<Switch checked={edit?.activo !== false} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} />} label="Activo" />
            </Stack>
          </DialogContent>
          <DialogActions><Button onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" variant="contained">Guardar</Button></DialogActions>
        </form>
      </Dialog>
    </Container>
  );
}
