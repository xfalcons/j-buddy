const fs = require('fs');
const path = require('path');
const createWebpackConfig = require('../webpack.config.js');
const { transformManifest } = createWebpackConfig;

const sourceManifest = fs.readFileSync(
  path.join(__dirname, '../src/manifest.json')
);

describe('webpack manifest transform', () => {
  test('uses a CSP-safe source map for development builds', () => {
    expect(createWebpackConfig({}, { mode: 'development' }).devtool).toBe('source-map');
    expect(createWebpackConfig({}, { mode: 'production' }).devtool).toBe(false);
  });

  test('grants the local Functions host only to development builds', () => {
    const developmentManifest = JSON.parse(transformManifest(sourceManifest, true));
    const productionManifest = JSON.parse(transformManifest(sourceManifest, false));

    expect(developmentManifest.host_permissions).toEqual(['http://127.0.0.1/*']);
    expect(productionManifest.host_permissions).toBeUndefined();
  });
});
