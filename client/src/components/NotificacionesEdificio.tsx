import { useState } from 'react';
import { Alert, Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { api, errMsg, fmtFecha, Notificacion } from '../api';
import PlazoChip from './PlazoChip';

const hoyIso = () => new Date().toISOString().slice(0, 10);

/** Pestaña "Notificación" de la ficha: historial de notificaciones del edificio y alta manual. */
export default function NotificacionesEdificio({ edificioId, notificaciones, puedeEditar, onCambio }: {
  edificioId: string; notificaciones: Notificacion[]; puedeEditar: boolean; onCambio: () => void;
}) {
  const [form, setForm] = useState({ fechaNotificacion: hoyIso(), plazoDias: '30', observaciones: '' });
  const [error, setError] = useState('');

  const accion = async (fn: () => Promise<unknown>) => {
    try { await fn(); setError(''); onCambio(); } catch (e) { setError(errMsg(e)); }
  };
  const valido = form.fechaNotificacion && Number(form.plazoDias) > 0;

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}
      {!notificaciones.length && <Typography variant="body2" color="text.secondary">Este edificio no tiene notificaciones.</Typography>}
      {notificaciones.map((n, i) => (
        <Paper key={n._id} sx={{ p: 1.5 }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
                <PlazoChip estado={n.estadoPlazo} dias={n.diasRestantes} />
                {i === 0 && notificaciones.length > 1 && <Typography variant="caption" color="text.secondary">Vigente</Typography>}
              </Stack>
              <Typography variant="body2">Notificado el <strong>{fmtFecha(n.fechaNotificacion)}</strong>{n.plazoDias ? <> · plazo de <strong>{n.plazoDias} días</strong></> : ''}</Typography>
              {!n.fechaVencimiento && <Typography variant="body2" color="text.secondary">Todavía no tiene plazo registrado.</Typography>}
              {n.fechaVencimiento && <Typography variant="body2">Vence el <strong>{fmtFecha(n.fechaVencimiento)}</strong>{n.prorroga && n.vencimientoOriginal ? ` (prórroga; vencía el ${fmtFecha(n.vencimientoOriginal)})` : ''}</Typography>}
              {(n.boleta || n.inspector || n.razonSocial) && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {[n.boleta && `Boleta ${n.boleta}`, n.razonSocial, n.inspector && `Inspector: ${n.inspector}`].filter(Boolean).join(' · ')}
                </Typography>
              )}
              {n.observaciones && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{n.observaciones}</Typography>}
            </Box>
            {puedeEditar && (
              <IconButton size="small" aria-label="Eliminar notificación" onClick={() => window.confirm('¿Eliminar esta notificación?') && accion(() => api.delete(`/notificaciones/${n._id}`))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        </Paper>
      ))}
      {puedeEditar && (
        <>
          <Typography variant="subtitle2" sx={{ pt: 1 }}>Registrar notificación</Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="date" label="Fecha de notificación" InputLabelProps={{ shrink: true }} value={form.fechaNotificacion} onChange={(ev) => setForm({ ...form, fechaNotificacion: ev.target.value })} sx={{ flex: 1 }} />
            <TextField size="small" type="number" label="Plazo (días)" inputProps={{ min: 1 }} value={form.plazoDias} onChange={(ev) => setForm({ ...form, plazoDias: ev.target.value })} sx={{ width: 130 }} />
          </Stack>
          <TextField size="small" label="Observaciones" multiline minRows={2} value={form.observaciones} onChange={(ev) => setForm({ ...form, observaciones: ev.target.value })} />
          <Button variant="contained" disabled={!valido} onClick={() => accion(async () => { await api.post('/notificaciones', { ...form, edificio: edificioId, plazoDias: Number(form.plazoDias) }); setForm({ ...form, observaciones: '' }); })}>Registrar</Button>
        </>
      )}
    </Stack>
  );
}
