import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Container, FormControlLabel, LinearProgress, Paper, Stack, Switch, Table, TableBody,
  TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';

type Tipo = 'edificios' | 'actas';
interface FilaPrev { fila: number; direccion: string; errores: string[]; nuevos: { motivos: string[] } }
interface Prev { total: number; validas: number; conErrores: number; filas: FilaPrev[] }
interface Progreso { corriendo: boolean; pendientes: number; porEstado: Record<string, number>; ultimoError: string }

export default function ImportarPage() {
  const { user } = useAuth();
  const esAdmin = user?.role === 'Administrador';
  const [tipo, setTipo] = useState<Tipo>('edificios');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [prev, setPrev] = useState<Prev | null>(null);
  const [crearCatalogos, setCrearCatalogos] = useState(false);
  const [lote, setLote] = useState<{ id: string; tipo: Tipo; importadas: number } | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<Progreso | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Progreso de geocodificación mientras haya pendientes
  useEffect(() => {
    let vivo = true;
    const tick = () => api.get('/geocodificar/progreso').then((r) => vivo && setProg(r.data)).catch(() => {});
    tick();
    const id = setInterval(tick, 3000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  const form = () => {
    const f = new FormData();
    f.append('archivo', archivo!);
    f.append('crearCatalogos', String(crearCatalogos));
    return f;
  };

  const descargarPlantilla = async () => {
    try {
      const r = await api.get(`/importar/plantilla/${tipo}`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = `plantilla-${tipo}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError(errMsg(e)); }
  };

  const previsualizar = async () => {
    setBusy(true); setError(''); setMsg(''); setPrev(null);
    try { setPrev((await api.post(`/importar/${tipo}/previsualizar`, form())).data); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const confirmar = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/importar/${tipo}/confirmar`, form());
      setLote({ id: r.data.lote, tipo, importadas: r.data.importadas });
      setMsg(`Se importaron ${r.data.importadas} filas${r.data.omitidas ? ` (${r.data.omitidas} omitidas por errores)` : ''}.`);
      setPrev(null); setArchivo(null);
      if (input.current) input.current.value = '';
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const revertir = async () => {
    if (!lote || !window.confirm(`¿Revertir la importación de ${lote.importadas} filas?`)) return;
    try {
      const r = await api.delete(`/importar/${lote.tipo}/lote/${lote.id}`);
      setMsg(`Importación revertida (${r.data.eliminadas} eliminadas).`);
      setLote(null);
    } catch (e) { setError(errMsg(e)); }
  };

  const total = prog ? Object.values(prog.porEstado).reduce((a, b) => a + b, 0) : 0;
  const hechos = total - (prog?.pendientes ?? 0);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Importar desde Excel</Typography>
        <ToggleButtonGroup exclusive value={tipo} onChange={(_, v) => { if (v) { setTipo(v); setPrev(null); setMsg(''); } }} size="small">
          <ToggleButton value="edificios">Edificios (direcciones)</ToggleButton>
          <ToggleButton value="actas">Actas y expedientes</ToggleButton>
        </ToggleButtonGroup>
        <Alert severity="info">
          {tipo === 'edificios'
            ? 'Cargá un .xlsx con las columnas Calle y Número (o una sola columna "Dirección completa"). Después de importar, las direcciones se ubican solas en el mapa.'
            : 'Vinculá actas o expedientes ya existentes a edificios cargados. Se asocian por Calle + Número, así que primero importá los edificios.'}
        </Alert>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {msg && <Alert severity="success" action={lote && esAdmin ? <Button color="inherit" size="small" onClick={revertir}>Revertir</Button> : undefined}>{msg}</Alert>}

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button onClick={descargarPlantilla}>Descargar plantilla</Button>
            <Button component="label" variant="outlined">
              {archivo ? archivo.name : 'Elegir archivo .xlsx'}
              <input ref={input} hidden type="file" accept=".xlsx" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setPrev(null); }} />
            </Button>
            {tipo === 'actas' && esAdmin && (
              <FormControlLabel control={<Switch checked={crearCatalogos} onChange={(e) => setCrearCatalogos(e.target.checked)} />} label="Crear motivos que no existan" />
            )}
            <Button variant="contained" disabled={!archivo || busy} onClick={previsualizar}>Previsualizar</Button>
          </Stack>
        </Paper>

        {prev && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <Chip label={`${prev.total} filas`} />
              <Chip color="success" label={`${prev.validas} válidas`} />
              <Chip color={prev.conErrores ? 'error' : 'default'} label={`${prev.conErrores} con errores`} />
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" disabled={!prev.validas || busy} onClick={confirmar}>Importar {prev.validas} filas válidas</Button>
            </Stack>
            <Table size="small">
              <TableHead><TableRow><TableCell width={70}>Fila</TableCell><TableCell>Dirección</TableCell><TableCell>Resultado</TableCell></TableRow></TableHead>
              <TableBody>
                {prev.filas.filter((f) => f.errores.length).slice(0, 200).map((f) => (
                  <TableRow key={f.fila}>
                    <TableCell>{f.fila}</TableCell><TableCell>{f.direccion || '—'}</TableCell>
                    <TableCell sx={{ color: 'error.main' }}>{f.errores.join(' · ')}</TableCell>
                  </TableRow>
                ))}
                {!prev.conErrores && <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>Todas las filas son válidas.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Paper>
        )}

        {prog && total > 0 && (prog.corriendo || prog.pendientes > 0) && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Ubicando direcciones en el mapa</Typography>
            <LinearProgress variant="determinate" value={total ? (hechos / total) * 100 : 0} sx={{ height: 8, borderRadius: 4 }} />
            <Typography variant="caption" color="text.secondary">
              {hechos} de {total} · se consulta OpenStreetMap a razón de 1 dirección por segundo{prog.ultimoError ? ` · último error: ${prog.ultimoError}` : ''}
            </Typography>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
