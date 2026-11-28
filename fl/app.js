'use strict';
const $=s=>document.querySelector(s);const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY='fl_pc';
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
async function decrypt(pc){const e=await (await fetch('data.enc.json',{cache:'no-store'})).json();
 const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pc),'PBKDF2',false,['deriveKey']);
 const k=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b64(e.salt),iterations:e.iter},km,{name:'AES-GCM',length:256},false,['decrypt']);
 const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv)},k,b64(e.ct));return JSON.parse(new TextDecoder().decode(pt));}
let curPc=null;
async function unlock(pc,remember){$('#err').textContent='';$('#go').textContent='Unlocking…';
 try{const d=await decrypt(pc);curPc=pc;if(remember)localStorage.setItem(KEY,pc);render(d);$('#lock').style.opacity=0;setTimeout(()=>$('#lock').remove(),400);}
 catch(x){curPc=null;localStorage.removeItem(KEY);$('#err').textContent='Wrong passcode';$('#go').textContent='Unlock';}}
async function refreshData(btn){if(!curPc){location.reload();return;}
 btn.disabled=true;btn.textContent='Refreshing…';
 try{if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}catch(e){}}
  const d=await decrypt(curPc);render(d);}
 catch(x){btn.disabled=false;btn.textContent='Refresh failed — tap to retry';}}
$('#go').onclick=()=>unlock($('#pw').value,$('#rem').checked);
$('#pw').addEventListener('keydown',e=>{if(e.key==='Enter')unlock($('#pw').value,$('#rem').checked);});
const saved=localStorage.getItem(KEY);if(saved)unlock(saved,true);
// --- Face ID unlock (WebAuthn passkey + PRF). The passcode itself never changes:
// data.enc.json stays encrypted with it. Face ID only unwraps a sealed copy of the
// passcode stored in this browser's local storage; the sealing key comes from the
// passkey's PRF output, which the authenticator releases only after Face ID.
const BIO='fl_bio';
const b64enc=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
async function kekFromPrf(prf){const km=await crypto.subtle.importKey('raw',prf,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('fl-dashboard'),info:new TextEncoder().encode('faceid-wrap-v1')},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function prfGet(rec){const a=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:'public-key',id:b64(rec.id)}],userVerification:'required',extensions:{prf:{eval:{first:b64(rec.salt)}}}}});
 const prf=a.getClientExtensionResults().prf&&a.getClientExtensionResults().prf.results&&a.getClientExtensionResults().prf.results.first;
 if(!prf)throw new Error('prf unavailable');return new Uint8Array(prf);}
function showBio(){const has=!!localStorage.getItem(BIO);const b=$('#bio');if(b)b.style.display=has?'':'none';
 const st=$('#bioSetup');if(st)st.style.display=(!has&&bioCapable)?'':'none';}
let bioCapable=false;
async function bioEnroll(){$('#err').style.color='';const pc=$('#pw').value;
 if(!pc){$('#err').textContent='Enter your passcode above first, then tap Enable Face ID';return;}
 $('#err').textContent='';try{await decrypt(pc);}catch(x){$('#err').textContent='Wrong passcode';return;}
 try{const salt=crypto.getRandomValues(new Uint8Array(32));
  const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'Florida Dashboard',id:location.hostname},user:{id:crypto.getRandomValues(new Uint8Array(16)),name:'dashboard',displayName:'Dashboard'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'required'},extensions:{prf:{eval:{first:salt}}}}});
  const rec={id:b64enc(cred.rawId),salt:b64enc(salt)};
  let ext=cred.getClientExtensionResults().prf;let prf=ext&&ext.results&&ext.results.first;
  if(!prf)prf=await prfGet(rec);else prf=new Uint8Array(prf);
  const kek=await kekFromPrf(prf);const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},kek,new TextEncoder().encode(pc));
  rec.iv=b64enc(iv);rec.ct=b64enc(ct);localStorage.setItem(BIO,JSON.stringify(rec));localStorage.removeItem(KEY);
  showBio();$('#err').style.color='var(--ok)';$('#err').textContent='Face ID is on — use the Face ID button next time';
 }catch(x){$('#err').textContent='Face ID setup was cancelled or is not available here';}}
