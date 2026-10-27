'use strict';
const $=id=>document.getElementById(id),enc=new TextEncoder();
let registration,session=null;
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function tell(worker,message){return new Promise((resolve,reject)=>{const c=new MessageChannel(),timer=setTimeout(()=>reject(Error('worker timeout')),12000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();e.data.ok?resolve():reject(Error('worker rejected'))};worker.postMessage(message,[c.port2])})}
async function unlockWorker(){await tell(registration.active,{type:'unlock',...session});}
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='need-key'&&session)unlockWorker().catch(()=>{});if(event.data?.type==='locked'){session=null;location.replace('./')}});
$('login').addEventListener('submit',async event=>{
 event.preventDefault();$('enter').disabled=true;$('status').textContent='Открываю архив…';
 try{
  if(!window.crypto?.subtle||!navigator.serviceWorker)throw Error('unsupported');
  const config=await(await fetch('config.json',{cache:'no-store'})).json();
  const material=await crypto.subtle.importKey('raw',enc.encode($('password').value),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(config.salt),iterations:config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const encrypted=new Uint8Array(await(await fetch(config.manifest,{cache:'no-store'})).arrayBuffer());
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:encrypted.slice(0,12),additionalData:enc.encode('manifest')},key,encrypted.slice(12));
  const files=JSON.parse(new TextDecoder().decode(plain));
  registration=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!registration.active)registration=await navigator.serviceWorker.getRegistration();
  session={key,files};await unlockWorker();$('password').value='';
  $('gate').hidden=true;$('archive').hidden=false;$('tree').src='vault/index.html';
 }catch(error){session=null;$('status').textContent=error.message==='unsupported'?'Нужен современный браузер с HTTPS.':'Не удалось открыть архив. Проверь пароль и подключение.'}
 finally{$('enter').disabled=false}
});
async function lockArchive(){session=null;$('tree').src='about:blank';try{await tell(registration.active,{type:'lock'})}finally{location.replace('./')}}
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===$('tree').contentWindow&&event.data?.type==='archive-lock')lockArchive()});
