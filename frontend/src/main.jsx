import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Users, Sparkles, Save, Plus, X, Settings2, Download, GripVertical } from 'lucide-react';
import './styles.css';

const API = '/api';
const BASE_ROLES = ['MD', 'RN', 'MA', 'Sonographer', 'FOS'];
const LANES = ['Admin', 'Off', 'Remote', 'Hospital', 'Vacation'];
const COLORS = { MD:'#f8d676', RN:'#fda4af', MA:'#86efac', Sonographer:'#c4b5fd', FOS:'#7dd3fc' };
const deep = value => JSON.parse(JSON.stringify(value));

const fallback = {
  version: 2,
  date: '2026-10-12',
  period: 'Full Day',
  roles: BASE_ROLES,
  sites: ['Kennesaw','Smyrna','Douglasville','Avalon','LaGrange','Paulding','Woodstock','Griffin/Sunday'],
  clinicTypes: {
    'Standard Cardiology': { mode:'In-person', requirements:{MD:1,RN:0,MA:1,Sonographer:1,FOS:1} },
    'Double Provider': { mode:'In-person', requirements:{MD:2,RN:1,MA:3,Sonographer:2,FOS:1} },
    'Fetal Clinic': { mode:'In-person', requirements:{MD:1,RN:0,MA:0,Sonographer:1,FOS:0} },
    'Hybrid Echo': { mode:'Hybrid', requirements:{MD:1,RN:0,MA:0,Sonographer:1,FOS:1} },
    'Telemedicine': { mode:'Telemedicine', requirements:{MD:1,RN:0,MA:0,Sonographer:0,FOS:0} },
    'Remote Echo': { mode:'Remote diagnostics', requirements:{MD:0,RN:0,MA:0,Sonographer:1,FOS:1} }
  },
  siteClinics: {Kennesaw:'Standard Cardiology',Smyrna:'Standard Cardiology',Douglasville:'Standard Cardiology',Avalon:'Standard Cardiology',LaGrange:'Hybrid Echo',Paulding:'Standard Cardiology',Woodstock:'Standard Cardiology','Griffin/Sunday':'Standard Cardiology'},
  staff: [['Dr. Sacks','MD'],['Dr. Makadia','MD'],['Dr. Yaari','MD'],['Raven','RN'],['Micah','MA'],['Kyonna','MA'],['Whittney','MA'],['Kim','Sonographer'],['Brittany','Sonographer'],['Mallory','Sonographer'],['Dannille','FOS'],['Heather','FOS'],['Nicole','FOS'],['Samantha','FOS'],['Jackie','FOS'],['Delaine','Sonographer'],['Marshall','MD']],
  assignments: {
    Kennesaw:{MD:['Dr. Sacks'],RN:[],MA:['Micah'],Sonographer:['Kim'],FOS:['Dannille','Heather']},
    Smyrna:{MD:['Dr. Makadia'],RN:[],MA:['Kyonna'],Sonographer:['Brittany'],FOS:['Nicole']},
    Douglasville:{MD:['Dr. Yaari'],RN:['Raven'],MA:['Whittney'],Sonographer:['Mallory'],FOS:['Samantha']}
  },
  lanes:{Admin:['Jackie'],Off:[],Remote:['Marshall'],Hospital:['Delaine'],Vacation:[]},
  overrides:{daily:{},weekly:{}},
  notes:{},
  audit:[]
};

function weekStart(value) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0,10);
}

function normalize(raw) {
  const state = {...deep(fallback), ...deep(raw || {})};
  state.roles = state.roles?.length ? state.roles : BASE_ROLES;
  state.assignments ||= {};
  state.lanes ||= {};
  state.overrides ||= {daily:{},weekly:{}};
  state.overrides.daily ||= {};
  state.overrides.weekly ||= {};
  state.audit ||= [];
  state.notes ||= {};
  LANES.forEach(lane => state.lanes[lane] ||= []);
  state.sites.forEach(site => {
    state.assignments[site] ||= {};
    state.roles.forEach(role => state.assignments[site][role] ||= []);
    state.siteClinics[site] ||= Object.keys(state.clinicTypes)[0];
  });
  Object.values(state.clinicTypes).forEach(type => state.roles.forEach(role => type.requirements[role] ??= 0));
  return state;
}

