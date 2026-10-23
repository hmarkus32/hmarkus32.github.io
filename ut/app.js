'use strict';
const $=s=>document.querySelector(s);const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY='ut_pc';
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
async function decrypt(pc){const e=await (await fetch('data.enc.json',{cache:'no-store'})).json();
 const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pc),'PBKDF2',false,['deriveKey']);
 const k=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b64(e.salt),iterations:e.iter},km,{name:'AES-GCM',length:256},false,['decrypt']);
 const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv)},k,b64(e.ct));return JSON.parse(new TextDecoder().decode(pt));}
async function unlock(pc,remember){$('#err').textContent='';$('#go').textContent='Unlocking…';
 try{const d=await decrypt(pc);if(remember)localStorage.setItem(KEY,pc);render(d);$('#lock').style.opacity=0;setTimeout(()=>$('#lock').remove(),400);}
 catch(x){localStorage.removeItem(KEY);$('#err').textContent='Wrong passcode';$('#go').textContent='Unlock';}}
$('#go').onclick=()=>unlock($('#pw').value,$('#rem').checked);
$('#pw').addEventListener('keydown',e=>{if(e.key==='Enter')unlock($('#pw').value,$('#rem').checked);});
const saved=localStorage.getItem(KEY);if(saved)unlock(saved,true);
const usd=n=>n===null?'unknown':'$'+n.toLocaleString('en-US',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});
const tone=s=>s==='Paid'?'success':s==='Unpaid'?'danger':s==='Unknown'?'warning':'';
function renderDetails(D){const F={p:'All',m:'All',c:'All',s:'All'};const R=D.rows.map(r=>({m:r[0],p:r[1],c:r[2],item:r[3],due:r[4],paid:r[5],dir:r[6],st:r[7],date:r[8],note:r[9]}));
 const sh=o=>o.replace(' Mountain',' Mtn');
 const chips=(k,opts)=>`<div class="chips" data-k="${k}">${opts.map(o=>`<button class="chip${F[k]===o?' on':''}" data-v="${esc(o)}">${esc(sh(o))}</button>`).join('')}</div>`;
 const sel=(k,opts,l)=>`<select data-k="${k}" aria-label="${l}">${opts.map(o=>`<option value="${o}">${o==='All'?l+': All':o}</option>`).join('')}</select>`;
 $('#det').innerHTML=`<h1>${esc(D.title)}</h1><div class="sub">As of ${esc(D.asOf)} · unknown means not verified</div>
 <div class="grid2" style="margin-top:18px">${D.metrics.map(m=>`<div class="card metric"><div class="v" style="color:var(--${m.tone==='danger'?'bad':'ok'})">${esc(m.value)}</div><div class="l">${esc(m.label)}</div><div class="d">${esc(m.detail||'')}</div></div>`).join('')}</div>
 <h2>Needs attention</h2><div class="card">${D.flags.map(f=>`<div class="row"><div class="main"><div class="k">${esc(f.p)}</div><div class="t">${esc(f.t)}</div><div class="d">${esc(f.d)}</div></div><span class="pill ${f.tone}">${esc(f.s)}</span></div>`).join('')}</div>
 <h2>Property</h2>${chips('p',['All',...D.props])}
 <h2>Cash flow</h2><div class="card"><div class="leg"><span><i style="background:var(--blue)"></i>In</span><span><i style="background:var(--yel)"></i>Out</span><span><i style="background:var(--cyan)"></i>Net</span></div><div class="chart" id="chart"></div><div class="d" style="color:var(--t3);font-size:11px;margin-top:8px">${esc(D.chartNote)}</div></div>
 <h2 id="ph">Payments</h2>${chips('s',['All','Paid','Unpaid','Scheduled','Unknown'])}
 <div class="grid2" style="margin:10px 0">${sel('m',['All','Aug','Sep','Oct','Nov'],'Month')}${sel('c',['All','Rent','Utilities','Mortgage','HOA','Deposit'],'Category')}</div>
 <div class="card" id="list"></div>
 <details style="margin-top:20px"><summary>Data gaps</summary><div class="d sub">${esc(D.gaps)}</div></details>
 <button class="link" id="lockbtn">Lock and forget on this device</button>`;
 const months=['Aug','Sep','Oct'];const ch=$('#chart');
 ch.innerHTML=months.map(m=>`<div class="grp"><div class="net" data-n="${m}"></div><div class="bars"><div class="bar" style="background:var(--blue)" data-b="${m}in"></div><div class="bar" style="background:var(--yel)" data-b="${m}out"></div><div class="bar" style="background:var(--cyan)" data-b="${m}net"></div></div><div class="lab">${m}</div></div>`).join('');
 function update(){const props=F.p==='All'?D.props:[F.p];
  const sum=(m,d)=>R.filter(e=>e.m===m&&e.dir===d&&props.includes(e.p)&&e.paid!==null).reduce((a,e)=>a+e.paid,0);
  const v=months.map(m=>({m,i:sum(m,'in'),o:sum(m,'out')}));const mx=Math.max(1,...v.map(x=>Math.max(x.i,x.o)));
  v.forEach(x=>{const n=x.i-x.o;ch.querySelector(`[data-b="${x.m}in"]`).style.height=(x.i/mx*100)+'%';ch.querySelector(`[data-b="${x.m}out"]`).style.height=(x.o/mx*100)+'%';
   const nb=ch.querySelector(`[data-b="${x.m}net"]`);nb.style.height=(Math.abs(n)/mx*100)+'%';nb.style.opacity=n<0?.45:1;
   ch.querySelector(`[data-n="${x.m}"]`).textContent=(n<0?'−$':'$')+Math.round(Math.abs(n)).toLocaleString();});
  const rows=R.filter(e=>(F.p==='All'||e.p===F.p)&&(F.m==='All'||e.m===F.m)&&(F.c==='All'||e.c===F.c)&&(F.s==='All'||e.st===F.s));
  $('#ph').textContent=`Payments (${rows.length})`;
  $('#list').innerHTML=rows.map((e,i)=>`<div class="row" style="animation-delay:${Math.min(i*25,300)}ms"><div class="main"><div class="k">${e.m} · ${esc(e.p)} · ${e.c}</div><div class="t">${esc(e.item)}</div><div class="d">Due ${usd(e.due)}${e.date?' · '+esc(e.date):''}. ${esc(e.note)}</div></div><div><div class="amt" style="color:${e.dir==='in'?'var(--t)':'var(--t2)'}">${e.dir==='in'?'+':'−'}${usd(e.paid)}</div><span class="pill ${tone(e.st)}">${e.st}</span></div></div>`).join('')||'<div class="d">Nothing matches these filters.</div>';}
 document.querySelectorAll('.chips').forEach(g=>g.addEventListener('click',ev=>{const b=ev.target.closest('.chip');if(!b)return;F[g.dataset.k]=b.dataset.v;g.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));update();}));
 document.querySelectorAll('select').forEach(s=>s.onchange=()=>{F[s.dataset.k]=s.value;update();});
 $('#lockbtn').onclick=()=>{localStorage.removeItem(KEY);location.reload();};
 requestAnimationFrame(update);}

