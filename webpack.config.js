const { shareAll, withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');

const mfConfig = withModuleFederationPlugin({
  name: 'mfe1_comandos_frontend',

  exposes: {
    './Component': './src/app/crisis-room/crisis-room.component.ts',
    './Reportes': './src/app/reportes/reportes.component.ts',
    './routes': './src/app/crisis-room/crisis-room.routes.ts',
  },

  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
});

mfConfig.output = {
  ...mfConfig.output,
  scriptType: 'module',
};

module.exports = mfConfig;
