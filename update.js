(() => {
  'use strict';
  const release = document.querySelector('meta[name="app-release"]')?.content || '';
  const scope = new URL('./',location.href).href;
  const storageKey = 'hk-pwa:later:'+scope;
  const writeLater = value => { try {localStorage.setItem(storageKey,value);} catch {} };
  const deferred = () => { try {return localStorage.getItem(storageKey);} catch {return '';} };
  let registration, pending, pendingVersion='', manual=false, requesting=false, applying=false;
  let statusBox, textBox, action, later;
  const values = worker => new Promise((resolve,reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(Error('worker timeout')); },5000);
    channel.port1.onmessage = event => {clearTimeout(timeout);channel.port1.close();resolve(event.data);};
    try {worker.target.postMessage({type:worker.type},[channel.port2]);}
    catch (error) { clearTimeout(timeout);channel.port1.close();reject(error); }
  });
  function notice(text, intent='', canApply=false) {
    if (!statusBox) {
      statusBox=document.createElement('section');
      statusBox.className='pwa-update';
      statusBox.setAttribute('aria-label','應用程式更新');
      statusBox.innerHTML='<p role="status" aria-live="polite"></p><div><button type="button" class="pwa-apply">立即更新</button><button type="button" class="pwa-later">關閉</button></div>';
      document.body.append(statusBox);
      textBox=statusBox.querySelector('p');
      action=statusBox.querySelector('.pwa-apply');
      later=statusBox.querySelector('.pwa-later');
      action.onclick=apply;
      later.onclick=()=>{if(canDefer()){writeLater(pendingVersion);}manual=false;statusBox.hidden=true;};
    }
    statusBox.hidden=false;statusBox.dataset.intent=intent;
    textBox.textContent=text;
    action.hidden=!canApply;action.disabled=requesting;
    later.textContent=canApply?'稍後':'關閉';
  }
  function canDefer(){return !!pendingVersion && !!pending;}
  function formInProgress(){
    return !!document.querySelector('dialog[open] form,form[aria-busy="true"],[data-save-pending="true"]');
  }
  async function announce(worker,force=false){
    if (!worker || !registration?.active) return;
    let info;
    try {info=await values({target:worker,type:'VERSION'});}
    catch {if(force) notice('新版狀態暫時無法確認，請再試一次。');return;}
    if (worker.state==='redundant' || info.release===release) return;
    pending=worker;pendingVersion=info.release;
    if (deferred()===pendingVersion && !force && !manual) return;
    notice('新版 '+pendingVersion+' 已準備好，可在完成手上的研究後更新。','ready',true);
  }
  const watched=new WeakSet();
  function observe(worker) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    const changed=()=>{
      if (worker.state==='installed' && registration.active) announce(worker,manual);
      if (worker.state==='redundant' && manual && !registration.waiting) {
        notice('新版下載未完成，目前版本仍可使用。恢復連線後可再檢查。');
        manual=false;
      }
      if (worker.state==='activated' && manual && !applying && !pending) {
        notice('離線檔案已準備好，目前使用版本 '+release+'。');manual=false;
      }
    };
    worker.addEventListener('statechange',changed);changed();
  }
  function reloadIfRequested() {
    if (!applying) return;
    applying=false;
    if (formInProgress()) {
      notice('新版已啟用。請先儲存並關閉編輯視窗，再按「檢查新版」重新載入。');
      return;
    }
    location.reload();
  }
  async function apply() {
    if (requesting) return;
    if (formInProgress()) {
      notice('請先儲存並關閉編輯視窗，再啟用新版。','ready',true);
      return;
    }
    const waiting=registration?.waiting || pending;
    if (!waiting || waiting.state==='redundant') {await check();return;}
    requesting=true;action.disabled=true;
    try {
      const reply=await values({target:waiting,type:'APPLY_UPDATE'});
      if (reply.blocked) {
        notice('請先儲存並關閉其他開啟此研究中心的分頁或主畫面視窗，然後再按「立即更新」。','ready',true);return;
      }
      if (!reply.accepted) throw Error('activation unavailable');
      applying=true;writeLater('');
      notice('正在啟用新版…');
      const activated=()=>{if(waiting.state==='activated')reloadIfRequested();};
      waiting.addEventListener('statechange',activated);
      activated();
    } catch {notice('暫時未能啟用新版，請稍後再試。','ready',true);}
    finally { requesting=false;if(action)action.disabled=false; }
  }
  let boot;
  function register() {
    if(boot) return boot;
    boot=navigator.serviceWorker.register(new URL('sw.js',scope),{scope,updateViaCache:'none'}).then(reg=>{
      registration=reg;
      reg.addEventListener('updatefound',()=>observe(reg.installing));
      observe(reg.installing);
      if(reg.waiting) announce(reg.waiting);
      else if(reg.active) announce(reg.active);
      return reg;
    }).catch(error=>{boot=null;throw error;});
    return boot;
  }
  async function check() {
    manual=true;
    if (!('serviceWorker' in navigator)){notice('此瀏覽器未支援離線版本管理。');manual=false;return;}
    if (registration?.waiting){await announce(registration.waiting,true);return;}
    if (!navigator.onLine){notice('目前離線，無法查核新版。已下載的研究中心可繼續使用。');manual=false;return;}
    notice('正在檢查新版…');
    try {
      const reg=await register();
      if(reg.waiting){await announce(reg.waiting,true);return;}
      if(reg.active){
        try {
          const activeInfo=await values({target:reg.active,type:'VERSION'});
          if(activeInfo.release!==release && !reg.waiting) {
            pending=reg.active;pendingVersion=activeInfo.release;
            notice('新版 '+pendingVersion+' 已下載，可在完成研究後更新。','ready',true);return;
          }
        } catch {}
      }
      await reg.update();
      if(reg.waiting){await announce(reg.waiting,true);return;}
      if(reg.installing){observe(reg.installing);notice('正在下載及驗證離線檔案…');return;}
      manual=false;
      notice('目前已是最新版本 '+release+'。');
    } catch {manual=false;notice('無法連接更新服務。請確認連線及登入狀態後再試。');}
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-check-update]')){event.preventDefault();check();}
  });
  document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent=release);
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.addEventListener('controllerchange',reloadIfRequested);
  register().catch(()=>{});
  const passive=()=>{if(navigator.onLine && document.visibilityState==='visible')register().then(reg=>reg.update()).catch(()=>{});};
  window.addEventListener('online',passive);
  document.addEventListener('visibilitychange',passive);
})();
