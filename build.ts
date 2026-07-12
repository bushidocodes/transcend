import * as esbuild from 'esbuild';
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Bundles the browser app to public/bundle.[hash].js (replaces webpack + babel-loader).
// Content hash in the filename enables long-lived immutable caching (issue #243).
// react-dom/scheduler read process.env.NODE_ENV at runtime, so it must be defined at
// build time or the bundle throws "process is not defined" in the browser.
const prod = process.env.NODE_ENV === 'production';
const publicDir = 'public';

const options: esbuild.BuildOptions = {
  entryPoints: ['browser/react/index.tsx'],
  bundle: true,
<<<<<<< HEAD
  outfile: 'public/bundle.js',
  // Dev: linked maps for debugging. Prod: never emit public/bundle.js.map — the static
  // server would ship the full original TypeScript source (~MB) to every visitor and
  // defeat minify on the next line (issue #230). Use external maps uploaded to an error
  // tracker if production stack traces are needed later.
  sourcemap: !prod,
=======
  outdir: publicDir,
  // Fixed "bundle" prefix + content hash so deploys bust caches without revalidating every load.
  entryNames: 'bundle.[hash]',
  sourcemap: true,
  metafile: true,
>>>>>>> c23ea31 (Cache-bust browser bundle with content hash (#243))
  // React 19 requires the modern JSX transform (issue #151). `automatic` injects
  // jsx-runtime imports so we don't need the classic React.createElement factory.
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
  // Match tsconfig.json "target": "es2022" (Node 24 / modern browsers).
  target: 'es2022',
  minify: prod,
  logLevel: 'info'
};

/** Remove previous hashed (and legacy unhashed) bundles so public/ does not accumulate. */
function cleanOldBundles(): void {
  for (const name of readdirSync(publicDir)) {
    if (/^bundle(\.[a-zA-Z0-9_-]+)?\.js(\.map)?$/.test(name)) {
      unlinkSync(join(publicDir, name));
    }
  }
}

/**
 * Write public/app.html from the browser/app.html template with the hashed script src.
 * The server serves this generated file so the browser loads the current content-hashed bundle.
 */
function writeAppHtml(bundleFileName: string): void {
  const template = readFileSync('browser/app.html', 'utf8');
  const html = template.replace(
    /src="\/bundle(?:\.[^"/]+)?\.js"/,
    `src="/${bundleFileName}"`
  );
  if (!html.includes(`src="/${bundleFileName}"`)) {
    throw new Error(
      `build: failed to inject script src for ${bundleFileName} into browser/app.html`
    );
  }
  writeFileSync(join(publicDir, 'app.html'), html);
  // Small manifest for tooling / debugging (server uses public/app.html directly).
  writeFileSync(
    join(publicDir, 'app-assets.json'),
    `${JSON.stringify({ bundle: bundleFileName }, null, 2)}\n`
  );
}

/** Pick the primary JS output path from an esbuild metafile (excludes .map). */
function bundleNameFromMetafile(metafile: esbuild.Metafile): string {
  const jsOutputs = Object.keys(metafile.outputs).filter(
    p => p.endsWith('.js') && !p.endsWith('.js.map')
  );
  if (jsOutputs.length !== 1) {
    throw new Error(
      `build: expected exactly one JS output, got ${jsOutputs.length}: ${jsOutputs.join(', ')}`
    );
  }
  // metafile paths use forward slashes; take the basename for the public URL.
  return jsOutputs[0].replace(/\\/g, '/').split('/').pop()!;
}

function afterBuild(result: esbuild.BuildResult): void {
  if (!result.metafile) {
    throw new Error('build: metafile missing; cannot resolve hashed bundle name');
  }
  const bundleFileName = bundleNameFromMetafile(result.metafile);
  writeAppHtml(bundleFileName);
  console.log(`esbuild: wrote public/app.html → /${bundleFileName}`);
}

const htmlInjectPlugin: esbuild.Plugin = {
  name: 'html-inject',
  setup(build) {
    build.onStart(() => {
      cleanOldBundles();
    });
    build.onEnd(result => {
      if (result.errors.length > 0) return;
      afterBuild(result);
    });
  }
};

options.plugins = [htmlInjectPlugin];

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild: watching for changes...');
} else {
  await esbuild.build(options);
}
