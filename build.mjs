import * as esbuild from 'esbuild';

// Bundles the browser app to public/bundle.js (replaces webpack + babel-loader).
// JSX lives in .js files, so map the .js loader to 'jsx'. react-dom/scheduler read
// process.env.NODE_ENV at runtime, so it must be defined at build time or the bundle
// throws "process is not defined" in the browser.
const prod = process.env.NODE_ENV === 'production';

const options = {
  entryPoints: ['browser/react/index.js'],
  bundle: true,
  outfile: 'public/bundle.js',
  sourcemap: true,
  // React 19 requires the modern JSX transform (issue #151). `automatic` injects
  // jsx-runtime imports so we don't need the classic React.createElement factory.
  loader: { '.js': 'jsx' },
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
  target: 'es2020',
  minify: prod,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild: watching for changes...');
} else {
  await esbuild.build(options);
}
