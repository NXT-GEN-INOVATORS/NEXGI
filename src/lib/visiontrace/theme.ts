import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  cssVariables: { nativeColor: true },
  palette: {
    primary: { main: 'var(--primary)', light:'var(--primary-light)', dark:'var(--primary-dark)', contrastText:'var(--primary-foreground)' },
    background: { default:'var(--background)', paper:'var(--card)' },
    text: { primary:'var(--foreground)', secondary:'var(--muted-foreground)' },
    divider:'var(--border)',
    success:{main:'var(--success)',light:'var(--primary-light)',dark:'var(--primary-dark)',contrastText:'var(--card)'},
    warning:{main:'var(--warning)',light:'var(--muted)',dark:'var(--warning)',contrastText:'var(--card)'},
    error:{main:'var(--danger)',light:'var(--muted)',dark:'var(--danger)',contrastText:'var(--card)'},
    info:{main:'var(--info)',light:'var(--muted)',dark:'var(--info)',contrastText:'var(--card)'},
  },
  typography:{ fontFamily:'var(--font-body)',fontSize:13, h1:{fontFamily:'var(--font-heading)',fontSize:28,fontWeight:600},h2:{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600},button:{textTransform:'none',fontWeight:600,letterSpacing:0}},
  shape:{borderRadius:7},
  components:{
    MuiButton:{defaultProps:{disableElevation:true},styleOverrides:{root:{padding:'10px 18px',fontSize:13},outlined:{borderColor:'var(--border)',color:'var(--foreground)',background:'var(--card)'}}},
    MuiIconButton:{styleOverrides:{root:{color:'var(--muted-foreground)'}}},
    MuiChip:{styleOverrides:{root:{borderRadius:5,fontSize:10,height:25},colorSuccess:{background:'var(--primary-light)',color:'var(--success)'},colorWarning:{background:'color-mix(in oklch,var(--warning) 12%,var(--card))',color:'var(--warning)'},outlined:{borderColor:'var(--border)'}}},
    MuiPaper:{styleOverrides:{root:{backgroundImage:'none',boxShadow:'var(--shadow)'}}},
    MuiTableCell:{styleOverrides:{root:{borderColor:'var(--border)',padding:'20px 18px',fontSize:12},head:{background:'var(--muted)',color:'var(--muted-foreground)',fontSize:11,fontWeight:600}}},
    MuiOutlinedInput:{styleOverrides:{root:{fontSize:13,background:'var(--card)'},notchedOutline:{borderColor:'var(--border)'}}},
    MuiListItemButton:{styleOverrides:{root:{borderRadius:6,marginBottom:4,padding:'11px 12px',fontSize:13,color:'var(--sidebar-text)','&.Mui-selected':{background:'var(--sidebar-active)',color:'var(--card)',borderLeft:'2px solid var(--success)'},'&.Mui-selected:hover':{background:'var(--sidebar-active)'}}}},
    MuiListItemIcon:{styleOverrides:{root:{minWidth:34,color:'inherit'}}},
    MuiDialogTitle:{styleOverrides:{root:{fontSize:20,fontWeight:650}}},
  }
});
