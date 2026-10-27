'use strict';
let session=null,waiting=[];
const root=new URL(self.registration.scope),vault=new URL('vault/',root),enc=new TextEncoder();
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 const source=event.source;
 if(!source||new URL(source.url).origin!==root.origin||!new URL(source.url).pathname.startsWith(root.pathname))return;
 if(event.data?.type==='unlock'){
  session={key:event.data.key,files:event.data.files};waiting.splice(0).forEach(resolve=>resolve());event.ports[0]?.postMessage({ok:true});
 }else if(event.data?.type==='lock'){
  session=null;
  event.waitUntil((async()=>{for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){if(client.url.startsWith(vault.href))await client.navigate(root.href);else if(client.url.startsWith(root.href))client.postMessage({type:'locked'})}event.ports[0]?.postMessage({ok:true})})());
 }
});
async function ensureSession(){
 if(session)return;
 const ready=new Promise(resolve=>{waiting.push(resolve);setTimeout(()=>{waiting=waiting.filter(r=>r!==resolve);resolve()},4000)});
 for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(client.url.startsWith(root.href)&&!client.url.startsWith(vault.href))client.postMessage({type:'need-key'});
 await ready;
}
async function serve(request){
 await ensureSession();const active=session;
 if(!active)return new Response('<!doctype html><meta charset="utf-8"><p>Архив закрыт. Вернись на страницу входа.</p>',{status:401,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 let path;try{path=decodeURIComponent(new URL(request.url).pathname.slice(vault.pathname.length))}catch{return new Response('',{status:400})}
 const file=Object.hasOwn(active.files,path)?active.files[path]:null;
 if(!file)return new Response('Not found',{status:404});
 try{
  const response=await fetch(new URL(file.object,root),{cache:'no-store'});if(!response.ok)throw Error('download');
  const encrypted=new Uint8Array(await response.arrayBuffer());
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:encrypted.slice(0,12),additionalData:enc.encode(path)},active.key,encrypted.slice(12));
  if(active!==session)throw Error('locked');
  const headers={'Content-Type':file.mime,'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
  const range=request.headers.get('range');
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(m){const size=plain.byteLength,start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;if(start>=size||end<start)return new Response('',{status:416});headers['Content-Range']=`bytes ${start}-${end}/${size}`;return new Response(plain.slice(start,end+1),{status:206,headers})}}
  return new Response(plain,{headers});
 }catch{return new Response('Не удалось открыть защищённый файл.',{status:403,headers:{'Cache-Control':'no-store'}})}
}
self.addEventListener('fetch',event=>{if(event.request.url.startsWith(vault.href))event.respondWith(serve(event.request))});