async function bioUnlock(){$('#err').style.color='';$('#err').textContent='';
 try{const rec=JSON.parse(localStorage.getItem(BIO));const prf=await prfGet(rec);const kek=await kekFromPrf(prf);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(rec.iv)},kek,b64(rec.ct));
  unlock(new TextDecoder().decode(pt),false);
 }catch(x){$('#err').textContent='Face ID unlock failed — use your passcode';}}
if(window.PublicKeyCredential){PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(a=>{bioCapable=!!a;showBio();});}
const bb=$('#bio');if(bb)bb.onclick=bioUnlock;const bs=$('#bioSetup');if(bs)bs.onclick=bioEnroll;showBio();
const usd=n=>n===null||n===undefined?'unknown':(n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});
const tone=s=>s==='Paid'?'success':s==='Unpaid'?'danger':s==='Unknown'?'warning':'';
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const toneS=s=>s==='Paid'?'success':s==='Overdue?'||s==='Unpaid'?'danger':s==='Unknown'||s==='Pending'?'warning':'';
const rowsOf=D=>D.rows.map(r=>({m:r[0],p:r[1],c:r[2],item:r[3],due:r[4],paid:r[5],dir:r[6],st:r[7],date:r[8],note:r[9],y:r[10],k:r[10]*12+MN.indexOf(r[0])}));
const kLabel=k=>MN[k%12]+' '+Math.floor(k/12);
const fmtD=s=>{if(!s)return'';const d=new Date(s+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');};
const isTax=e=>/^Tax write-off/.test(e.c);

// ---------------- Home ----------------
function renderHome(D){const now=new Date();const key=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const keys=Object.keys(D.home).sort();const k=D.home[key]?key:keys[keys.length-1];
 const [y,m]=k.split('-').map(Number);const label=new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
 const H=D.home[k];const icon=s=>s==='ok'?'<span class="ic ok">✓</span>':s==='x'?'<span class="ic bad">✕</span>':'<span class="ic va">–</span>';
 const today=now.toISOString().slice(0,10);
 const next=D.stays.filter(s=>s.checkout>=today).slice(0,4);
 const om=Object.keys(D.occ).sort();const nowM=key;const idx=om.indexOf(nowM);
 const win=om.filter(x=>x>=shiftM(nowM,-6)&&x<=shiftM(nowM,6));
 $('#home').innerHTML=`<div class="sub" style="margin-top:14px">${k===key?'This month':'Latest data'}</div><h1>${esc(label)}</h1>
 <div class="card" style="margin-top:16px;padding:4px 16px">${H.map((h,i)=>`<button class="prop" data-i="${i}">${icon(h.state)}<span class="pn">${esc(D.title)}</span><span class="ps ${h.state}">${esc(h.sum)}</span><span class="chev">›</span></button>`).join('')}</div>
 <div class="grid2" style="margin-top:12px">${D.metrics.map(x=>`<div class="card metric"><div class="v" style="color:var(--${x.tone==='danger'?'bad':'ok'})">${esc(x.value)}</div><div class="l">${esc(x.label)}</div><div class="d">${esc(x.detail||'')}</div></div>`).join('')}</div>
 <h2>Needs attention</h2><div class="card">${D.flags.map(f=>`<div class="row"><div class="main"><div class="t">${esc(f.t)}</div><div class="d">${esc(f.d)}</div></div><span class="pill ${f.tone}">${esc(f.s)}</span></div>`).join('')}</div>
 <h2>Upcoming bills</h2><div class="card">${D.bills.map(b=>`<div class="row"><div class="main"><div class="t">${esc(b.t)}</div><div class="d">${esc(b.due)} · ${esc(b.how)}</div></div><div class="amt" style="color:${b.tone==='danger'?'var(--bad)':b.tone==='warning'?'var(--warn)':'var(--t)'}">${b.a===null?'varies':usd(b.a)}</div></div>`).join('')}</div>
 <h2>Next stays</h2><div class="card">${next.map(s=>`<div class="row"><div class="main"><div class="k">${esc(s.channel)} · ${s.nights} nights</div><div class="t">${esc(s.guest)}</div><div class="d">${fmtD(s.checkin)} – ${fmtD(s.checkout)}${s.poolHeat!=='none'?' · pool heat '+s.poolHeat:''}</div></div><div><div class="amt">${s.paidAmount!=null?usd(s.paidAmount):s.expectedPayout!=null?usd(s.expectedPayout):'—'}</div><span class="pill ${toneS(s.payoutStatus)}">${esc(s.payoutStatus)}</span></div></div>`).join('')||'<div class="d">No upcoming stays</div>'}</div>
 <h2>Occupancy by month</h2><div class="card"><div class="occ">${win.map(x=>{const o=D.occ[x];return `<div class="c"><div class="p">${Math.round(o.occ*100)}%</div><div class="b${x>nowM?' f':''}" style="height:${Math.max(2,o.occ*100)}%"></div><div class="l">${MN[+x.slice(5)-1]}</div></div>`;}).join('')}</div>
 <div class="d" style="color:var(--t3);font-size:11px;margin-top:8px">Booked nights ÷ days. Lighter bars are future months (booked so far). Avg nightly rate: ${win.filter(x=>D.occ[x].adr).map(x=>MN[+x.slice(5)-1]+' $'+D.occ[x].adr).join(', ')}</div></div>
 <details style="margin-top:20px"><summary>Data gaps</summary><div class="d sub">${esc(D.gaps)}</div></details>
 <button class="link" id="refreshbtn" style="display:block;margin:6px auto 2px">↻ Refresh</button><button class="link" id="lockbtn" style="display:block;margin:0 auto">Lock and forget on this device</button>`;
 const close=()=>{$('#sheet').classList.remove('open');$('#scrim').classList.remove('open');};
 $('#scrim').onclick=close;
 document.querySelectorAll('.prop').forEach(b=>b.onclick=()=>{const h=H[b.dataset.i];
  $('#sc').innerHTML=`<div class="k">${esc(label)}</div><h2 style="margin:4px 0 2px;font-size:22px;text-transform:none;letter-spacing:-.01em;color:var(--t)">${esc(D.title)}</h2><div class="sub">${esc(h.sum)}</div>
  <div style="margin-top:12px">${h.items.map(it=>`<div class="row"><div class="main"><div class="t">${esc(it.t)}</div><div class="d">${it.w?esc(it.w)+' · ':''}${esc(it.n)}</div></div><div class="amt">${esc(it.a)}</div></div>`).join('')}</div>
  <button class="btn" style="margin-top:16px;max-width:none" id="cls">Close</button>`;
  $('#cls').onclick=close;$('#scrim').classList.add('open');$('#sheet').classList.add('open');});
 let sy=null;const sh=$('#sheet');sh.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;},{passive:true});
 sh.addEventListener('touchend',e=>{if(sy!==null&&e.changedTouches[0].clientY-sy>60)close();sy=null;});
 const rb=$('#refreshbtn');if(rb)rb.onclick=()=>refreshData(rb);
 $('#lockbtn').onclick=()=>{localStorage.removeItem(KEY);localStorage.removeItem(BIO);location.reload();};}