function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState('All Roles');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('Daily Huddle');
  const [toast, setToast] = useState('');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('Ask about staffing, coverage, clinic requirements, or vacations.');
  const [clinicOpen, setClinicOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/state`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setState(normalize(data)))
      .catch(() => setState(normalize(fallback)));
  }, []);

  const notify = message => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  if (!state) return <div className="loading">Loading Workforce Operations Center…</div>;

  const roles = state.roles;
  const shown = view === 'All Roles' ? roles : [view];
  const occupied = new Set([
    ...state.sites.flatMap(site => roles.flatMap(role => state.assignments[site]?.[role] || [])),
    ...Object.values(state.lanes).flat()
  ]);

  function effective(site, targetDate = state.date) {
    const type = state.siteClinics[site];
    const base = {...(state.clinicTypes[type]?.requirements || {})};
    const weekly = state.overrides.weekly[`${weekStart(targetDate)}|${site}`];
    const daily = state.overrides.daily[`${targetDate}|${site}`];
    return {
      type,
      source: daily ? 'Daily override' : weekly ? 'Weekly override' : 'Baseline',
      requirements: {...base, ...weekly, ...daily}
    };
  }

  function update(mutator) {
    setState(previous => {
      const next = deep(previous);
      mutator(next);
      return next;
    });
  }

  function removeEverywhere(name, draft) {
    draft.sites.forEach(site => draft.roles.forEach(role => {
      draft.assignments[site][role] = draft.assignments[site][role].filter(item => item !== name);
    }));
    LANES.forEach(lane => draft.lanes[lane] = draft.lanes[lane].filter(item => item !== name));
  }

  function assign(name, site, role) {
    const person = state.staff.find(item => item[0] === name);
    if (!person || person[1] !== role) return notify(`Choose a ${role} from the roster`);
    update(draft => {
      removeEverywhere(name, draft);
      draft.assignments[site][role].push(name);
      draft.audit.unshift({at:new Date().toISOString(), action:`Assigned ${name} to ${site} as ${role}`});
    });
    notify(`Assigned ${name}`);
  }

  function moveToLane(name, lane) {
    update(draft => {
      removeEverywhere(name, draft);
      draft.lanes[lane].push(name);
      draft.audit.unshift({at:new Date().toISOString(), action:`Moved ${name} to ${lane}`});
    });
    notify(`Moved ${name} to ${lane}`);
  }

  function remove(name) {
    update(draft => removeEverywhere(name, draft));
  }

  async function save() {
    try {
      const response = await fetch(`${API}/state`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(state)});
      if (!response.ok) throw new Error('Save failed');
      notify('Saved');
    } catch {
      localStorage.setItem('workforce-v2-state', JSON.stringify(state));
      notify('Saved in browser');
    }
  }

  function exportData() {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)], {type:'application/json'}));
    link.download = `workforce-${state.date}.json`;
    link.click();
  }

  function generateCoverage() {
    const changes = [];
    update(draft => {
      draft.sites.forEach(site => {
        const requirement = effective(site).requirements;
        draft.roles.forEach(role => {
          while (draft.assignments[site][role].length < (requirement[role] || 0)) {
            const busy = new Set([
              ...draft.sites.flatMap(other => draft.assignments[other][role]),
              ...Object.values(draft.lanes).flat()
            ]);
            const person = draft.staff.find(item => item[1] === role && !busy.has(item[0]));
            if (!person) break;
            draft.assignments[site][role].push(person[0]);
            changes.push(`${person[0]} → ${site} (${role})`);
          }
        });
      });
      draft.audit.unshift({at:new Date().toISOString(), action:`Generated ${changes.length} draft assignments`});
    });
    setReply(changes.length ? `Draft coverage generated:\n${changes.map(item => `• ${item}`).join('\n')}\n\nReview and save when ready.` : 'No qualified unassigned staff were available for the remaining gaps.');
    notify(`${changes.length} draft assignments`);
  }

  function askAssistant() {
    const query = prompt.toLowerCase();
    const site = state.sites.find(item => query.includes(item.toLowerCase())) || selected?.site;
    const role = roles.find(item => query.includes(item.toLowerCase())) || selected?.role;
    if (!site || !role) {
      setReply('Mention a location and role, or click a staffing cell first. Example: “Why does Kennesaw need one sonographer?”');
      return;
    }
    const details = effective(site);
    const names = state.assignments[site][role];
    const required = details.requirements[role] || 0;
    setReply(`${site} · ${role}\nClinic: ${details.type}\nRequirement source: ${details.source}\nRequired: ${required}\nAssigned: ${names.join(', ') || 'None'}\nMissing: ${Math.max(0, required - names.length)}\n\nThe requirement can be changed for the selected day, the selected week, or the permanent clinic baseline.`);
  }

  return <div className="app">
    <header>
      <div><h1>Workforce Operations Center</h1><p>Daily huddle, clinic templates, staffing coverage, and transparent requirements</p></div>
      <div className="headerActions">
        <button onClick={() => setLocationOpen(true)}>Locations</button>
        <button onClick={() => setRosterOpen(true)}><Users/>Roster</button>
        <button onClick={() => setClinicOpen(true)}><Settings2/>Clinic Types</button>
        <button className="primary" onClick={save}><Save/>Save</button>
      </div>
    </header>

    <nav>{['Daily Huddle','Weekly Overview','Audit'].map(item => <button key={item} className={tab===item?'active':''} onClick={() => setTab(item)}>{item}</button>)}</nav>

    {tab === 'Daily Huddle' && <>
      <section className="toolbar">
        <label>Date<input type="date" value={state.date} onChange={event => setState({...state,date:event.target.value})}/></label>
        <label>Period<select value={state.period} onChange={event => setState({...state,period:event.target.value})}><option>Full Day</option><option>AM</option><option>PM</option></select></label>
        <label>View<select value={view} onChange={event => setView(event.target.value)}><option>All Roles</option>{roles.map(role => <option key={role}>{role}</option>)}</select></label>
        <button className="coverage" onClick={generateCoverage}><Sparkles/>Generate Draft Coverage</button>
        <button onClick={exportData}><Download/>Export</button>
      </section>

      <div className="content">
        <main>
          <div className="legend"><span className="lg covered">Covered</span><span className="lg shortage">Missing</span><span className="lg excess">Extra</span><span className="lg none">Not needed</span></div>
          <div className="tableWrap"><table><thead><tr><th>Staff Scheduling</th>{shown.map(role => <th key={role}>{role}</th>)}</tr></thead><tbody>
            {state.sites.map(site => <tr key={site}>
              <td className="site"><strong>{site}</strong><small>{state.siteClinics[site]}</small></td>
              {shown.map(role => <BoardCell key={role} site={site} role={role} state={state} details={effective(site)} onAssign={assign} onMove={assign} onRemove={remove} onSelect={() => setSelected({site,role})}/>) }
            </tr>)}
          </tbody></table></div>
          <Lanes state={state} onDrop={moveToLane}/>
        </main>

        <aside>
          <section className="assistant"><h2><Sparkles/>Staffing Assistant</h2><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Why does Kennesaw need one sonographer? Cover today's absences."/><button className="primary" onClick={askAssistant}>Ask</button><pre>{reply}</pre></section>
          <section><h2>Unassigned Staff</h2><p className="muted">Drag to a cell, or type a name inside the cell.</p>{state.staff.filter(item => (view==='All Roles'||item[1]===view) && !occupied.has(item[0])).map(item => <StaffPill key={item[0]} name={item[0]} role={item[1]}/>)}</section>
          {selected && <CellEditor selected={selected} state={state} update={update} effective={effective} notify={notify}/>} 
        </aside>
      </div>
    </>}

    {tab === 'Weekly Overview' && <Weekly state={state} effective={effective}/>} 
    {tab === 'Audit' && <Audit state={state}/>} 
    {clinicOpen && <ClinicModal state={state} update={update} close={() => setClinicOpen(false)} notify={notify}/>} 
    {rosterOpen && <RosterModal state={state} update={update} close={() => setRosterOpen(false)} notify={notify}/>} 
    {locationOpen && <LocationModal state={state} update={update} close={() => setLocationOpen(false)} notify={notify}/>} 
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function StaffPill({name, role, onRemove}) {
  return <div className="pill" draggable onDragStart={event => event.dataTransfer.setData('application/json',JSON.stringify({name,role}))} style={{'--role':COLORS[role] || '#cbd5e1'}}>
    <GripVertical/><span>{name}</span><small>{role}</small>{onRemove && <button onClick={onRemove} aria-label={`Remove ${name}`}><X/></button>}
  </div>;
}

function BoardCell({site, role, state, details, onAssign, onMove, onRemove, onSelect}) {
  const [typed,setTyped] = useState('');
  const required = details.requirements[role] || 0;
  const names = state.assignments[site][role];
  const status = required===0 && !names.length ? 'none' : names.length<required ? 'shortage' : names.length>required ? 'excess' : 'covered';
  return <td className={`cell ${status}`} onClick={onSelect} onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault();const item=JSON.parse(event.dataTransfer.getData('application/json'));onMove(item.name,site,role)}}>
    {names.map(name => <StaffPill key={name} name={name} role={role} onRemove={() => onRemove(name)}/>)}
    <div className="cellStatus"><b>Required {required}</b> · Assigned {names.length} · Missing {Math.max(0,required-names.length)}<br/><span>{details.source}</span></div>
    <div className="assignBox"><input list={`list-${site}-${role}`} value={typed} onChange={event => setTyped(event.target.value)} onClick={event => event.stopPropagation()} placeholder={`Type or choose ${role}`}/><datalist id={`list-${site}-${role}`}>{state.staff.filter(item => item[1]===role).map(item => <option key={item[0]} value={item[0]}/>)}</datalist><button onClick={event => {event.stopPropagation();onAssign(typed,site,role);setTyped('')}}><Plus/></button></div>
  </td>;
}

function Lanes({state,onDrop}) {
  return <div className="lanes">{LANES.map(lane => <div className="lane" key={lane}><strong>{lane}</strong><div onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault();const item=JSON.parse(event.dataTransfer.getData('application/json'));onDrop(item.name,lane)}}>{state.lanes[lane].map(name => {const role=state.staff.find(item => item[0]===name)?.[1]||'';return <StaffPill key={name} name={name} role={role}/>})}<span className="dropHint">Drop staff here</span></div></div>)}</div>;
}

function CellEditor({selected,state,update,effective,notify}) {
  const details = effective(selected.site);
  const [value,setValue] = useState(details.requirements[selected.role] || 0);
  const [scope,setScope] = useState('daily');
  function apply() {
    update(draft => {
      if (scope === 'baseline') draft.clinicTypes[details.type].requirements[selected.role] = +value;
      else {
        const key = `${scope==='daily'?draft.date:weekStart(draft.date)}|${selected.site}`;
        draft.overrides[scope][key] = {...(draft.overrides[scope][key]||{}), [selected.role]:+value};
      }
      draft.audit.unshift({at:new Date().toISOString(),action:`Changed ${selected.site} ${selected.role} requirement to ${value} (${scope})`});
    });
    notify('Requirement updated');
  }
  function changeClinic(type) {
    update(draft => {draft.siteClinics[selected.site]=type;draft.audit.unshift({at:new Date().toISOString(),action:`Changed ${selected.site} clinic type to ${type}`});});
    notify('Clinic type updated');
  }
  return <section className="selected"><h2>{selected.site} · {selected.role}</h2><label>Clinic type<select value={details.type} onChange={event => changeClinic(event.target.value)}>{Object.keys(state.clinicTypes).map(type => <option key={type}>{type}</option>)}</select></label><p><b>Source:</b> {details.source}<br/><b>Assigned:</b> {state.assignments[selected.site][selected.role].join(', ')||'None'}<br/><b>Required:</b> {details.requirements[selected.role]||0}<br/><b>Missing:</b> {Math.max(0,(details.requirements[selected.role]||0)-state.assignments[selected.site][selected.role].length)}</p><div className="reqEditor"><label>Required {selected.role}<input type="number" min="0" value={value} onChange={event => setValue(event.target.value)}/></label><label>Apply to<select value={scope} onChange={event => setScope(event.target.value)}><option value="daily">Selected day</option><option value="weekly">Selected week</option><option value="baseline">Permanent baseline</option></select></label><button onClick={apply}>Apply</button></div></section>;
}

function Modal({title,children,close}) { return <div className="modalBack"><div className="modal"><button className="close" onClick={close}><X/></button><h2>{title}</h2>{children}</div></div>; }

function ClinicModal({state,update,close,notify}) {
  const [name,setName]=useState(''); const [mode,setMode]=useState('In-person'); const [requirements,setRequirements]=useState(Object.fromEntries(state.roles.map(role=>[role,0])));
  function add(){if(!name.trim())return;update(draft=>{draft.clinicTypes[name]={mode,requirements};draft.audit.unshift({at:new Date().toISOString(),action:`Added clinic type ${name}`});});notify('Clinic type added');setName('');}
  return <Modal title="Clinic Types & Baselines" close={close}><p className="muted">Create in-person, hybrid, telemedicine, remote diagnostic, outreach, or specialty clinic types.</p><div className="typeGrid">{Object.entries(state.clinicTypes).map(([type,data])=><div className="typeCard" key={type}><b>{type}</b><small>{data.mode}</small><p>{state.roles.map(role=>`${role} ${data.requirements[role]||0}`).join(' · ')}</p></div>)}</div><h3>Add clinic type</h3><div className="formGrid"><label>Name<input value={name} onChange={event=>setName(event.target.value)} placeholder="Acworth Hybrid Echo"/></label><label>Mode<select value={mode} onChange={event=>setMode(event.target.value)}>{['In-person','Hybrid','Telemedicine','Remote diagnostics','Administrative','Outreach'].map(item=><option key={item}>{item}</option>)}</select></label></div><div className="roleReqs">{state.roles.map(role=><label key={role}>{role}<input type="number" min="0" value={requirements[role]} onChange={event=>setRequirements({...requirements,[role]:+event.target.value})}/></label>)}</div><button className="primary" onClick={add}>Add Clinic Type</button></Modal>;
}

function RosterModal({state,update,close,notify}) {
  const [name,setName]=useState(''); const [role,setRole]=useState(state.roles[0]);
  function add(){if(!name.trim())return;update(draft=>{draft.staff.push([name,role]);draft.audit.unshift({at:new Date().toISOString(),action:`Added ${name} to roster as ${role}`});});notify('Staff member added');setName('');}
  return <Modal title="Staff Roster" close={close}><div className="rosterList">{state.staff.map(item=><StaffPill key={item[0]} name={item[0]} role={item[1]}/>)}</div><h3>Add staff member</h3><div className="formGrid"><label>Name<input value={name} onChange={event=>setName(event.target.value)}/></label><label>Role<select value={role} onChange={event=>setRole(event.target.value)}>{state.roles.map(item=><option key={item}>{item}</option>)}</select></label></div><button className="primary" onClick={add}>Add to Roster</button></Modal>;
}

function LocationModal({state,update,close,notify}) {
  const [name,setName]=useState(''); const [clinic,setClinic]=useState(Object.keys(state.clinicTypes)[0]);
  function add(){if(!name.trim()||state.sites.includes(name))return;update(draft=>{draft.sites.push(name);draft.siteClinics[name]=clinic;draft.assignments[name]=Object.fromEntries(draft.roles.map(role=>[role,[]]));draft.audit.unshift({at:new Date().toISOString(),action:`Added location ${name}`});});notify('Location added');setName('');}
  return <Modal title="Locations" close={close}><div className="typeGrid">{state.sites.map(site=><div className="typeCard" key={site}><b>{site}</b><small>{state.siteClinics[site]}</small></div>)}</div><h3>Add location</h3><div className="formGrid"><label>Name<input value={name} onChange={event=>setName(event.target.value)} placeholder="Acworth"/></label><label>Default clinic type<select value={clinic} onChange={event=>setClinic(event.target.value)}>{Object.keys(state.clinicTypes).map(item=><option key={item}>{item}</option>)}</select></label></div><button className="primary" onClick={add}>Add Location</button></Modal>;
}

function Weekly({state,effective}) {
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
  return <div className="page"><h2><CalendarDays/>Week of {weekStart(state.date)}</h2><p className="muted">The weekly view summarizes active locations, assignments, and shortages using baseline, weekly, and daily requirements.</p><div className="weekCards">{days.map(day=>{let gaps=0;state.sites.forEach(site=>state.roles.forEach(role=>{const need=effective(site).requirements[role]||0;gaps+=Math.max(0,need-state.assignments[site][role].length)}));return <div className="weekCard" key={day}><b>{day}</b><span>{state.sites.length} locations · {gaps} staffing gaps</span></div>})}</div></div>;
}

function Audit({state}) { return <div className="page"><h2>Audit & Accountability</h2>{state.audit.length?state.audit.map((item,index)=><div className="audit" key={`${item.at}-${index}`}><b>{item.action}</b><span>{item.at}</span></div>):<p>No changes recorded yet.</p>}</div>; }

createRoot(document.getElementById('root')).render(<App/>);
