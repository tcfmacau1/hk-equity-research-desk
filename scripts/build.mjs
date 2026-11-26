import {readdir, readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
export const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
async function collectAssets(directory) {
  const assets = {};
  async function visit(dir) {
    for (const item of await readdir(dir, {withFileTypes:true})) {
      if (item.name.startsWith('.') || item.name === 'server') continue;
      const filename = path.join(dir,item.name);
      if (item.isDirectory()) { await visit(filename); continue; }
      const type = types[path.extname(item.name)];
      if (type) assets['/'+path.relative(directory,filename).split(path.sep).join('/')] = [type,(await readFile(filename)).toString('base64')];
    }
  }
  await visit(directory);
  return assets;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = asset => Buffer.from(asset[1],'base64');
const encode = text => Buffer.from(text).toString('base64');
async function compiledAssets(directory) {
  const assets = await collectAssets(directory);
  const workerTemplate = await readFile(path.join(dist,'sw.js'),'utf8');
  if (!assets['/index.html']) throw Error('Missing index.html');
  // Re-exporting an already compiled static directory must preserve its release.
  const html = decode(assets['/index.html']).toString('utf8').replace(/<meta name="app-release" content="[a-f0-9]+">/g,'');
  assets['/index.html'][1]=encode(html);
  const included = Object.keys(assets).filter(key=>key!=='/sw.js' && key!=='/updater.json').sort();
  const fingerprints = Object.fromEntries(included.map(key=>[key.slice(1),hash(decode(assets[key]))]));
  const release = hash(JSON.stringify(fingerprints)+workerTemplate).slice(0,12);
  const versioned = html.replace('</head>','<meta name="app-release" content="'+release+'"></head>');
  assets['/index.html'][1] = encode(versioned);
  fingerprints['index.html'] = hash(Buffer.from(versioned));
  const sw = workerTemplate.replace("'__BUILD_RELEASE__'",JSON.stringify(release)).replace('/* BUILD_ASSET_DIGESTS */ {}',JSON.stringify(fingerprints));
  assets['/sw.js']=[types['.js'],encode(sw)];
  return assets;
}
export async function readAssets() { return compiledAssets(dist); }
export async function writeStaticRelease(directory) {
  const absolute = path.resolve(directory);
  if (absolute===path.resolve(dist)) throw Error('Use a separate GitHub Pages output directory');
  const assets = await compiledAssets(absolute);
  for (const name of ['index.html','sw.js']) await writeFile(path.join(absolute,name),decode(assets['/'+name]));
  return decode(assets['/index.html']).toString().match(/name="app-release" content="([^"]+)"/)[1];
}
export async function readSeeds() {
  const ctx = {window:{}};
  vm.runInNewContext(await readFile(path.join(dist,'seed.js'),'utf8'),ctx,{timeout:1000});
  if (!Array.isArray(ctx.window.SEED)) throw Error('Missing seed dataset');
  return ctx.window.SEED;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const assets = await readAssets();
  if (!assets['/index.html']) throw Error('Missing user interface');
  const seeds = await readSeeds();
  await mkdir(path.join(dist,'server'),{recursive:true});
  await mkdir(path.join(dist,'.openai'),{recursive:true});
  const worker = await readFile(path.join(root,'worker/index.js'),'utf8');
  await writeFile(path.join(dist,'server/index.js'),worker+'\nexport default createWorker('+JSON.stringify(assets)+','+JSON.stringify(seeds)+');\n');
  await copyFile(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
  console.log('Built '+Object.keys(assets).length+' application assets and '+seeds.length+' research records');
}
