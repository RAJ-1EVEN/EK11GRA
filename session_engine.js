// EKAGRA — Session Engine: picker, reorder, adaptive order, editor, advanced session mode

// ─── STATE EXTENSIONS ───────────────────────────────────────────────────────
// These are merged into the main state object on load:
// state.orderPrefs[sessionId][muscleId] = [exName, ...] in preferred order
// state.editedSessions[sessionId] = { blocks: [...] } — custom program edits

// ─── SESSION PICKER ─────────────────────────────────────────────────────────
function renderSessionPicker(){
  const todayIdx=getTodayIdx(); const wk=getWeekKey(0);
  const debt=getRecoveryDebt();

  let debtHtml='';
  if(debt.length>0) debtHtml=`<div class="debt-alert">
    <div class="debt-title">⚠ VOLUME DEBT THIS WEEK</div>
    ${debt.map(d=>`<div class="debt-row"><span style="color:${d.color}">${d.name}</span><span>${d.done}/${d.min} sets · need ${d.owed} more</span></div>`).join('')}
  </div>`;

  const cards=SCHEDULE.map((day,i)=>{
    const sc=getSplitClass(day); const isToday=i===todayIdx;
    const done=day.blocks.reduce((acc,b)=>acc+totalSetsForMuscle(wk,b.muscleId),0);
    const planned=day.blocks.reduce((acc,b)=>acc+b.exercises.reduce((a,e)=>a+e.sets,0),0);
    const pct=planned>0?Math.round(done/planned*100):0;
    return `<div class="picker-card ${isToday?'today-pick':''} ${sc}" onclick="launchSession(${i})">
      <div class="picker-top">
        <div>
          <div class="picker-day">${day.day}${isToday?' · TODAY':''}</div>
          <div class="picker-label">${day.label}</div>
          <div class="picker-focus">${day.primaryFocus.split('·')[0].trim()}</div>
        </div>
        <div class="picker-ring-wrap">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3"
              stroke-linecap="round" transform="rotate(-90 22 22)"
              stroke-dasharray="113" stroke-dashoffset="${113*(1-Math.min(pct/100,1))}"/>
            <text x="22" y="26" text-anchor="middle" font-family="Bebas Neue" font-size="11" fill="white">${pct}%</text>
          </svg>
        </div>
      </div>
      <div class="picker-muscles">${day.blocks.slice(0,3).map(b=>`<span class="picker-chip">${b.muscle}</span>`).join('')}${day.blocks.length>3?`<span class="picker-chip">+${day.blocks.length-3}</span>`:''}</div>
    </div>`;
  }).join('');

  document.getElementById(editorState.dayIdx===null?'editorContent':'editorContent').innerHTML=`
    ${renderChain()}
    ${debtHtml}
    <div class="sect">// select session</div>
    <div class="picker-grid">${cards}</div>`;
}

// ─── LAUNCH → REORDER SCREEN ────────────────────────────────────────────────
function launchSession(schedIdx){
  const day=getEffectiveSession(schedIdx);
  if(day.id==='rest'&&!confirm('Rest day — start a session anyway?')) return;

  const wk=getWeekKey(0);
  // build ordered exercise list respecting saved preferences
  const orderedBlocks=day.blocks.map(blk=>{
    const prefs=state.orderPrefs?.[day.id]?.[blk.muscleId];
    let exs=[...blk.exercises];
    const custom=(state.customEx?.[wk]?.[blk.muscleId]||[]).map(n=>({name:n,type:'isolation',fiber:'custom',repRange:{min:8,max:12},alternatives:[],sets:3}));
    exs=[...exs,...custom];
    if(prefs&&prefs.length>0){
      exs.sort((a,b)=>{const ai=prefs.indexOf(a.name),bi=prefs.indexOf(b.name);if(ai===-1&&bi===-1)return 0;if(ai===-1)return 1;if(bi===-1)return -1;return ai-bi;});
    }
    return {...blk, exercises:exs};
  });

  const queue=[];
  orderedBlocks.forEach(blk=>blk.exercises.forEach(ex=>queue.push({...ex,muscleId:blk.muscleId,muscleName:blk.muscle,schedIdx})));

  renderReorderScreen(day, queue, schedIdx);
}

