import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  InputLabel, ListItemText, MenuItem, FormControl, OutlinedInput, Select, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Typography, SelectChangeEvent,
} from '@mui/material';
import { api, Asignable, Catalogo, Edificio, errMsg, Infraccion, Inspector, isoDia, Motivo } from '../api';

interface Props {
  open: boolean;
  infraccion?: Infraccion | null; // si viene, se edita
  edificio?: { id: string; direccion: string } | null; // edificio preseleccionado (desde la ficha)
  motivosIniciales?: string[]; // motivos precargados (desde una posible infracción)
  onClose: () => void;
  onSaved: (inf: Infraccion) => void;
}

function MultiCatalogo({ label, items, value, onChange, secundario }: {
  label: string; items: (Catalogo & { legajo?: string; descripcion?: string })[]; value: string[];
  onChange: (v: string[]) => void; secundario?: (i: Catalogo & { legajo?: string; descripcion?: string }) => string | undefined;
}) {
  const nombre = (id: string) => items.find((i) => i._id === id)?.nombre ?? '…';
  return (
    <FormControl fullWidth size="small">
      <InputLabel>{label}</InputLabel>
      <Select<string[]>
        multiple
        value={value}
        onChange={(e: SelectChangeEvent<string[]>) => onChange(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
        input={<OutlinedInput label={label} />}
        renderValue={(sel) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{sel.map((id) => <Chip key={id} size="small" label={nombre(id)} />)}</Box>
        )}
      >
        {items.length === 0 && <MenuItem disabled>No hay registros cargados (cargalos en Catálogos)</MenuItem>}
        {items.map((i) => (
          <MenuItem key={i._id} value={i._id}>
            <Checkbox checked={value.includes(i._id)} size="small" />
            <ListItemText primary={i.nombre} secondary={secundario?.(i)} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default function InfraccionForm({ open, infraccion, edificio, motivosIniciales, onClose, onSaved }: Props) {
  const editando = Boolean(infraccion);
  const [inspectores, setInspectores] = useState<Inspector[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [modo, setModo] = useState<'existente' | 'nueva'>('existente');
  const [edif, setEdif] = useState<{ id: string; direccion: string } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [opciones, setOpciones] = useState<Edificio[]>([]);
  const [nueva, setNueva] = useState({ calle: '', numero: '' });
  const [f, setF] = useState({ numeroActa: '', infractor: '', fechaInfraccion: '', inspectoresActuantes: [] as string[], motivosInfraccion: [] as string[], asignadoA: '', observaciones: false, detalleObservaciones: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Carga de catálogos y valores iniciales al abrir
  useEffect(() => {
    if (!open) return;
    setError('');
    const todos = editando ? { todos: true } : undefined; // al editar se listan también los inactivos ya asignados
    api.get('/catalogos/inspectores', { params: todos }).then((r) => setInspectores(r.data)).catch(() => {});
    api.get('/catalogos/motivos', { params: todos }).then((r) => setMotivos(r.data)).catch(() => {});
    api.get('/users/asignables').then((r) => setAsignables(r.data)).catch(() => {});
    if (infraccion) {
      setEdif({ id: infraccion.edificio._id, direccion: infraccion.edificio.direccionOriginal });
      setModo('existente');
      setF({
        numeroActa: infraccion.numeroActa, infractor: infraccion.infractor, fechaInfraccion: isoDia(infraccion.fechaInfraccion),
        inspectoresActuantes: infraccion.inspectoresActuantes.map((i) => i._id), motivosInfraccion: infraccion.motivosInfraccion.map((m) => m._id),
        asignadoA: infraccion.asignadoA?._id ?? '', observaciones: infraccion.observaciones, detalleObservaciones: infraccion.detalleObservaciones,
      });
    } else {
      setEdif(edificio ?? null);
      setModo('existente');
      setNueva({ calle: '', numero: '' });
      setF({ numeroActa: '', infractor: '', fechaInfraccion: new Date().toISOString().slice(0, 10), inspectoresActuantes: [], motivosInfraccion: motivosIniciales ?? [], asignadoA: '', observaciones: false, detalleObservaciones: '' });
    }
  }, [open, infraccion, edificio, motivosIniciales, editando]);

  // Búsqueda de edificios: "Mate de Luna 12" -> calle "Mate de Luna", filtra por el número
  useEffect(() => {
    if (!open || modo !== 'existente' || busqueda.trim().length < 2) { setOpciones([]); return; }
    const m = busqueda.trim().match(/^(.*?)[\s,]+(\d+)$/);
    const calle = (m ? m[1] : busqueda).trim();
    const t = setTimeout(() => {
      api.get('/edificios', { params: { calle, limit: 30 } })
        .then((r) => setOpciones((r.data.items as Edificio[]).filter((e) => !m || String(e.numero ?? '').startsWith(m[2]))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, modo, open]);

  const nombresAsignables = useMemo(() => asignables.map((a) => ({ ...a, label: `${a.apellidos}, ${a.nombres}` })), [asignables]);

  const valido =
    f.numeroActa.trim().length >= 3 && !!f.fechaInfraccion && f.inspectoresActuantes.length > 0 && f.motivosInfraccion.length > 0 &&
    (modo === 'existente' ? !!edif : !!nueva.calle.trim()) && (!f.observaciones || !!f.detalleObservaciones.trim());

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, ...(modo === 'existente' ? { edificio: edif!.id } : { calle: nueva.calle, numero: nueva.numero }) };
      const r = editando ? await api.put(`/infracciones/${infraccion!._id}`, { ...body, edificio: edif?.id }) : await api.post('/infracciones', body);
      onSaved(r.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={guardar}>
        <DialogTitle>{editando ? `Editar infracción ${infraccion!.numeroActa}` : 'Cargar infracción'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <Box>
              <Typography variant="subtitle2" gutterBottom>Edificio</Typography>
              {!edificio && (
                <ToggleButtonGroup exclusive size="small" value={modo} onChange={(_, v) => v && setModo(v)} sx={{ mb: 1 }}>
                  <ToggleButton value="existente">Ya cargado</ToggleButton>
                  <ToggleButton value="nueva">Dirección nueva</ToggleButton>
                </ToggleButtonGroup>
              )}
              {modo === 'existente' ? (
                edificio ? (
                  <Alert severity="info" icon={false}>{edificio.direccion}</Alert>
                ) : (
                  <Autocomplete
                    size="small"
                    options={opciones}
                    value={null}
                    inputValue={busqueda}
                    onInputChange={(_, v, reason) => reason !== 'reset' && setBusqueda(v)}
                    getOptionLabel={(o) => o.direccionOriginal}
                    filterOptions={(x) => x}
                    noOptionsText={busqueda.length < 2 ? 'Escribí la calle (y el número)' : 'Sin resultados: usá "Dirección nueva"'}
                    onChange={(_, v) => { if (v) { setEdif({ id: v._id, direccion: v.direccionOriginal }); setBusqueda(''); } }}
                    renderInput={(p) => <TextField {...p} label={edif ? `Elegido: ${edif.direccion}` : 'Buscar dirección'} placeholder="Ej: Mate de Luna 1234" />}
                  />
                )
              ) : (
                <>
                  <Stack direction="row" spacing={1}>
                    <TextField size="small" label="Calle" required sx={{ flex: 2 }} value={nueva.calle} onChange={(e) => setNueva({ ...nueva, calle: e.target.value })} />
                    <TextField size="small" label="Número" sx={{ flex: 1 }} value={nueva.numero} onChange={(e) => setNueva({ ...nueva, numero: e.target.value })} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">Si el edificio no existe, se crea y se ubica en el mapa automáticamente.</Typography>
                </>
              )}
            </Box>

            <Stack direction="row" spacing={1}>
              <TextField size="small" required label="N° de acta" sx={{ flex: 1 }} value={f.numeroActa} onChange={(e) => setF({ ...f, numeroActa: e.target.value })}
                error={!!f.numeroActa && f.numeroActa.trim().length < 3} helperText={f.numeroActa && f.numeroActa.trim().length < 3 ? 'Mínimo 3 caracteres' : ' '} />
              <TextField size="small" required type="date" label="Fecha de infracción" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} value={f.fechaInfraccion} onChange={(e) => setF({ ...f, fechaInfraccion: e.target.value })} />
            </Stack>
            <TextField size="small" label="Nombre o razón social del infractor" value={f.infractor} onChange={(e) => setF({ ...f, infractor: e.target.value })} />
            <MultiCatalogo label="Inspectores actuantes *" items={inspectores} value={f.inspectoresActuantes} onChange={(v) => setF({ ...f, inspectoresActuantes: v })} secundario={(i) => (i.legajo ? `Legajo ${i.legajo}` : undefined)} />
            <MultiCatalogo label="Motivos de infracción *" items={motivos} value={f.motivosInfraccion} onChange={(v) => setF({ ...f, motivosInfraccion: v })} secundario={(i) => i.descripcion || undefined} />
            <TextField select size="small" label="Asignado a" value={f.asignadoA} onChange={(e) => setF({ ...f, asignadoA: e.target.value })}>
              <MenuItem value="">Sin asignar</MenuItem>
              {nombresAsignables.map((a) => <MenuItem key={a.id} value={a.id}>{a.label}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Switch checked={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.checked })} />} label="Tiene observaciones" />
            {f.observaciones && <TextField size="small" multiline minRows={2} label="Detalle de las observaciones" value={f.detalleObservaciones} onChange={(e) => setF({ ...f, detalleObservaciones: e.target.value })} />}
            {!editando && <Typography variant="caption" color="text.secondary">Se registra con el estado y la oficina iniciales definidos en Catálogos.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={!valido || busy}>{editando ? 'Guardar cambios' : 'Registrar infracción'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
