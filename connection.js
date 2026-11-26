(() => {
  'use strict';
  const key = 'iphone-research-cloud-v1';
  const settings = () => JSON.parse(localStorage.getItem(key) || '{}');
  const button = document.querySelector('#connect-private');
  const note = document.querySelector('#connection-note');
  function status() {
    const cfg = settings();
    button.textContent = cfg.session ? '雲端帳戶' : '連接 iPhone 獨立雲端';
    note.textContent = cfg.session ? '已登入獨立雲端 · ' + cfg.email : '本機模式 · 登入後可同步現有待辦變更';
  }
  async function auth(url, apiKey, grant, body) {
    const res = await fetch(url+'/auth/v1/token?grant_type='+grant, {
      method:'POST', headers:{apikey:apiKey,'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
    if (!res.ok) throw Error('登入或續期失敗，請核對帳戶及專案設定。');
    return res.json();
  }
  let renewing;
  async function session() {
    let cfg = settings();
    if (!cfg.session) throw Error('請登入獨立雲端');
    if (cfg.session.expires_at < Date.now()/1000 + 60) {
      renewing ||= auth(cfg.url,cfg.apiKey,'refresh_token',{refresh_token:cfg.session.refresh_token})
        .then(tokens => {
          const current=settings();
          if(current.session?.refresh_token!==cfg.session.refresh_token) return;
          current.session=tokens;
          localStorage.setItem(key,JSON.stringify(current));
        }).finally(()=>{renewing=null;});
      await renewing;
      cfg=settings();
    }
    if(!cfg.session) throw Error('請重新登入');
    return cfg;
  }
  button.onclick = () => {
    const cfg = settings();
    const dialog = document.createElement('dialog');
    dialog.className='cloud-account';
    dialog.innerHTML='<form><h2>iPhone 獨立雲端</h2><label>Supabase 專案網址<input name="url" type="url" placeholder="https://專案代號.supabase.co" required></label><label>Publishable key<input name="apiKey" placeholder="sb_publishable_…" required></label><label>電郵<input name="email" type="email" autocomplete="username" required></label><label>密碼<input name="password" type="password" autocomplete="current-password" required></label><p>登入後會同步此裝置的待辦變更。</p><p role="alert"></p><button type="submit">登入並同步</button> <button type="button" data-close>關閉</button></form>';
    document.body.append(dialog);
    const form=dialog.querySelector('form');
    for(const name of ['url','apiKey','email']) form.elements[name].value=cfg[name]||'';
    form.elements.url.readOnly=Boolean(cfg.uid);
    form.elements.email.readOnly=Boolean(cfg.uid);
    dialog.onclose=()=>dialog.remove();
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    if(cfg.session){
      const logout=document.createElement('button');
      logout.type='button';logout.textContent='中斷雲端連線';
      logout.onclick=()=>{const current=settings();delete current.session;localStorage.setItem(key,JSON.stringify(current));status();dialog.close();};
      form.append(logout);
    }
    form.onsubmit=async e=>{
      e.preventDefault();
      const submit=form.querySelector('[type=submit]');submit.disabled=true;
      try {
        const url=form.elements.url.value.trim().replace(/\/$/,'');
        const email=form.elements.email.value.trim(),apiKey=form.elements.apiKey.value.trim();
        if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!apiKey.startsWith('sb_publishable_')) throw Error('請填寫 Supabase 專案網址及 publishable key。');
        const tokens=await auth(url,apiKey,'password',{email,password:form.elements.password.value});
        if(cfg.uid && tokens.user.id!==cfg.uid) throw Error('請使用此裝置原有的雲端帳戶。');
        localStorage.setItem(key,JSON.stringify({url,apiKey,email,uid:tokens.user.id,session:tokens}));
        status();dialog.close();window.dispatchEvent(new Event('online'));
      } catch(err){form.querySelector('[role=alert]').textContent=err.message;}
      finally {submit.disabled=false;}
    };
    dialog.showModal();
  };
  window.researchFetch=async(path, options={})=>{
    const kind=path.split('?')[0].split('/').pop();
    if(!['records','watchlist'].includes(kind)) throw Error('未知資料類型');
    const cfg=await session();
    const headers={apikey:cfg.apiKey,Authorization:'Bearer '+cfg.session.access_token,'Content-Type':'application/json'};
    const rest=cfg.url+'/rest/v1/';
    if(options.method==='POST'){
      const {expectedVersion,record,...stock}=JSON.parse(options.body);
      const response=await fetch(rest+'rpc/save_iphone_research',{method:'POST',headers,body:JSON.stringify({k:kind,v:kind==='records'?record:stock,expected:expectedVersion})});
      if(response.ok)return response;
      const body=await response.json();
      return Response.json({error:body.message||'同步失敗'},{status:response.status});
    }
    const rows=[];
    for(let start=0;;start+=100){
      const response=await fetch(rest+'iphone_research?select=data&kind=eq.'+kind+'&order=item&limit=100&offset='+start,{headers,cache:'no-store'});
      if(!response.ok)return response;
      const page=await response.json();rows.push(...page.map(row=>row.data));
      if(page.length<100)return Response.json(rows);
    }
  };
  status();
})();