function getEffectiveSession(schedIdx){
  const base=SCHEDULE[schedIdx];
  const edited=state.editedSessions?.[base.id];
  return edited?{...base,...edited}:base;
}

// ─── REORDER SCREEN ─────────────────────────────────────────────────────────
let reorderState={queue:[],day:null,schedIdx:0,dragIdx:null,tapRank:[],tapMode:false};

function renderReorderScreen(day, queue, schedIdx){
  reorderState={queue:[...queue],day,schedIdx,dragIdx:null,tapRank:[],tapMode:false};
  const sc=getSplitClass(day);
  const debt=getRecoveryDebt();
  const readiness=day.blocks.map(b=>{const r=getMuscleReadiness(b.muscleId);return `<div class="readiness-row"><span class="readiness-icon ${r.status}">${r.icon}</span><span class="readiness-name">${b.muscle}</span><span class="readiness-note">${r.note}</span></div>`;}).join('');

  document.getElementById(editorState.dayIdx===null?'editorContent':'editorContent').innerHTML=`
    <div class="reorder-header ${sc}">
      <div class="reorder-back" onclick="renderTrain()">← Back</div>
      <div class="reorder-title">${day.label}</div>
      <div class="reorder-sub">${queue.length} exercises</div>
    </div>
    ${debt.length>0?`<div class="debt-alert"><div class="debt-title">⚠ WEEK DEBT — consider adding these</div>${debt.map(d=>`<div class="debt-row"><span style="color:${d.color}">${d.name}</span><span>${d.owed} sets still needed</span></div>`).join('')}</div>`:''}
    <div class="readiness-block">${readiness}</div>
    <div class="reorder-controls">
      <button class="reorder-mode-btn ${reorderState.tapMode?'':'active'}" onclick="setReorderMode(false)">⠿ Drag</button>
      <button class="reorder-mode-btn ${reorderState.tapMode?'active':''}" onclick="setReorderMode(true)">⓪ Tap to Rank</button>
    </div>
    <div class="sect">// exercise order — ${reorderState.tapMode?'tap in the order you want':'hold to drag'}</div>
    <div class="reorder-list" id="reorderList"></div>
    <button class="start-session-cta" onclick="startSessionFromReorder()">Start Session →</button>`;

  renderReorderList();
}

function setReorderMode(tapMode){
  reorderState.tapMode=tapMode; reorderState.tapRank=[];
  document.querySelectorAll('.reorder-mode-btn').forEach((b,i)=>b.classList.toggle('active',i===(tapMode?1:0)));
  document.querySelector('.sect') && (document.querySelector('.sect').textContent=`// exercise order — ${tapMode?'tap in the order you want':'hold to drag'}`);
  renderReorderList();
}

function renderReorderList(){
  const {queue,tapMode,tapRank}=reorderState;
  const seqNotes={};
  queue.forEach((ex,i)=>{if(i>0){const n=getSequencingNote(ex.name,queue[i-1].name);if(n)seqNotes[i]=n;}});

  document.getElementById('reorderList').innerHTML=queue.map((ex,i)=>{
    const rankPos=tapRank.indexOf(i);
    const sugg=ex.name==='Wall Handstand Hold'?getHSPUSuggestion(ex.name,ex.repRange):getWeightSuggestion(ex.name,ex.type,ex.repRange);
    const seq=seqNotes[i];
    return `
      ${seq?`<div class="seq-note ${seq.level}">↕ ${seq.msg}</div>`:''}
      <div class="reorder-item" id="ri-${i}"
        ${!tapMode?`draggable="true" ondragstart="dragStart(${i})" ondragover="dragOver(event,${i})" ondrop="dropOn(${i})" ondragend="dragEnd()"`:``}
        onclick="${tapMode?`tapRank(${i})`:``}">
        <div class="ri-handle">${tapMode?(rankPos>=0?`<span class="rank-badge">${rankPos+1}</span>`:'○'):'⠿'}</div>
        <div class="ri-body">
          <div class="ri-muscle">${ex.muscleName}</div>
          <div class="ri-name">${ex.name}</div>
          <div class="ri-meta">${ex.sets} sets · ${ex.repRange?.min||'?'}–${ex.repRange?.max||'?'} reps · ${ex.type}</div>
        </div>
        <div class="ri-sugg" style="color:${sugg.badgeColor}">
          <div class="ri-sugg-w">${sugg.weight?sugg.weight+'kg':'—'}</div>
          <div class="ri-sugg-lbl">${sugg.badge}</div>
        </div>
      </div>`;
  }).join('');
}

