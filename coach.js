// EKAGRA — Coaching Engine v4
// Conservative overload + advanced session intelligence

// ─── HELPERS ───────────────────────────────────────────────────────────────
function roundW(w){ return Math.round(w*2)/2; }
function getInc(type){ return type==='compound'?2.5:2.5; }

function getExHistory(exName, weeksBack=10){
  const sessions=[];
  for(let w=0;w>=-weeksBack;w--){
    const wk=getWeekKey(w); const wl=state.logs[wk]; if(!wl) continue;
    for(const dk in wl){
      const exLog=wl[dk][exName]; if(!exLog||!exLog.length) continue;
      const withW=exLog.filter(s=>s.weight!==''&&s.weight!=null&&s.weight>0);
      if(withW.length>0) sessions.push({weekOffset:w,dayKey:Number(dk),sets:withW,weekKey:wk});
    }
  }
  sessions.sort((a,b)=>b.weekOffset-a.weekOffset||b.dayKey-a.dayKey);
  return sessions;
}

function sessMaxW(s){ return Math.max(...s.sets.map(x=>x.weight||0)); }
function sessHitTop(s,rr){ return s.sets.every(x=>(x.reps||0)>=rr.max); }
function sessAllClean(s){ return s.sets.every(x=>x.effort!=='F'); }
function sessMissed(s,rr){ return s.sets.some(x=>x.effort==='F'&&(x.reps||0)<rr.max); }
function isReadinessPoor(){
  const r=state.readiness?.[getWeekKey(0)];
  return r&&r.sleep==='Poor'&&r.soreness==='High';
}
function daysSinceLastLogged(exName){
  const hist=getExHistory(exName,4); if(!hist.length) return null;
  const last=hist[0]; const now=new Date(); now.setHours(0,0,0,0);
  const monOfWeek=new Date(now); monOfWeek.setDate(now.getDate()-((now.getDay()+6)%7));
  const monOfLast=new Date(monOfWeek); monOfLast.setDate(monOfWeek.getDate()+last.weekOffset*7);
  const lastDate=new Date(monOfLast); lastDate.setDate(monOfLast.getDate()+last.dayKey);
  return Math.floor((now-lastDate)/86400000);
}

// ─── CORE WEIGHT SUGGESTION ─────────────────────────────────────────────────
function getWeightSuggestion(exName, exType, repRange){
  if(!repRange) return {status:'no_data',weight:null,repsText:'',reasoning:'No rep range defined.',badge:'FIRST SESSION',badgeColor:'#6C63FF',pushSet:null};
  const hist=getExHistory(exName,10);
  if(!hist.length) return {status:'no_data',weight:null,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:`First session on ${exName}. Enter a weight you can do for ${repRange.max} clean reps — this becomes your baseline.`,badge:'SET YOUR BASELINE',badgeColor:'#6C63FF',pushSet:null};

  const last=hist[0]; const lastW=sessMaxW(last); const poor=isReadinessPoor();

  if(sessMissed(last,repRange)) return {status:'recover',weight:lastW,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:`Last session: ${lastW}kg near failure, reps missed. Complete the range cleanly at ${lastW}kg before progressing.`,badge:'COMPLETE THE REPS',badgeColor:'#FF4D6D',pushSet:null};

  if(poor) return {status:'repeat',weight:lastW,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:`Readiness is low (poor sleep + high soreness). Hold at ${lastW}kg — recovery first.`,badge:'HOLD STEADY',badgeColor:'#FF8A3D',pushSet:null};

  const atSame=[];
  for(const s of hist){ if(sessMaxW(s)===lastW) atSame.push(s); else break; }
  if(atSame.length>=3){
    const allTop=atSame.slice(0,3).every(s=>sessHitTop(s,repRange));
    if(allTop){ const dl=roundW(lastW*.9); return {status:'plateau',weight:dl,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:`${atSame.length} sessions at ${lastW}kg — plateau confirmed. Deload to ${dl}kg this week with perfect form, then rebuild.`,badge:'PLATEAU — DELOAD',badgeColor:'#FF4D6D',pushSet:null}; }
    return {status:'plateau',weight:lastW,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:`${atSame.length} sessions at ${lastW}kg. Hit ${repRange.max} clean reps on every set before progressing.`,badge:'BUILD THE REPS',badgeColor:'#FF8A3D',pushSet:null};
  }

  if(hist.length>=2){
    const [s1,s2]=hist;
    if(sessMaxW(s1)===sessMaxW(s2)&&sessHitTop(s1,repRange)&&sessHitTop(s2,repRange)&&sessAllClean(s1)&&sessAllClean(s2)){
      const nw=roundW(lastW+getInc(exType));
      return {status:'increase',weight:nw,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:`Two clean sessions at ${lastW}kg — top of range, no grinding. Ready. Try ${nw}kg today.`,badge:'READY TO PROGRESS',badgeColor:'#3DDC97',pushSet:{setNum:3,weight:nw,note:`Push set — attempt ${nw}kg on set 3`}};
    }
  }

  const hitTop=sessHitTop(last,repRange);
  const reason=hitTop?`Solid ${lastW}kg last time — one more clean run before adding weight.`:`Last session didn't reach ${repRange.max} reps at ${lastW}kg. Aim for the full range today.`;
  return {status:'repeat',weight:lastW,repsText:`${repRange.min}–${repRange.max} reps`,reasoning:reason,badge:'HOLD STEADY',badgeColor:'#FFC23D',pushSet:null};
}

