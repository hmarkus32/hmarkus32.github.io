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

function render(D){const now=new Date();const key=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const keys=Object.keys(D.home).sort();const k=D.home[key]?key:keys[keys.length-1];
 const [y,m]=k.split('-').map(Number);const label=new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
 const stale=k!==key;const H=D.home[k];
 const icon=s=>s==='ok'?'<span class="ic ok">✓</span>':s==='x'?'<span class="ic bad">✕</span>':'<span class="ic va">–</span>';
 $('#app').innerHTML=`<div class="tabs"><button class="tab on" data-t="home">Home</button><button class="tab" data-t="det">Details</button></div>
 <div id="home" class="view"><div class="sub" style="margin-top:14px">${stale?'Latest data':'This month'}</div><h1>${esc(label)}</h1>
 ${stale?`<div class="sub" style="color:var(--warn)">No data yet for ${new Date().toLocaleString('en-US',{month:'long'})}; showing ${esc(label)}</div>`:''}
 <div class="card" style="margin-top:16px;padding:4px 16px">${H.map((h,i)=>`<button class="prop" data-i="${i}">${icon(h.state)}<span class="pn">${esc(h.p)}</span><span class="ps ${h.state}">${esc(h.sum)}</span><span class="chev">›</span></button>`).join('')}</div></div>
 <div id="det" class="view" style="display:none"></div>
 <div id="scrim"></div><div id="sheet"><div class="grab"></div><div id="sc"></div></div>`;
 renderDetails(D);
 document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  ['home','det'].forEach(v=>{const el=$('#'+v);el.style.display=v===t.dataset.t?'block':'none';if(v===t.dataset.t){el.style.animation='none';el.offsetHeight;el.style.animation='';}});window.scrollTo({top:0});});
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
