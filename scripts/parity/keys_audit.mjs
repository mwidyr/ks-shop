import fs from 'fs'; import path from 'path'
const root=process.cwd()
const merge=(a,b)=>{const o={...a};for(const[k,v]of Object.entries(b||{}))o[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(a[k]||{},v):v;return o}
const dict={}
for(const l of ['id','en','zh']) dict[l]=(await import(`${root}/i18n/${l}.js`)).default
for(const f of fs.readdirSync(`${root}/i18n/parts`)){const m=(await import(`${root}/i18n/parts/${f}`)).default;for(const l of Object.keys(dict))dict[l]=merge(dict[l],m[l])}
const get=(o,k)=>k.split('.').reduce((x,p)=>x==null?x:x[p],o)
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='i18n'?[]:walk(`${d}/${e.name}`)):/\.jsx?$/.test(e.name)?[`${d}/${e.name}`]:[])
const miss={id:new Set(),en:new Set(),zh:new Set()}
for(const f of walk(root)){const s=fs.readFileSync(f,'utf8');for(const m of s.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)){const k=m[1];for(const l of Object.keys(dict))if(get(dict[l],k)===undefined)miss[l].add(k)}}
for(const l of Object.keys(miss))console.log(l,miss[l].size,[...miss[l]].slice(0,25).join(' '))