// ─── WARMUP SETS ────────────────────────────────────────────────────────────
function getWarmupSets(exName, exType, workingWeight){
  if(exType!=='compound'||!workingWeight||workingWeight<40) return [];
  return [
    {label:'Warmup 1',weight:roundW(workingWeight*0.50),reps:10,note:'Activate — feel the pattern'},
    {label:'Warmup 2',weight:roundW(workingWeight*0.70),reps:5, note:'Build tension'},
    {label:'Warmup 3',weight:roundW(workingWeight*0.90),reps:2, note:'Prime the CNS — no grind'},
  ];
}

// ─── MRV / INTRA-SESSION FLAGS ───────────────────────────────────────────────
function getMRVFlag(exName, currentSets, muscleId){
  const tgt=MUSCLE_TARGETS[muscleId]; if(!tgt) return null;
  const wkSets=totalSetsForMuscle(getWeekKey(0),muscleId);
  if(wkSets>=tgt.max+3) return {level:'danger',msg:`${tgt.name} approaching MRV (${wkSets}/${tgt.max} max). Consider stopping here.`};
  if(wkSets>=tgt.max) return {level:'warn',msg:`${tgt.name} weekly target hit (${wkSets} sets). Additional sets are diminishing returns.`};
  return null;
}

function getEffortFlag(sessionSets){
  if(!sessionSets||sessionSets.length<2) return null;
  const last3=sessionSets.slice(-3);
  const allF=last3.every(s=>s.effort==='F');
  const allE=last3.filter(s=>s.effort==='E').length>=2&&last3.length>=2;
  if(allF&&last3.length>=3) return {level:'danger',msg:'3 consecutive near-failure sets — your next set carries high injury risk. Stop or drop weight 20%.'};
  if(allF&&last3.length>=2) return {level:'warn',msg:'2 near-failure sets in a row. Consider this a sign to reduce weight on next set or wrap this exercise.'};
  if(allE) return {level:'good',msg:'Easy effort across recent sets — you have more in the tank. Consider adding a set or bumping weight next set.'};
  return null;
}

// ─── SEQUENCING NOTES ────────────────────────────────────────────────────────
// Joint stress categories — warns if same joint hit twice in a row
const JOINT_MAP = {
  'Back Squat':'knee_hip','Hack Squat':'knee','Leg Extension':'knee','Romanian Deadlift':'hip_lumber',
  'Lying Leg Curl':'knee','Seated Leg Curl':'knee','Bulgarian Split Squat':'knee_hip',
  'Incline Smith Press':'shoulder_elbow','Incline DB Press':'shoulder_elbow','Flat DB Press':'shoulder_elbow',
  'Overhead Cable Extension':'elbow','Skull Crushers':'elbow','Rope Pushdown':'elbow',
  'Cable Lateral Raise':'shoulder','DB Lateral Raise':'shoulder','Leaning Lateral Raise':'shoulder',
  'Neutral-Grip Lat Pulldown':'shoulder_elbow','Chest-Supported Row (Lat Bias)':'shoulder',
  'Bayesian Curl':'elbow','Incline DB Curl':'elbow','EZ Bar Curl':'elbow','Hammer Curl':'elbow',
  'Wrist Curl':'wrist','Reverse Wrist Curl':'wrist','Reverse Curl':'wrist',
  'Pike Push-Ups':'shoulder_elbow','Wall Handstand Hold':'shoulder',
};

function getSequencingNote(exName, prevExName){
  if(!prevExName||!exName) return null;
  const cur=JOINT_MAP[exName]; const prev=JOINT_MAP[prevExName]; if(!cur||!prev) return null;
  const curJoints=cur.split('_'); const prevJoints=prev.split('_');
  const overlap=curJoints.filter(j=>prevJoints.includes(j));
  if(overlap.length>0) return {level:'info',msg:`Both ${prevExName} and ${exName} stress the ${overlap.join('/')} joint — back-to-back placement increases fatigue. Consider separating with a non-${overlap[0]} exercise.`};
  return null;
}