function renderEquity(D){
 const R=D.rows.map(r=>({m:r[0],p:r[1],c:r[2],item:r[3],due:r[4],paid:r[5],dir:r[6],st:r[7],date:r[8],note:r[9]}));
 const props=D.props||[];
 const selected=new Set(props);
 const colors={Principal:'#3e8cff',Interest:'#f5c542',Escrow:'#2fd3c4',Utilities:'#ff9f43',HOA:'#a78bfa',Expenses:'#ff5d5d',Revenue:'#34d27b'};
 const sh=o=>o.replace(' Mountain',' Mtn');
 let tipK=null,cur={costs:[],total:0};
 const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const now=new Date(),nowK=now.getFullYear()*12+now.getMonth();
 const mk=m=>{const i=MN.indexOf(m);return i<0?null:(i>now.getMonth()+2?now.getFullYear()-1:now.getFullYear())*12+i;};
 R.forEach(e=>e.k=mk(e.m));
 const avail=[...new Set(R.filter(e=>e.paid!==null&&e.k!==null&&e.k<=nowK).map(e=>e.k))].sort((a,b)=>b-a);
 let month=avail.includes(nowK)||!avail.length?nowK:avail[0];
 const minK=avail.length?avail[avail.length-1]:nowK;
 const mLabel=k=>new Date(Math.floor(k/12),k%12,1).toLocaleString('en-US',{month:'long'}).toUpperCase()+(Math.floor(k/12)!==now.getFullYear()?' '+Math.floor(k/12):'');
 const KS=['Principal','Interest','Escrow','Utilities','HOA','Expenses','Mortgage'];
 function update(){
  const sel=[...selected];
  const rows=R.filter(e=>sel.includes(e.p)&&e.paid!==null&&e.k===month);
  const sum=pred=>rows.filter(pred).reduce((a,e)=>a+(e.paid||0),0);
  const costs=[
   {k:'Principal',v:sum(e=>e.dir==='out'&&e.c==='Mortgage'&&/principal/i.test(e.item))},
   {k:'Interest',v:sum(e=>e.dir==='out'&&e.c==='Mortgage'&&/interest/i.test(e.item))},
   {k:'Escrow',v:sum(e=>e.dir==='out'&&e.c==='Mortgage'&&/escrow/i.test(e.item))},
   {k:'Utilities',v:sum(e=>e.dir==='out'&&e.c==='Utilities')},
   {k:'HOA',v:sum(e=>e.dir==='out'&&e.c==='HOA')},
   {k:'Expenses',v:sum(e=>e.dir==='out'&&!['Mortgage','Utilities','HOA'].includes(e.c))}
  ].filter(x=>x.v>0);
  const mortTotal=sum(e=>e.dir==='out'&&e.c==='Mortgage');
  const mortSplit=costs.filter(c=>['Principal','Interest','Escrow'].includes(c.k)).reduce((a,c)=>a+c.v,0);
  if(mortTotal>mortSplit) costs.push({k:'Mortgage',v:mortTotal-mortSplit});
  const revenue=sum(e=>e.dir==='in');
  const totalCost=costs.reduce((a,c)=>a+c.v,0);
  const scale=Math.max(totalCost,revenue,1);
  KS.forEach(k=>{const c=costs.find(x=>x.k===k),el=$(`#eq-cost [data-k="${k}"]`);el.style.width=(c?c.v/scale*100:0)+'%';el.style.minWidth=c?'':'0';el.title=c?`${k}: ${usd(c.v)}`:'';});
  const rv=$('#eq-rev .seg');rv.style.width=(revenue/scale*100)+'%';rv.style.minWidth=revenue?'':'0';rv.title=`Revenue: ${usd(revenue)}`;
  $('#eq-mt').textContent=mLabel(month);$('#eq-prev').disabled=month<=minK;$('#eq-next').disabled=month>=nowK;
  $('#eq-cost-sum').textContent=usd(totalCost);
  $('#eq-rev-sum').textContent=usd(revenue);
  const leg=costs.filter(c=>c.k!=='Mortgage').map(c=>`<span data-k="${c.k}" style="cursor:pointer"><i style="background:${colors[c.k]||'#888'}"></i>${c.k}</span>`).join('');
  $('#eq-leg').innerHTML=leg;
  cur={costs,total:totalCost};showTip();clearTimeout(update.t);update.t=setTimeout(showTip,620);
  const net=revenue-totalCost;
  $('#eq-net').textContent=(net>=0?'+':'')+usd(net);
  $('#eq-net').style.color=net>=0?'var(--ok)':'var(--bad)';
 }
 function showTip(){const t=$('#eq-tip');const c=tipK&&cur.costs.find(x=>x.k===tipK);
  if(!c){tipK=null;t.style.opacity=0;t.style.transform='translateY(4px)';return;}
  const pct=cur.total?Math.round(c.v/cur.total*100):0;
  t.innerHTML=`<b>${esc(c.k)}</b> ${usd(c.v)} · ${pct}%`;
  const card=$('#eq-cc').getBoundingClientRect(),bar=$('#eq-cost').getBoundingClientRect();
  const a=$(`#eq-cost [data-k="${c.k}"]`)||$(`#eq-leg [data-k="${c.k}"]`),r=a.getBoundingClientRect();
  const w=t.offsetWidth;const x=Math.max(8,Math.min(r.left+r.width/2-card.left-w/2,card.width-w-8));
  t.style.left=x+'px';t.style.top=(bar.bottom-card.top+6)+'px';t.style.opacity=1;t.style.transform='translateY(0)';
 }
 $('#eq').innerHTML=`<h1>Equity</h1><div class="sub">Monthly cash flow · same scale on both bars</div>
 <h2>Properties</h2><div class="chips" id="eq-chips">${props.map(p=>`<button class="chip on" data-p="${esc(p)}">${esc(sh(p))}</button>`).join('')}</div>
 <div class="mnav" id="eq-mn"><button id="eq-prev" aria-label="Previous month">‹</button><button id="eq-mt" class="mt"></button><button id="eq-next" aria-label="Next month">›</button>
 <div class="mdd" id="eq-dd">${avail.map(k=>`<button data-m="${k}">${mLabel(k)}</button>`).join('')}</div></div>
 <h2>Costs</h2><div class="card" id="eq-cc" style="position:relative"><div class="eq-num" id="eq-cost-sum"></div><div class="leg2" id="eq-leg" style="margin:8px 0 0"></div><div class="hbar" id="eq-cost" style="cursor:pointer">${KS.map(k=>`<div class="seg" data-k="${k}" style="width:0;min-width:0;background:${colors[k]||'#888'}"></div>`).join('')}</div>
 <div id="eq-tip" style="position:absolute;left:0;top:0;opacity:0;pointer-events:none;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease;background:var(--line);color:var(--t);font-size:12px;padding:6px 10px;border-radius:10px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.45);z-index:5"></div></div>
 <h2>Revenue</h2><div class="card"><div class="eq-num" id="eq-rev-sum"></div><div class="hbar" id="eq-rev"><div class="seg" style="width:0;min-width:0;background:${colors.Revenue}"></div></div></div>
 <div class="card" style="margin-top:8px"><div class="k">Net</div><div class="eq-num" id="eq-net" style="font-size:22px"></div></div>`;
 $('#eq-cc').addEventListener('click',ev=>{const el=ev.target.closest('[data-k]');if(!el)return;tipK=tipK===el.dataset.k?null:el.dataset.k;showTip();});
 document.addEventListener('pointerdown',ev=>{if(tipK&&!ev.target.closest('#eq-cc [data-k],#eq-mn')){tipK=null;showTip();}
  if(!ev.target.closest('#eq-mn'))$('#eq-dd').classList.remove('open');});
 const go=k=>{if(k<minK||k>nowK)return;month=k;$('#eq-dd').classList.remove('open');update();};
 $('#eq-prev').onclick=()=>go(month-1);$('#eq-next').onclick=()=>go(month+1);
 $('#eq-mt').onclick=()=>{const d=$('#eq-dd');d.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.m===month));d.classList.toggle('open');};
 $('#eq-dd').onclick=ev=>{const b=ev.target.closest('[data-m]');if(b)go(+b.dataset.m);};
 document.querySelectorAll('#eq-chips .chip').forEach(b=>b.onclick=()=>{
  const p=b.dataset.p;
  if(selected.has(p)){if(selected.size>1)selected.delete(p);}else selected.add(p);
  b.classList.toggle('on',selected.has(p));
  update();
 });
 update();
}

