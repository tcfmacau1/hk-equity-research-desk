(() => {
  'use strict';

  const stocks = () => Array.isArray(window.watchStocks) ? window.watchStocks : [];
  const escaped = value => String(value ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const normalCode = value => {
    const digits = String(value).normalize('NFKC').trim().toUpperCase().replace(/\.HK$/,'');
    if (!/^\d{1,5}$/.test(digits) || Number(digits) < 1) return '';
    return String(Number(digits)).padStart(4,'0');
  };
  const find = code => stocks().find(stock => stock.code === code);
  const channelLabels = { site:'網站追蹤', alerts:'重大消息提醒' };
  let busy=false, archiveOpen=false, feedback='', problem=false;

  const marks={'9888':'du','3690':'美','0020':'S','1810':'mi'};
  window.stockLogo = stock => {
    const fallback=marks[stock.code]||Array.from(stock.name||'')[0]||'＋';
    if(stock.logo?.startsWith('data:image/png;base64,')){
      return '<span class="mark wl-custom-logo"><img src="'+escaped(stock.logo)+'" alt=""></span>';
    }
    return '<span class="mark c'+escaped(stock.code)+'" aria-hidden="true">'+escaped(fallback)+'</span>';
  };
  async function thumbnail(file){
    if(file.size>10*1024*1024)throw Error('請選用 10 MB 或以下的圖片。');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('請選用 PNG、JPEG 或 WebP 圖片。');
    const image=new Image(), source=URL.createObjectURL(file);
    try{
      await new Promise((resolve,reject)=>{
        image.onload=resolve;
        image.onerror=()=>reject(Error('圖片無法開啟，請另選檔案。'));
        image.src=source;
      });
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=160;
      const scale=160/Math.max(image.naturalWidth,image.naturalHeight);
      const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
      const context=canvas.getContext('2d');
      context.imageSmoothingQuality='high';
      context.drawImage(image,(160-w)/2,(160-h)/2,w,h);
      return canvas.toDataURL('image/png');
    }finally{URL.revokeObjectURL(source)}
  }

  function switchButton(stock, field) {
    const label = channelLabels[field];
    return '<button class="wl-switch" type="button" role="switch" aria-label="'+escaped(stock.name+' '+label)+'" aria-checked="'+Boolean(stock[field])+
      '" data-wl-action="toggle" data-wl-field="'+field+'"><span class="wl-track" aria-hidden="true"></span><span>'+label+'</span></button>';
  }
  function row(stock, archived=false) {
    const code=escaped(stock.code), name=escaped(stock.name);
    const count=(window.records||[]).filter(r=>r.company===stock.code).length;
    return '<li class="wl-row" data-wl-code="'+code+'"><div class="wl-stock"> '+window.stockLogo(stock)+'<div class="wl-identity"><strong>'+name+'</strong><span>'+code+'.HK · '+count+' 筆研究紀錄</span></div></div>'+
      (archived?'<div class="wl-tools"><button type="button" data-wl-action="restore">恢復追蹤</button></div>':
        '<div class="wl-channels">'+switchButton(stock,'site')+switchButton(stock,'alerts')+'</div><div class="wl-tools"><button type="button" data-wl-action="edit" aria-label="編輯'+name+'">編輯</button><button type="button" data-wl-action="remove" aria-label="移出'+name+'">移出</button></div>')+'</li>';
  }
  window.renderWatchlist = () => {
    const items=stocks(), active=items.filter(s=>s.site||s.alerts), archived=items.filter(s=>!s.site&&!s.alerts);
    return '<div class="wl-wrap"><section class="wl-panel"><div class="wl-heading"><div><h2>監察中的股票 <span>'+active.length+'</span></h2><p>網站追蹤及重大消息提醒可逐股設定。</p></div><button class="wl-primary" type="button" data-wl-action="add">＋ 新增股票</button></div>'+
      (active.length?'<ul class="wl-list">'+active.map(s=>row(s)).join('')+'</ul>':'<p class="wl-empty">名單目前空白，可新增股票或恢復過往追蹤。</p>')+'</section>'+
      (archived.length?'<details id="wl-archive" class="wl-archive" '+(archiveOpen?'open':'')+'><summary>已移出名單 <span>'+archived.length+'</span></summary><ul class="wl-list">'+archived.map(s=>row(s,true)).join('')+'</ul></details>':'')+
      '<div class="wl-feedback" role="status" aria-live="polite" '+(problem?'data-error':'')+'>'+escaped(feedback)+'</div></div>';
  };
  function notify(message, isProblem=false) {
    feedback=message;
    problem=isProblem;
    const el=document.querySelector('.wl-feedback');
    if(el){el.textContent=message;el.toggleAttribute('data-error',isProblem);}
  }
  function setBusy(value) {
    busy=value;
    document.querySelectorAll('.wl-wrap button, #watchlist-dialog button').forEach(button=>{button.disabled=value});
  }
  function persist(stock,base) {
    return window.researchOffline.put('watchlist',stock,base);
  }
  function dialog() {
    let el=document.getElementById('watchlist-dialog');
    if(!el){el=document.createElement('dialog');el.id='watchlist-dialog';el.className='wl-dialog';el.setAttribute('aria-labelledby','wl-title');document.body.append(el);}
    return el;
  }
  function openForm(stock, restoring=false, draft=null) {
    const el=dialog(), editing=Boolean(stock), original=stock||{code:'',name:'',site:true,alerts:true,version:0};
    const draftKey=draft?.id || 'stock:'+crypto.randomUUID();
    const check=(field,label,on)=>'<label class="wl-option"><input type="checkbox" name="'+field+'" '+(on?'checked':'')+'><span>'+label+'</span></label>';
    el.innerHTML='<form class="wl-form"><div class="wl-formhead"><h2 id="wl-title">'+(restoring?'恢復追蹤':editing?'編輯股票':'新增股票')+'</h2><button type="button" data-wl-close aria-label="關閉">×</button></div>'+
      '<label class="wl-input">港股代號<input name="code" type="text" maxlength="8" placeholder="例如 0700" required '+(editing?'readonly':'')+' value="'+escaped(original.code)+'" autocapitalize="characters" inputmode="'+(editing?'text':'numeric')+'"></label>'+
      '<label class="wl-input">公司名稱<input name="name" required maxlength="80" value="'+escaped(original.name)+'" placeholder="例如 騰訊控股"></label>'+
      '<div class="wl-logo-editor"><span class="wl-logo-label">公司 Logo</span><div class="wl-logo-controls"><div class="wl-logo-preview"></div><label class="wl-file-button"><span>選擇圖片</span><input type="file" name="logoFile" aria-label="選擇公司 Logo 圖片" accept="image/png,image/jpeg,image/webp"></label><button type="button" data-logo-remove>移除 Logo</button></div><small>PNG、JPEG 或 WebP，最大 10 MB。</small></div>'+
      '<fieldset><legend>追蹤設定</legend>'+check('site',channelLabels.site,restoring||original.site)+check('alerts',channelLabels.alerts,restoring||original.alerts)+'</fieldset>'+
      '<p class="wl-formerror" role="alert"></p><div class="wl-formfoot"><button type="button" data-wl-close>取消</button><button type="submit" class="wl-primary">儲存設定</button></div></form>';
    const form=el.querySelector('form'), error=el.querySelector('.wl-formerror');
    let draftLogo=original.logo??null, reading=false, selection=0;
    const fileInput=form.elements.logoFile, remove=form.querySelector('[data-logo-remove]');
    function keepDraft(){
      const values={name:form.elements.name.value,code:form.elements.code.value,site:form.elements.site.checked,alerts:form.elements.alerts.checked,logo:draftLogo};
      window.researchOffline.draft(draftKey,{kind:'watchlist',label:'名單草稿 · '+(values.name||values.code||'新增股票'),original:stock||null,restoring,values}).catch(()=>{error.textContent='無法保存本機草稿，請檢查裝置儲存空間。';});
    }
    if(draft){
      form.elements.name.value=draft.values.name;form.elements.code.value=draft.values.code;
      form.elements.site.checked=draft.values.site;form.elements.alerts.checked=draft.values.alerts;draftLogo=draft.values.logo??null;
    }
    form.addEventListener('input',e=>{if(e.target!==fileInput)keepDraft()});
    function showLogo(){
      form.querySelector('.wl-logo-preview').innerHTML=window.stockLogo({code:normalCode(form.elements.code.value),name:form.elements.name.value,logo:draftLogo});
      remove.hidden=!draftLogo;
      form.querySelector('.wl-file-button span').textContent=reading?'處理中…':draftLogo?'更換圖片':'選擇圖片';
      form.querySelector('[type="submit"]').disabled=reading;
    }
    form.elements.name.addEventListener('input',showLogo);
    form.elements.code.addEventListener('input',showLogo);
    fileInput.onchange=async ()=>{
      const file=fileInput.files[0];
      if(!file)return;
      const token=++selection;
      reading=true;error.textContent='';showLogo();
      try{
        const logo=await thumbnail(file);
        if(token===selection){draftLogo=logo;keepDraft();}
      }catch(e){if(token===selection)error.textContent=e.message;}
      finally{if(token===selection){reading=false;fileInput.value='';showLogo()}}
    };
    remove.onclick=()=>{selection++;reading=false;draftLogo=null;error.textContent='';fileInput.value='';showLogo();keepDraft()};
    showLogo();
    el.oncancel=e=>{if(busy)e.preventDefault()};
    el.querySelectorAll('[data-wl-close]').forEach(btn=>btn.onclick=()=>{if(!busy)el.close()});
    form.onsubmit=async e=>{
      e.preventDefault();if(busy||reading)return;
      const code=normalCode(form.elements.code.value), name=form.elements.name.value.trim();
      if(!code){error.textContent='請輸入 1 至 5 位數字的港股代號。';form.elements.code.focus();return;}
      if(!name){error.textContent='請填寫公司名稱。';form.elements.name.focus();return;}
      if(!editing&&find(code)){error.textContent=find(code).site||find(code).alerts?'此股票已在名單內，請在原項目編輯。':'此股票曾經移出，可在「已移出名單」恢復追蹤。';return;}
      const site=form.elements.site.checked, alerts=form.elements.alerts.checked;
      if(!editing&&!site&&!alerts){error.textContent='請選擇至少一項追蹤設定。';return;}
      if(restoring&&!site&&!alerts){error.textContent='請選擇要恢復的追蹤設定。';return;}
      setBusy(true);error.textContent='';
      try {
        await persist({code,name,site,alerts,logo:draftLogo,version:original.version},original);
        await window.researchOffline.draft(draftKey,null);
        el.close();notify(name+'（'+code+'.HK）的設定已儲存在本機。');
      } catch(err){error.textContent=err.message||'連線中斷，請重試。';}
      finally{setBusy(false);}
    };
    el.showModal();
    form.elements[editing?'name':'code'].focus();
  }
  window.resumeStockDraft=d=>openForm(d.original,d.restoring,d);
  document.addEventListener('toggle',e=>{if(e.target.id==='wl-archive')archiveOpen=e.target.open;},true);
  document.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-wl-action]');
    if(!btn||busy)return;
    if(window.watchReady===false){notify('本機名單正在載入，請稍後再試。',true);return;}
    const action=btn.dataset.wlAction;
    if(action==='add'){openForm();return;}
    const stock=find(btn.closest('[data-wl-code]')?.dataset.wlCode);
    if(!stock)return;
    if(action==='edit'||action==='restore'){openForm(stock,action==='restore');return;}
    if(action!=='remove'&&action!=='toggle')return;
    const update={...stock};
    if(action==='remove'){update.site=false;update.alerts=false;}
    else {
      const ch=btn.dataset.wlField;
      if(!Object.hasOwn(channelLabels,ch))return;
      update[ch]=!stock[ch];
    }
    setBusy(true);
    try {
      await persist(update,stock);
      notify(update.site||update.alerts?stock.name+'的監察設定已更新。':stock.name+'已移出名單，研究紀錄已保留。');
    } catch(err){notify(err.message||'連線中斷，請重試。',true);}
    finally{setBusy(false);}
  });
})();