// ─── PUSH-SET TARGETING ──────────────────────────────────────────────────────
function getPushSetTarget(sugg, plannedSets){
  if(sugg.status!=='increase'||!sugg.weight) return null;
  const pushSetNum=Math.min(3,plannedSets);
  return {setNum:pushSetNum,weight:sugg.weight,warmupWeight:roundW(sugg.weight-getInc('compound')),note:`Set ${pushSetNum}: attempt ${sugg.weight}kg. Sets 1-${pushSetNum-1}: ${roundW(sugg.weight-2.5)}kg to build into it.`};
}

// ─── RECOVERY DEBT ───────────────────────────────────────────────────────────
function getRecoveryDebt(){
  const wk=getWeekKey(0); const today=getTodayIdx(); const daysLeft=6-today;
  const debts=[];
  for(const [id,tgt] of Object.entries(MUSCLE_TARGETS)){
    const done=totalSetsForMuscle(wk,id);
    if(done<tgt.min&&daysLeft<=2) debts.push({muscleId:id,name:tgt.name,done,min:tgt.min,owed:tgt.min-done,color:tgt.color});
  }
  return debts.sort((a,b)=>b.owed-a.owed);
}

// ─── MUSCLE READINESS ────────────────────────────────────────────────────────
function getMuscleReadiness(muscleId){
  const wk=getWeekKey(0); const muscleLogs=state.logs[wk]||{};
  let lastDays=null, lastEffort='';
  // find most recent session for this muscle
  for(const day of SCHEDULE){
    const blk=day.blocks.find(b=>b.muscleId===muscleId); if(!blk) continue;
    for(let d=getTodayIdx()-1;d>=0;d--){
      for(const ex of blk.exercises){
        const sets=(muscleLogs[d]||{})[ex.name]||[];
        if(sets.length>0){
          if(lastDays===null) lastDays=getTodayIdx()-d;
          const efforts=sets.map(s=>s.effort||'M');
          const hasF=efforts.includes('F'); const allE=efforts.every(e=>e==='E');
          lastEffort=hasF?'F':allE?'E':'M';
        }
      }
    }
  }
  if(lastDays===null) return {status:'fresh',note:'No recent data — go by feel today.',icon:'◎'};
  if(lastDays<=1&&lastEffort==='F') return {status:'fatigued',note:`${lastDays===0?'Same day':'Yesterday'}: near-failure session. High fatigue. Reduce volume or skip direct work.`,icon:'⚠'};
  if(lastDays<=1&&lastEffort==='M') return {status:'moderate',note:'Trained yesterday at moderate effort. Should be manageable today.',icon:'~'};
  if(lastDays>=3) return {status:'ready',note:`${lastDays} days since last session — well recovered and ready to push.`,icon:'✓'};
  return {status:'ok',note:`${lastDays} day(s) since last session — adequate recovery.`,icon:'◎'};
}

// ─── POST-SESSION SUMMARY ────────────────────────────────────────────────────
function buildPostSessionSummary(wk, dayIdx, todayBlocks){
  const lines=[], prs=[], warnings=[];
  for(const blk of todayBlocks){
    let totalSets=0;
    for(const ex of blk.exercises){
      const sets=(state.logs[wk]?.[dayIdx]||{})[ex.name]||[];
      totalSets+=sets.length;
      // PR detection
      if(sets.length>0){
        const maxToday=Math.max(...sets.map(s=>s.weight||0));
        const prevBest=state.overload[ex.name]?.weight||0;
        if(maxToday>prevBest&&prevBest>0) prs.push(`${ex.name}: ${maxToday}kg (was ${prevBest}kg)`);
        // MRV warning
        const eff=getEffortFlag(sets);
        if(eff&&eff.level==='danger') warnings.push(`${ex.name}: ${eff.msg}`);
      }
    }
    if(totalSets>0) lines.push({muscle:blk.muscle,sets:totalSets,color:MUSCLE_TARGETS[blk.muscleId]?.color||'#FFC23D'});
  }
  // next session coaching note
  const nextNotes=[];
  for(const blk of todayBlocks){
    for(const ex of blk.exercises){
      const sugg=getWeightSuggestion(ex.name,ex.type,ex.repRange);
      if(sugg.status==='increase') nextNotes.push(`Next: +2.5kg on ${ex.name} → ${sugg.weight}kg`);
    }
  }
  return {muscleSets:lines,prs,warnings,nextNotes:nextNotes.slice(0,3)};
}

// ─── HSPU SPECIAL CASE ──────────────────────────────────────────────────────
function getHSPUSuggestion(exName, repRange){
  const hist=getExHistory(exName,8);
  if(exName==='Wall Handstand Hold') return {status:'skill',weight:null,repsText:'max hold',reasoning:'Focus on active shoulders, core lock, and scapular depression. Beat your last hold time.',badge:'SKILL WORK',badgeColor:'#FFC23D',pushSet:null};
  return getWeightSuggestion(exName,'compound',repRange);
}