function shiftM(ym,n){let [y,m]=ym.split('-').map(Number);m+=n;while(m<1){m+=12;y--;}while(m>12){m-=12;y++;}return y+'-'+String(m).padStart(2,'0');}

// ---------------- Stays ----------------
function renderStays(D){let F='Upcoming';const today=new Date().toISOString().slice(0,10);
 $('#st').innerHTML=`<h1>Stays</h1><div class="sub">Expected payouts land in AFCU about 3 days after check-in</div>
 <div class="chips" id="st-ch" style="margin-top:14px">${['Upcoming','Past','All'].map(x=>`<button class="chip${x===F?' on':''}" data-v="${x}">${x}</button>`).join('')}</div>
 <div class="grid2" style="margin-top:12px" id="st-m"></div><h2 id="st-h">Stays</h2><div class="card" id="st-l"></div>`;
 function update(){const L=D.stays.filter(s=>F==='All'||(F==='Upcoming'?s.checkout>=today:s.checkout<today)).slice();if(F!=='Upcoming')L.reverse();
  const exp=L.filter(s=>s.payoutStatus==='Expected'||s.payoutStatus==='Overdue?').reduce((a,s)=>a+(s.expectedPayout||0),0);
  const paid=L.filter(s=>s.payoutStatus==='Paid').reduce((a,s)=>a+(s.paidAmount||0),0);
  const pend=L.filter(s=>s.payoutStatus==='Pending'||s.payoutStatus==='Unknown').length;
  const nights=L.reduce((a,s)=>a+s.nights,0);
  $('#st-m').innerHTML=`<div class="card metric"><div class="v">${usd(Math.round(F==='Past'?paid:exp))}</div><div class="l">${F==='Past'?'Paid out':'Expected (known amounts)'}</div><div class="d">${pend} stays with no amount yet</div></div><div class="card metric"><div class="v">${L.length}</div><div class="l">Stays</div><div class="d">${nights} nights</div></div>`;
  $('#st-h').textContent=`${F} stays (${L.length})`;
  $('#st-l').innerHTML=L.map((s,i)=>`<div class="row" style="animation-delay:${Math.min(i*20,300)}ms"><div class="main"><div class="k">${esc(s.channel)}${s.code?' · '+esc(s.code):''} · ${s.nights} nights</div><div class="t">${esc(s.guest)}</div><div class="d">${fmtD(s.checkin)} – ${fmtD(s.checkout)}${s.poolHeat!=='none'?' · pool heat '+s.poolHeat:''}${s.payoutStatus==='Paid'?' · paid '+fmtD(String(s.paidDate)):' · expected '+fmtD(s.expectedDate)}${s.note?' · '+esc(s.note):''}</div></div><div><div class="amt">${s.paidAmount!=null?usd(s.paidAmount):s.expectedPayout!=null?usd(s.expectedPayout):'—'}</div><span class="pill ${toneS(s.payoutStatus)}">${esc(s.payoutStatus)}</span></div></div>`).join('')||'<div class="d">No stays</div>';}
 $('#st-ch').addEventListener('click',ev=>{const b=ev.target.closest('.chip');if(!b)return;F=b.dataset.v;$('#st-ch').querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));update();});
 update();}

