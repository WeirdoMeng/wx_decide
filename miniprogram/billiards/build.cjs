/* Both generated ES2018 bundles are exact entries in setting.babelSetting.ignore.
 * The developer tool compilejs worker returns ignored files unchanged (helpers:[]),
 * avoiding a second enhance transform and injected @babel/runtime dependencies.
 * Other pages continue using enhance; see the local tool utils/babel_helper.js isIgnore.
 * Rebuild using the original project's already-installed Babylon/esbuild. No install. */
const path = require('node:path');
const sourceRoot = process.env.BILLIARDS_SOURCE || '/Users/apple/Desktop/WebSpace/mobile-3d-billiards';
const esbuild = require(path.join(sourceRoot, 'node_modules/esbuild'));
const root = __dirname;
(async () => {
 await esbuild.build({entryPoints:[path.join(root,'src/core.ts')],bundle:true,format:'cjs',target:'es2018',minify:true,outfile:path.join(root,'core.js')});
 await esbuild.build({entryPoints:[path.join(root,'src/renderer.ts')],bundle:true,format:'cjs',target:'es2018',minify:true,legalComments:'none',nodePaths:[path.join(sourceRoot,'node_modules')],external:['./core'],define:{window:'undefined',document:'undefined',navigator:'undefined'},outfile:path.join(root,'renderer.js')});
})();
