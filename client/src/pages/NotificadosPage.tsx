import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Container, MenuItem, Pagination, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { api, errMsg, fmtFecha, Notificacion } from '../api';
import { useMapa } from '../store';
import PlazoChip from '../components/PlazoChip';
import { PLAZO } from '../semaforo';
import { useAuth } from '../auth';
import { can } from '../utils/permisos';

const LIMITE = 25;
interface Resumen { sinPlazo: number; notificados: number; enPlazo: number; porVencer: number; vencidos: number; presentaron: number; pasaronAActa: number }

function Tarjeta({ titulo, valor, color }: { titulo: string; valor: number; color?: string }) {
  return (
    <Paper sx={{ p: 2, flex: '1 1 150px', minWidth: 150, borderLeft: color ? `4px solid ${color}` : undefined }}>
      <Typography variant="caption" color="text.secondary">{titulo}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>{valor.toLocaleString('es-AR')}</Typography>
    </Paper>
  );
}

export default function NotificadosPage() {
  const nav = useNavigate();
  const seleccionar = useMapa((s) => s.seleccionar);
  const [items, setItems] = useState<Notificacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');
  const [todas, setTodas] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const { user } = useAuth();

  const cargar = useCallback(() => {
    api.get('/notificaciones', { params: { page, limit: LIMITE, estadoPlazo: estado || undefined, search: search || undefined, todas: todas ? 'si' : undefined } })
      .then((r) => { setItems(r.data.items); setTotal(r.data.total); setError(''); })
      .catch((e) => setError(errMsg(e)));
  }, [page, estado, search, todas]);

  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);
  const cargarResumen = useCallback(() => { api.get('/notificaciones/kpis').then((r) => setResumen(r.data.resumen)).catch(() => {}); }, []);
  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  const vencidasAActa = async () => {
    if (!window.confirm(`Las ${resumen?.vencidos} notificaciones con plazo vencido pasarán a "Pasó a acta". Se puede corregir editando cada una. ¿Continuar?`)) return;
    try {
      const r = await api.post('/notificaciones/vencidas-a-acta');
      setMsg(`${r.data.actualizadas} notificaciones pasaron a acta`);
      cargar();
      cargarResumen();
    } catch (e) { setError(errMsg(e)); }
  };

  const direccion = (n: Notificacion) => (typeof n.edificio === 'object' ? n.edificio.direccionOriginal : '');
  const idEdificio = (n: Notificacion) => (typeof n.edificio === 'object' ? n.edificio._id : n.edificio ?? null);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Edificios notificados</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {msg && <Alert severity="success" onClose={() => setMsg('')}>{msg}</Alert>}
        {resumen && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
            <Tarjeta titulo="Edificios notificados" valor={resumen.notificados} />
            <Tarjeta titulo="En plazo" valor={resumen.enPlazo} color={PLAZO.en_plazo.color} />
            <Tarjeta titulo="Por vencer" valor={resumen.porVencer} color={PLAZO.por_vencer.color} />
            <Tarjeta titulo="Vencidos" valor={resumen.vencidos} color={PLAZO.vencido.color} />
            <Tarjeta titulo="Presentaron documentación" valor={resumen.presentaron} color={PLAZO.presento.color} />
            <Tarjeta titulo="Pasaron a acta" valor={resumen.pasaronAActa} color={PLAZO.acta.color} />
            {resumen.sinPlazo > 0 && <Tarjeta titulo="Sin plazo registrado" valor={resumen.sinPlazo} color={PLAZO.sin_plazo.color} />}
          </Stack>
        )}
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 2 }} alignItems="center">
            <TextField size="small" label="Buscar (dirección u observaciones)" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} sx={{ minWidth: { xs: 0, sm: 280 }, flex: 1 }} />
            <TextField select size="small" label="Plazo" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }} sx={{ minWidth: 170 }}>
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(PLAZO).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </TextField>
            {can(user?.role, 'editarEdificios') && (resumen?.vencidos || 0) > 0 && <Button color="warning" onClick={vencidasAActa}>Pasar {resumen?.vencidos} vencidas a acta</Button>}
            <Button onClick={() => { setTodas((v) => !v); setPage(1); }}>{todas ? 'Ver solo la vigente de cada edificio' : 'Ver historial completo'}</Button>
          </Stack>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Dirección</TableCell><TableCell>Boleta</TableCell><TableCell>Notificado</TableCell><TableCell>Plazo</TableCell>
                  <TableCell>Vence</TableCell><TableCell>Estado</TableCell><TableCell>Observaciones</TableCell><TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((n) => (
                  <TableRow key={n._id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{direccion(n)}{n.razonSocial && <Typography variant="caption" color="text.secondary" component="div">{n.razonSocial}</Typography>}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{n.boleta || '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtFecha(n.fechaNotificacion)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{n.plazoDias ? `${n.plazoDias} días` : '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{n.fechaVencimiento ? fmtFecha(n.fechaVencimiento) : '—'}{n.prorroga && <Typography variant="caption" color="text.secondary" component="div">con prórroga</Typography>}</TableCell>
                    <TableCell><PlazoChip estado={n.estadoPlazo} dias={n.diasRestantes} /></TableCell>
                    <TableCell>{n.observaciones || '—'}</TableCell>
                    <TableCell align="right"><Button size="small" onClick={() => { seleccionar(idEdificio(n)); nav('/'); }}>Ver ficha</Button></TableCell>
                  </TableRow>
                ))}
                {!items.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>No hay edificios notificados con esos filtros.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
          {total > LIMITE && <Pagination sx={{ mt: 2 }} count={Math.ceil(total / LIMITE)} page={page} onChange={(_, p) => setPage(p)} />}
        </Paper>
      </Stack>
    </Container>
  );
}
