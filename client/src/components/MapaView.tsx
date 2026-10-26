import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css';
import 'react-leaflet-cluster/lib/assets/MarkerCluster.Default.css';
import { PuntoMapa } from '../api';
import { CATEGORIAS, PLAZO } from '../semaforo';

const CENTRO: [number, number] = [-26.8241, -65.2226]; // San Miguel de Tucumán

const iconos = new Map<string, L.DivIcon>();
function icono(color: string, grande: boolean, aro = '', emoji = '') {
  const k = `${color}-${grande}-${aro}-${emoji}`;
  let i = iconos.get(k);
  if (!i) {
    if (emoji) {
      // Colegios y boliches: emoji sobre una chapita blanca; el borde lleva el color del semáforo y el aro el del plazo.
      const t = grande ? 40 : 32;
      i = L.divIcon({
        className: '',
        iconSize: [t, t],
        iconAnchor: [t / 2, t / 2],
        html: `<div style="width:${t}px;height:${t}px;border-radius:50%;background:#fff;border:3px solid ${color};display:flex;align-items:center;justify-content:center;font-size:${grande ? 24 : 18}px;line-height:1;box-shadow:${aro ? `0 0 0 3px ${aro}, ` : ''}0 2px 6px rgba(0,0,0,.4)">${emoji}</div>`,
      });
    } else {
      const t = grande ? 26 : 16;
      i = L.divIcon({
        className: '',
        iconSize: [t, t],
        iconAnchor: [t / 2, t / 2],
        html: `<div style="width:${t}px;height:${t}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:${aro ? `0 0 0 3px ${aro}, ` : ''}0 0 0 1px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.35)"></div>`,
      });
    }
    iconos.set(k, i);
  }
  return i;
}

// Borde gris para todos: el mapa ya no muestra el semáforo de documentación.
const colorDe = (_p: PuntoMapa) => '#546e7a';
const emojiDe = (p: PuntoMapa) => CATEGORIAS[p.categoria ?? 'EDIFICIOS'].marcador;

/** Ajusta la vista solo cuando cambian los filtros, no en cada recarga de datos. */
function AjustarVista({ puntos, clave }: { puntos: PuntoMapa[]; clave: string }) {
  const map = useMap();
  const ultima = useRef('');
  useEffect(() => {
    if (!puntos.length || ultima.current === clave) return;
    ultima.current = clave;
    const b = L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b, { padding: [60, 60], maxZoom: 18 });
  }, [puntos, clave, map]);
  return null;
}

function Redimensionar({ dep }: { dep: unknown }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [dep, map]);
  return null;
}

function ClickParaUbicar({ activo, onPick }: { activo: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => activo && onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface Props {
  puntos: PuntoMapa[];
  claveFiltros: string;
  seleccionado: string | null;
  moviendo: boolean;
  posSeleccionado: [number, number] | null;
  panelAbierto: boolean;
  onSelect: (id: string) => void;
  onMover: (lat: number, lng: number) => void;
}

export default function MapaView({ puntos, claveFiltros, seleccionado, moviendo, posSeleccionado, panelAbierto, onSelect, onMover }: Props) {
  const normales = useMemo(() => puntos.filter((p) => p.id !== seleccionado), [puntos, seleccionado]);
  const sel = puntos.find((p) => p.id === seleccionado);

  return (
    <MapContainer center={CENTRO} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <AjustarVista puntos={puntos} clave={claveFiltros} />
      <Redimensionar dep={panelAbierto} />
      <ClickParaUbicar activo={moviendo} onPick={onMover} />
      <MarkerClusterGroup chunkedLoading maxClusterRadius={45}>
        {normales.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icono(colorDe(p), false, p.plazo ? PLAZO[p.plazo].color : '', emojiDe(p))} eventHandlers={{ click: () => onSelect(p.id) }}>
            <Tooltip direction="top" offset={[0, -8]}>
              {p.categoria && p.categoria !== 'EDIFICIOS' ? (
                <>
                  <strong>{p.nombre || CATEGORIAS[p.categoria].label}</strong>
                  <br />
                  {p.direccion}
                </>
              ) : (
                <strong>{p.direccion}</strong>
              )}
              {p.plazo && <><br />⏱ Notificado: {PLAZO[p.plazo].label}</>}
              {!!p.fotos && <><br />📷 {p.fotos} foto{p.fotos === 1 ? '' : 's'}</>}
            </Tooltip>
          </Marker>
        ))}
      </MarkerClusterGroup>
      {(sel || (moviendo && posSeleccionado)) && (
        <Marker
          key={`${seleccionado}-${moviendo}`}
          position={sel ? [sel.lat, sel.lng] : posSeleccionado!}
          icon={icono(sel ? colorDe(sel) : '#78909c', true, '', sel ? emojiDe(sel) : '')}
          draggable={moviendo}
          zIndexOffset={1000}
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onMover(ll.lat, ll.lng); } }}
        />
      )}
    </MapContainer>
  );
}
