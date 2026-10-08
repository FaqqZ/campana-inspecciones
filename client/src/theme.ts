import { alpha, createTheme } from '@mui/material';

// Tema con fondo suave, tarjetas elevadas y acento azul. Los colores de series del tablero
// salen de la paleta categórica validada (azul, naranja, aqua) y no se mezclan con el acento.
export const buildTheme = (dark: boolean) => {
  const primary = dark ? '#3cc0cc' : '#0b6b73';
  const bg = dark ? '#0d1a1d' : '#f6f3ee';
  const paper = dark ? '#152428' : '#fffdf9';
  const line = dark ? 'rgba(255,255,255,.09)' : 'rgba(40,50,30,.11)';
  const shadow = dark ? '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25)' : '0 1px 2px rgba(60,50,20,.05), 0 8px 24px rgba(60,50,20,.08)';

  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: primary },
      background: { default: bg, paper },
      divider: line,
      secondary: { main: '#e8a317' },
      text: dark ? { primary: '#ecf4f3', secondary: '#9fb4b6' } : { primary: '#1b2a30', secondary: '#5f6f74' },
    },
    typography: {
      fontFamily: 'Poppins, system-ui, sans-serif',
      h5: { fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundImage: dark ? 'none' : 'radial-gradient(1000px 360px at 85% -180px, rgba(232,163,23,.16), transparent), radial-gradient(900px 360px at 10% -200px, rgba(11,107,115,.12), transparent)', backgroundRepeat: 'no-repeat' } } },
      MuiPaper: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { borderColor: line, backgroundImage: 'none' }, outlined: { boxShadow: shadow } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 10, paddingInline: 16 }, contained: { boxShadow: `0 4px 12px ${alpha(primary, 0.28)}` } },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: dark ? alpha('#fff', 0.03) : '#fffdf9' } } },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-root': {
              backgroundColor: dark ? alpha('#fff', 0.04) : '#f3efe6', color: dark ? '#9fb4b6' : '#5f6f74',
              fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${line}`,
            },
          },
        },
      },
      MuiTableRow: { styleOverrides: { root: { '&:last-child td': { borderBottom: 0 }, '&.MuiTableRow-hover:hover': { backgroundColor: alpha(primary, dark ? 0.1 : 0.05) } } } },
      MuiTableCell: { styleOverrides: { root: { borderBottom: `1px solid ${line}` } } },
      MuiTab: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 18 } } },
    },
  });
};
