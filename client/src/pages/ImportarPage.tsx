import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Container, FormControlLabel, LinearProgress, Paper, Stack, Switch, Table, TableBody,
  TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';

type Tipo = 'edificios' | 'infracciones' | 'cruce' | 'actas' | 'fotos' | 'notificados';
const esInfra = (t: Tipo) => t === 'infracciones' || t === 'actas';
interface FilaPrev { fila: number; direccion: string; errores: string[]; avisos: string[]; unida: boolean; nuevos: { motivos: string[] }; cambios?: string[]; actualiza?: boolean }
interface Prev { total: number; validas: number; conErrores: number; unidas?: number; conAvisos?: number; certificados?: number; nuevas?: number; aActualizar?: number; sinCambios?: number; fotos?: number; sinDireccion?: number; ignoradas?: number; filas: FilaPrev[] }
interface Progreso { corriendo: boolean; pendientes: number; porEstado: Record<string, number>; ultimoError: string }

export default function ImportarPage() {
  const { user } = useAuth();
  const esAdmin = user?.role === 'Administrador';
  const [tipo, setTipo] = useState<Tipo>('edificios');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [prev, setPrev] = useState<Prev | null>(null);
  const [crearCatalogos, setCrearCatalogos] = useState(false);
  const [crearEdificios, setCrearEdificios] = useState(true);
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
    f.append('crearEdificios', String(crearEdificios));
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
      setLote({ id: r.data.lote, tipo, importadas: r.data.importadas + (r.data.actualizadas ?? 0) });
      const extra = [r.data.actualizadas ? `${r.data.actualizadas} actualizados` : '', r.data.sinCambios ? `${r.data.sinCambios} ya estaban al día` : '', r.data.unidas ? `${r.data.unidas} repetidas unidas` : '', r.data.conCertificado !== undefined ? `${r.data.conCertificado} con certificado final` : '', r.data.edificiosCreados ? `${r.data.edificiosCreados} edificios nuevos` : '', r.data.omitidas ? `${r.data.omitidas} omitidas por errores` : ''].filter(Boolean).join(', ');
      setMsg(`Se importaron ${r.data.importadas} ${tipo === 'fotos' ? 'fotos' : tipo === 'notificados' ? 'notificaciones' : esInfra(tipo) ? 'infracciones' : 'edificios'}${extra ? ` (${extra})` : ''}.`);
      setPrev(null); setArchivo(null);
      if (input.current) input.current.value = '';
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const revertir = async () => {
    if (!lote || !window.confirm(`¿Revertir la importación de ${lote.importadas} filas?`)) return;
    try {
      const r = await api.delete(`/importar/${lote.tipo}/lote/${lote.id}`);
      setMsg(`Importación revertida (${r.data.eliminadas} eliminadas${r.data.restauradas ? `, ${r.data.restauradas} restaurados a su estado anterior` : ''}).`);
      setLote(null);
    } catch (e) { setError(errMsg(e)); }
  };

  const total = prog ? Object.values(prog.porEstado).reduce((a, b) => a + b, 0) : 0;
  const hechos = total - (prog?.pendientes ?? 0);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Importar desde Excel</Typography>
        <ToggleButtonGroup exclusive value={tipo} onChange={(_, v) => { if (v) { setTipo(v); setPrev(null); setMsg(''); setCrearEdificios(v !== 'notificados'); } }} size="small">
          <ToggleButton value="edificios">Edificios (direcciones)</ToggleButton>
          <ToggleButton value="infracciones">Infracciones</ToggleButton>
          <ToggleButton value="cruce">Cruce Catastro / Defensa Civil</ToggleButton>
          <ToggleButton value="actas">Actas de Defensa Civil</ToggleButton>
          <ToggleButton value="fotos">Fotos (Word)</ToggleButton>
          <ToggleButton value="notificados">Edificios notificados</ToggleButton>
        </ToggleButtonGroup>
        <Alert severity="info">
          {tipo === 'edificios' && 'Cargá un .xlsx con las columnas Calle y Número (o una sola columna "Dirección completa"). Después de importar, las direcciones se ubican solas en el mapa.'}
          {tipo === 'infracciones' && 'Cargá infracciones en lote. Cada una se asocia al edificio por Calle + Número. Los inspectores, motivos, estados y oficinas se buscan por nombre en los catálogos; si el estado o la oficina van vacíos, se usan los iniciales.'}
          {tipo === 'fotos' && 'Subí un Word (.docx) con las direcciones de los edificios y las fotos debajo de cada una. Cada foto se asocia al edificio de esa dirección y se ve en la pestaña Fotos de su ficha en el mapa, junto con lo que informa Catastro sobre el final de obra.'}
          {tipo === 'actas' && 'Subí el listado de actas de infracción tal cual (Fecha, Domicilio, Razón Social, N° de Acta, Motivo, Normativa). Cada acta se asocia al edificio por su domicilio, el motivo se clasifica en el catálogo y el texto original queda guardado. Si un acta aparece repetida en el mismo domicilio se une en una sola.'}
          {tipo === 'notificados' && 'Subí el listado de edificios notificados (Excel) con Domicilio y Fecha de notificación. El plazo es opcional: puede venir en días, como vencimiento vigente (con prórrogas) o faltar; los notificados sin plazo se cargan igual y se completan después con un listado de plazos. Se guardan también boleta, razón social, inspector y novedades, y el seguimiento se ve en la página Notificados, en la ficha y en el mapa.'}
          {tipo === 'cruce' && 'Subí el Excel del cruce o de Catastro tal cual está: se ignoran el resumen y las notas, se traducen los nombres de calle, se toma la primera altura y se registra el certificado final de Defensa Civil. Los edificios que ya existen se actualizan con los datos nuevos (padrón, estado de obra, titular, certificado); lo que venga vacío no pisa lo ya cargado y las actas, fotos y notificaciones no se tocan. La importación se puede revertir.'}
        </Alert>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {msg && <Alert severity="success" action={lote && esAdmin ? <Button color="inherit" size="small" onClick={revertir}>Revertir</Button> : undefined}>{msg}</Alert>}

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {tipo !== 'cruce' && tipo !== 'actas' && tipo !== 'fotos' && tipo !== 'notificados' && <Button onClick={descargarPlantilla}>Descargar plantilla</Button>}
            <Button component="label" variant="outlined">
              {archivo ? archivo.name : `Elegir archivo ${tipo === 'fotos' ? '.docx' : '.xlsx'}`}
              <input ref={input} hidden type="file" accept={tipo === 'fotos' ? '.docx' : '.xlsx'} onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setPrev(null); }} />
            </Button>
            {(esInfra(tipo) || tipo === 'fotos' || tipo === 'notificados') && (
              <FormControlLabel control={<Switch checked={crearEdificios} onChange={(e) => { setCrearEdificios(e.target.checked); setPrev(null); }} />} label="Crear los edificios que falten" />
            )}
            {tipo === 'notificados' && crearEdificios && (
              <Alert severity="warning" sx={{ flexBasis: '100%' }}>Se creará un edificio nuevo por cada domicilio que no exista en la campaña. Para notificados conviene dejarlo apagado: así solo se cargan los edificios que ya están.</Alert>
            )}
            {tipo === 'infracciones' && esAdmin && (
              <FormControlLabel control={<Switch checked={crearCatalogos} onChange={(e) => { setCrearCatalogos(e.target.checked); setPrev(null); }} />} label="Crear inspectores y motivos que no existan" />
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
              {!!prev.unidas && <Chip color="info" label={`${prev.unidas} repetidas, se unen`} />}
              {!!prev.conAvisos && <Chip color="warning" label={`${prev.conAvisos} con avisos`} />}
              {tipo === 'cruce' && <Chip color="primary" variant="outlined" label={`${prev.nuevas ?? 0} nuevos`} />}
              {tipo === 'cruce' && <Chip color="primary" label={`${prev.aActualizar ?? 0} a actualizar`} />}
              {tipo === 'cruce' && !!prev.sinCambios && <Chip variant="outlined" label={`${prev.sinCambios} sin cambios`} />}
              {tipo === 'cruce' && <Chip variant="outlined" label={`${prev.certificados ?? 0} con certificado final`} />}
              {tipo === 'fotos' && <Chip variant="outlined" label={`${prev.fotos ?? 0} fotos`} />}
              {tipo === 'fotos' && !!prev.sinDireccion && <Chip color="warning" label={`${prev.sinDireccion} imágenes sin dirección`} />}
              {tipo === 'fotos' && !!prev.ignoradas && <Chip color="warning" label={`${prev.ignoradas} imágenes ignoradas (formato no soportado)`} />}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" disabled={!prev.validas || busy} onClick={confirmar}>{tipo === 'fotos' ? `Importar ${prev.fotos ?? 0} fotos` : <>{tipo === 'cruce' ? `Cargar ${(prev.nuevas ?? 0)} nuevos y actualizar ${(prev.aActualizar ?? 0)}` : <>Importar {prev.validas - (prev.unidas ?? 0)} {tipo === 'notificados' ? 'notificaciones' : esInfra(tipo) ? 'infracciones' : 'edificios'}</>}</>}</Button>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}><Table size="small">
              <TableHead><TableRow><TableCell width={70}>Fila</TableCell><TableCell>Dirección</TableCell><TableCell>Resultado</TableCell></TableRow></TableHead>
              <TableBody>
                {prev.filas.filter((f) => f.errores.length || f.avisos.length || f.cambios?.length).slice(0, 200).map((f) => (
                  <TableRow key={f.fila}>
                    <TableCell>{f.fila}</TableCell><TableCell>{f.direccion || '—'}</TableCell>
                    <TableCell sx={{ color: f.errores.length ? 'error.main' : f.avisos.length ? 'warning.main' : 'text.primary' }}>
                      {[...f.errores, ...f.avisos].join(' · ')}
                      {!!f.cambios?.length && <Box component="span" sx={{ color: 'info.main' }}>{f.errores.length || f.avisos.length ? ' · ' : ''}Se actualiza: {f.cambios.join(', ')}</Box>}
                    </TableCell>
                  </TableRow>
                ))}
                {!prev.conErrores && !prev.conAvisos && !prev.unidas && !prev.aActualizar && <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>Todas las filas son válidas.</TableCell></TableRow>}
              </TableBody>
            </Table></Box>
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
