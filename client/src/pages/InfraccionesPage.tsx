import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Collapse, Container, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Pagination, Paper, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SwapIcon from '@mui/icons-material/SwapHoriz';
import HistoryIcon from '@mui/icons-material/History';
import FolderIcon from '@mui/icons-material/CreateNewFolderOutlined';
import MapIcon from '@mui/icons-material/PlaceOutlined';
import { api, Asignable, errMsg, Estado, fmtFecha, Infraccion, Inspector, Motivo, Oficina } from '../api';
import { useAuth } from '../auth';
import { useMapa } from '../store';
import { can, puedePasar } from '../utils/permisos';
import InfraccionForm from '../components/InfraccionForm';
import PaseDialog from '../components/PaseDialog';
import HistorialDialog from '../components/HistorialDialog';

const LIMITE = 25;
const VACIOS = { search: '', estado: '', oficina: '', asignadoA: '', inspector: '', motivo: '', fechaDesde: '', fechaHasta: '' };

export default function InfraccionesPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const rol = user?.role;
  const { seleccionar } = useMapa();
  const [filtros, setFiltros] = useState(VACIOS);
  const [verFiltros, setVerFiltros] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Infraccion[]>([]);
  const [total, setTotal] = useState(0);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [inspectores, setInspectores] = useState<Inspector[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [form, setForm] = useState<{ abierto: boolean; inf: Infraccion | null }>({ abierto: false, inf: null });
  const [pase, setPase] = useState<Infraccion | null>(null);
  const [historial, setHistorial] = useState<Infraccion | null>(null);
  const [eliminar, setEliminar] = useState<{ inf: Infraccion; numero: string; motivo: string } | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    api.get('/catalogos/estados').then((r) => setEstados(r.data)).catch(() => {});
    api.get('/catalogos/oficinas').then((r) => setOficinas(r.data)).catch(() => {});
    api.get('/catalogos/inspectores', { params: { todos: true } }).then((r) => setInspectores(r.data)).catch(() => {});
    api.get('/catalogos/motivos', { params: { todos: true } }).then((r) => setMotivos(r.data)).catch(() => {});
    api.get('/users/asignables').then((r) => setAsignables(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = Object.fromEntries(Object.entries({ ...filtros, page, limit: LIMITE }).filter(([, v]) => v !== ''));
      api.get('/infracciones', { params })
        .then((r) => { setItems(r.data.items); setTotal(r.data.total); setError(''); })
        .catch((e) => setError(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [filtros, page, recarga]);

  const cambiar = (k: keyof typeof VACIOS, v: string) => { setFiltros({ ...filtros, [k]: v }); setPage(1); };
  const refrescar = useCallback(() => setRecarga((x) => x + 1), []);
  const oficinaInicial = oficinas.find((o) => o.esInicial)?._id;
  const cerrada = (i: Infraccion) => Boolean(i.expediente?.numero);

  const generarExpediente = async (i: Infraccion) => {
    if (!window.confirm(`¿Generar el expediente de ${i.numeroActa}? La infracción quedará cerrada.`)) return;
    try {
      const r = await api.post(`/infracciones/${i._id}/expediente`, {});
      setAviso(`Expediente ${r.data.expediente.numero} generado`);
      refrescar();
    } catch (e) { setError(errMsg(e)); }
  };

  const confirmarEliminar = async () => {
    if (!eliminar) return;
    try {
      await api.delete(`/infracciones/${eliminar.inf._id}`, { data: { motivoEliminacion: eliminar.motivo } });
      setEliminar(null);
      setAviso('Infracción eliminada');
      refrescar();
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h5" sx={{ flex: 1 }}>Infracciones <Typography component="span" color="text.secondary">({total})</Typography></Typography>
          <Button onClick={() => setVerFiltros(!verFiltros)}>{verFiltros ? 'Ocultar filtros' : 'Más filtros'}</Button>
          {can(rol, 'editarInfracciones') && <Button variant="contained" onClick={() => setForm({ abierto: true, inf: null })}>Cargar infracción</Button>}
        </Stack>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
            <TextField size="small" label="Buscar (acta, infractor, dirección)" sx={{ minWidth: { xs: 0, sm: 280 }, flex: 1 }} value={filtros.search} onChange={(e) => cambiar('search', e.target.value)} />
            <TextField select size="small" label="Estado" sx={{ minWidth: 170 }} value={filtros.estado} onChange={(e) => cambiar('estado', e.target.value)}>
              <MenuItem value="">Todos</MenuItem>{estados.map((x) => <MenuItem key={x._id} value={x._id}>{x.nombre}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Oficina" sx={{ minWidth: 170 }} value={filtros.oficina} onChange={(e) => cambiar('oficina', e.target.value)}>
              <MenuItem value="">Todas</MenuItem>{oficinas.map((x) => <MenuItem key={x._id} value={x._id}>{x.nombre}</MenuItem>)}
            </TextField>
            <Button onClick={() => { setFiltros(VACIOS); setPage(1); }}>Limpiar</Button>
          </Stack>
          <Collapse in={verFiltros}>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2, mt: 2 }}>
              <TextField select size="small" label="Asignado a" sx={{ minWidth: 200 }} value={filtros.asignadoA} onChange={(e) => cambiar('asignadoA', e.target.value)}>
                <MenuItem value="">Todos</MenuItem><MenuItem value="sin-asignar">Sin asignar</MenuItem>
                {asignables.map((a) => <MenuItem key={a.id} value={a.id}>{a.apellidos}, {a.nombres}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Inspector" sx={{ minWidth: 200 }} value={filtros.inspector} onChange={(e) => cambiar('inspector', e.target.value)}>
                <MenuItem value="">Todos</MenuItem>{inspectores.map((x) => <MenuItem key={x._id} value={x._id}>{x.nombre}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Motivo" sx={{ minWidth: 220 }} value={filtros.motivo} onChange={(e) => cambiar('motivo', e.target.value)}>
                <MenuItem value="">Todos</MenuItem>{motivos.map((x) => <MenuItem key={x._id} value={x._id}>{x.nombre}</MenuItem>)}
              </TextField>
              <TextField size="small" type="date" label="Infracción desde" InputLabelProps={{ shrink: true }} value={filtros.fechaDesde} onChange={(e) => cambiar('fechaDesde', e.target.value)} />
              <TextField size="small" type="date" label="Infracción hasta" InputLabelProps={{ shrink: true }} value={filtros.fechaHasta} onChange={(e) => cambiar('fechaHasta', e.target.value)} />
            </Stack>
          </Collapse>
        </Paper>

        <Paper sx={{ p: 1, overflow: 'auto' }}>
          <Box sx={{ overflowX: 'auto' }}><Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>N° acta</TableCell><TableCell>Edificio</TableCell><TableCell>Infractor</TableCell><TableCell>Inspectores</TableCell>
                <TableCell>Motivos</TableCell><TableCell>Fecha</TableCell><TableCell>Estado</TableCell><TableCell>Oficina</TableCell>
                <TableCell>Asignado</TableCell><TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i._id} hover>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{i.numeroActa}</TableCell>
                  <TableCell>{i.edificio.direccionOriginal}</TableCell>
                  <TableCell>{i.infractor || '—'}</TableCell>
                  <TableCell>{i.inspectoresActuantes.map((x) => x.nombre).join(', ')}</TableCell>
                  <TableCell><Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>{i.motivosInfraccion.map((m) => <Chip key={m._id} size="small" label={m.nombre} />)}</Stack>{i.descripcion && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{i.descripcion}{i.normativa ? ` · ${i.normativa}` : ''}</Typography>}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtFecha(i.fechaInfraccion)}</TableCell>
                  <TableCell>
                    <Chip size="small" color={cerrada(i) ? 'success' : i.estado.requiereComentario ? 'warning' : 'default'} label={cerrada(i) ? `Exp. ${i.expediente!.numero}` : i.estado.nombre} />
                  </TableCell>
                  <TableCell>{i.oficinaActual.nombre}</TableCell>
                  <TableCell>{i.asignadoA ? `${i.asignadoA.apellidos}, ${i.asignadoA.nombres}` : '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Ver en el mapa"><span><IconButton size="small" disabled={i.edificio.lat === null} onClick={() => { seleccionar(i.edificio._id); nav('/'); }}><MapIcon fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Historial"><IconButton size="small" onClick={() => setHistorial(i)}><HistoryIcon fontSize="small" /></IconButton></Tooltip>
                    {can(rol, 'editarInfracciones') && <Tooltip title="Editar"><span><IconButton size="small" disabled={cerrada(i)} onClick={() => setForm({ abierto: true, inf: i })}><EditIcon fontSize="small" /></IconButton></span></Tooltip>}
                    {puedePasar(rol, i.oficinaActual._id, oficinaInicial) && <Tooltip title="Cursar pase"><span><IconButton size="small" disabled={cerrada(i)} onClick={() => setPase(i)}><SwapIcon fontSize="small" /></IconButton></span></Tooltip>}
                    {can(rol, 'expediente') && <Tooltip title="Generar expediente"><span><IconButton size="small" disabled={cerrada(i)} onClick={() => generarExpediente(i)}><FolderIcon fontSize="small" /></IconButton></span></Tooltip>}
                    {can(rol, 'eliminarInfracciones') && <Tooltip title="Eliminar"><span><IconButton size="small" disabled={cerrada(i)} onClick={() => setEliminar({ inf: i, numero: '', motivo: '' })}><DeleteIcon fontSize="small" /></IconButton></span></Tooltip>}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5, color: 'text.secondary' }}>No hay infracciones con esos filtros.</TableCell></TableRow>}
            </TableBody>
          </Table></Box>
          {total > LIMITE && <Box sx={{ p: 1 }}><Pagination count={Math.ceil(total / LIMITE)} page={page} onChange={(_, p) => setPage(p)} /></Box>}
        </Paper>
      </Stack>

      <InfraccionForm
        open={form.abierto}
        infraccion={form.inf}
        onClose={() => setForm({ abierto: false, inf: null })}
        onSaved={(i) => { setForm({ abierto: false, inf: null }); setAviso(i.edificioCreado ? 'Infracción registrada. Se creó el edificio y se está ubicando en el mapa' : 'Infracción guardada'); refrescar(); }}
      />
      <PaseDialog infraccion={pase} onClose={() => setPase(null)} onDone={() => { setPase(null); setAviso('Pase registrado'); refrescar(); }} />
      <HistorialDialog infraccion={historial} onClose={() => setHistorial(null)} />

      <Dialog open={!!eliminar} onClose={() => setEliminar(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar infracción</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">Escribí el N° de acta <strong>{eliminar?.inf.numeroActa}</strong> para confirmar. La infracción deja de verse, pero queda registrada en la auditoría.</Alert>
            <TextField size="small" label="N° de acta" value={eliminar?.numero ?? ''} onChange={(e) => setEliminar({ ...eliminar!, numero: e.target.value })} />
            <TextField size="small" label="Motivo de la eliminación" multiline minRows={2} value={eliminar?.motivo ?? ''} onChange={(e) => setEliminar({ ...eliminar!, motivo: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEliminar(null)}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={!eliminar || eliminar.numero.trim() !== eliminar.inf.numeroActa || eliminar.motivo.trim().length < 3} onClick={confirmarEliminar}>Eliminar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!aviso} autoHideDuration={4000} onClose={() => setAviso('')} message={aviso} />
    </Container>
  );
}
