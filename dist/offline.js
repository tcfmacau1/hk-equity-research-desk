(() => {
  'use strict';
  const kinds = ['records','watchlist'];
  const meta = new Set(['version','versions','updatedAt','_offline','_pending']);
  const keyOf = (kind, value) => kind==='records' ? value.id : value.code;
  const clean = value => Object.fromEntries(Object.entries(value||{}).filter(([key])=>!meta.has(key)));
  const patch = (from,to) => Object.fromEntries(Object.entries(clean(to)).filter(([key,val])=>JSON.stringify(from?.[key])!==JSON.stringify(val)));
  const esc = value => String(value??'').replace(/[<>&"']/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[ch]));
  const state={records:[],watchlist:[],queue:[],drafts:[],ready:false,error:'',online:navigator.onLine!==false};
  const initial={
    records:(window.SEED||[]).map(r=>({...r,version:0,versions:[]})),
    watchlist:window.OFFLINE_INITIAL_WATCHLIST||[]
  };
  const scope=new URL('.',location.href).pathname;
  const name='hk-equity-research-offline:'+scope;
  const dbPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(Error('此瀏覽器無法使用離線儲存。'));return;}
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore('cache');
      db.createObjectStore('queue',{keyPath:'n',autoIncrement:true});
      db.createObjectStore('drafts',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  const req = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  async function transaction(stores,mode,work){
    const db=await dbPromise, tx=db.transaction(stores,mode);
    const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('本機儲存未完成。'));tx.onerror=()=>{}});
    try {
      const result=await work(Object.fromEntries(stores.map(k=>[k,tx.objectStore(k)])));
      await done;return result;
    }catch(error){try{tx.abort()}catch{}await done.catch(()=>{});throw error;}
  }
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(name):null;
  let onChange=()=>{}, loadSeq=0, running=null;
  function legacy(kind){
    if(scope!=='/')return initial[kind];
    try{const value=JSON.parse(localStorage.getItem('hkdesk-'+kind));return Array.isArray(value)?value:initial[kind];}
    catch{return initial[kind];}
  }
  function projected(kind,base,jobs){
    const rows=new Map(base.map(r=>[keyOf(kind,r),r]));
    for(const job of jobs.filter(j=>j.kind===kind)){
      const previous=rows.get(job.key);
      const local={...job.value,version:job.expected+1,_pending:job.n};
      if(kind==='records'){
        local.versions=[...(previous?.versions||[])];
        if(previous){const {versions,...snapshot}=previous;local.versions.push(snapshot);}
        local.updatedAt=job.time;
      }
      rows.set(job.key,local);
    }
    return [...rows.values()];
  }
  async function reload(){
    const seq=++loadSeq;
    const data=await transaction(['cache','queue','drafts'],'readonly',async s=>Promise.all([s.cache.get('records'),s.cache.get('watchlist'),s.queue.getAll(),s.drafts.getAll()].map(req)));
    if(seq!==loadSeq)return;
    state.queue=data[2];state.drafts=data[3];state.ready=true;
    kinds.forEach((kind,i)=>{state[kind]=projected(kind,data[i]||legacy(kind),state.queue)});
    onChange();
  }
  async function changed(){
    await reload();channel?.postMessage('changed');
  }
  if(channel)channel.onmessage=()=>reload().catch(()=>{});
  const remote = (path,options) => (window.researchFetch||window.fetch.bind(window))(path,options);
  const pathOf=kind=>'/api/'+kind+(kind==='watchlist'?'?logos=1':'');
  async function fetchList(kind){
    const resp=await remote(pathOf(kind),{cache:'no-store'});
    if(!resp.ok)throw Error('連線暫停');
    const data=await resp.json();if(!Array.isArray(data))throw Error('資料格式有誤');
    return data;
  }
  function merge(rows,add,kind){
    const map=new Map(rows.map(row=>[keyOf(kind,row),row]));
    for(const row of add){
      const key=keyOf(kind,row),old=map.get(key);
      if(!old || (row.version??0)>=(old.version??0))map.set(key,{...old,...row});
    }
    return [...map.values()];
  }
  async function cacheRows(kind,add){
    await transaction(['cache'],'readwrite',async ({cache})=>{
      const rows=await req(cache.get(kind))||legacy(kind);
      await req(cache.put(merge(rows,add,kind),kind));
    });
  }
  async function refresh(kind){
    if(state.volatile){
      try{state[kind]=await fetchList(kind);state.online=true;state.ready=true;}catch{state.online=false;}
      onChange();return;
    }
    try{
      const rows=await fetchList(kind);await cacheRows(kind,rows);state.online=true;state.error='';
    }catch{state.online=false;state.error='連線暫停，變更可先儲存在本機。';}
    await reload();
  }
  async function put(kind,value,baseOverride){
    if(state.volatile){
      const expect=value.version||0, cleanValue=clean(value);
      const payload=kind==='records'?{record:cleanValue,expectedVersion:expect}:{...cleanValue,expectedVersion:expect};
      const response=await remote('/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'未能連線儲存，請保留此編輯視窗。');
      state[kind]=merge(state[kind],[{...value,...result}],kind);onChange();return result;
    }
    if(!state.ready)throw Error('本機儲存尚未就緒，請稍後再試。');
    const key=keyOf(kind,value),expected=Number(value.version)||0;
    const base=baseOverride||state[kind].find(r=>keyOf(kind,r)===key)||{};
    const job={kind,key,expected,value:clean(value),base:clean(base),delta:patch(base,value),time:new Date().toISOString(),error:''};
    await transaction(['queue','cache'],'readwrite',async stores=>{
      const [jobs,server]=await Promise.all([req(stores.queue.getAll()),req(stores.cache.get(kind))]);
      const current=projected(kind,server||legacy(kind),jobs).find(s=>keyOf(kind,s)===key);
      if((current?.version||0)!==expected)job.error='編輯期間已有其他版本，請比較兩個版本。';
      await req(stores.queue.add(job));
    });
    await changed();void sync();return {queued:true};
  }
  async function changeJob(n,fn){
    await transaction(['queue'],'readwrite',async ({queue})=>{
      const job=await req(queue.get(n));if(job)await fn(queue,job);
    });
  }
  async function flush(){
    if(navigator.onLine===false&&!window.researchLocalOnly)return;
    const jobs=await transaction(['queue'],'readonly',({queue})=>req(queue.getAll()));
    const blocked=new Set();
    for(const initialJob of jobs){
      const job=await transaction(['queue'],'readonly',({queue})=>req(queue.get(initialJob.n)));
      if(!job)continue;
      const group=job.kind+':'+job.key;
      if(job.error){blocked.add(group);continue;}
      if(blocked.has(group)||(job.kind==='records'&&blocked.has('watchlist:'+job.value.company)))continue;
      const payload=job.kind==='records'?{record:job.value,expectedVersion:job.expected}:{...job.value,expectedVersion:job.expected};
      let response,body;
      try{
        response=await remote('/api/'+job.kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        body=await response.json();
      }catch{state.online=false;break;}
      if(!response.ok){
        if(response.status>=500||[401,403,408,429].includes(response.status)){state.error=response.status===401||response.status===403?'同步需要重新登入，草稿已保留。':'同步暫停，變更已保留。';break;}
        const reason=body.error||'無法套用此變更，請核對後再試。';
        await changeJob(job.n,(queue,stored)=>{if(stored.expected===job.expected)return req(queue.put({...stored,error:reason}));});
        blocked.add(group);
        try{await cacheRows(job.kind,await fetchList(job.kind))}catch{}
        continue;
      }
      if(!body||typeof body.version!=='number'||keyOf(job.kind,body)!==job.key){state.error='同步回應未能核實，本機變更已保留。';break;}
      state.online=true;state.error='';
      await transaction(['cache','queue'],'readwrite',async ({cache,queue})=>{
        const existing=await req(queue.get(job.n));if(!existing)return;
        const rows=await req(cache.get(job.kind))||legacy(job.kind);
        await req(cache.put(merge(rows,[{...job.value,...body}],job.kind),job.kind));
        await req(queue.delete(job.n));
        if(body.version!==job.expected+1){
          const next=(await req(queue.getAll())).filter(j=>j.n>job.n&&j.key===job.key&&j.kind===job.kind);
          for(const [i,j] of next.entries())await req(queue.put({...j,expected:body.version+i}));
        }
      });
    }
    await changed();
  }
  function sync(){
    if(state.volatile)return Promise.resolve();
    if(running)return running;
    const work=navigator.locks?navigator.locks.request(name+':flush',flush):flush();
    running=Promise.resolve(work).catch(()=>{state.error='未能同步，本機變更已保留。';onChange();}).finally(()=>{running=null;});
    return running;
  }
  async function draft(id,value){
    if(state.volatile){
      state.drafts=state.drafts.filter(d=>d.id!==id);
      if(value)state.drafts.push({...value,id});onChange();return;
    }
    await transaction(['drafts'],'readwrite',({drafts})=>req(value?drafts.put({...value,id}):drafts.delete(id)));
    await changed();
  }
  async function resolve(n,action){
    const item=state.queue.find(j=>j.n===n);if(!item)return;
    if(action==='export'){
      const a=document.createElement('a'), url=URL.createObjectURL(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}));
      a.href=url;a.download='hk-research-draft-'+item.n+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return;
    }
    const rows=await fetchList(item.kind);await cacheRows(item.kind,rows);
    const server=rows.find(value=>keyOf(item.kind,value)===item.key);
    if(action==='drop'&&!confirm('捨棄這項本機變更？已同步的版本會保留。'))return;
    if(action==='apply'&&!confirm('把此草稿修改的欄位套用至目前版本？'))return;
    await transaction(['queue'],'readwrite',async ({queue})=>{
      const all=await req(queue.getAll()),group=all.filter(j=>j.kind===item.kind&&j.key===item.key);
      if(group[0]?.n!==n)throw Error('請先處理這項資料最早的待同步變更。');
      let base=clean(server), version=server?.version||0;
      for(const j of group){
        if(j.n===n&&action==='drop'){await req(queue.delete(n));continue;}
        const value={...base,...j.delta};
        await req(queue.put({...j,expected:version++,base,value,error:''}));base=value;
      }
    });
    await changed();void sync();
  }
  function render(){
    const blocked=state.queue.filter(j=>j.error);
    const drafts=state.drafts;
    if(state.ready&&state.online&&!state.queue.length&&!drafts.length&&!state.error)return '';
    const status=state.error||(!state.online?'離線模式':'');
    const title=[status,state.queue.length?'待同步 '+state.queue.length+' 項':'',blocked.length?'需處理 '+blocked.length+' 項':'',drafts.length?'未提交草稿 '+drafts.length+' 項':''].filter(Boolean).join(' · ');
    if(!title)return '';
    return '<section class="sync" aria-live="polite"><b>'+esc(title)+'</b> '+(state.queue.length?'<button type="button" data-sync-action="retry">重新同步</button>':'')+
      blocked.map(j=>{
        const label=j.value.title||j.value.name||j.key;
        return '<details><summary>'+esc(label)+' · '+esc(j.error)+'</summary><p>本機修改的欄位</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto">'+esc(JSON.stringify(j.delta,(k,v)=>k==='logo'&&v?'［自訂圖片］':v,2))+'</pre><button data-sync-action="compare" data-sync-n="'+j.n+'">比較最新版本</button> <button data-sync-action="apply" data-sync-n="'+j.n+'">套用本機修改</button> <button data-sync-action="export" data-sync-n="'+j.n+'">匯出草稿</button> <button data-sync-action="drop" data-sync-n="'+j.n+'">捨棄此變更</button></details>';
      }).join('')+drafts.map(d=>'<div>'+esc(d.label||'編輯中')+' <button data-sync-action="draft" data-sync-id="'+esc(d.id)+'">繼續草稿</button> <button data-sync-action="discard" data-sync-id="'+esc(d.id)+'">捨棄草稿</button></div>').join('')+'</section>';
  }
  document.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-sync-action]');if(!btn)return;
    const action=btn.dataset.syncAction,n=Number(btn.dataset.syncN),id=btn.dataset.syncId;
    try{
      if(action==='retry'){await sync();return;}
      if(action==='draft'){const d=state.drafts.find(x=>x.id===id);if(d)(d.kind==='records'?window.resumeRecordDraft:window.resumeStockDraft)(d);return;}
      if(action==='discard'){if(confirm('捨棄這份未提交的本機草稿？'))await draft(id,null);return;}
      if(action==='compare'){
        const j=state.queue.find(x=>x.n===n);if(!j)return;
        const list=await fetchList(j.kind),server=list.find(x=>keyOf(j.kind,x)===j.key);
        const out=Object.keys(j.delta).map(key=>key+'\n最新：'+(key==='logo'?(server?.logo?'有圖片':'無圖片'):String(server?.[key]??'未填'))+'\n本機：'+(key==='logo'?(j.value.logo?'有圖片':'無圖片'):String(j.value[key]??'未填')));
        alert(out.join('\n\n')||'沒有欄位差異。');return;
      }
      await resolve(n,action);
    }catch(error){alert(error.message||'未能連線，草稿仍然保留。');}
  });
  window.researchOffline={state,render,put,draft,refresh,sync,async start(handler){
    onChange=handler;
    try{await reload();}catch{state.volatile=true;state.error='本機儲存無法開啟。此工作階段須連線儲存，離開頁面前請提交草稿。';onChange();}
    await Promise.all(kinds.map(refresh));void sync();
  }};
  window.addEventListener('offline',()=>{state.online=false;onChange()});
  window.addEventListener('online',()=>{if(state.ready)Promise.all(kinds.map(refresh)).then(sync)});
  window.addEventListener('pageshow',()=>{if(state.ready)void sync()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.ready)void sync()});
  setInterval(()=>{if(!document.hidden&&state.ready&&state.queue.some(j=>!j.error))void sync()},30000);
})();
