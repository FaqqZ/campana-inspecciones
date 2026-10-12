import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { api, Edificio, errMsg } from '../api';
import { can } from '../utils/permisos';
import { GEO_LABEL, INSPECCION_LABEL, SEMAFORO } from '../semaforo';
import { useAuth } from '../auth';
import { useMapa } from '../store';

interface Resumen {
  total: number;
  geolocalizados: number;
  porGeo: Record<string, number>;
  porInspeccion: Record<string, number>;
  porSemaforo: Record<string, number>;
}
const LIMITE = 50;

function Kpi({ titulo, valor, sub }: { titulo: string; valor: number | string; sub?: string }) {
  return (
    <Paper sx={{ p: 2, minWidth: 150, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">{titulo}</Typography>
      <Typography variant="h5">{valor}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

export default function EdificiosPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { seleccionar } = useMapa();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [items, setItems] = useState<Edificio[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [geoEstado, setGeoEstado] = useState('');
  const [calle, setCalle] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [ocultos, setOcultos] = useState(0);
  const [nuevo, setNuevo] = useState<{ calle: string; numero: string; titular: string; uso: string; observaciones: string } | null>(null);

  useEffect(() => { api.get('/edificios/resumen').then((r) => setResumen(r.data)).catch((e) => setError(errMsg(e))); }, [recarga]);
  useEffect(() => { api.get('/edificios/ocultos').then((r) => setOcultos(r.data.length)).catch(() => {}); }, [recarga]);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/edificios', { params: { page, limit: LIMITE, geoEstado: geoEstado || undefined, calle: calle || undefined } })
        .then((r) => { setItems(r.data.items); setTotal(r.data.total); setError(''); })
        .catch((e) => setError(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [page, geoEstado, calle, recarga]);

  const ubicar = (id: string) => { seleccionar(id, true); nav('/'); };
  const reintentar = async () => {
    try {
      const r = await api.post('/geocodificar/reintentar-fallidos');
      setMsg(`${r.data.reencolados} direcciones vueltas a la cola`);
      setRecarga((x) => x + 1);
    } catch (e) { setError(errMsg(e)); }
  };

  const ocultar = async () => {
    if (!window.confirm('Los edificios que no se pudieron ubicar dejarán de verse en el mapa, los listados y los indicadores. Sus datos se conservan y se pueden volver a mostrar. ¿Continuar?')) return;
    try {
      const r = await api.post('/edificios/ocultar-no-encontrados');
      setMsg(`${r.data.ocultados} edificios ocultos`);
      setRecarga((x) => x + 1);
    } catch (e) { setError(errMsg(e)); }
  };
  const mostrar = async () => {
    try {
      const r = await api.post('/edificios/mostrar-ocultos');
      setMsg(`${r.data.mostrados} edificios vueltos a mostrar`);
      setRecarga((x) => x + 1);
    } catch (e) { setError(errMsg(e)); }
  };

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!nuevo) return;
    try {
      const r = await api.post('/edificios', nuevo);
      setNuevo(null);
      setError('');
      setMsg(`Edificio agregado: ${r.data.direccionOriginal}. Se está ubicando en el mapa.`);
      setRecarga((x) => x + 1);
    } catch (e) { setError(errMsg(e)); }
  };

  const sinUbicar = (resumen?.porGeo.pendiente || 0) + (resumen?.porGeo.fallido || 0);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Edificios de la campaña</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {msg && <Alert severity="success" onClose={() => setMsg('')}>{msg}</Alert>}
        {resumen && (
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
            <Kpi titulo="Edificios" valor={resumen.total} />
            <Kpi titulo="Ubicados en el mapa" valor={resumen.geolocalizados} sub={resumen.total ? `${Math.round((resumen.geolocalizados / resumen.total) * 100)}%` : ''} />
            <Kpi titulo="Sin ubicar" valor={sinUbicar} sub={`${resumen.porGeo.fallido || 0} no encontradas`} />
            <Kpi titulo="Aproximadas" valor={resumen.porGeo.aproximado || 0} sub="revisar en el mapa" />
            <Kpi titulo="Inspeccionados" valor={(resumen.total - (resumen.porInspeccion.pendiente || 0))} sub={`de ${resumen.total}`} />
            <Kpi titulo="Falta documentación" valor={resumen.porSemaforo.faltante || 0} sub={`${resumen.porSemaforo.vencido || 0} vencidos`} />
          </Stack>
        )}
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }} alignItems="center">
            <TextField size="small" label="Calle" value={calle} onChange={(e) => { setCalle(e.target.value); setPage(1); }} />
            <TextField select size="small" label="Ubicación" value={geoEstado} onChange={(e) => { setGeoEstado(e.target.value); setPage(1); }} sx={{ minWidth: 200 }}>
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(GEO_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <Box sx={{ flex: 1 }} />
            {can(user?.role, 'editarEdificios') && <Button variant="contained" onClick={() => setNuevo({ calle: '', numero: '', titular: '', uso: '', observaciones: '' })}>Agregar edificio</Button>}
            {can(user?.role, 'editarEdificios') && (resumen?.porGeo.fallido || 0) > 0 && <Button onClick={reintentar}>Reintentar no encontradas</Button>}
            {can(user?.role, 'editarEdificios') && (resumen?.porGeo.fallido || 0) > 0 && <Button color="warning" onClick={ocultar}>Ocultar no encontradas</Button>}
            {can(user?.role, 'editarEdificios') && ocultos > 0 && <Button onClick={mostrar}>Mostrar {ocultos} ocultos</Button>}
          </Stack>
          <Box sx={{ overflowX: 'auto' }}><Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Dirección</TableCell><TableCell>Ubicación</TableCell><TableCell>Documentación</TableCell>
                <TableCell>Inspección</TableCell><TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e._id} hover>
                  <TableCell>{e.direccionOriginal}</TableCell>
                  <TableCell>{GEO_LABEL[e.geoEstado]}</TableCell>
                  <TableCell>{e.semaforo && <Chip size="small" label={SEMAFORO[e.semaforo].label} sx={{ bgcolor: SEMAFORO[e.semaforo].color, color: e.semaforo === 'por_vencer' ? '#2a1d00' : '#fff' }} />}</TableCell>
                  <TableCell>{INSPECCION_LABEL[e.estadoInspeccion]}</TableCell>
                  <TableCell align="right">
                    {e.lat !== null && <Button size="small" onClick={() => { seleccionar(e._id); nav('/'); }}>Ver ficha</Button>}
                    {can(user?.role, 'editarEdificios') && ['fallido', 'aproximado', 'pendiente'].includes(e.geoEstado) && (
                      <Button size="small" onClick={() => ubicar(e._id)}>{e.lat === null ? 'Ubicar' : 'Corregir'}</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No hay edificios con esos filtros.</TableCell></TableRow>}
            </TableBody>
          </Table></Box>
          {total > LIMITE && <Pagination sx={{ mt: 2 }} count={Math.ceil(total / LIMITE)} page={page} onChange={(_, p) => setPage(p)} />}
        </Paper>
      </Stack>
      <Dialog open={!!nuevo} onClose={() => setNuevo(null)} fullWidth maxWidth="xs">
        <form onSubmit={crear}>
          <DialogTitle>Agregar edificio</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Calle" required autoFocus placeholder="Ej: Mate de Luna" value={nuevo?.calle ?? ''} onChange={(e) => setNuevo({ ...nuevo!, calle: e.target.value })} />
              <TextField label="Número" placeholder="Vacío si es s/n" value={nuevo?.numero ?? ''} onChange={(e) => setNuevo({ ...nuevo!, numero: e.target.value })} />
              <TextField label="Titular" value={nuevo?.titular ?? ''} onChange={(e) => setNuevo({ ...nuevo!, titular: e.target.value })} />
              <TextField label="Uso" value={nuevo?.uso ?? ''} onChange={(e) => setNuevo({ ...nuevo!, uso: e.target.value })} />
              <TextField label="Observaciones" multiline minRows={2} value={nuevo?.observaciones ?? ''} onChange={(e) => setNuevo({ ...nuevo!, observaciones: e.target.value })} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNuevo(null)}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={!nuevo?.calle.trim()}>Agregar</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
}