function render(D){const now=new Date();const key=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const keys=Object.keys(D.home).sort();const k=D.home[key]?key:keys[keys.length-1];
 const [y,m]=k.split('-').map(Number);const label=new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
 const stale=k!==key;const H=D.home[k];
 const icon=s=>s==='ok'?'<span class="ic ok">✓</span>':s==='x'?'<span class="ic bad">✕</span>':'<span class="ic va">–</span>';
 $('#app').innerHTML=`<div class="tabs"><button class="tab on" data-t="home">Home</button><button class="tab" data-t="det">Details</button><button class="tab" data-t="eq">Equity</button></div>
 <div id="home" class="view"><div class="sub" style="margin-top:14px">${stale?'Latest data':'This month'}</div><h1>${esc(label)}</h1>
 ${stale?`<div class="sub" style="color:var(--warn)">No data yet for ${new Date().toLocaleString('en-US',{month:'long'})}; showing ${esc(label)}</div>`:''}
 <div class="card" style="margin-top:16px;padding:4px 16px">${H.map((h,i)=>`<button class="prop" data-i="${i}">${icon(h.state)}<span class="pn">${esc(h.p)}</span><span class="ps ${h.state}">${esc(h.sum)}</span><span class="chev">›</span></button>`).join('')}</div></div>
 <div id="det" class="view" style="display:none"></div>
 <div id="eq" class="view" style="display:none"></div>
 <div id="scrim"></div><div id="sheet"><div class="grab"></div><div id="sc"></div></div>`;
 renderDetails(D);
 renderEquity(D);
 document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  ['home','det','eq'].forEach(v=>{const el=$('#'+v);el.style.display=v===t.dataset.t?'block':'none';if(v===t.dataset.t){el.style.animation='none';el.offsetHeight;el.style.animation='';}});window.scrollTo({top:0});});
 const close=()=>{$('#sheet').classList.remove('open');$('#scrim').classList.remove('open');};
 $('#scrim').onclick=close;
 document.querySelectorAll('.prop').forEach(b=>b.onclick=()=>{const h=H[b.dataset.i];
  const head=h.state==='x'?'What\'s owed':h.state==='ok'?'What was paid':'Status';
  $('#sc').innerHTML=`<div class="k">${esc(label)}</div><h2 style="margin:4px 0 2px;font-size:22px;text-transform:none;letter-spacing:-.01em;color:var(--t)">${esc(h.p)}</h2><div class="sub">${head} · ${esc(h.sum)}</div>
  <div style="margin-top:12px">${h.items.map(it=>`<div class="row"><div class="main"><div class="t">${esc(it.t)}</div><div class="d">${it.w?esc(it.w)+' · ':''}${esc(it.n)}</div></div><div class="amt">${esc(it.a)}</div></div>`).join('')}</div>
  <button class="btn" style="margin-top:16px;max-width:none" id="cls">Close</button>`;
  $('#cls').onclick=close;$('#scrim').classList.add('open');$('#sheet').classList.add('open');});
 let sy=null;const sh=$('#sheet');sh.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;},{passive:true});
 sh.addEventListener('touchend',e=>{if(sy!==null&&e.changedTouches[0].clientY-sy>60)close();sy=null;});
 $('#app').classList.add('show');}
