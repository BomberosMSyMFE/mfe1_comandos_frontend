const fs = require('fs');
const path = require('path');

// Ruta del archivo .env
const envPath = path.resolve(__dirname, '../.env');
const envExamplePath = path.resolve(__dirname, '../.env.example');

// Leer archivo .env o usar .env.example si no existe
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
} else if (fs.existsSync(envExamplePath)) {
  console.log('[set-env.js] .env no encontrado, usando .env.example por defecto');
  envContent = fs.readFileSync(envExamplePath, 'utf8');
}

// Parsear variables clave=valor
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...values] = trimmed.split('=');
    if (key) {
      envVars[key.trim()] = values.join('=').trim();
    }
  }
});

// Valores con defaults seguros
const useMocks = (process.env.USE_MOCKS || envVars.USE_MOCKS || 'false').toLowerCase() === 'true';
const apiMs1Url = process.env.API_MS1_URL || envVars.API_MS1_URL || 'https://bomberos-uagrm-scz.duckdns.org/api/v1';
const wsSalaCrisisUrl = process.env.WS_SALA_CRISIS_URL || envVars.WS_SALA_CRISIS_URL || 'wss://bomberos-uagrm-scz.duckdns.org/ws/sala-crisis';
const apiMs5Url = process.env.API_MS5_URL || envVars.API_MS5_URL || 'https://bomberos-uagrm-scz.duckdns.org/api/v1/reportes';
const apiMs2FlotasUrl = process.env.API_MS2_FLOTAS_URL || envVars.API_MS2_FLOTAS_URL || 'https://bomberos-uagrm-scz.duckdns.org/api/v1/flotas';
const apiMs3GraphqlUrl = process.env.API_MS3_GRAPHQL_URL || envVars.API_MS3_GRAPHQL_URL || 'https://bomberos-uagrm-scz.duckdns.org/graphql/inventario';

const targetDir = path.resolve(__dirname, '../src/environments');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Plantilla con resolución inteligente de origen
const getTemplate = (isProd) => `// GENERADO AUTOMÁTICAMENTE POR scripts/set-env.js DESDE .env
// NO EDITAR MANUALMENTE ESTE ARCHIVO. Modifica el archivo .env en la raíz.

const isBrowser = typeof window !== 'undefined';
const isDuckDns = isBrowser &&
  (window.location.hostname.includes('duckdns.org') ||
   window.location.hostname.includes('bomberos') ||
   window.location.protocol === 'https:');

export const environment = {
  production: ${isProd},
  useMocks: ${useMocks},
  apiMs1Url: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/api/v1' : '${apiMs1Url}',
  wsSalaCrisisUrl: isDuckDns ? 'wss://bomberos-uagrm-scz.duckdns.org/ws/sala-crisis' : '${wsSalaCrisisUrl}',
  apiMs5Url: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/api/v1/reportes' : '${apiMs5Url}',
  apiMs2FlotasUrl: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/api/v1/flotas' : '${apiMs2FlotasUrl}',
  apiMs3GraphqlUrl: isDuckDns ? 'https://bomberos-uagrm-scz.duckdns.org/graphql/inventario' : '${apiMs3GraphqlUrl}'
};
`;

fs.writeFileSync(path.join(targetDir, 'environment.ts'), getTemplate(false));
fs.writeFileSync(path.join(targetDir, 'environment.prod.ts'), getTemplate(true));

console.log('[set-env.js] ✅ src/environments/environment.ts sincronizado con .env (useMocks=' + useMocks + ')');
