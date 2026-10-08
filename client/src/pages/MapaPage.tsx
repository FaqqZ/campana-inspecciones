import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Chip, Divider, MenuItem, Paper, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { api, errMsg, PuntoMapa } from '../api';
import { INSPECCION_LABEL, GEO_LABEL, SEMAFORO } from '../semaforo';
import { useMapa } from '../store';
import MapaView from '../components/MapaView';
import FichaEdificio from '../components/FichaEdificio';
import { useAuth } from '../auth';

interface Calle { calleNorm: string; calle: string; cantidad: number }

export default function MapaPage() {
  const { user } = useAuth();
  const { filtros, setFiltro, limpiar, seleccionado, seleccionar, moviendo, setMoviendo, version, refrescar } = useMapa();
  const [params, setParams] = useSearchParams();
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [resumen, setResumen] = useState({ total: 0, sinUbicar: 0 });
  const [calles, setCalles] = useState<Calle[]>([]);
  const [textoCalle, setTextoCalle] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [posNueva, setPosNueva] = useState<[number, number] | null>(null);

  // Abrir un edificio desde otra pantalla (/?ver=ID&mover=1)
  useEffect(() => {
    const ver = params.get('ver');
    if (ver) {
      seleccionar(ver, params.get('mover') === '1');
      setParams({}, { replace: true });
    }
  }, [params, seleccionar, setParams]);

  useEffect(() => {
    api.get('/edificios/calles', { params: { q: textoCalle } }).then((r) => setCalles(r.data)).catch(() => {});
  }, [textoCalle, version]);

  useEffect(() => {
    const q = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
    api.get('/edificios/mapa', { params: q })
      .then((r) => { setPuntos(r.data.puntos); setResumen({ total: r.data.total, sinUbicar: r.data.sinUbicar }); setError(''); })
      .catch((e) => setError(errMsg(e)));
  }, [filtros, version]);

  const claveFiltros = useMemo(() => JSON.stringify(filtros), [filtros]);
  const cuenta = useMemo(() => {
    const c: Record<string, number> = {};
    puntos.forEach((p) => { c[p.semaforo] = (c[p.semaforo] || 0) + 1; });
    return c;
  }, [puntos]);

  const mover = useCallback(async (lat: number, lng: number) => {
    if (!seleccionado) return;
    try {
      await api.patch(`/edificios/${seleccionado}/ubicacion`, { lat, lng });
      setPosNueva([lat, lng]);
      setMoviendo(false);
      setAviso('Ubicación guardada');
      refrescar();
    } catch (e) {
      setError(errMsg(e));
    }
  }, [seleccionado, setMoviendo, refrescar]);

  const puntoSel = puntos.find((p) => p.id === seleccionado);
  const puedeEditar = user?.role !== 'Consulta';

  return (
    <Box sx={{ display: 'flex', height: '100%', position: 'relative' }}>
      <Paper square sx={{ width: 300, flexShrink: 0, p: 2, overflow: 'auto', borderWidth: '0 1px 0 0' }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>Filtros</Typography>
          <Autocomplete
            freeSolo
            options={calles}
            getOptionLabel={(o) => (typeof o === 'string' ? o : o.calle)}
            renderOption={(props, o) => <li {...props} key={o.calleNorm}>{o.calle}<Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({o.cantidad})</Typography></li>}
            inputValue={textoCalle}
            onInputChange={(_, v, reason) => { setTextoCalle(v); if (reason === 'clear' || v === '') setFiltro('calle', ''); }}
            onChange={(_, v) => setFiltro('calle', v ? (typeof v === 'string' ? v : v.calle) : '')}
            renderInput={(p) => <TextField {...p} label="Calle" placeholder="Ej: Mate de Luna" size="small" />}
          />
          <TextField select size="small" label="Documentación" value={filtros.semaforo} onChange={(e) => setFiltro('semaforo', e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            {Object.entries(SEMAFORO).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Inspección" value={filtros.estadoInspeccion} onChange={(e) => setFiltro('estadoInspeccion', e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            {Object.entries(INSPECCION_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Calidad de ubicación" value={filtros.geoEstado} onChange={(e) => setFiltro('geoEstado', e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            {Object.entries(GEO_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <Button size="small" onClick={() => { limpiar(); setTextoCalle(''); }}>Limpiar filtros</Button>
          <Divider />
          <Typography variant="body2">
            <strong>{resumen.total}</strong> edificios{resumen.sinUbicar > 0 && <> · <strong>{resumen.sinUbicar}</strong> sin ubicar</>}
          </Typography>
          <Stack spacing={0.8}>
            {Object.entries(SEMAFORO).map(([k, v]) => (
              <Stack key={k} direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: v.color, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.4)' }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{v.label}</Typography>
                <Chip size="small" label={cuenta[k] || 0} />
              </Stack>
            ))}
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Paper>

      <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MapaView
          puntos={puntos}
          claveFiltros={claveFiltros}
          seleccionado={seleccionado}
          moviendo={moviendo}
          posSeleccionado={puntoSel ? [puntoSel.lat, puntoSel.lng] : posNueva}
          panelAbierto={!!seleccionado}
          onSelect={(id) => { seleccionar(id); setPosNueva(null); }}
          onMover={mover}
        />
        {moviendo && (
          <Alert severity="info" sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}
            action={<Button color="inherit" size="small" onClick={() => setMoviendo(false)}>Cancelar</Button>}>
            Hacé clic en el mapa{puntoSel ? ' o arrastrá el marcador' : ''} para fijar la ubicación
          </Alert>
        )}
      </Box>

      {seleccionado && (
        <FichaEdificio id={seleccionado} puedeEditar={puedeEditar} onClose={() => seleccionar(null)} onCambio={refrescar} />
      )}
      <Snackbar open={!!aviso} autoHideDuration={3000} onClose={() => setAviso('')} message={aviso} />
    </Box>
  );
}
