import {cp,mkdir} from 'node:fs/promises';
import {writeStaticRelease} from './build.mjs';
await mkdir('public',{recursive:true});
await cp('dist','public',{recursive:true});
console.log(await writeStaticRelease('public'));
