import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { api, Asignable, errMsg, Estado, Infraccion, Oficina } from '../api';

export default function PaseDialog({ infraccion, onClose, onDone }: { infraccion: Infraccion | null; onClose: () => void; onDone: (i: Infraccion) => void }) {
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [f, setF] = useState({ oficinaDestino: '', estado: '', asignadoA: '', comentarios: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!infraccion) return;
    setError('');
    setF({ oficinaDestino: infraccion.oficinaActual._id, estado: infraccion.estado._id, asignadoA: infraccion.asignadoA?._id ?? '', comentarios: '' });
    api.get('/catalogos/oficinas').then((r) => setOficinas(r.data)).catch(() => {});
    api.get('/catalogos/estados').then((r) => setEstados(r.data)).catch(() => {});
    api.get('/users/asignables').then((r) => setAsignables(r.data)).catch(() => {});
  }, [infraccion]);

  const estadoSel = estados.find((e) => e._id === f.estado);
  const exige = Boolean(estadoSel?.requiereComentario);
  const valido = !!f.oficinaDestino && (!exige || !!f.comentarios.trim());

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone((await api.post(`/infracciones/${infraccion!._id}/pase`, f)).data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!infraccion} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={enviar}>
        <DialogTitle>Cursar pase — {infraccion?.numeroActa}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField select size="small" label="Oficina de destino" value={f.oficinaDestino} onChange={(e) => setF({ ...f, oficinaDestino: e.target.value })}>
              {oficinas.map((o) => <MenuItem key={o._id} value={o._id}>{o.nombre}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              {estados.map((e) => <MenuItem key={e._id} value={e._id}>{e.nombre}{e.requiereComentario ? ' (requiere comentario)' : ''}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Asignar a" value={f.asignadoA} onChange={(e) => setF({ ...f, asignadoA: e.target.value })}>
              <MenuItem value="">Sin asignar</MenuItem>
              {asignables.map((a) => <MenuItem key={a.id} value={a.id}>{a.apellidos}, {a.nombres}</MenuItem>)}
            </TextField>
            <TextField size="small" multiline minRows={2} label={exige ? 'Comentario (obligatorio)' : 'Comentario'} required={exige} value={f.comentarios} onChange={(e) => setF({ ...f, comentarios: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={!valido || busy}>Cursar pase</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