function tapRank(idx){
  const pos=reorderState.tapRank.indexOf(idx);
  if(pos>=0) reorderState.tapRank.splice(pos,1);
  else reorderState.tapRank.push(idx);
  // if all ranked, reorder queue
  if(reorderState.tapRank.length===reorderState.queue.length){
    reorderState.queue=reorderState.tapRank.map(i=>reorderState.queue[i]);
    reorderState.tapRank=[]; renderReorderList(); return;
  }
  renderReorderList();
}

// drag-and-drop
function dragStart(i){ reorderState.dragIdx=i; }
function dragOver(e,i){ e.preventDefault(); }
function dropOn(i){
  const from=reorderState.dragIdx; if(from===null||from===i) return;
  const q=[...reorderState.queue]; const [item]=q.splice(from,1); q.splice(i,0,item);
  reorderState.queue=q; reorderState.dragIdx=null; renderReorderList();
}
function dragEnd(){ reorderState.dragIdx=null; }

// ─── START SESSION FROM REORDER ─────────────────────────────────────────────
function startSessionFromReorder(){
  const {queue,day,schedIdx}=reorderState;
  // save order preference
  if(!state.orderPrefs) state.orderPrefs={};
  if(!state.orderPrefs[day.id]) state.orderPrefs[day.id]={};
  // group by muscleId and save order per muscle block
  const byMuscle={};
  queue.forEach(ex=>{
    if(!byMuscle[ex.muscleId]) byMuscle[ex.muscleId]=[];
    byMuscle[ex.muscleId].push(ex.name);
  });
  Object.entries(byMuscle).forEach(([mid,names])=>{ state.orderPrefs[day.id][mid]=names; });
  save();

  // launch session
  const wk=getWeekKey(0);
  session={queue,idx:0,dayIdx:getTodayIdx(),elapsed:0,timerInterval:null,swapped:{},wk,day,schedIdx};
  const sc=getSplitClass(day);
  document.getElementById('sessBadge').textContent=day.label;
  document.getElementById('sessBadge').className='sess-split-badge '+sc;
  document.getElementById('sessionOverlay').classList.add('active');
  session.timerInterval=setInterval(()=>{
    session.elapsed++;
    const m=Math.floor(session.elapsed/60),s=session.elapsed%60;
    document.getElementById('sessTimer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  },1000);
  renderStep();
}

// ─── SESSION STEP — ADVANCED COACHING ───────────────────────────────────────
function renderStep(){
  if(!session) return;
  if(session.idx>=session.queue.length){ renderPostSession(); return; }

  const step=session.queue[session.idx];
  const ex=session.swapped[session.idx]||step;
  const origName=step.name;
  const sets=getLog(session.wk,session.dayIdx,origName);
  const sugg=ex.name==='Wall Handstand Hold'?getHSPUSuggestion(origName,step.repRange):getWeightSuggestion(origName,step.type,step.repRange);
  const warmups=sugg.weight?getWarmupSets(origName,step.type,sugg.weight):[];
  const mrvFlag=getMRVFlag(origName,sets.length,step.muscleId);
  const effortFlag=getEffortFlag(sets);
  const prevEx=session.idx>0?(session.swapped[session.idx-1]||session.queue[session.idx-1]):null;
  const seqNote=prevEx?getSequencingNote(ex.name,prevEx.name):null;
  const pushTarget=getPushSetTarget(sugg,step.sets);
  const noteKey=`${session.wk}_${session.dayIdx}_${origName}`;
  const noteVal=state.sessionNotes?.[noteKey]||'';
  const pref=state.cuePrefs?.[ex.name];
  const cue=CUES[ex.name]||{internal:'Focus on the target muscle, control the tempo',external:'Move the weight smoothly through the full range'};
  const alts=(step.alternatives||[]).map(n=>{for(const d of SCHEDULE)for(const b of d.blocks)for(const e of b.exercises)if(e.name===n)return e;return{name:n,type:'isolation',fiber:'alt',repRange:step.repRange,alternatives:[]};}).filter(Boolean);

  document.getElementById('sessBody').innerHTML=`
    <div class="sess-nav-row">
      <button class="sess-nav-btn" onclick="prevStep()">← Prev</button>
      <div class="sess-progress">${session.idx+1} / ${session.queue.length}</div>
      <button class="sess-nav-btn" onclick="nextStep()">Skip →</button>
    </div>

    <div class="sess-muscle-tag" style="color:${MUSCLE_TARGETS[step.muscleId]?.color||'var(--gold)'}">${ex.muscleName||step.muscleName}</div>
    <div class="sess-ex-name">${ex.name}${session.swapped[session.idx]?` <span style="font-size:14px;color:var(--muted)">(swap)</span>`:''}</div>
    <div class="sess-fiber-tag">${ex.fiber||'—'} · ${ex.type} · ${step.sets} sets planned</div>

    ${seqNote?`<div class="coach-flag ${seqNote.level}"><span class="flag-icon">↕</span>${seqNote.msg}</div>`:''}
    ${mrvFlag?`<div class="coach-flag ${mrvFlag.level}"><span class="flag-icon">${mrvFlag.level==='danger'?'⛔':'⚠'}</span>${mrvFlag.msg}</div>`:''}
    ${effortFlag?`<div class="coach-flag ${effortFlag.level}"><span class="flag-icon">${effortFlag.level==='danger'?'⛔':effortFlag.level==='warn'?'⚠':'✓'}</span>${effortFlag.msg}</div>`:''}

    <div class="sugg-card" style="background:${sugg.badgeColor}18;border-color:${sugg.badgeColor}44">
      <div class="sugg-badge" style="background:${sugg.badgeColor}22;color:${sugg.badgeColor}">${sugg.badge}</div>
      ${sugg.weight!=null?`<div class="sugg-weight-row"><div class="sugg-weight">${sugg.weight}</div><div class="sugg-unit">kg</div><div class="sugg-reps" style="color:${sugg.badgeColor}">${sugg.repsText}</div></div>`:''}
      <div class="sugg-reasoning">${sugg.reasoning}</div>
      ${pushTarget?`<div class="push-target">🎯 ${pushTarget.note}</div>`:''}
    </div>

    ${warmups.length>0?`<div class="warmup-block">
      <div class="warmup-title">WARMUP SETS</div>
      ${warmups.map(w=>`<div class="warmup-row"><span class="wu-label">${w.label}</span><span class="wu-weight">${w.weight}kg × ${w.reps}</span><span class="wu-note">${w.note}</span></div>`).join('')}
    </div>`:''}

    <div class="swap-row"><button class="swap-btn" onclick="toggleSwap()">${session.swapOpen?'Close':'⇄ Swap'}</button></div>
    ${session.swapOpen?`<div class="swap-menu">${alts.map(a=>`<div class="swap-opt" onclick="doSwap('${esc(a.name)}')">${a.name}<span class="swap-opt-tag">${a.type}</span></div>`).join('')}<div class="swap-opt" onclick="doSwap(null)" style="color:var(--muted)">Use planned: ${step.name}</div></div>`:''}

    <div class="cues-row" style="margin-bottom:14px">
      <div class="cue-pill ${pref==='internal'?'pref':''}" onclick="sessCuePref('${esc(ex.name)}','internal')"><div class="cue-lbl">Internal${pref==='internal'?' ★':''}</div><div class="cue-text">${cue.internal}</div></div>
      <div class="cue-pill ${pref==='external'?'pref':''}" onclick="sessCuePref('${esc(ex.name)}','external')"><div class="cue-lbl">External${pref==='external'?' ★':''}</div><div class="cue-text">${cue.external}</div></div>
    </div>

    <div class="sess-inp-row">
      <div class="sess-inp-group"><label>Reps</label><input type="number" inputmode="numeric" id="sReps" value="${sets[sets.length-1]?.reps??''}"></div>
      <div class="sess-inp-group"><label>Weight kg</label><input type="number" inputmode="decimal" id="sWeight" value="${sugg.weight??sets[sets.length-1]?.weight??''}"></div>
      <div class="sess-inp-group"><label>Set #</label><input type="text" value="${sets.length+1}" readonly style="color:var(--muted)"></div>
    </div>
    <div class="effort-row">
      <button class="eff-btn" id="effE" onclick="selEff('E')">Easy</button>
      <button class="eff-btn" id="effM" onclick="selEff('M')">Moderate</button>
      <button class="eff-btn" id="effF" onclick="selEff('F')">Near Failure</button>
    </div>
    <button class="log-btn" onclick="logSet()">Log Set + Rest</button>

    <div class="set-history">${sets.map((s,i)=>`<div class="set-log-item"><span>Set ${i+1}${s.swappedFrom?` (${s.swappedFrom})`:''}</span><span class="set-log-val">${s.reps||'?'} × ${s.weight||'?'}kg${s.effort?' · '+{E:'Easy',M:'Moderate',F:'Near Failure'}[s.effort]:''}</span></div>`).join('')}</div>

    <div class="sess-notes-wrap">
      <div class="sess-notes-lbl">Notes</div>
      <textarea class="sess-notes-inp" placeholder="how did this feel..." onchange="saveNote('${esc(noteKey)}',this.value)">${noteVal}</textarea>
    </div>`;
  session.selEff=null;
}

// ─── POST-SESSION SUMMARY ────────────────────────────────────────────────────
function renderPostSession(){
  const {wk,dayIdx,day}=session;
  const summary=buildPostSessionSummary(wk,dayIdx,day.blocks||[]);
  const mins=Math.floor(session.elapsed/60);

  document.getElementById('sessBody').innerHTML=`
    <div class="post-session">
      <div class="post-title">SESSION COMPLETE</div>
      <div class="post-time">${mins} min</div>
      <div class="post-note">"${QUOTES[Math.floor(Date.now()/86400000)%QUOTES.length].text}"</div>

      <div class="post-section">SETS THIS SESSION</div>
      <div class="post-muscles">${summary.muscleSets.map(m=>`<div class="post-muscle-row"><span class="post-muscle-dot" style="background:${m.color}"></span><span>${m.muscle}</span><span class="post-muscle-sets">${m.sets} sets</span></div>`).join('')}</div>

      ${summary.prs.length>0?`<div class="post-section">🏆 PERSONAL RECORDS</div>${summary.prs.map(p=>`<div class="post-pr">${p}</div>`).join('')}`:''}
      ${summary.warnings.length>0?`<div class="post-section">⚠ FLAGS</div>${summary.warnings.map(w=>`<div class="post-warn">${w}</div>`).join('')}`:''}
      ${summary.nextNotes.length>0?`<div class="post-section">NEXT SESSION</div>${summary.nextNotes.map(n=>`<div class="post-next">${n}</div>`).join('')}`:''}

      <button class="log-btn" onclick="exitSession()" style="margin-top:24px">Done</button>
    </div>`;
}

// ─── PROGRAM EDITOR ─────────────────────────────────────────────────────────
let editorState={dayIdx:null};

function renderEditor(){
  if(editorState.dayIdx===null){
    document.getElementById(editorState.dayIdx===null?'editorContent':'editorContent').innerHTML=`
      <div class="editor-header">
        <div class="editor-title">PROGRAM EDITOR</div>
        <div class="editor-sub">Edit your training split, exercises, sets and rep ranges</div>
      </div>
      <div class="sect">// select day to edit</div>
      ${SCHEDULE.map((day,i)=>`<div class="editor-day-card" onclick="openDayEditor(${i})">
        <div class="editor-day-name">${day.day}</div>
        <div class="editor-day-label">${day.label}</div>
        <div class="editor-day-ex">${day.blocks.reduce((a,b)=>a+b.exercises.length,0)} exercises · ${day.blocks.reduce((a,b)=>a+b.exercises.reduce((c,e)=>c+e.sets,0),0)} sets</div>
        <div class="editor-arrow">→</div>
      </div>`).join('')}
      <div class="editor-reset-note">Edits are saved per-day and persist across sessions. Tap Reset on any day to restore defaults.</div>`;
  }
}

function openDayEditor(schedIdx){
  editorState.dayIdx=schedIdx;
  const day=getEffectiveSession(schedIdx);
  document.getElementById(editorState.dayIdx===null?'editorContent':'editorContent').innerHTML=`
    <div class="editor-header">
      <button class="reorder-back" onclick="renderEditor()">← Days</button>
      <div class="editor-title">${day.label}</div>
    </div>
    <div class="sect">// muscle blocks & exercises</div>
    ${day.blocks.map((blk,bi)=>`
      <div class="editor-block">
        <div class="editor-block-head">
          <span class="editor-block-muscle">${blk.muscle}</span>
          <button class="editor-add-ex-btn" onclick="addEditorEx(${schedIdx},${bi})">+ Add</button>
        </div>
        ${blk.exercises.map((ex,ei)=>`
          <div class="editor-ex-row">
            <div class="editor-ex-info">
              <div class="editor-ex-name">${ex.name}</div>
              <div class="editor-ex-meta">${ex.sets}s · ${ex.repRange?.min}–${ex.repRange?.max} reps · ${ex.type}</div>
            </div>
            <div class="editor-ex-controls">
              <button class="ed-btn" onclick="editSets(${schedIdx},${bi},${ei})">Sets: ${ex.sets}</button>
              <button class="ed-btn" onclick="editReps(${schedIdx},${bi},${ei})">${ex.repRange?.min}–${ex.repRange?.max}</button>
              <button class="ed-btn danger" onclick="removeEditorEx(${schedIdx},${bi},${ei})">✕</button>
            </div>
          </div>`).join('')}
      </div>`).join('')}
    <button class="editor-reset-btn" onclick="resetDayEdits(${schedIdx})">Reset to Default</button>`;
}

function ensureEditedSession(schedIdx){
  if(!state.editedSessions) state.editedSessions={};
  const id=SCHEDULE[schedIdx].id;
  if(!state.editedSessions[id]) state.editedSessions[id]=JSON.parse(JSON.stringify(SCHEDULE[schedIdx]));
  return state.editedSessions[id];
}

function addEditorEx(schedIdx,blockIdx){
  const name=prompt('Exercise name:'); if(!name) return;
  const setsStr=prompt('How many sets?','3'); const sets=parseInt(setsStr)||3;
  const repStr=prompt('Rep range (e.g. 8-12):','8-12');
  const [minR,maxR]=(repStr||'8-12').split('-').map(Number);
  const day=ensureEditedSession(schedIdx);
  day.blocks[blockIdx].exercises.push({name,type:'isolation',fiber:'custom',repRange:{min:minR||8,max:maxR||12},sets,alternatives:[]});
  save(); openDayEditor(schedIdx);
}

function removeEditorEx(schedIdx,blockIdx,exIdx){
  if(!confirm('Remove this exercise?')) return;
  const day=ensureEditedSession(schedIdx);
  day.blocks[blockIdx].exercises.splice(exIdx,1);
  save(); openDayEditor(schedIdx);
}

function editSets(schedIdx,blockIdx,exIdx){
  const day=ensureEditedSession(schedIdx);
  const cur=day.blocks[blockIdx].exercises[exIdx].sets;
  const val=prompt('Number of sets:',cur); if(!val) return;
  day.blocks[blockIdx].exercises[exIdx].sets=parseInt(val)||cur;
  save(); openDayEditor(schedIdx);
}

function editReps(schedIdx,blockIdx,exIdx){
  const day=ensureEditedSession(schedIdx);
  const ex=day.blocks[blockIdx].exercises[exIdx];
  const cur=`${ex.repRange.min}-${ex.repRange.max}`;
  const val=prompt('Rep range (e.g. 8-12):',cur); if(!val) return;
  const [minR,maxR]=val.split('-').map(Number);
  ex.repRange={min:minR||ex.repRange.min,max:maxR||ex.repRange.max};
  save(); openDayEditor(schedIdx);
}

function resetDayEdits(schedIdx){
  if(!confirm('Reset this day to default program?')) return;
  const id=SCHEDULE[schedIdx].id;
  if(state.editedSessions) delete state.editedSessions[id];
  save(); openDayEditor(schedIdx); toast('Reset to default');
}
