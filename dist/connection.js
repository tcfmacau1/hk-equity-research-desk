(() => {
  const origin='https://hk-equity-research-desk.tcfmacau0912.chatgpt.site';
  let popup,channel,ready=false,seq=0;
  const pending=new Map();
  const button=document.querySelector('#connect-private');
  const note=document.querySelector('#connection-note');
  const appleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(appleMobile){
    button.textContent='開啟私人工作區';
    note.textContent='在同一分頁查看及編輯私人研究。';
    button.onclick=()=>location.assign(origin+'/');
    window.researchFetch=()=>Promise.reject(new TypeError('請在私人工作區查看及同步研究。'));
    return;
  }
  const fallback=document.createElement('a');
  fallback.href=origin+'/';
  fallback.textContent='直接開啟私人工作區';
  note.after(fallback);
  const disconnected=()=>{ready=false;channel?.close();for(const req of pending.values())req.reject(new TypeError('私人工作區已中斷連線'));pending.clear();button.textContent='連接私人工作區';note.textContent='使用已儲存在本機的研究資料。'};
  button.onclick=()=>{
    if(ready&&popup&&!popup.closed){popup.focus();return;}
    disconnected();popup=window.open(origin+'/connect.html','hkResearchConnect');
    note.textContent=popup?'請在私人網站分頁確認連線。':'請允許此頁開啟私人網站分頁。';
  };
  window.addEventListener('message',e=>{
    if(e.origin!==origin||e.source!==popup||e.data?.type!=='hkdesk.bridge')return;
    disconnected();
    const pair=new MessageChannel();channel=pair.port1;
    channel.onmessage=({data})=>{
      if(data?.type==='ready'){ready=true;button.textContent='私人工作區已連接';note.textContent='';window.dispatchEvent(new Event('online'));return;}
      const req=pending.get(data?.id);if(!req)return;pending.delete(data.id);
      if(data.error)req.reject(new TypeError(data.error));else req.resolve(new Response(data.text,{status:data.status,headers:{'Content-Type':'application/json'}}));
    };
    popup.postMessage({type:'hkdesk.request'},origin,[pair.port2]);
  });
  window.researchFetch=(path,options={})=>new Promise((resolve,reject)=>{
    if(!ready||!popup||popup.closed){disconnected();reject(new TypeError('請連接私人工作區'));return;}
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new TypeError('私人工作區連線逾時'))},18000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
    channel.postMessage({id,path,method:options.method||'GET',body:options.body});
  });
})();
