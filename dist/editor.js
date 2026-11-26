(() => {
  'use strict';
  const stocks = () => Array.isArray(window.watchStocks) ? window.watchStocks : [];
  const siteCodes = () => stocks().filter(stock=>stock.site).map(stock=>stock.code);
  const companyName = code => stocks().find(stock=>stock.code===code)?.name || code;
  const choices = {
    type:['重要公告','業績','業績指引','重大交易','核心業務','競爭格局','監管變動','其他'],
    period:['0–3 個月','3–6 個月','6–12 個月','12 個月以上'], importance:['高','中','低'],
    status:['待核實','已確認'], decision:['觀察','持有','增加配置','減少配置','暫緩決策']
  };
  const labels = {company:'公司', date:'消息發布日期',eventDate:'事件發生日期',title:'消息標題',summary:'事實摘要',
    official:'官方來源連結',media:'可靠財經媒體連結',status:'資料狀態',type:'消息類型',period:'影響期間',importance:'重要性',
    impact:'潛在股價影響',risk:'主要風險',next:'下一輪研究',inference:'分析推論',notes:'備註',fundamental:'基本面變化',valuation:'估值分析',
    close:'收市價（港元）',priceDate:'收市交易日',priceSource:'收市價來源連結',eps:'每股盈利（港元）',epsBasis:'盈利期間及口徑',epsSource:'每股盈利來源連結',
    decision:'投資決策',decisionReason:'決策依據',decisionDate:'決策日期',reviewDate:'下次覆核日期', material:'重大新消息'};
  const svg = {close:'<path d="m6 6 12 12M18 6 6 18"/>',back:'<path d="m14.5 5-7 7 7 7"/>',external:'<path d="M14 4h6v6m-1-5-9 9"/><path d="M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"/>'};
  const icon = name => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+svg[name]+'</svg>';
  const esc = val => String(val ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const url = v => { try { const u = new URL(String(v)); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch {return '';} };
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Macau',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const modal = () => document.getElementById('detail');
  let rec, mode, fresh=false, dirty=false, saving=false, draftKey='', draftValues=null;
  const data = key => rec[key] ?? '';
  const display = (key,val) => key==='company' ? companyName(val)+' · '+val+'.HK' : key==='material' ? (val===false?'否':'是') : val;
  const field = (key,kind='text',required=false,extra='') => {
    const val = data(key);
    const attrs = ' name="'+key+'" id="ed-'+key+'" '+(required?'required ':'')+extra;
    let input;
    if (kind==='select') {
      const values = [...new Set([...(key==='company' ? siteCodes() : choices[key] || []), ...(val ? [val] : [])])];
      input='<select'+attrs+'>'+values.map(v=>'<option value="'+esc(v)+'" '+(v===val?'selected':'')+'>'+esc(display(key,v))+'</option>').join('')+'</select>';
    } else if(kind==='textarea') input='<textarea rows="3" maxlength="12000"'+attrs+'>'+esc(val)+'</textarea>';
    else input='<input type="'+kind+'" value="'+esc(val)+'"'+attrs+'>';
    return '<label class="ed-field" for="ed-'+key+'"><span>'+labels[key]+(required?' <b>*</b>':'')+'</span>'+input+'</label>';
  };
  const group = (title,content) => '<section class="ed-block"><h3>'+title+'</h3>'+content+'</section>';
  const row = (...els) => '<div class="ed-fields">'+els.join('')+'</div>';
  const textLine = (key,placeholder='尚未記錄') => '<div class="ed-info"><h4>'+labels[key]+'</h4><p>'+esc(data(key)||placeholder)+'</p></div>';
  const sourceLink = (title,value) => url(value)?'<a class="ed-link" href="'+esc(url(value))+'" target="_blank" rel="noopener noreferrer"><span>'+esc(title)+'</span>'+icon('external')+'</a>':'';
  function metadata() {
    return '<dl class="ed-meta">'+['status','date','eventDate','type','period','importance'].map(k=>'<div><dt>'+labels[k]+'</dt><dd>'+esc(data(k)||(k==='eventDate'?'未另列':'未填'))+'</dd></div>').join('')+'</dl>';
  }
  function detailView() {
    return metadata()+group('事實與推論','<div class="ed-columns">'+(data('status')==='待核實'?'<div class="ed-info"><h4>待核實摘要</h4><p>'+esc(data('summary'))+'</p></div>':textLine('summary'))+textLine('inference')+'</div>')+
      group('基本面及估值','<div class="ed-columns">'+textLine('fundamental')+textLine('valuation')+'</div>'+priceSummary())+
      group('影響評估','<div class="ed-columns">'+textLine('impact')+textLine('risk')+'</div>')+
      group('後續研究',textLine('next')+textLine('decision')+(data('decisionReason')?textLine('decisionReason'):'')+(data('reviewDate')?textLine('reviewDate'):'')+(data('notes')?textLine('notes'):''))+
      group('消息來源',sourceLink('官方公告或投資者關係',data('official'))+sourceLink('可靠財經媒體',data('media'))||'<p>尚待補充來源</p>');
  }
  function priceSummary() {
    if (!(Number(data('close'))>0)) return '';
    const pe=Number(data('eps'))>0?Number(data('close'))/Number(data('eps')):null;
    return '<div class="ed-price"><span>'+esc(data('priceDate'))+' 收市</span><strong>HK$ '+esc(data('close'))+'</strong>'+(pe!==null?'<span>市盈率 '+pe.toFixed(2)+' 倍 · '+esc(data('epsBasis'))+'</span>':'')+'</div>'+sourceLink('收市價來源',data('priceSource'))+sourceLink('每股盈利來源',data('epsSource'));
  }
  function editView() {
    return group('消息資料',row(field('company','select',true),field('type','select',true))+field('title','text',true,'maxlength="180"')+row(field('date','date',true,'max="'+today()+'"'),field('eventDate','date'))+
      row(field('period','select'),field('importance','select'))+'<label class="ed-check"><input type="checkbox" name="material" '+(data('material')===false?'':'checked')+'>具實質影響的重大新消息</label>')+
      group('事實及來源',field('summary','textarea',true)+field('official','url',false,'placeholder="https://…"')+field('media','url',false,'placeholder="https://…"')+
      field('status','select')+'<label class="ed-check"><input type="checkbox" name="verified" '+(data('status')==='已確認'?'checked':'')+'>已核對連結內容，可確認本項消息</label>')+
      group('研究分析',field('inference','textarea')+row(field('fundamental','textarea'),field('valuation','textarea'))+
      row(field('impact','textarea'),field('risk','textarea'))+field('next','textarea')+field('notes','textarea'));
  }
  function priceView() {
    return group('更新收市價',row(field('priceDate','date',true,'max="'+today()+'"'),field('close','number',true,'min="0.000001" step="any" inputmode="decimal"'))+field('priceSource','url',true)+
      '<div id="ed-calc" class="ed-calc" aria-live="polite"></div>')+
      group('市盈率試算（選填）',row(field('eps','number',false,'step="any" inputmode="decimal"'),field('epsBasis','text',false,'placeholder="例如：截至最近年結日的基本每股盈利"'))+field('epsSource','url'))+
      group('本次分析',field('valuation','textarea',true)+field('next','textarea'));
  }
  function calc() {
    const f=modal().querySelector('form');if(!f?.elements.close)return;
    const px=Number(f.elements.close.value), eps=Number(f.elements.eps.value);
    const msg=[];
    if(px>0 && Number(data('close'))>0) msg.push('較上次記錄（'+(data('priceDate')||'日期未填')+'）變動 '+((px/Number(data('close'))-1)*100).toFixed(2)+'%');
    if(px>0 && eps>0) msg.push('按所填每股盈利計算，市盈率為 '+(px/eps).toFixed(2)+' 倍');
    if(f.elements.eps.value && eps<=0) msg.push('每股盈利為零或負數，市盈率不適用');
    f.querySelector('#ed-calc').textContent=msg.join('。');
  }
  const decisionView = () => group('投資決策追蹤',row(field('decision','select',true),field('decisionDate','date',true,'max="'+today()+'"'))+field('decisionReason','textarea',true)+field('reviewDate','date')+field('next','textarea'));
  const prior = () => (Array.isArray(rec.versions)?rec.versions:[]).map(v=>v.snapshot || v.record || v).filter(Boolean);
  const snapshots = () => [...prior(),rec].sort((a,b)=>(Number(a.version)||0)-(Number(b.version)||0));
  const verName = v => Number(v.version)>0?'版本 '+v.version:'初始紀錄';
  function historyView() {
    const list=snapshots(), count=list.length;
    if(count===1)return group('版本留痕','<p>目前只有'+esc(verName(rec))+'。更新消息、收市價或投資決策後，即可在此比較歷次變更。</p>');
    const opts=(idx)=>list.map((v,i)=>'<option value="'+i+'" '+(i===idx?'selected':'')+'>'+esc(verName(v))+' · '+esc((v.updatedAt||v.updated_at||v.date||'').slice(0,10))+'</option>').join('');
    return group('比較歷史版本',row('<label class="ed-field"><span>較早版本</span><select id="ed-from">'+opts(count-2)+'</select></label>','<label class="ed-field"><span>對照版本</span><select id="ed-to">'+opts(count-1)+'</select></label>')+'<div id="ed-diff"></div>')+
      group('更新紀錄','<ol class="ed-log">'+list.slice().reverse().map(v=>'<li><strong>'+esc(verName(v))+'</strong><span>'+esc((v.updatedAt||v.updated_at||v.date||'').replace('T',' ').slice(0,16))+' · '+esc(v.changeNote||'消息紀錄')+'</span></li>').join('')+'</ol>');
  }
  function diff() {
    const el=modal().querySelector('#ed-diff');if(!el)return;
    const all=snapshots(), a=all[Number(modal().querySelector('#ed-from').value)], b=all[Number(modal().querySelector('#ed-to').value)];
    const changes=Object.keys(labels).filter(k=>String(a[k]??'')!==String(b[k]??''));
    el.innerHTML=changes.map(k=>'<div class="ed-change"><h4>'+labels[k]+'</h4><div class="ed-columns"><div><small>'+esc(verName(a))+'</small><p>'+esc(display(k,a[k])??'未填')+'</p></div><div><small>'+esc(verName(b))+'</small><p>'+esc(display(k,b[k])??'未填')+'</p></div></div></div>').join('')||'<p>所選版本的研究欄位相同。</p>';
  }
  const tabs={view:'消息詳情',edit:'編輯紀錄',price:'更新收市價',decision:'投資決策',history:'版本比較'};
  function keepDraft(form){
    const values={};
    for(const input of form.elements){
      if(input.name)values[input.name]=input.type==='checkbox'?input.checked:input.value;
    }
    const title=values.title||rec.title||companyName(rec.company);
    window.researchOffline.draft(draftKey,{kind:'records',label:tabs[mode]+' · '+title,base:rec,mode,fresh,values}).catch(()=>{
      form.querySelector('.ed-error').textContent='無法保存本機草稿，請檢查裝置儲存空間。';
    });
  }
  function closeModal() {
    if(saving)return;
    dirty=false;modal().close();
  }
  function render() {
    const box=modal(), form=['edit','price','decision'].includes(mode);
    box.classList.add('ed-dialog');
    box.setAttribute('aria-labelledby','ed-title');
    box.innerHTML='<div class="ed-shell"><header class="ed-head"><div><div class="ed-eyebrow">'+esc(companyName(rec.company)||'研究紀錄')+' · '+esc(rec.company)+'.HK</div><h2 id="ed-title">'+esc(fresh?'新增消息紀錄':rec.title)+'</h2></div><button class="ed-icon" type="button" data-close aria-label="關閉">'+icon('close')+'</button></header>'+
      (!fresh?'<nav class="ed-tabs" aria-label="紀錄操作">'+Object.entries(tabs).map(([k,label])=>'<button type="button" data-mode="'+k+'" aria-pressed="'+(k===mode)+'">'+label+'</button>').join('')+'</nav>':'')+
      '<div class="ed-body">'+(form?'<form id="ed-form">':'')+(mode==='edit'?editView():mode==='price'?priceView():mode==='decision'?decisionView():mode==='history'?historyView():detailView())+
      (form?'<div class="ed-error" role="alert"></div><footer class="ed-actions"><button type="button" data-close>稍後繼續</button><button class="ed-primary" type="submit">儲存'+(fresh?'紀錄':'新版本')+'</button></footer></form>':'')+'</div></div>';
    box.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal);
    box.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(saving||mode===b.dataset.mode)return;dirty=false;mode=b.dataset.mode;draftKey='record:'+crypto.randomUUID();draftValues=null;render()});
    box.oncancel=e=>{e.preventDefault();closeModal()};
    box.onclick=e=>{if(e.target===box)closeModal()};
    if(form){
      const f=box.querySelector('form'); f.oninput=()=>{dirty=true;if(mode==='price')calc();keepDraft(f)}; f.onsubmit=save;
      if(mode==='price'){if(!f.elements.priceDate.value)f.elements.priceDate.value=today();calc()}
      if(mode==='decision'&&!f.elements.decisionDate.value)f.elements.decisionDate.value=today();
      if(mode==='edit') [f.elements.official,f.elements.media,f.elements.summary].forEach(input=>input.addEventListener('input',()=>{f.elements.verified.checked=false}));
      if(draftValues){
        for(const [key,val] of Object.entries(draftValues)){const input=f.elements.namedItem(key);if(input){if(input.type==='checkbox')input.checked=Boolean(val);else input.value=val;}}
        draftValues=null;dirty=true;if(mode==='price')calc();
      }
    } else if(mode==='history'){box.querySelectorAll('select').forEach(el=>el.onchange=diff);diff()}
    box.querySelector('.ed-body').scrollTop=0;
  }
  async function save(e) {
    e.preventDefault();if(saving)return;
    const f=e.currentTarget,out={...rec};
    const fail=message=>{const err=f.querySelector('.ed-error');err.textContent=message;err.scrollIntoView({block:'nearest'});};
    for(const [k,v] of new FormData(f)) if(k in labels)out[k]=String(v).trim();
    if(mode==='edit'){
      out.material=f.elements.material.checked;
      if(!out.title||!out.summary)return fail('請填寫消息標題及事實摘要。');
      if(out.status==='已確認'&&(!(url(out.official)||url(out.media))||!f.elements.verified.checked))return fail('已確認的消息須附官方或可靠財經媒體連結，並勾選已核對內容。');
      const norm=s=>String(s||'').normalize('NFKC').replace(/[\s\p{P}]/gu,'').toLowerCase();
      if((window.records||[]).some(r=>r.id!==out.id&&r.company===out.company&&norm(r.title)===norm(out.title)))return fail('已有相同公司的同名紀錄，請在原紀錄儲存新版本。');
    }
    for(const k of ['official','media','priceSource','epsSource'])if(f.elements[k]?.value&&!url(f.elements[k].value))return fail(labels[k]+'須使用有效的 http 或 https 網址。');
    if(mode==='price'){
      if(data('priceDate')&&out.priceDate<data('priceDate'))return fail('交易日早於上一次記錄，請核對日期。');
      if(!Number.isFinite(Number(out.close))||Number(out.close)<=0||!out.valuation)return fail('請填寫有效收市價及本次估值分析。');
      if(out.eps&&(!out.epsBasis||!url(out.epsSource)))return fail('使用每股盈利試算時，請補充盈利期間、口徑及來源。');
      out.close=Number(out.close);
    }
    if(mode==='decision'&&!out.decisionReason)return fail('請填寫決策依據。');
    if(mode==='decision'&&out.reviewDate&&out.reviewDate<out.decisionDate)return fail('下次覆核日期應在決策當日或之後。');
    const changed=Object.keys(labels).some(k=>k==='material' ? (rec.material!==false)!==(out.material!==false) : String(rec[k]??'')!==String(out[k]??''));
    if(!fresh&&!changed)return fail('尚未有欄位變更。');
    out.changeNote=fresh?'新增研究紀錄':mode==='price'?'更新收市價及估值分析':mode==='decision'?'更新投資決策':'修訂消息及研究內容';
    saving=true;f.querySelector('button[type=submit]').disabled=true;
    try {await window.saveRecord(out,rec);await window.researchOffline.draft(draftKey,null);dirty=false;modal().close();}
    catch(error){fail(error?.message||'儲存失敗，請稍後再試。');f.querySelector('button[type=submit]').disabled=false;}
    finally{saving=false;}
  }
  function open(r,m,isNew,draft=null){draftKey=draft?.id||'record:'+crypto.randomUUID();draftValues=draft?.values||null;rec={...r}; fresh=isNew;mode=m in tabs?m:'view';dirty=false;render();if(!modal().open)modal().showModal();}
  window.resumeRecordDraft=d=>open(d.base,d.mode,d.fresh,d);
  window.openRecord=(r,m='view')=>{if(r)open(r,m,false)};
  window.newRecord = preferred => {
    const enabled = siteCodes();
    if(!enabled.length){window.alert('請先在監察名單開啟至少一隻股票的網站追蹤。');return;}
    const company=enabled.includes(preferred)?preferred:enabled[0];
    open({id:crypto.randomUUID(),version:0,company,date:today(),status:'待核實',type:'重要公告',period:'6–12 個月',importance:'高',material:true,versions:[]},'edit',true);
  };
})();
