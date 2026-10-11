import { alpha, createTheme } from '@mui/material';

// Tema con fondo suave, tarjetas elevadas y acento azul. Los colores de series del tablero
// salen de la paleta categórica validada (azul, naranja, aqua) y no se mezclan con el acento.
export const buildTheme = (dark: boolean) => {
  const primary = dark ? '#6aa8ff' : '#1f4fa3';
  const bg = dark ? '#0a1428' : '#f2f5fb';
  const paper = dark ? '#11203d' : '#ffffff';
  const line = dark ? 'rgba(150,180,255,.14)' : 'rgba(40,50,30,.11)';
  const shadow = dark ? '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25)' : '0 1px 2px rgba(60,50,20,.05), 0 8px 24px rgba(60,50,20,.08)';

  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: primary },
      background: { default: bg, paper },
      divider: line,
      secondary: { main: '#e8a317' },
      text: dark ? { primary: '#e8eefc', secondary: '#9fb2d6' } : { primary: '#1b2a30', secondary: '#5f6f74' },
    },
    typography: {
      fontFamily: 'Poppins, system-ui, sans-serif',
      h5: { fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundImage: dark ? 'radial-gradient(900px 340px at 85% -200px, rgba(106,168,255,.12), transparent)' : 'radial-gradient(1000px 360px at 85% -180px, rgba(31,79,163,.10), transparent), radial-gradient(900px 360px at 10% -200px, rgba(31,79,163,.08), transparent)', backgroundRepeat: 'no-repeat' } } },
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
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: dark ? alpha('#6aa8ff', 0.05) : '#ffffff' } } },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-root': {
              backgroundColor: dark ? alpha('#6aa8ff', 0.07) : '#eaeff8', color: dark ? '#9fb2d6' : '#5f6f74',
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
