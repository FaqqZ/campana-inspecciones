import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Container, Paper, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material';
import { api, errMsg } from '../api';

interface Item { nombre: string; cantidad: number }
interface KpisEdificios {
  resumen: {
    total: number; delCruce: number; creadosDesdeActas: number; conCertificado: number; pctCertificado: number; sinCertificado: number; sinRelevar: number;
    sinFinalCatastro: number; pctSinFinalCatastro: number;
    sinCertConActasAbiertas: number; sinCertSinActas: number; conActas: number; sinUbicar: number;
  };
  porSituacion: Item[];
  porEstadoObra: Item[]; porSemaforo: Item[]; porInspeccion: Item[]; porGeo: Item[]; sinCertPorCalle: Item[];
}
interface KpisNotif {
  resumen: { notificados: number; notificaciones: number; enPlazo: number; porVencer: number; vencidos: number; presentaron: number; pasaronAActa: number; sinPlazo: number; conProrroga: number; vencenEn7: number; vencenEn30: number; plazoPromedio: number };
  porEstado: Item[]; porCalle: Item[]; porMesVencimiento: Item[];
}
interface Kpis {
  resumen: {
    total: number; abiertas: number; conExpediente: number; pctExpediente: number; edificiosConActas: number; totalEdificios: number;
    pctCobertura: number; promedioPorEdificio: number; reincidentes: number; sinAsignar: number; antiguedadPromedio: number; antiguedadMaxima: number;
  };
  porMotivo: Item[]; porEstado: Item[]; porOficina: Item[]; porCalle: Item[]; topEdificios: Item[]; antiguedad: Item[];
  porSemana: { semana: string; cantidad: number }[];
}

const num = (n: number) => n.toLocaleString('es-AR');
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Paper sx={{ p: 2, flex: '1 1 170px', minWidth: 170 }}>
      <Typography variant="caption" color="text.secondary">{titulo}</Typography>
      <Typography sx={{ fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>{valor}</Typography>
      {detalle && <Typography variant="caption" color="text.secondary">{detalle}</Typography>}
    </Paper>
  );
}

