'use strict';
let names={},codes=[];

window.watchStocks=[];
window.watchReady=false;
let watchMessage='';
function useWatch(rows){
  window.watchStocks=rows;
  names=Object.fromEntries(rows.map(s=>[s.code,s.name]));
  codes=rows.filter(s=>s.site).map(s=>s.code);
}
function displayName(code){return esc(names[code]||code)}
const navs=['研究總覽','重大消息清單','公司總覽','基本面及估值','事件時間線','事實與推論','影響評估','待核實事項','投資決策追蹤','下一輪研究','監察名單管理'];
const paths=['M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z','M4 5h16v14H4z M7 9h10 M7 13h7','M3 21h18 M5 20V7l7-4v17 M12 9h6v11 M8 9v1 M8 13v1 M15 13v1','M3 3v17h18 M6 16l5-6 4 3 6-8','M7 3v18 M10 6h10 M10 12h7 M10 18h10','M3 4h8v15H3z M13 4h8v15h-8z','M2 12h5l3-7 4 14 3-7h5','M12 4l9 16H3z M12 9v5 M12 16v1','M5 3h14v18l-7-4-7 4z','M4 4h12v15H4z M8 8h5 M8 12h5 M19 9l3 3-3 3','M3 6h18 M3 12h18 M3 18h18 M7 4v4 M16 10v4 M9 16v4'];
const sub=['WORKSPACE OVERVIEW','NEWS MONITOR','COMPANY COVERAGE','FUNDAMENTALS & VALUATION','EVENT TIMELINE','RESEARCH EVIDENCE','IMPACT ASSESSMENT','VERIFICATION QUEUE','INVESTMENT JOURNAL','RESEARCH AGENDA','WATCHLIST MANAGEMENT'];
let page=0,filters={},syncMessage='';const q=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
window.records=(window.SEED||[]).map(r=>({...r,version:0,versions:[]}));
function icon(i){return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[i]+'"/></svg>'}
function navTo(i,f={}){page=i;filters=f;document.body.classList.remove('navopen');draw();window.scrollTo(0,0);if(i===10&&navigator.onLine)window.refreshWatch().catch(()=>{})}
function sorted(){return [...records].sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title))}
function material(r){return r.material!==false&&r.importance!=='低'}
function confirmed(r){return r.status==='已確認'&&!!(r.official||r.media)}
function badge(r){return confirmed(r)?'<span class="pill ok">已確認</span>':'<span class="pill hi">待核實</span>'}
function head(k,t,action=''){return '<div class="sectionhead"><div><div class="eyebrow">'+k+'</div><h2>'+t+'</h2></div>'+action+'</div>'}
function jump(i,t){return '<button class="textbtn" data-page="'+i+'">'+t+' →</button>'}
function panel(k,t,body,i){return '<section class="panel"><div class="panelhead"><div><div class="eyebrow">'+k+'</div><h2>'+t+'</h2></div>'+jump(i,'查看全部')+'</div>'+body+'</section>'}
function card(c){let rs=sorted().filter(r=>r.company===c&&material(r));return '<button class="company" data-company="'+c+'"><div class="cohead">'+window.stockLogo(window.watchStocks.find(stock=>stock.code===c))+'<div><b>'+displayName(c)+'</b><span class="code">'+c+'.HK</span></div></div><div class="cobody"><span>重大消息 <strong>'+rs.length+'</strong></span><span>↗</span></div></button>'}
function row(r){return '<button class="feedrow" data-id="'+esc(r.id)+'"><div class="meta"><b>'+displayName(r.company)+'</b><span class="pill">'+esc(r.type)+'</span>'+badge(r)+'<span class="stamp">'+esc(r.date)+'</span></div><h3>'+esc(r.title)+'</h3><p>'+esc(r.summary)+'</p></button>'}
function study(r){return '<button class="study" data-id="'+esc(r.id)+'"><div class="meta"><b>'+displayName(r.company)+' · '+r.company+'.HK</b></div><p style="margin-top:6px">'+esc(r.next)+'</p></button>'}
const empty=t=>'<div class="empty">'+t+'</div>';
function select(key,label,opts){return '<label>'+label+'<select data-filter="'+key+'"><option value="">全部</option>'+opts.map(v=>'<option value="'+esc(v)+'" '+(filters[key]===v?'selected':'')+'>'+esc(names[v]||v)+'</option>').join('')+'</select></label>'}
function controls(){const opts=k=>[...new Set(records.map(r=>r[k]).filter(Boolean))];return '<div class="filters">'+select('company','公司',[...new Set([...codes,...records.map(r=>r.company)])])+select('type','消息類型',opts('type'))+select('period','影響期間',opts('period'))+select('status','資料狀態',['已確認','待核實'])+select('importance','重要性',['高','中','低'])+['from','to'].map((k,i)=>'<label>發布日期'+(i?'至':'由')+'<input type="date" data-filter="'+k+'" value="'+esc(filters[k]||'')+'"></label>').join('')+'<button class="textbtn" id="reset">重設</button></div>'}
function selected(){return sorted().filter(r=>Object.entries(filters).every(([k,v])=>!v||(k==='from'?r.date>=v:k==='to'?r.date<=v:k==='status'?(confirmed(r)?'已確認':'待核實')===v:r[k]===v)))}
function info(r,fields){return '<article class="detailrow"><div class="meta"><b>'+displayName(r.company)+'</b>'+badge(r)+'<span class="stamp">'+esc(r.date)+'</span></div><h3>'+esc(r.title)+'</h3><div class="grid2">'+fields.map(([title,key])=>'<div><h4>'+title+'</h4><p>'+esc(r[key]||'尚未記錄')+'</p></div>').join('')+'</div><button class="textbtn" data-id="'+esc(r.id)+'" data-mode="'+({3:'price',8:'decision'}[page]||'view')+'">'+({3:'按收市價更新分析',8:'更新投資決策'}[page]||'查看紀錄')+' →</button></article>'}
function draw(){
 q('#nav').innerHTML=navs.map((n,i)=>'<button data-page="'+i+'" class="'+(i===page?'on':'')+'">'+icon(i)+n+'</button>').join('');q('#crumb').textContent=navs[page];q('#hero').style.display=page?'none':'flex';
 const all=sorted(),latest=all.filter(r=>codes.includes(r.company)&&material(r)),v=q('#view');q('#herodate').textContent='最近消息日期  /  '+(latest[0]?.date||'—').replaceAll('-','.');
 let body='';const cards='<div class="cards">'+codes.map(card).join('')+'</div>';
 q('#add').disabled=!window.watchReady||codes.length===0;
 if(page===10){body='<div class="pagehead"><div class="eyebrow">'+sub[page]+'</div><h1>'+navs[page]+'</h1></div>'+window.renderWatchlist()}
 else if(page===0){body=head('COMPANY WATCHLIST','關注公司',jump(10,'管理名單'))+(codes.length?cards:empty(window.watchReady?'暫無啟用網站追蹤的股票。':'正在讀取監察名單…'))+'<div class="contentgrid space">'+panel('MATERIAL UPDATES','最新重大消息',latest.slice(0,5).map(row).join('')||empty('未有重大消息'),1)+panel('RESEARCH AGENDA','下一輪研究',latest.filter(r=>r.next).slice(0,4).map(study).join('')||empty('暫無研究項目'),9)+'</div>'}
 else{let rs=selected();body='<div class="pagehead"><div class="eyebrow">'+sub[page]+'</div><h1>'+navs[page]+'</h1></div>';
 if(page===2){body+=cards;let c=filters.company||codes[0];rs=all.filter(r=>r.company===c);body+=head('COMPANY PROFILE',c?displayName(c)+' · '+c+'.HK':'暫無追蹤公司',jump(10,'管理名單'))+'<section class="panel">'+(rs.map(r=>info(r,[['基本面','fundamental'],['估值觀察','valuation']])).join('')||empty('暫無紀錄'))+'</section>'}
 else{body+=controls();if(page===1)rs=rs.filter(material);if(page===4)rs.sort((a,b)=>(b.eventDate||b.date).localeCompare(a.eventDate||a.date));if(page===7)rs=rs.filter(r=>!confirmed(r));if(page===9)rs=rs.filter(r=>r.next);body+='<div class="note">'+rs.length+' 筆紀錄</div><section class="panel" style="margin-top:8px">'+(rs.map(r=>page===1||page===7?row(r):page===4?'<div class="detailrow"><span class="eyebrow">事件日期 '+esc(r.eventDate||r.date)+'</span>'+row(r)+'</div>':info(r,({3:[['基本面變化','fundamental'],['估值分析','valuation'],['最近記錄收市價（港元）','close'],['價格日期','priceDate']],5:[[confirmed(r)?'已確認事實':'待核實內容','summary'],['分析推論','inference']],6:[['潛在股價影響','impact'],['主要風險','risk']],8:[['投資決策','decision'],['決策理由','decisionReason']],9:[['下一輪研究','next'],['觀察風險','risk']]}[page]))).join('')||empty(page===7?'目前沒有待核實事項。':'沒有符合條件的紀錄。'))+'</section>'}}
 const enabledAlerts = new Set(window.watchStocks.filter(stock=>stock.alerts).map(stock=>stock.code));
 const alerts = page===0 ? all.filter(r=>enabledAlerts.has(r.company)&&material(r)).slice(0,5) : [];
 const alertPanel = alerts.length ? '<section class="panel"><h2>監察名單提醒</h2>'+alerts.map(row).join('')+'</section>' : '';
 v.innerHTML=window.researchOffline.render()+alertPanel+body;
}
window.refreshWatch=()=>window.researchOffline.refresh('watchlist');
window.saveRecord=(record,base)=>window.researchOffline.put('records',record,base);
function updateWorkspace(){
  const store=window.researchOffline.state;
  window.watchReady=store.ready;
  if(store.ready){useWatch(store.watchlist);window.records=store.records;}
  draw();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-page],[data-company],[data-id],#reset');if(!b||b.closest('#detail'))return;if(b.dataset.page!==undefined)navTo(+b.dataset.page);else if(b.dataset.company)navTo(2,{company:b.dataset.company});else if(b.id==='reset'){filters={};draw()}else{const r=records.find(r=>r.id===b.dataset.id);if(r)openRecord(r,b.dataset.mode||'view')}});
