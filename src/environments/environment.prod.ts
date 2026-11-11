// GENERADO AUTOMÁTICAMENTE POR scripts/set-env.js DESDE .env
// NO EDITAR MANUALMENTE ESTE ARCHIVO. Modifica el archivo .env en la raíz.

const isBrowser = typeof window !== 'undefined';
const isDuckDns = isBrowser &&
  (window.location.hostname.includes('duckdns.org') ||
   window.location.hostname.includes('bomberos') ||
   window.location.protocol === 'https:');

export const environment = {
  production: true,
  useMocks: false,
  apiMs1Url: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/api/v1' : 'http://localhost:3000/api/v1',
  wsSalaCrisisUrl: isDuckDns ? 'wss://bomberos-uagrm-scz.duckdns.org/ws/sala-crisis' : 'ws://localhost:3000/ws/sala-crisis',
  apiMs5Url: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/api/v1/reportes' : 'http://localhost:8005/api/v1/reportes',
  apiMs2FlotasUrl: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/api/v1/flotas' : 'http://34.28.212.45:8082/api/v1/flotas',
  apiMs3GraphqlUrl: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/graphql/inventario' : 'https://ms3-inventario-backend.onrender.com/graphql'
};
