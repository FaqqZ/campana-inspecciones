import { useCallback, useEffect, useState } from 'react';
import FotosEdificio, { AvisoFinalDeObra } from './FotosEdificio';
import NotificacionesEdificio from './NotificacionesEdificio';
import {
  Alert, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Tabs,
  TextField, Typography, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PlaceIcon from '@mui/icons-material/EditLocationAlt';
import {
  api, errMsg, Ficha, FichaDocumento, fmtFecha, isoDia, Inspector, EstadoInspeccion,
} from '../api';
import { useAuth } from '../auth';
import { can } from '../utils/permisos';
import InfraccionForm from './InfraccionForm';
import { CATEGORIAS, GEO_LABEL, INSPECCION_LABEL, SEMAFORO } from '../semaforo';
import { useMapa } from '../store';

const hoyIso = () => new Date().toISOString().slice(0, 10);

function DocFila({ item, edificioId, puedeEditar, onGuardado }: { item: FichaDocumento; edificioId: string; puedeEditar: boolean; onGuardado: () => void }) {
  const { tipo, doc, estado } = item;
  const [presente, setPresente] = useState(doc?.presente ?? false);
  const [emision, setEmision] = useState(isoDia(doc?.fechaEmision));
  const [venc, setVenc] = useState(isoDia(doc?.fechaVencimiento));
  const [nro, setNro] = useState(doc?.nroReferencia ?? '');
  const [error, setError] = useState('');
  const cambio = presente !== (doc?.presente ?? false) || emision !== isoDia(doc?.fechaEmision) || venc !== isoDia(doc?.fechaVencimiento) || nro !== (doc?.nroReferencia ?? '');

  const guardar = async () => {
    try {
      await api.put(`/edificios/${edificioId}/documentos/${tipo._id}`, {
        presente, fechaEmision: presente ? emision : '', fechaVencimiento: presente ? venc : '', nroReferencia: nro,
      });
      setError('');
      onGuardado();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Paper sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
            {tipo.nombre}{tipo.requerido ? '' : ' (opcional)'}
          </Typography>
          <Chip size="small" label={SEMAFORO[estado].label} sx={{ bgcolor: SEMAFORO[estado].color, color: estado === 'por_vencer' ? '#2a1d00' : '#fff' }} />
        </Stack>
        <FormControlLabel
          control={<Checkbox size="small" checked={presente} disabled={!puedeEditar} onChange={(e) => setPresente(e.target.checked)} />}
          label="Presenta el documento"
        />
        {presente && (
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="date" label="Emisión" InputLabelProps={{ shrink: true }} value={emision} disabled={!puedeEditar} onChange={(e) => setEmision(e.target.value)} />
            {tipo.tieneVencimiento && (
              <TextField size="small" type="date" label="Vencimiento" InputLabelProps={{ shrink: true }} value={venc} disabled={!puedeEditar} onChange={(e) => setVenc(e.target.value)} />
            )}
          </Stack>
        )}
        {presente && <TextField size="small" label="N° / referencia" value={nro} disabled={!puedeEditar} onChange={(e) => setNro(e.target.value)} />}
        {error && <Alert severity="error">{error}</Alert>}
        {puedeEditar && cambio && <Button size="small" variant="contained" onClick={guardar}>Guardar</Button>}
      </Stack>
    </Paper>
  );
}

export default function FichaEdificio({ id, puedeEditar, onClose, onCambio }: { id: string; puedeEditar: boolean; onClose: () => void; onCambio: () => void }) {
  const { setMoviendo, moviendo } = useMapa();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState({ titular: '', uso: '', observaciones: '' });
  const [inspectores, setInspectores] = useState<Inspector[]>([]);
  const { user } = useAuth();
  const puedeInfraccion = can(user?.role, 'editarInfracciones');
  const [formInf, setFormInf] = useState<{ abierto: boolean; motivos: string[] }>({ abierto: false, motivos: [] });
  const [visita, setVisita] = useState({ fecha: hoyIso(), inspector: '', resultado: 'inspeccionado', observaciones: '' });

  const cargar = useCallback(async () => {
    try {
      const r = await api.get<Ficha>(`/edificios/${id}`);
      setFicha(r.data);
      setDatos({ titular: r.data.edificio.titular, uso: r.data.edificio.uso, observaciones: r.data.edificio.observaciones });
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => { setFicha(null); setTab(0); cargar(); }, [cargar]);
  useEffect(() => {
    api.get('/catalogos/inspectores').then((r) => setInspectores(r.data)).catch(() => {});
  }, []);

  const tras = () => { cargar(); onCambio(); };
  const accion = async (fn: () => Promise<unknown>) => {
    try { await fn(); setError(''); tras(); } catch (e) { setError(errMsg(e)); }
  };

  const e = ficha?.edificio;
  // Colegios y boliches: sin la estructura de edificios (papeles, infracciones, visitas, notificación); solo nombre y datos básicos.
  const simple = !!ficha?.categoria && ficha.categoria !== 'EDIFICIOS';
  const nombreInstitucion = (e?.titular || '').trim();

  return (
    <Paper square sx={{ width: { xs: '100%', md: 440 }, flexShrink: 0, display: 'flex', flexDirection: 'column', borderWidth: '0 0 0 1px', overflow: 'hidden', position: { xs: 'absolute', md: 'static' }, inset: { xs: 0, md: 'auto' }, zIndex: { xs: 1200, md: 'auto' } }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {simple ? (
              <>
                <Typography variant="h6" sx={{ wordBreak: 'break-word' }}>{nombreInstitucion || 'Sin nombre'}</Typography>
                <Typography variant="body2" color="text.secondary">{e?.direccionOriginal}</Typography>
              </>
            ) : (
              <Typography variant="h6" noWrap>{e?.direccionOriginal ?? 'Cargando…'}</Typography>
            )}
            {e && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                {ficha?.categoria && ficha.categoria !== 'EDIFICIOS' && <Chip size="small" color="primary" variant="outlined" label={`${CATEGORIAS[ficha.categoria].emoji} ${CATEGORIAS[ficha.categoria].label.replace(/s$/, '')}`} />}
                <Chip size="small" variant="outlined" label={`Ubicación: ${GEO_LABEL[e.geoEstado]}`} />
                {!simple && <Chip size="small" variant="outlined" label={INSPECCION_LABEL[e.estadoInspeccion]} />}
              </Stack>
            )}
          </Box>
          <IconButton onClick={onClose} aria-label="Cerrar"><CloseIcon /></IconButton>
        </Stack>
        {puedeEditar && e && (
          <Button size="small" startIcon={<PlaceIcon />} sx={{ mt: 1 }} disabled={moviendo} onClick={() => setMoviendo(true)}>
            {e.lat === null ? 'Ubicar en el mapa' : 'Corregir ubicación'}
          </Button>
        )}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </Box>
      {!simple && <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Datos" />
        <Tab label="Papeles" />
        <Tab label={`Infracciones${ficha ? ` (${ficha.infracciones.length})` : ''}`} />
        <Tab label={`Visitas${ficha ? ` (${ficha.inspecciones.length})` : ''}`} />
        <Tab label={`Fotos${ficha ? ` (${ficha.fotos?.length ?? 0})` : ''}`} />
        <Tab label={`Notificación${ficha?.notificaciones?.length ? ` (${ficha.notificaciones.length})` : ''}`} />
      </Tabs>}

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {ficha && e && simple && (
          <Stack spacing={2}>
            {e.geoDisplayName && <Typography variant="caption" color="text.secondary">OSM: {e.geoDisplayName}</Typography>}
            {e.codigo && <TextField size="small" label="ID" value={e.codigo} disabled />}
            <TextField size="small" label="Nombre" value={datos.titular} disabled={!puedeEditar} onChange={(ev) => setDatos({ ...datos, titular: ev.target.value })} />
            <TextField size="small" label="Dirección" value={e.direccionOriginal} disabled />
            <TextField size="small" label="Observaciones" multiline minRows={2} value={datos.observaciones} disabled={!puedeEditar} onChange={(ev) => setDatos({ ...datos, observaciones: ev.target.value })} />
            {puedeEditar && <Button variant="contained" onClick={() => accion(() => api.patch(`/edificios/${id}`, { titular: datos.titular, observaciones: datos.observaciones }))}>Guardar</Button>}
            <Divider />
            <Typography variant="subtitle2">Fotos{ficha.fotos?.length ? ` (${ficha.fotos.length})` : ''}</Typography>
            <FotosEdificio simple edificio={e} fotos={ficha.fotos ?? []} puedeEditar={puedeEditar} onCambio={tras} />
          </Stack>
        )}
        {ficha && e && !simple && tab === 0 && (
          <Stack spacing={2}>
            {e.geoDisplayName && <Typography variant="caption" color="text.secondary">OSM: {e.geoDisplayName}</Typography>}
            <AvisoFinalDeObra e={e} />
            {(e.padron || e.estadoObra) && (
              <Paper sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" gutterBottom>Catastro</Typography>
                <Stack spacing={0.4}>
                  {e.padron && <Typography variant="body2"><strong>Padrón:</strong> {e.padron}</Typography>}
                  {e.estadoObra && <Typography variant="body2"><strong>Estado de obra:</strong> {e.estadoObra}</Typography>}
                  {e.calleOrigen && <Typography variant="body2"><strong>Figura como:</strong> {e.calleOrigen} {e.alturaOriginal}</Typography>}
                  {e.esquina && <Typography variant="body2"><strong>Esquina:</strong> {e.esquina}</Typography>}
                  {e.conclusionCruce && <Typography variant="body2" color="text.secondary">{e.conclusionCruce}</Typography>}
                </Stack>
                {e.mismaCalleOtraAltura && <Chip size="small" color="warning" label="Hay certificado en la misma calle con otra altura" sx={{ mt: 1 }} />}
                {e.enListadoSinCert && <Chip size="small" color="info" label="Está en el listado de Defensa Civil sin certificado" sx={{ mt: 1, ml: 0.5 }} />}
              </Paper>
            )}
            <TextField size="small" label="Titular" value={datos.titular} disabled={!puedeEditar} onChange={(ev) => setDatos({ ...datos, titular: ev.target.value })} />
            <TextField size="small" label="Uso" value={datos.uso} disabled={!puedeEditar} onChange={(ev) => setDatos({ ...datos, uso: ev.target.value })} />
            <TextField size="small" label="Observaciones" multiline minRows={2} value={datos.observaciones} disabled={!puedeEditar} onChange={(ev) => setDatos({ ...datos, observaciones: ev.target.value })} />
            {puedeEditar && (
              <Stack direction="row" spacing={1}>
                <TextField select size="small" label="Estado de inspección" sx={{ flex: 1 }} value={e.estadoInspeccion}
                  onChange={(ev) => accion(() => api.patch(`/edificios/${id}`, { estadoInspeccion: ev.target.value }))}>
                  {(Object.keys(INSPECCION_LABEL) as EstadoInspeccion[]).map((k) => <MenuItem key={k} value={k}>{INSPECCION_LABEL[k]}</MenuItem>)}
                </TextField>
                <Button variant="contained" onClick={() => accion(() => api.patch(`/edificios/${id}`, datos))}>Guardar</Button>
              </Stack>
            )}
            <Divider />
            <Typography variant="subtitle2">Posibles infracciones</Typography>
            {ficha.infraccionesPotenciales.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No se detectan por la documentación cargada.
              </Typography>
            ) : (
              <Stack spacing={0.8}>
                {ficha.infraccionesPotenciales.map((i, k) => (
                  <Alert key={k} severity={i.estado === 'vencido' ? 'warning' : 'error'} icon={false} sx={{ py: 0 }}>
                    <strong>{i.motivo.nombre}</strong>
                    <Typography variant="caption" display="block">
                      {i.documento}: {i.estado === 'vencido' ? 'vencido' : 'no presentado'}
                    </Typography>
                    {puedeInfraccion && <Button size="small" sx={{ mt: 0.5 }} onClick={() => setFormInf({ abierto: true, motivos: [i.motivo._id] })}>Registrar infracción</Button>}
                  </Alert>
                ))}
                <Typography variant="caption" color="text.secondary">Son sugerencias según los papeles requeridos; no son actas labradas.</Typography>
              </Stack>
            )}
          </Stack>
        )}

        {ficha && e && !simple && tab === 1 && (
          <Stack spacing={1.5}>
            {ficha.documentos.length === 0 && <Alert severity="info">No hay tipos de documento definidos. Cargalos en Catálogos.</Alert>}
            {ficha.documentos.map((d) => (
              <DocFila key={`${d.tipo._id}-${d.doc ? 1 : 0}`} item={d} edificioId={id} puedeEditar={puedeEditar} onGuardado={tras} />
            ))}
          </Stack>
        )}

        {ficha && e && !simple && tab === 2 && (
          <Stack spacing={1.5}>
            {ficha.infracciones.length === 0 && <Typography variant="body2" color="text.secondary">Este edificio no tiene infracciones cargadas.</Typography>}
            {ficha.infracciones.map((a) => (
              <Paper key={a._id} sx={{ p: 1.5 }}>
                <Stack spacing={0.6}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>Acta {a.numeroActa} · {fmtFecha(a.fechaInfraccion)}</Typography>
                    <Chip size="small" color={a.expediente?.numero ? 'success' : a.estado.requiereComentario ? 'warning' : 'default'} label={a.expediente?.numero ? `Exp. ${a.expediente.numero}` : a.estado.nombre} />
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    {a.motivosInfraccion.map((m) => <Chip key={m._id} size="small" variant="outlined" label={m.nombre} />)}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {a.oficinaActual.nombre} · {a.inspectoresActuantes.map((i) => i.nombre).join(', ')}{a.infractor ? ` · ${a.infractor}` : ''}
                  </Typography>
                </Stack>
              </Paper>
            ))}
            {puedeInfraccion && <Button variant="contained" onClick={() => setFormInf({ abierto: true, motivos: [] })}>Cargar infracción</Button>}
            <Typography variant="caption" color="text.secondary">Para editar, hacer pases o generar el expediente usá la sección Infracciones.</Typography>
          </Stack>
        )}

        {ficha && e && !simple && tab === 5 && <NotificacionesEdificio edificioId={id} notificaciones={ficha.notificaciones ?? []} puedeEditar={puedeEditar} onCambio={tras} />}
        {ficha && e && !simple && tab === 4 && <FotosEdificio edificio={e} fotos={ficha.fotos ?? []} puedeEditar={puedeEditar} onCambio={tras} />}
        {ficha && e && !simple && tab === 3 && (
          <Stack spacing={1.5}>
            {ficha.inspecciones.length === 0 && <Typography variant="body2" color="text.secondary">Todavía no hay visitas registradas.</Typography>}
            {ficha.inspecciones.map((i) => (
              <Paper key={i._id} sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="flex-start">
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{fmtFecha(i.fecha)} · {INSPECCION_LABEL[i.resultado]}</Typography>
                    <Typography variant="caption" color="text.secondary">{i.inspector?.nombre ?? 'Sin inspector'}</Typography>
                    {i.observaciones && <Typography variant="body2">{i.observaciones}</Typography>}
                  </Box>
                  {puedeEditar && (
                    <IconButton size="small" aria-label="Eliminar" onClick={() => window.confirm('¿Eliminar esta visita?') && accion(() => api.delete(`/edificios/${id}/inspecciones/${i._id}`))}><DeleteIcon fontSize="small" /></IconButton>
                  )}
                </Stack>
              </Paper>
            ))}
            {puedeEditar && (
              <>
                <Divider />
                <Typography variant="subtitle2">Registrar visita</Typography>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="date" label="Fecha" InputLabelProps={{ shrink: true }} value={visita.fecha} onChange={(ev) => setVisita({ ...visita, fecha: ev.target.value })} sx={{ flex: 1 }} />
                  <TextField select size="small" label="Resultado" value={visita.resultado} onChange={(ev) => setVisita({ ...visita, resultado: ev.target.value })} sx={{ flex: 1 }}>
                    {(['inspeccionado', 'observado', 'regularizado'] as const).map((k) => <MenuItem key={k} value={k}>{INSPECCION_LABEL[k]}</MenuItem>)}
                  </TextField>
                </Stack>
                <TextField select size="small" label="Inspector" value={visita.inspector} onChange={(ev) => setVisita({ ...visita, inspector: ev.target.value })}>
                  <MenuItem value="">Sin especificar</MenuItem>
                  {inspectores.map((i) => <MenuItem key={i._id} value={i._id}>{i.nombre}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Observaciones" multiline minRows={2} value={visita.observaciones} onChange={(ev) => setVisita({ ...visita, observaciones: ev.target.value })} />
                <Button variant="contained" disabled={!visita.fecha} onClick={() => accion(async () => { await api.post(`/edificios/${id}/inspecciones`, visita); setVisita({ ...visita, observaciones: '' }); })}>Registrar</Button>
              </>
            )}
          </Stack>
        )}
      </Box>
      {e && !simple && (
        <InfraccionForm
          open={formInf.abierto}
          edificio={{ id, direccion: e.direccionOriginal }}
          motivosIniciales={formInf.motivos}
          onClose={() => setFormInf({ abierto: false, motivos: [] })}
          onSaved={() => { setFormInf({ abierto: false, motivos: [] }); setTab(2); tras(); }}
        />
      )}
    </Paper>
  );
}
