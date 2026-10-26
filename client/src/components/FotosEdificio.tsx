import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogContent, IconButton, Paper, Stack, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import AddPhotoIcon from '@mui/icons-material/AddPhotoAlternate';
import { api, Edificio, errMsg } from '../api';

export interface FotoRef { _id: string; nombreOriginal: string; descripcion: string }

/** Final de obra faltante en Catastro: el estado de obra o la conclusión del cruce lo indican. */
export const sinFinalDeObra = (e: Pick<Edificio, 'estadoObra' | 'conclusionCruce'>) => {
  const sinTildes = (t?: string) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /sin final/i.test(sinTildes(e.estadoObra)) || /sin final de obra/i.test(sinTildes(e.conclusionCruce));
};

/** Aviso destacado con lo que informa Catastro sobre el final de obra. */
export function AvisoFinalDeObra({ e }: { e: Edificio }) {
  if (!sinFinalDeObra(e)) return null;
  return (
    <Alert severity="warning" variant="outlined">
      <strong>Catastro: falta el final de obra.</strong>
      <Box sx={{ mt: 0.5 }}>
        {e.estadoObra && <Typography variant="body2"><strong>Estado de obra:</strong> {e.estadoObra}</Typography>}
        {e.padron && <Typography variant="body2"><strong>Padrón:</strong> {e.padron}</Typography>}
        {e.conclusionCruce && <Typography variant="body2" color="text.secondary">{e.conclusionCruce}</Typography>}
      </Box>
    </Alert>
  );
}

/** Descarga la imagen con la sesión iniciada (un <img> no puede mandar el token). */
function useImagen(edificioId: string, fotoId: string) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let vivo = true;
    let objeto = '';
    api.get(`/edificios/${edificioId}/fotos/${fotoId}`, { responseType: 'blob' })
      .then((r) => { objeto = URL.createObjectURL(r.data); if (vivo) setUrl(objeto); })
      .catch(() => {});
    return () => { vivo = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [edificioId, fotoId]);
  return url;
}

function Miniatura({ edificioId, foto, onClick }: { edificioId: string; foto: FotoRef; onClick: () => void }) {
  const url = useImagen(edificioId, foto._id);
  return (
    <Box onClick={onClick} role="button" aria-label={`Ampliar ${foto.nombreOriginal}`}
      sx={{ aspectRatio: '1', borderRadius: 2, overflow: 'hidden', cursor: 'zoom-in', bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
      {url && <img src={url} alt={foto.descripcion || foto.nombreOriginal} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </Box>
  );
}

function Visor({ edificioId, fotos, indice, onCambiar, onClose }: { edificioId: string; fotos: FotoRef[]; indice: number | null; onCambiar: (i: number) => void; onClose: () => void }) {
  const foto = indice === null ? null : fotos[indice];
  const url = useImagen(edificioId, foto?._id ?? '');
  useEffect(() => {
    if (indice === null) return;
    const h = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowLeft') onCambiar((indice - 1 + fotos.length) % fotos.length);
      if (ev.key === 'ArrowRight') onCambiar((indice + 1) % fotos.length);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [indice, fotos.length, onCambiar]);
  if (!foto || indice === null) return null;
  return (
    <Dialog open maxWidth="lg" fullWidth onClose={onClose}>
      <DialogContent sx={{ position: 'relative', bgcolor: '#111', p: 0, minHeight: 300, display: 'grid', placeItems: 'center' }}>
        {url && <img src={url} alt={foto.descripcion || foto.nombreOriginal} style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />}
        <IconButton aria-label="Cerrar" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff' }}><CloseIcon /></IconButton>
        {fotos.length > 1 && (
          <>
            <IconButton aria-label="Anterior" onClick={() => onCambiar((indice - 1 + fotos.length) % fotos.length)} sx={{ position: 'absolute', left: 8, color: '#fff' }}><ChevronLeft fontSize="large" /></IconButton>
            <IconButton aria-label="Siguiente" onClick={() => onCambiar((indice + 1) % fotos.length)} sx={{ position: 'absolute', right: 8, color: '#fff' }}><ChevronRight fontSize="large" /></IconButton>
          </>
        )}
        <Typography variant="caption" sx={{ position: 'absolute', bottom: 8, left: 12, color: '#fff' }}>{indice + 1} de {fotos.length} · {foto.nombreOriginal}</Typography>
      </DialogContent>
    </Dialog>
  );
}

const MAX_BYTES = 10 * 1024 * 1024;

/** simple: colegios y boliches (sin aviso de final de obra ni informe de Catastro). */
export default function FotosEdificio({ edificio, fotos, puedeEditar, onCambio, simple = false }: { edificio: Edificio; fotos: FotoRef[]; puedeEditar: boolean; onCambio: () => void; simple?: boolean }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const subir = async (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    if (input.current) input.current.value = '';
    if (!archivos.length) return;
    if (archivos.length > 10) return setError('Hasta 10 fotos por vez');
    const grande = archivos.find((f) => f.size > MAX_BYTES);
    if (grande) return setError(`${grande.name} pesa más de 10 MB`);
    const f = new FormData();
    archivos.forEach((a) => f.append('fotos', a));
    setSubiendo(true); setError('');
    try {
      const r = await api.post(`/edificios/${edificio._id}/fotos`, f);
      if (r.data.rechazadas?.length) setError(`No se subieron (no son imágenes válidas): ${r.data.rechazadas.join(', ')}`);
      onCambio();
    } catch (e) { setError(errMsg(e)); }
    finally { setSubiendo(false); }
  };
  const eliminar = async (f: FotoRef) => {
    if (!window.confirm(`¿Eliminar la foto ${f.nombreOriginal}?`)) return;
    try { await api.delete(`/edificios/${edificio._id}/fotos/${f._id}`); onCambio(); } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Stack spacing={2}>
      {!simple && <AvisoFinalDeObra e={edificio} />}
      {puedeEditar && (
        <>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(ev) => subir(ev.target.files)} />
          <Button variant="outlined" startIcon={<AddPhotoIcon />} disabled={subiendo} onClick={() => input.current?.click()} sx={{ alignSelf: 'flex-start' }}>
            {subiendo ? 'Subiendo…' : 'Adjuntar fotos'}
          </Button>
        </>
      )}
      {!simple && edificio.informe && (
        <Paper sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom>Informe de inspección</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{edificio.informe}</Typography>
        </Paper>
      )}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {!fotos.length ? (
        <Paper sx={{ p: 2, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">{simple ? 'Todavía no hay fotos.' : 'Este edificio no tiene fotos cargadas. Se cargan desde Importar → Fotos (Word).'}</Typography></Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 1 }}>
          {fotos.map((f, i) => (
            <Box key={f._id} sx={{ position: 'relative' }}>
              <Miniatura edificioId={edificio._id} foto={f} onClick={() => setAbierta(i)} />
              {puedeEditar && (
                <IconButton size="small" aria-label="Eliminar foto" onClick={() => eliminar(f)} sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,.75)' } }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      )}
      <Visor edificioId={edificio._id} fotos={fotos} indice={abierta} onCambiar={setAbierta} onClose={() => setAbierta(null)} />
    </Stack>
  );
}
