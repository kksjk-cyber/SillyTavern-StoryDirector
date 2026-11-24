// Lightweight SAG-inspired event/entity joins. No global graph or additional service.
const unique=a=>[...new Set(a)];
const clean=(x,n=180)=>typeof x==='string'?x.trim().slice(0,n):'';
export function createEntityIndex(entries){
 const entities=new Map(),byId=new Map();
 for(const e of entries){byId.set(e.id,e);for(const t of unique([...(e.entities||[]),...(e.tags||[])].map(x=>x.trim().toLowerCase()).filter(Boolean))){if(!entities.has(t))entities.set(t,new Set());entities.get(t).add(e.id);}}
 return {entities,byId};
}
export function expand(index,seeds,{world='',limit=24,hops=2,fanout=24}={}){
 const out=new Map(),paths=new Map();const seedIds=new Set(seeds.map(s=>s.entry.id));
 const valid=e=>e&&(!world||!e.world||e.world===world);
 for(const [i,s] of seeds.entries())if(valid(s.entry)){out.set(s.entry.id,{entry:s.entry,score:1/(1+i*.15),hop:0});paths.set(s.entry.id,[s.entry.id]);}
 let frontier=[...out.values()].slice(0,8);
 for(let h=1;h<=hops;h++){
  const next=new Map();for(const node of frontier){const e=node.entry;
   for(const tag of unique([...(e.entities||[]),...(e.tags||[])].map(t=>t.toLowerCase()))){const links=index.entities.get(tag);if(!links||links.size>fanout)continue;
    for(const id of links){const target=index.byId.get(id);if(!valid(target)||out.has(id)||(e.world&&target.world&&e.world!==target.world))continue;
      const score=node.score*.7/Math.sqrt(Math.max(1,links.size-1));const prev=next.get(id);if(!prev||score>prev.score)next.set(id,{entry:target,score,hop:h,path:[...paths.get(e.id),tag,id]});
    }
   }
  }
  frontier=[...next.values()].sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id)).slice(0,limit);for(const x of frontier){out.set(x.entry.id,x);paths.set(x.entry.id,x.path);}if(!frontier.length)break;
 }
 // Reserve a few slots for actual relational evidence instead of allowing all seeds to crowd it out.
 const ranked=[...out.values()].sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id));const related=ranked.filter(x=>!seedIds.has(x.entry.id)).slice(0,Math.floor(limit/3));const base=ranked.filter(x=>seedIds.has(x.entry.id)).slice(0,limit-related.length);
 return [...base,...related].map(x=>({...x,path:paths.get(x.entry.id)}));
}
export const initial=()=>({known:[],last:{},scene:{},events:{},goals:[]});
export function normalizeState(s){return {...initial(),...s,events:{...(s?.events||{})},goals:Array.isArray(s?.goals)?s.goals:[]};}
export function eventPlan(raw,prior,candidates,history,world=''){
 const p=normalizeState(prior);const map=new Map(candidates.map(x=>[x.entry.id,x.entry]));
 const recent=history.slice(-12).map(m=>String(m.mes||''));const updates=[];
 for(const x of Array.isArray(raw?.updates)?raw.updates.slice(0,12):[]){const e=map.get(x?.id);if(!e||e.kind!=='event'||(world&&e.world&&world!==e.world))continue;
  const old=p.events[e.id]?.status;const target=x.status;const quote=clean(x.evidence,240);
  // Completion and start require a quoted observation already in the conversation.
  if(!['active','resolved','abandoned'].includes(target)||quote.length<4||!recent.some(t=>t.includes(quote)))continue;
  if(target==='active'&&!['offered','active'].includes(old))continue;
  if(['resolved','abandoned'].includes(target)&&old!=='active')continue;
  if(!updates.some(u=>u.id===e.id))updates.push({id:e.id,status:target,evidence:quote});
 }
 // Goals reference existing reviewed entries, never freeform generated instructions.
 const goals=[];for(const x of Array.isArray(raw?.goals)?raw.goals.slice(0,8):[]){const e=map.get(x?.id);if(!e||e.kind!=='event'||goals.some(g=>g.id===e.id))continue;const horizon=Number(x.horizon);if(!Number.isInteger(horizon)||horizon<1||horizon>8)continue;goals.push({id:e.id,horizon});}
 return {updates,goals};
}
export function applyLifecycle(prior,plan,used,turn,{ttl=6}={}){
 const p=normalizeState(prior);const events={...p.events};for(const [id,e] of Object.entries(events))if(e.status==='offered'&&turn-e.turn>=ttl)events[id]={...e,status:'expired',turn};
 for(const u of plan.updates||[])events[u.id]={status:u.status,turn,evidence:u.evidence};
 for(const e of used)if(e.kind==='event'&&(!events[e.id]||events[e.id].status==='expired'))events[e.id]={status:'offered',turn};
 const goals=new Map(p.goals.filter(g=>g.due>=turn&&!['resolved','abandoned','expired'].includes(events[g.id]?.status)).map(g=>[g.id,g]));
 for(const g of plan.goals||[])if(!goals.has(g.id)&&!['resolved','abandoned','expired'].includes(events[g.id]?.status))goals.set(g.id,{id:g.id,due:turn+g.horizon});
 return {...p,events,goals:[...goals.values()].slice(0,8)};
}
export function candidateWithMemory(candidates,index,prior,world='',limit=24){
 const p=normalizeState(prior);const retained=[];for(const [id,e] of Object.entries(p.events))if(['offered','active'].includes(e.status))retained.push(id);for(const g of p.goals)retained.push(g.id);
 const result=new Map();for(const id of unique(retained)){const e=index.byId.get(id);if(e&&(!world||!e.world||e.world===world))result.set(id,{entry:e,score:2,hop:-1,path:[id]});if(result.size>=Math.min(8,limit))break;}
 for(const item of candidates)if(!result.has(item.entry.id)&&result.size<limit)result.set(item.entry.id,item);return [...result.values()];
}
export function snapshotState(snapshots,history,key){for(let i=history.length;i>0;i--){const s=snapshots[key(history.slice(0,i))];if(s)return normalizeState(s);}return initial();}
export function isAppendCommit(base,current,key){return current.length===base.length+1&&!current.at(-1)?.is_user&&key(current.slice(0,-1))===key(base)&&!!String(current.at(-1)?.mes||'').trim();}
export function lifecycleFilter(ids,state){return ids.filter(id=>!['resolved','abandoned'].includes(state.events?.[id]?.status));}