document.addEventListener('change',e=>{if(e.target.dataset.filter){filters[e.target.dataset.filter]=e.target.value;draw()}});
q('#menu').onclick=()=>document.body.classList.toggle('navopen');q('#add').onclick=()=>newRecord();
function paper(){const news=sorted().filter(r=>codes.includes(r.company)&&material(r));const included=codes.length>4?[...new Set([...news.map(r=>r.company),...codes])].slice(0,4):codes;const cut=(s,n)=>esc(String(s||'尚未記錄').slice(0,n));q('#paper').innerHTML='<h1>港股重大消息及投資研究摘要</h1><small>'+(codes.length>4?'最近重大消息涵蓋首四家追蹤公司':'每家公司最近一項重大消息')+'　｜　列印日期 '+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Macau'}).format(new Date())+'</small>'+included.map(c=>{const r=news.find(r=>r.company===c);return '<section><h3>'+displayName(c)+' · '+c+'.HK</h3>'+(r?'<b>'+cut(r.title,70)+'</b>　'+esc(r.date)+' · '+(confirmed(r)?'已確認':'待核實')+'<p>摘要　'+cut(r.summary,95)+'</p><p>推論　'+cut(r.inference,75)+'</p><p>風險　'+cut(r.risk,65)+'</p><p>跟進　'+cut(r.next,65)+'</p>':'尚無重大紀錄')+'</section>'}).join('')}
q('#print').onclick=()=>{paper();window.print()};window.addEventListener('beforeprint',paper);draw();window.researchOffline.start(updateWorkspace);
