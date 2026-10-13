import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Container, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography, useTheme } from '@mui/material';
import { api, errMsg } from '../api';

interface Item { nombre: string; cantidad: number; detalle?: string }
interface KpisEdificios {
  resumen: {
    total: number; delCruce: number; creadosDesdeActas: number; conCertificado: number; pctCertificado: number; sinCertificado: number; sinRelevar: number;
    sinFinalCatastro: number; pctSinFinalCatastro: number;
    sinCertConActasAbiertas: number; sinCertSinActas: number; conActas: number; sinUbicar: number;
  };
  porSituacion: Item[];
  porSituacionDetalle: (Item & { conCertificado: number })[];
  porEstadoObra: Item[]; porSemaforo: Item[]; porInspeccion: Item[]; porGeo: Item[]; sinCertPorCalle: Item[];
}
interface KpisDC {
  resumen: { edificiosAlcanzados: number; actuaciones: number; notificaciones: number; infracciones: number; edificiosConInfracciones: number; edificiosNotificados: number; edificiosConAmbas: number; soloInfraccion: number; soloNotificacion: number };
  porTipoActuacion: (Item & { porcentaje: number })[]; estadoNotificaciones: Item[]; porTipologia: Item[]; edificiosPorTipologia: Item[];
  porNormativa: Item[]; edificiosPorCantidad: Item[];
}
const num = (n: number) => n.toLocaleString('es-AR');
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** Paleta categórica (orden fijo, validada en claro y oscuro) y rampa ordinal azul para valores ordenados. */
const PALETAS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
const RAMPAS = { light: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'], dark: ['#184f95', '#256abf', '#5598e7', '#9ec5f4'] };
const useModo = () => (useTheme().palette.mode === 'dark' ? 'dark' : 'light');
const useColores = () => PALETAS[useModo()];

function Tile({ titulo, valor, detalle, color }: { titulo: string; valor: string; detalle?: string; color?: string }) {
  return (
    <Paper sx={{ p: 2, flex: '1 1 170px', minWidth: 170, borderLeft: color ? `4px solid ${color}` : undefined }}>
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

const SinDatos = () => <Typography variant="body2" color="text.secondary">Sin datos.</Typography>;

/** Gráfico de anillo con leyenda: cada categoría con su color, cantidad y porcentaje. Al pasar el cursor resalta la porción. */
function Dona({ items, centro }: { items: Item[]; centro: string }) {
  const colores = useColores();
  const [sel, setSel] = useState<number | null>(null);
  const total = items.reduce((n, i) => n + i.cantidad, 0);
  if (!total) return <SinDatos />;
  const r = 58;
  const c = 2 * Math.PI * r;
  const visibles = items.filter((i) => i.cantidad > 0).length;
  let acumulado = 0;
  const actual = sel !== null ? items[sel] : null;
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
      <Box sx={{ position: 'relative', width: 170, height: 170, flex: '0 0 auto', mx: 'auto' }}>
        <svg viewBox="0 0 160 160" width="170" height="170" role="img" aria-label={`${centro}: ${items.map((i) => `${i.nombre} ${i.cantidad}`).join(', ')}`}>
          <g transform="rotate(-90 80 80)">
            {items.map((i, k) => {
              if (!i.cantidad) return null;
              const largo = (i.cantidad / total) * c;
              const trazo = Math.max(largo - (visibles > 1 ? 2 : 0), 0.5);
              const desfase = -acumulado;
              acumulado += largo;
              return (
                <circle
                  key={i.nombre} cx="80" cy="80" r={r} fill="none" stroke={colores[k % colores.length]}
                  strokeWidth={sel === k ? 28 : 24} strokeDasharray={`${trazo} ${c - trazo}`} strokeDashoffset={desfase}
                  onMouseEnter={() => setSel(k)} onMouseLeave={() => setSel(null)} style={{ cursor: 'default', transition: 'stroke-width .12s' }}
                />
              );
            })}
          </g>
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', px: 4 }}>
          <Typography sx={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>{num(actual ? actual.cantidad : total)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>{actual ? `${pct(actual.cantidad, total)}%` : centro}</Typography>
        </Box>
      </Box>
      <Stack spacing={0.75} sx={{ flex: '1 1 220px', minWidth: 0 }}>
        {items.map((i, k) => (
          <Box
            key={i.nombre} onMouseEnter={() => setSel(k)} onMouseLeave={() => setSel(null)}
            sx={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', columnGap: 1, alignItems: 'start', opacity: sel === null || sel === k ? 1 : 0.55 }}
          >
            <Box sx={{ width: 12, height: 12, mt: '4px', borderRadius: '3px', bgcolor: colores[k % colores.length] }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">{i.nombre}</Typography>
              {i.detalle && <Typography variant="caption" color="text.secondary">{i.detalle}</Typography>}
            </Box>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {num(i.cantidad)} <Typography component="span" variant="caption" color="text.secondary">· {pct(i.cantidad, total)}%</Typography>
            </Typography>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

/** Barras horizontales, una por categoría, cada una con su color; nombre (y detalle), cantidad y porcentaje siempre visibles. */
function Barras({ items, total }: { items: Item[]; total?: number }) {
  const colores = useColores();
  const max = Math.max(1, ...items.map((i) => i.cantidad));
  if (!items.length) return <SinDatos />;
  return (
    <Stack spacing={1.25}>
      {items.map((i, k) => (
        <Tooltip key={i.nombre} placement="top-start" title={`${i.nombre}${i.detalle ? ` (${i.detalle})` : ''}: ${num(i.cantidad)}${total ? ` (${pct(i.cantidad, total)}%)` : ''}`}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 40%) 1fr', alignItems: 'center', columnGap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.25 }}>{i.nombre}</Typography>
              {i.detalle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25 }}>{i.detalle}</Typography>}
            </Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ height: 16, width: `${(i.cantidad / max) * 100}%`, minWidth: 4, bgcolor: colores[k % colores.length], borderRadius: '0 4px 4px 0' }} />
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {num(i.cantidad)}{total ? <Typography component="span" variant="caption" color="text.secondary"> · {pct(i.cantidad, total)}%</Typography> : null}
              </Typography>
            </Stack>
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

/** Columnas verticales para categorías ordenadas (de menos a más): rampa de un solo tono, de claro a oscuro. */
function Columnas({ items, total }: { items: Item[]; total?: number }) {
  const rampa = RAMPAS[useModo()];
  const max = Math.max(1, ...items.map((i) => i.cantidad));
  if (!items.length) return <SinDatos />;
  return (
    <Stack direction="row" sx={{ gap: '8px', alignItems: 'flex-end', height: 190 }}>
      {items.map((i, k) => (
        <Tooltip key={i.nombre} title={`${i.nombre}: ${num(i.cantidad)}${total ? ` (${pct(i.cantidad, total)}%)` : ''}`} placement="top">
          <Box sx={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{num(i.cantidad)}</Typography>
            <Box sx={{ width: '100%', maxWidth: 72, height: `${(i.cantidad / max) * 100 * 0.62}%`, minHeight: i.cantidad ? 3 : 0, bgcolor: rampa[Math.min(k, rampa.length - 1)], borderRadius: '4px 4px 0 0' }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, textAlign: 'center', lineHeight: 1.2, minHeight: 30 }}>{i.nombre}</Typography>
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

/** Barras apiladas en dos partes (p. ej. con / sin certificado) con separación de 2px y los valores a la vista. */
function Apiladas({ items, etiquetas }: { items: { nombre: string; a: number; b: number }[]; etiquetas: [string, string] }) {
  const colores = useColores();
  const max = Math.max(1, ...items.map((i) => i.a + i.b));
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
        {etiquetas.map((e, k) => (
          <Stack key={e} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: colores[k] }} />
            <Typography variant="caption" color="text.secondary">{e}</Typography>
          </Stack>
        ))}
      </Stack>
      {items.map((i) => (
        <Tooltip key={i.nombre} placement="top-start" title={`${i.nombre}: ${num(i.a)} ${etiquetas[0].toLowerCase()} · ${num(i.b)} ${etiquetas[1].toLowerCase()}`}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 40%) 1fr', alignItems: 'center', columnGap: 1.5 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.25 }}>{i.nombre}</Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Stack direction="row" sx={{ gap: '2px', width: `${((i.a + i.b) / max) * 100}%`, minWidth: 4 }}>
                {i.a > 0 && <Box sx={{ flex: i.a, height: 16, bgcolor: colores[0], borderRadius: '0 0 0 0' }} />}
                {i.b > 0 && <Box sx={{ flex: i.b, height: 16, bgcolor: colores[1], borderRadius: '0 4px 4px 0' }} />}
              </Stack>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{num(i.a)} / {num(i.b)}</Typography>
            </Stack>
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

function Filtros({ desde, hasta, setDesde, setHasta, texto }: { desde: string; hasta: string; setDesde: (v: string) => void; setHasta: (v: string) => void; texto: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{texto}</Typography>
      <TextField size="small" type="date" label="Infracciones desde" InputLabelProps={{ shrink: true }} value={desde} onChange={(e) => setDesde(e.target.value)} />
      <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={hasta} onChange={(e) => setHasta(e.target.value)} />
    </Stack>
  );
}

/** Defensa Civil: los indicadores del reporte de avance de la campaña. */
function DefensaCivil() {
  const c = useColores();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [d, setD] = useState<KpisDC | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    setError('');
    api.get('/infracciones/kpis-dc', { params: { fechaDesde: desde || undefined, fechaHasta: hasta || undefined } })
      .then((r) => vivo && setD(r.data))
      .catch((e) => vivo && setError(errMsg(e)));
    return () => { vivo = false; };
  }, [desde, hasta]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!d) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  const r = d.resumen;
  return (
    <Stack spacing={3}>
      <Filtros desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} texto="Avance de la campaña de fiscalización de Defensa Civil. Las actas se pueden filtrar por fecha." />
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Tile color={c[0]} titulo="Edificios alcanzados" valor={num(r.edificiosAlcanzados)} detalle="edificios con al menos una notificación" />
        <Tile color={c[1]} titulo="Actuaciones registradas" valor={num(r.actuaciones)} detalle="notificaciones + actas de infracción" />
        <Tile color={c[2]} titulo="Notificaciones realizadas" valor={num(r.notificaciones)} detalle={`en ${num(r.edificiosAlcanzados)} edificios`} />
        <Tile color={c[3]} titulo="Infracciones registradas" valor={num(r.infracciones)} detalle={`en ${num(r.edificiosConInfracciones)} edificios`} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Las actuaciones corresponden a registros administrativos: un mismo edificio puede registrar más de una. Se entiende por actuaciones tanto las notificaciones como las actas de infracción.
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Panel titulo="Edificios según tipo de actuación" ancho={360}>
          <Dona items={d.porTipoActuacion} centro="edificios" />
        </Panel>
        <Panel titulo="Estado de las notificaciones" ancho={360}>
          <Dona items={d.estadoNotificaciones} centro="notificaciones" />
        </Panel>
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Panel titulo="Infracciones por tipología"><Barras items={d.porTipologia} total={r.infracciones} /></Panel>
        <Panel titulo="Edificios afectados por tipo de infracción">
          <Barras items={d.edificiosPorTipologia} total={r.edificiosConInfracciones} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Las tipologías no son excluyentes: los valores no suman el total de edificios.</Typography>
        </Panel>
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Panel titulo="Actas según normativa infringida"><Barras items={d.porNormativa} total={r.infracciones} /></Panel>
        <Panel titulo="Edificios según cantidad de infracciones">
          <Columnas items={d.edificiosPorCantidad} total={r.edificiosConInfracciones} />
        </Panel>
      </Stack>
    </Stack>
  );
}

/** Catastro: situación de los edificios del cruce según el estado de obra que informa Catastro. */
function Catastro() {
  const c = useColores();
  const [ek, setEk] = useState<KpisEdificios | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    api.get('/edificios/kpis').then((r) => vivo && setEk(r.data)).catch((e) => vivo && setError(errMsg(e)));
    return () => { vivo = false; };
  }, []);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!ek) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  const base = ek.resumen.delCruce;
  const sit = ek.porSituacionDetalle;
  const principales = sit.slice(0, 3);
  const resto = sit.slice(3).reduce((n, x) => n + x.cantidad, 0);
  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Edificios del cruce con Catastro ({num(base)}), según su estado de obra. Cada edificio se cuenta en una sola situación.
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        {principales.map((i, k) => (
          <Tile key={i.nombre} color={c[k]} titulo={i.nombre} valor={num(i.cantidad)} detalle={`${pct(i.cantidad, base)}% de los ${num(base)} edificios del cruce`} />
        ))}
        <Tile color={c[3]} titulo="Otras situaciones" valor={num(resto)} detalle={`${pct(resto, base)}% · permiso sin final, obra construida, paralizadas y otras`} />
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Panel titulo="Situación de todos los edificios según Catastro" ancho={520}><Dona items={sit} centro="edificios del cruce" /></Panel>
        <Panel titulo="Situación y certificado final de Defensa Civil" ancho={520}>
          <Apiladas
            etiquetas={['Con certificado final', 'Sin certificado final']}
            items={sit.map((i) => ({ nombre: i.nombre, a: i.conCertificado, b: i.cantidad - i.conCertificado }))}
          />
        </Panel>
      </Stack>
    </Stack>
  );
}

export default function KpisPage() {
  const [tab, setTab] = useState(0);
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h5">Indicadores</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Defensa Civil" />
          <Tab label="Catastro" />
        </Tabs>
        {tab === 0 && <DefensaCivil />}
        {tab === 1 && <Catastro />}
      </Stack>
    </Container>
  );
}