function Panel({ titulo, children, ancho = 420 }: { titulo: string; children: React.ReactNode; ancho?: number }) {
  return (
    <Paper sx={{ p: 2, flex: `1 1 ${ancho}px`, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{titulo}</Typography>
      {children}
    </Paper>
  );
}

/** Barras horizontales: nombre a la izquierda, barra y valor directo a la derecha. */
function Barras({ items, total }: { items: Item[]; total?: number }) {
  const color = useTheme().palette.primary.main;
  const max = Math.max(1, ...items.map((i) => i.cantidad));
  if (!items.length) return <Typography variant="body2" color="text.secondary">Sin datos.</Typography>;
  return (
    <Stack spacing={0.75}>
      {items.map((i) => (
        <Tooltip key={i.nombre} placement="top-start" title={`${i.nombre}: ${num(i.cantidad)}${total ? ` (${Math.round((i.cantidad / total) * 100)}%)` : ''}`}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) 1fr', alignItems: 'center', columnGap: 1.5 }}>
            <Typography variant="body2" noWrap color="text.secondary">{i.nombre}</Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ height: 14, width: `${(i.cantidad / max) * 100}%`, minWidth: 3, bgcolor: color, borderRadius: '0 4px 4px 0' }} />
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{num(i.cantidad)}</Typography>
            </Stack>
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

/** Columnas por semana, con 2px de separación y valor al pasar el cursor. */
function Semanas({ datos }: { datos: Kpis['porSemana'] }) {
  const color = useTheme().palette.primary.main;
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  if (!datos.length) return <Typography variant="body2" color="text.secondary">Sin datos.</Typography>;
  const cada = Math.ceil(datos.length / 8);
  return (
    <Box>
      <Stack direction="row" alignItems="flex-end" sx={{ height: 150, gap: '2px', borderBottom: 1, borderColor: 'divider' }}>
        {datos.map((d) => (
          <Tooltip key={d.semana} title={`Semana del ${diaMes(d.semana)}: ${num(d.cantidad)} actas`} placement="top">
            <Box sx={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
              <Box sx={{ width: '100%', height: `${(d.cantidad / max) * 100}%`, minHeight: d.cantidad ? 2 : 0, bgcolor: color, borderRadius: '4px 4px 0 0' }} />
            </Box>
          </Tooltip>
        ))}
      </Stack>
      <Stack direction="row" sx={{ gap: '2px' }}>
        {datos.map((d, i) => (
          <Typography key={d.semana} variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'center', fontSize: 10, overflow: 'visible', whiteSpace: 'nowrap' }}>
            {i % cada === 0 ? diaMes(d.semana) : ''}
          </Typography>
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary">Máximo semanal: {num(max)} actas · cada columna es una semana (desde el lunes).</Typography>
    </Box>
  );
}

export default function KpisPage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [k, setK] = useState<Kpis | null>(null);
  const [ek, setEk] = useState<KpisEdificios | null>(null);
  const [nk, setNk] = useState<KpisNotif | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    api.get('/notificaciones/kpis').then((r) => vivo && setNk(r.data)).catch(() => {});
    api.get('/edificios/kpis').then((r) => vivo && setEk(r.data)).catch((e) => vivo && setError(errMsg(e)));
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    let vivo = true;
    setError('');
    api.get('/infracciones/kpis', { params: { fechaDesde: desde || undefined, fechaHasta: hasta || undefined } })
      .then((r) => vivo && setK(r.data))
      .catch((e) => vivo && setError(errMsg(e)));
    return () => { vivo = false; };
  }, [desde, hasta]);

  const r = k?.resumen;
  const inspeccionados = ek ? ek.porInspeccion.filter((x) => x.nombre !== 'Pendiente').reduce((n, x) => n + x.cantidad, 0) : 0;
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Indicadores</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {ek && (
          <>
            <Typography variant="h6">Edificios y Catastro</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: '-16px !important' }}>
              Sobre todos los edificios cargados (cruce de Catastro / Defensa Civil y edificios creados desde las actas). No dependen del período.
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Tile titulo="Edificios cargados" valor={num(ek.resumen.total)} detalle={`${num(ek.resumen.delCruce)} del cruce · ${num(ek.resumen.creadosDesdeActas)} creados desde actas`} />
              <Tile
                titulo="Edificios inspeccionados"
                valor={num(inspeccionados)}
                detalle={`${ek.resumen.total ? Math.round((inspeccionados / ek.resumen.total) * 100) : 0}% del total · los que tienen actas de infracción`}
              />
              <Tile titulo="Con certificado final" valor={num(ek.resumen.conCertificado)} detalle={`${ek.resumen.pctCertificado}% del total`} />
              <Tile titulo="Sin certificado final" valor={num(ek.resumen.sinCertificado)} detalle={`${num(ek.resumen.sinRelevar)} más sin relevar`} />
              <Tile titulo="Sin final de obra (Catastro)" valor={num(ek.resumen.sinFinalCatastro)} detalle={`${ek.resumen.pctSinFinalCatastro}% del total`} />
              <Tile titulo="Sin certificado con actas abiertas" valor={num(ek.resumen.sinCertConActasAbiertas)} detalle={`${num(ek.resumen.sinCertSinActas)} sin certificado ni actas`} />
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Panel titulo="Calles con más edificios sin certificado"><Barras items={ek.sinCertPorCalle} total={ek.resumen.sinCertificado} /></Panel>
            </Stack>
            {nk && nk.resumen.notificados > 0 && (
              <>
                <Typography variant="h6" sx={{ pt: 1 }}>Edificios notificados</Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                  <Tile titulo="Edificios notificados" valor={num(nk.resumen.notificados)} detalle={`plazo promedio de ${nk.resumen.plazoPromedio} días`} />
                  <Tile titulo="En plazo" valor={num(nk.resumen.enPlazo)} detalle={`${Math.round((nk.resumen.enPlazo / nk.resumen.notificados) * 100)}% de los notificados`} />
                  <Tile titulo="Por vencer" valor={num(nk.resumen.porVencer)} detalle="faltan 10 días o menos" />
                  <Tile titulo="Vencidos" valor={num(nk.resumen.vencidos)} detalle={`${Math.round((nk.resumen.vencidos / nk.resumen.notificados) * 100)}% de los notificados`} />
                  <Tile titulo="Presentaron documentación" valor={num(nk.resumen.presentaron)} detalle={`${num(nk.resumen.conProrroga)} con prórroga`} />
                  <Tile titulo="Pasaron a acta" valor={num(nk.resumen.pasaronAActa)} detalle="vencido el plazo, pase al Dep. Técnico" />
                  {nk.resumen.sinPlazo > 0 && <Tile titulo="Sin plazo registrado" valor={num(nk.resumen.sinPlazo)} detalle="notificados, falta cargar el plazo" />}
                  <Tile titulo="Vencen en 7 días" valor={num(nk.resumen.vencenEn7)} detalle={`${num(nk.resumen.vencenEn30)} en los próximos 30 días`} />
                </Stack>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                  <Panel titulo="Notificados según su plazo" ancho={300}><Barras items={nk.porEstado} total={nk.resumen.notificados} /></Panel>
                  <Panel titulo="Vencimientos por mes" ancho={300}><Barras items={nk.porMesVencimiento} /></Panel>
                  <Panel titulo="Calles con más notificados" ancho={300}><Barras items={nk.porCalle} total={nk.resumen.notificados} /></Panel>
                </Stack>
              </>
            )}
            <Typography variant="h6" sx={{ pt: 1 }}>Infracciones</Typography>
          </>
        )}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Las actas de infracción se pueden filtrar por fecha.</Typography>
          <TextField size="small" type="date" label="Infracciones desde" InputLabelProps={{ shrink: true }} value={desde} onChange={(e) => setDesde(e.target.value)} />
          <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Stack>
        {!k && !error && <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>}
        {k && r && (r.total === 0 ? (
          <Alert severity="info">No hay infracciones cargadas en el período elegido.</Alert>
        ) : (
          <>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Tile titulo="Infracciones cargadas" valor={num(r.total)} detalle={`${num(r.abiertas)} abiertas · ${num(r.conExpediente)} con expediente`} />
              <Tile titulo="Con expediente" valor={`${r.pctExpediente}%`} detalle="de las infracciones cargadas" />
              <Tile titulo="Edificios con infracciones" valor={num(r.edificiosConActas)} detalle={`${r.pctCobertura}% de los ${num(r.totalEdificios)} de la campaña`} />
              <Tile titulo="Promedio por edificio" valor={String(r.promedioPorEdificio).replace('.', ',')} detalle="infracciones por edificio con actas" />
              <Tile titulo="Edificios reincidentes" valor={num(r.reincidentes)} detalle="con 2 o más infracciones" />
              <Tile titulo="Antigüedad de las abiertas" valor={`${num(r.antiguedadPromedio)} d`} detalle={`promedio · la más vieja ${num(r.antiguedadMaxima)} días`} />
              <Tile titulo="Abiertas sin asignar" valor={num(r.sinAsignar)} detalle="sin responsable a cargo" />
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Panel titulo="Infracciones por semana" ancho={560}><Semanas datos={k.porSemana} /></Panel>
              <Panel titulo="Por motivo"><Barras items={k.porMotivo} total={r.total} /></Panel>
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Panel titulo="Por estado" ancho={300}><Barras items={k.porEstado} total={r.total} /></Panel>
              <Panel titulo="Abiertas por oficina" ancho={300}><Barras items={k.porOficina} total={r.abiertas} /></Panel>
              <Panel titulo="Antigüedad de las abiertas" ancho={300}><Barras items={k.antiguedad} total={r.abiertas} /></Panel>
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Panel titulo="Calles con más infracciones"><Barras items={k.porCalle} total={r.total} /></Panel>
              <Panel titulo="Edificios con más infracciones"><Barras items={k.topEdificios} total={r.total} /></Panel>
            </Stack>
          </>
        ))}
      </Stack>
    </Container>
  );
}
