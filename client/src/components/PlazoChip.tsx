import { Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorIcon from '@mui/icons-material/ErrorOutline';
import TaskIcon from '@mui/icons-material/TaskAlt';
import GavelIcon from '@mui/icons-material/Gavel';
import HelpIcon from '@mui/icons-material/HelpOutline';
import { EstadoPlazo } from '../api';
import { PLAZO } from '../semaforo';

const ICONO = { en_plazo: CheckCircleIcon, por_vencer: ScheduleIcon, vencido: ErrorIcon, presento: TaskIcon, acta: GavelIcon, sin_plazo: HelpIcon };

/** "Vencido hace 5 días", "Vence hoy", "Faltan 12 días". */
export const textoDias = (d: number) =>
  d < 0 ? `Venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'Vence hoy' : `Faltan ${d} día${d === 1 ? '' : 's'}`;

export default function PlazoChip({ estado, dias }: { estado: EstadoPlazo; dias?: number | null }) {
  const Icono = ICONO[estado];
  return (
    <Chip
      size="small"
      icon={<Icono style={{ color: 'inherit' }} />}
      label={dias === undefined || dias === null || estado === 'presento' || estado === 'acta' ? PLAZO[estado].label : `${PLAZO[estado].label} · ${textoDias(dias)}`}
      sx={{ bgcolor: PLAZO[estado].color, color: estado === 'por_vencer' ? '#2a1d00' : '#fff', maxWidth: '100%' }}
    />
  );
}
