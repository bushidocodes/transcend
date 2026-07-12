import * as esbuild from 'esbuild';

// Bundles the browser app to public/bundle.js (replaces webpack + babel-loader).
// react-dom/scheduler read process.env.NODE_ENV at runtime, so it must be defined at
// build time or the bundle throws "process is not defined" in the browser.
const prod = process.env.NODE_ENV === 'production';

const options: esbuild.BuildOptions = {
  entryPoints: ['browser/react/index.tsx'],
  bundle: true,
  outfile: 'public/bundle.js',
  sourcemap: true,
  // React 19 requires the modern JSX transform (issue #151). `automatic` injects
  // jsx-runtime imports so we don't need the classic React.createElement factory.
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