// ---------------- Expenses ----------------
function renderExpenses(D){const R=rowsOf(D).slice().reverse();const F={y:String(new Date().getFullYear()),m:'All',c:'All',t:'Costs',q:''};
 const years=[...new Set(R.map(e=>String(e.y)))].sort().reverse();const cats=Object.keys(D.categories);
 const sel=(k,opts,l)=>`<select data-k="${k}" aria-label="${l}">${opts.map(o=>`<option value="${esc(o)}"${F[k]===o?' selected':''}>${o==='All'?l+': All':esc(o)}</option>`).join('')}</select>`;
 $('#ex').innerHTML=`<h1>Expenses</h1><div class="sub">Every Florida transaction · memo rows never count toward cash flow</div>
 <div class="chips" id="ex-t" style="margin-top:14px">${['Costs','Revenue','Memo','Tax','All'].map(x=>`<button class="chip${x===F.t?' on':''}" data-v="${x}">${x}</button>`).join('')}</div>
 <div class="grid2" style="margin:10px 0">${sel('y',['All',...years],'Year')}${sel('m',['All',...MN],'Month')}</div>${sel('c',['All',...cats],'Category')}
 <input class="q" id="ex-q" placeholder="Search vendor or note" style="margin-top:10px">
 <div class="grid2" style="margin-top:12px" id="ex-m"></div><h2 id="ex-h">Transactions</h2><div class="card" id="ex-l"></div>`;
 function update(){const base=R.filter(e=>(F.y==='All'||String(e.y)===F.y)&&(F.m==='All'||e.m===F.m)&&(F.c==='All'||e.c===F.c)&&(!F.q||(e.item+' '+e.note).toLowerCase().includes(F.q)));
  const L=base.filter(e=>F.t==='All'||(F.t==='Costs'?e.dir==='out':F.t==='Revenue'?e.dir==='in':F.t==='Memo'?e.dir==='memo':isTax(e)));
  const S=p=>base.filter(p).reduce((a,e)=>a+(e.paid||0),0);
  const cost=S(e=>e.dir==='out'),rev=S(e=>e.dir==='in'),tax=S(isTax),memo=S(e=>e.dir==='memo'&&!isTax(e));
  const byCat={};base.filter(e=>e.dir==='out').forEach(e=>{byCat[e.c]=(byCat[e.c]||0)+(e.paid||0);});
  $('#ex-m').innerHTML=`<div class="card metric"><div class="v" style="color:var(--bad)">${usd(Math.round(cost))}</div><div class="l">Cash-flow costs</div><div class="d">Revenue ${usd(Math.round(rev))}</div></div><div class="card metric"><div class="v">${usd(Math.round(tax))}</div><div class="l">Tax write-offs (owner trips)</div><div class="d">Other memo ${usd(Math.round(memo))}</div></div>
  <div class="card" style="grid-column:1/-1"><table class="tbl">${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<tr><td>${esc(c)}</td><td>${usd(Math.round(v))}</td></tr>`).join('')||'<tr><td>No costs in this filter</td><td></td></tr>'}</table></div>`;
  $('#ex-h').textContent=`Transactions (${L.length})`;
  $('#ex-l').innerHTML=L.slice(0,400).map((e,i)=>`<div class="row" style="animation-delay:${Math.min(i*15,300)}ms"><div class="main"><div class="k">${fmtD(e.date)} · ${esc(e.c)}</div><div class="t">${esc(e.item)}</div><div class="d">${esc(e.note)}</div></div><div><div class="amt" style="color:${e.dir==='in'?'var(--ok)':e.dir==='memo'?'var(--t3)':'var(--t)'}">${e.dir==='in'?'+':e.dir==='memo'?'':'−'}${usd(e.paid)}</div><span class="pill ${toneS(e.st)}">${esc(e.st)}</span></div></div>`).join('')+(L.length>400?'<div class="d">Showing first 400; narrow the filter.</div>':'')||'<div class="d">Nothing matches these filters.</div>';}
 $('#ex-t').addEventListener('click',ev=>{const b=ev.target.closest('.chip');if(!b)return;F.t=b.dataset.v;$('#ex-t').querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));update();});
 document.querySelectorAll('#ex select').forEach(s=>s.onchange=()=>{F[s.dataset.k]=s.value;update();});
 $('#ex-q').oninput=ev=>{F.q=ev.target.value.toLowerCase();update();};
 update();}

// ---------------- Equity (UT copy, year-aware, single property) ----------------
function renderEquity(D){const R=rowsOf(D);
 const colors={Principal:'#3D7BD9',Interest:'#F5B841',Escrow:'#8C6BAE',Utilities:'#4F8A8B',HOA:'#B49AC9',Expenses:'#D9534F',Mortgage:'#6E548C',Revenue:'#7D9B6A'};
 let tipK=null,cur={costs:[],total:0};const now=new Date(),nowK=now.getFullYear()*12+now.getMonth();
 const [fy,fm]=(D.fullFrom||'2000-01').split('-').map(Number);const fullK=fy*12+fm-1;
 const avail=[...new Set(R.filter(e=>e.paid!==null&&e.k<=nowK).map(e=>e.k))].sort((a,b)=>b-a);
 let month=avail.includes(nowK)||!avail.length?nowK:avail[0];const homeK=month;const minK=avail.length?avail[avail.length-1]:nowK;let period='1M';
 const KS=['HOA','Utilities','Escrow','Expenses','Interest','Principal','Mortgage'];let lineF=0;
 function placeLine(){const line=$('#eq-line');if(!line)return;const cb2=$('#eq-cost'),rv2=$('#eq-rev');if(!cb2||!rv2)return;
  const wr=$('#eq-bars').getBoundingClientRect(),cr=cb2.getBoundingClientRect(),rr=rv2.getBoundingClientRect();
  if(!rr.width)return;line.style.left=(rr.left-wr.left+lineF*rr.width)+'px';line.style.top=(cr.top-wr.top)+'px';line.style.height=(rr.bottom-cr.top)+'px';}
 function calc(startK,endK){const rows=R.filter(e=>e.paid!==null&&e.k>=startK&&e.k<=endK);const sum=p=>rows.filter(p).reduce((a,e)=>a+(e.paid||0),0);
  const costs=[{k:'Principal',v:sum(e=>e.dir==='out'&&e.c==='Mortgage'&&/principal/i.test(e.item))},{k:'Interest',v:sum(e=>e.dir==='out'&&e.c==='Mortgage'&&/interest/i.test(e.item))},
   {k:'Escrow',v:sum(e=>e.dir==='out'&&e.c==='Mortgage'&&/escrow|tax|insur|\bpmi\b|\bmip\b/i.test(e.item))},{k:'Utilities',v:sum(e=>e.dir==='out'&&e.c==='Utilities')},
   {k:'HOA',v:sum(e=>e.dir==='out'&&e.c==='HOA')},{k:'Expenses',v:sum(e=>e.dir==='out'&&!['Mortgage','Utilities','HOA'].includes(e.c))}].filter(x=>x.v>0);
  const mortTotal=sum(e=>e.dir==='out'&&e.c==='Mortgage');const mortSplit=costs.filter(c=>['Principal','Interest','Escrow'].includes(c.k)).reduce((a,c)=>a+c.v,0);
  const mortLeft=Math.round((mortTotal-mortSplit)*100)/100;if(mortLeft>=0.01)costs.push({k:'Mortgage',v:mortLeft});
  const revenue=sum(e=>e.dir==='in');const totalCost=costs.reduce((a,c)=>a+c.v,0);const prin=(costs.find(c=>c.k==='Principal')||{v:0}).v;
  return {costs,revenue,totalCost,net:revenue-totalCost,netp:revenue-totalCost+prin};}
 function update(){const startK=period==='3M'?month-2:period==='12M'?month-11:period==='YTD'?Math.floor(month/12)*12:month;
  const c=calc(startK,month);const {costs,revenue,totalCost,net,netp}=c;const scale=Math.max(totalCost,revenue,1);
  KS.forEach(k=>{const x=costs.find(y=>y.k===k),el=$(`#eq-cost [data-k="${k}"]`);el.style.width=(x?x.v/scale*100:0)+'%';el.style.minWidth=x?'':'0';el.title=x?`${k}: ${usd(x.v)}`:'';});
  const rv=$('#eq-rev .seg');rv.style.width=(revenue/scale*100)+'%';rv.style.minWidth=revenue?'':'0';lineF=revenue/scale;
  $('#eq-mt').textContent=period==='1M'?kLabel(month).toUpperCase():(kLabel(startK)+' – '+kLabel(month)).toUpperCase();$('#eq-prev').disabled=startK<=minK;$('#eq-next').disabled=month>=nowK;
  $('#eq-cost-sum').textContent=usd(Math.round(totalCost*100)/100);$('#eq-rev-sum').textContent=usd(Math.round(revenue*100)/100);
  $('#eq-leg').innerHTML=['HOA','Utilities','Escrow','Expenses','Interest','Principal'].map(k=>costs.find(x=>x.k===k)).filter(Boolean).map(x=>`<span data-k="${x.k}" style="cursor:pointer"><i style="background:${colors[x.k]||'#888'}"></i>${x.k}</span>`).join('');
  cur={costs,total:totalCost};showTip();clearTimeout(update.t);update.t=setTimeout(()=>{showTip();placeLine();},620);
  const nn=Math.round(net*100)/100,np=Math.round(netp*100)/100;
  $('#eq-net').textContent=(nn>=0?'+':'')+usd(nn);$('#eq-net').style.color=nn>=0?'#7D9B6A':'#D9534F';
  $('#eq-netp').textContent=(np>=0?'+':'')+usd(np);$('#eq-netp').style.color=np>=0?'#7D9B6A':'#D9534F';
  const ly=calc(startK-12,month-12);
  $('#eq-yoy').innerHTML=(ly.revenue||ly.totalCost)?`Same period last year: revenue ${usd(Math.round(ly.revenue))}, net before principal ${usd(Math.round(ly.netp))}${startK-12<fullK?' (partial data)':''}`:'No data for the same period last year';
  $('#eq-warn').style.display=startK<fullK?'':'none';
  placeLine();requestAnimationFrame(placeLine);
  const A=D.assets&&D.assets.Florida;if(A){const V=+A.value||0,B=+A.balance||0,E=V-B,neg=E<0,T=neg?B:V;const pct=V?E/V*100:0;
   $('#eqp-pct').textContent=(Math.round(pct*10)/10)+'% equity';$('#eqp-eq').style.width=(T?Math.abs(E)/T*100:0)+'%';$('#eqp-bal').style.width=(T?(neg?V:B)/T*100:0)+'%';
   $('#eqp-eqv').textContent=usd(Math.round(E));$('#eqp-balv').textContent=usd(B);$('#eqp-val').textContent=usd(V);}}
 function showTip(){const t=$('#eq-tip');const c=tipK&&cur.costs.find(x=>x.k===tipK);
  if(!c){tipK=null;t.style.opacity=0;t.style.transform='translateY(4px)';return;}
  const pct=cur.total?Math.round(c.v/cur.total*100):0;t.innerHTML=`<b>${esc(c.k)}</b> ${usd(Math.round(c.v*100)/100)} · ${pct}%`;
  const card=$('#eq-cc').getBoundingClientRect(),bar=$('#eq-cost').getBoundingClientRect();
  const a=$(`#eq-cost [data-k="${c.k}"]`)||$(`#eq-leg [data-k="${c.k}"]`),r=a.getBoundingClientRect();
  const w=t.offsetWidth;const x=Math.max(8,Math.min(r.left+r.width/2-card.left-w/2,card.width-w-8));
  t.style.left=x+'px';t.style.top=(bar.bottom-card.top+6)+'px';t.style.opacity=1;t.style.transform='translateY(0)';}
 const A=D.assets&&D.assets.Florida;
 $('#eq').innerHTML=`<h1>Equity</h1><div class="sub">Cash flow · same scale on both bars</div>
 <div class="mnav" id="eq-mn"><button id="eq-prev" aria-label="Previous month">‹</button><button id="eq-mt" class="mt"></button><button id="eq-next" aria-label="Next month">›</button>
 <div class="mdd" id="eq-dd" style="max-height:60vh;overflow:auto">${avail.map(k=>`<button data-m="${k}">${kLabel(k).toUpperCase()}</button>`).join('')}</div></div>
 <div class="chips" id="eq-period" style="margin-top:10px"><button class="chip on" data-per="1M">Month</button><button class="chip" data-per="3M">Last 3 months</button><button class="chip" data-per="YTD">YTD</button><button class="chip" data-per="12M">Last 12 months</button></div>
 <div class="warnbox" id="eq-warn" style="display:none">Includes months before ${esc(D.fullFrom)}: only Airbnb payouts, the mortgage schedule and Beyond are in the data then, so costs are understated.</div>
 <div id="eq-bars" style="position:relative">
 <h2>Costs</h2><div class="card" id="eq-cc" style="position:relative"><div class="eq-num" id="eq-cost-sum"></div><div class="leg2" id="eq-leg" style="margin:8px 0 0"></div><div class="hbar" id="eq-cost" style="cursor:pointer">${KS.map(k=>`<div class="seg" data-k="${k}" style="width:0;min-width:0;background:${colors[k]||'#888'}"></div>`).join('')}</div>
 <div id="eq-tip" style="position:absolute;left:0;top:0;opacity:0;pointer-events:none;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease;background:var(--line);color:var(--t);font-size:12px;padding:6px 10px;border-radius:10px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.45);z-index:5"></div></div>
 <h2>Revenue</h2><div class="card"><div class="eq-num" id="eq-rev-sum"></div><div class="hbar" id="eq-rev"><div class="seg" style="width:0;min-width:0;background:${colors.Revenue}"></div></div></div>
 <div id="eq-line" style="position:absolute;top:0;height:0;width:0;border-left:2px dotted rgba(255,255,255,.35);pointer-events:none;z-index:2;transition:left .6s cubic-bezier(.2,.8,.2,1)"></div></div>
 <h2>Net</h2><div class="card"><div class="eq-num" id="eq-net" style="font-size:22px"></div></div>
 <h2>Net before principal</h2><div class="card"><div class="eq-num" id="eq-netp" style="font-size:22px"></div><div class="d" style="color:var(--t3);font-size:11px;margin-top:4px">Principal paydown excluded — it builds equity, it is not an expense</div><div class="d" id="eq-yoy" style="color:var(--t2);font-size:12px;margin-top:8px"></div></div>
 ${A?`<h2>Equity progress</h2><div class="card"><div class="eq-num" id="eqp-pct"></div><div class="hbar"><div class="seg" id="eqp-eq" style="width:0;background:#7D9B6A"></div><div class="seg" id="eqp-bal" style="width:0;background:#6E548C"></div></div><div class="leg2" style="margin-top:8px"><span><i style="background:#7D9B6A"></i>Equity <b id="eqp-eqv"></b></span><span><i style="background:#6E548C"></i>Loan balance <b id="eqp-balv"></b></span><span>Est. value <b id="eqp-val"></b></span></div>
 <div class="d" style="color:var(--t3);font-size:11px;margin-top:6px">Value range ${usd(A.valueLow)}–${usd(A.valueHigh)} · as of ${esc(A.asOf)} · bought ${usd(A.purchasePrice)} (${esc(A.purchaseDate)}) · Zillow ${usd(A.zillow.value)} (${esc(A.zillow.asOf)})<br>${esc(A.valueSource)}<br>Balance: ${esc(A.balanceSource)}</div>
 <details><summary>Comparable sales</summary><table class="tbl">${A.comps.map(c=>`<tr><td>${esc(c.addr)}<div class="d" style="color:var(--t3)">${esc(c.date)} · ${esc(c.note)}</div></td><td>${usd(c.price)}</td></tr>`).join('')}</table></details></div>`:''}`;
 $('#eq-cc').addEventListener('click',ev=>{const el=ev.target.closest('[data-k]');if(!el)return;tipK=tipK===el.dataset.k?null:el.dataset.k;showTip();});
 document.addEventListener('pointerdown',ev=>{if(tipK&&!ev.target.closest('#eq-cc [data-k],#eq-mn')){tipK=null;showTip();}if(!ev.target.closest('#eq-mn'))$('#eq-dd').classList.remove('open');});
 const go=k=>{if(k<minK||k>nowK)return;month=k;$('#eq-dd').classList.remove('open');update();};
 $('#eq-prev').onclick=()=>go(month-1);$('#eq-next').onclick=()=>go(month+1);
 $('#eq-mt').onclick=()=>{const d=$('#eq-dd');d.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.m===month));d.classList.toggle('open');};
 $('#eq-dd').onclick=ev=>{const b=ev.target.closest('[data-m]');if(b)go(+b.dataset.m);};
 document.querySelectorAll('#eq-period .chip').forEach(b=>b.onclick=()=>{period=b.dataset.per;if(period!=='1M')month=homeK;document.querySelectorAll('#eq-period .chip').forEach(x=>x.classList.toggle('on',x===b));update();});
 window.__eqFix=update;if(!window.__eqRes){window.__eqRes=1;window.addEventListener('resize',()=>{if(window.__eqFix)window.__eqFix();});}
 update();}

function render(D){
 $('#app').innerHTML=`<div class="tabs"><button class="tab on" data-t="home">Home</button><button class="tab" data-t="st">Stays</button><button class="tab" data-t="ex">Expenses</button><button class="tab" data-t="eq">Equity</button></div>
 <div id="home" class="view"></div><div id="st" class="view" style="display:none"></div><div id="ex" class="view" style="display:none"></div><div id="eq" class="view" style="display:none"></div>
 <div id="scrim"></div><div id="sheet"><div class="grab"></div><div id="sc"></div></div>`;
 renderHome(D);renderStays(D);renderExpenses(D);renderEquity(D);
 document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  ['home','st','ex','eq'].forEach(v=>{const el=$('#'+v);el.style.display=v===t.dataset.t?'block':'none';if(v===t.dataset.t){el.style.animation='none';el.offsetHeight;el.style.animation='';}});if(t.dataset.t==='eq'&&window.__eqFix)window.__eqFix();window.scrollTo({top:0});});
 $('#app').classList.add('show');}
