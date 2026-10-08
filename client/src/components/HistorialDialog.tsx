import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { api, errMsg, Infraccion, Movimiento } from '../api';

export default function HistorialDialog({ infraccion, onClose }: { infraccion: Infraccion | null; onClose: () => void }) {
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!infraccion) return;
    setMovs([]);
    api.get(`/infracciones/${infraccion._id}`).then((r) => setMovs(r.data.historialMovimientos ?? [])).catch((e) => setError(errMsg(e)));
  }, [infraccion]);
  return (
    <Dialog open={!!infraccion} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Historial — {infraccion?.numeroActa}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {movs.map((m, i) => (
            <Stack key={i} spacing={0.2} sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5 }}>
              <Typography variant="body2" fontWeight={600}>
                {m.oficinaOrigen ? `${m.oficinaOrigen.nombre} → ` : ''}{m.oficinaDestino.nombre}{m.estado ? ` · ${m.estado.nombre}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(m.fecha).toLocaleString('es-AR')} · {m.por.apellidos}, {m.por.nombres}
              </Typography>
              {m.comentarios && <Typography variant="body2">{m.comentarios}</Typography>}
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cerrar</Button></DialogActions>
    </Dialog>
  );
}
