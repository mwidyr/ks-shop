// node crop.mjs out/Main.png 3300 3600  -> out/crop.png  (rows y0..y1 of the ref | app | diff montage)
import fs from 'node:fs'
import { PNG } from 'pngjs'
const [src, y0, y1] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])]
const a = PNG.sync.read(fs.readFileSync(src))
const h = y1 - y0
const o = new PNG({ width: a.width, height: h })
PNG.bitblt(a, o, 0, y0, a.width, h, 0, 0)
fs.writeFileSync('out/crop.png', PNG.sync.write(o))
