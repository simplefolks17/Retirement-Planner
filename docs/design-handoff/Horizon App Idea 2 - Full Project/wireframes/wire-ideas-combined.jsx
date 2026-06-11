// wire-ideas-combined.jsx — unified Ideas page (low-fi, interactive).
// The Arc is always the hero. All four mode panels project their impact
// as a dotted alternative line on the Arc (solid = today, dotted = what-if).
// Load after wire-kit.jsx.

// ── arc coordinate helpers ──────────────────────────────────────────────────
const IC_VW = 1200, IC_VH = 210;
const IC_PL = 54, IC_PR = 54;
// hand-tuned piecewise y values for the base arc (today's plan)
const IC_BASE_Y = [[30,196],[40,180],[50,158],[60,118],[65,82],[70,64],[75,72],[80,92],[85,114],[90,132]];
function icX(age){ return IC_PL + (age-30)/60*(IC_VW-IC_PL-IC_PR); }
function icY(age){
  for(let i=0;i<IC_BASE_Y.length-1;i++){
    const [a0,y0]=IC_BASE_Y[i],[a1,y1]=IC_BASE_Y[i+1];
    if(age>=a0&&age<=a1) return y0+(y1-y0)*(age-a0)/(a1-a0);
  }
  return IC_BASE_Y[IC_BASE_Y.length-1][1];
}

// scenario dotted-line paths (approximate bezier, all start at today)
const IC_PATHS = {
  base:     "M 54 196 C 160 186 230 152 370 120 C 450 100 500 78 570 60 C 612 46 644 38 668 36 C 720 34 744 34 762 36 C 844 44 960 76 1146 132",
  retire60: "M 54 196 C 155 188 222 158 360 134 C 434 116 482 100 558 94 C 598 90 630 92 665 98 C 730 110 856 130 1146 168",
  saveMore: "M 54 196 C 160 184 230 146 370 108 C 450 84 500 60 570 40 C 612 26 644 18 668 16 C 720 14 744 14 762 18 C 844 26 960 56 1146 110",
  retire63: "M 54 196 C 158 187 228 154 366 124 C 444 104 494 80 566 62 C 608 48 640 42 665 40 C 718 38 742 38 760 42 C 840 50 956 80 1146 138",
  bigTrip:  "M 54 196 C 160 186 230 152 370 120 C 450 100 500 78 570 60 C 612 46 644 38 668 36 C 720 34 744 34 762 36 C 808 40 844 52 866 46 C 920 50 1000 82 1146 136",
};
const IC_SCENARIOS = {
  retire60: { path:"retire60", label:"Retire at 60", stats:{retire:"60", income:"$7,100", nest:"$2.6M", left:"$420k"} },
  saveMore: { path:"saveMore", label:"Save $300 more/mo", stats:{retire:"64", income:"$9,100", nest:"$3.4M", left:"$1.8M"} },
  retire63: { path:"retire63", label:"Retire at 63", stats:{retire:"63", income:"$7,900", nest:"$2.9M", left:"$720k"} },
  bigTrip:  { path:"bigTrip",  label:"Big trip at 70 · $40k", stats:{retire:"65", income:"$7,800", nest:"$3.1M", left:"$960k"} },
};
const IC_BASE_STATS = { retire:"65", income:"$8,200", nest:"$3.1M", left:"$1.4M" };

// ── arc hero component ──────────────────────────────────────────────────────
function ICArcHero({ scenario, lifeEvents }){
  const dPath = scenario ? IC_PATHS[scenario.path] : null;
  const milestones = [{age:30,label:"Today",ck:"good"},{age:46,label:"$1M",ck:"accent"},
    {age:57,label:"$2M",ck:"accent"},{age:65,label:"Retire",ck:"accent"},{age:90,label:"For life",ck:"warm"}];
  return (
    <div style={{position:"relative",width:"100%",height:IC_VH,flexShrink:0}}>
      <svg width="100%" height={IC_VH} viewBox={`0 0 ${IC_VW} ${IC_VH}`}
        preserveAspectRatio="none" style={{display:"block"}}>
        <defs>
          <linearGradient id="ica-f" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={WK.good} stopOpacity="0.18"/>
            <stop offset="55%" stopColor={WK.accent} stopOpacity="0.22"/>
            <stop offset="100%" stopColor={WK.warm} stopOpacity="0.16"/>
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[55,100,148].map((y,i)=>(
          <line key={i} x1={IC_PL} x2={IC_VW-IC_PR} y1={y} y2={y}
            stroke={WK.line2} strokeWidth="1" strokeDasharray="2 8" opacity="0.55"/>
        ))}
        {/* area + today's plan */}
        <path d={IC_PATHS.base+` L ${IC_VW-IC_PR} ${IC_VH-14} L ${IC_PL} ${IC_VH-14} Z`}
          fill="url(#ica-f)"/>
        <path d={IC_PATHS.base} fill="none" stroke={WK.ink}
          strokeWidth="2.6" strokeLinecap="round"/>
        {/* retire divider */}
        <line x1={icX(65)} x2={icX(65)} y1={8} y2={IC_VH-14}
          stroke={WK.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.35"/>
        {/* dotted what-if overlay */}
        {dPath && (
          <path d={dPath} fill="none" stroke={WK.accent}
            strokeWidth="2.4" strokeLinecap="round" strokeDasharray="8 5"/>
        )}
        {/* life event pins */}
        {lifeEvents && lifeEvents.map(({age,label},i)=>(
          <g key={i}>
            <line x1={icX(age)} x2={icX(age)} y1={icY(age)-8} y2={icY(age)-34}
              stroke={WK.warm} strokeWidth="1.8"/>
            <circle cx={icX(age)} cy={icY(age)} r="6.5" fill={WK.card}
              stroke={WK.warm} strokeWidth="2.5"/>
            <circle cx={icX(age)} cy={icY(age)} r="2.5" fill={WK.warm}/>
          </g>
        ))}
        {/* milestone dots */}
        {milestones.map(({age,ck})=>(
          <circle key={age} cx={icX(age)} cy={icY(age)} r="4.5"
            fill={WK.card} stroke={WK[ck]} strokeWidth="2.4"/>
        ))}
        {/* baseline */}
        <line x1={IC_PL} x2={IC_VW-IC_PR} y1={IC_VH-14} y2={IC_VH-14}
          stroke={WK.line2} strokeWidth="1.5"/>
      </svg>
      {/* milestone labels */}
      {milestones.map(({age,label})=>(
        <div key={age} style={{position:"absolute",
          left:`${icX(age)/IC_VW*100}%`,top:`${icY(age)/IC_VH*100}%`,
          transform:"translate(-50%,-175%)",font:`400 11.5px ${WUI}`,color:WK.mut,
          background:WK.card,border:`1.5px solid ${WK.line2}`,borderRadius:6,
          padding:"2px 7px",whiteSpace:"nowrap",zIndex:2}}>
          {label}
        </div>
      ))}
      {/* life event labels */}
      {lifeEvents && lifeEvents.map(({age,label},i)=>(
        <div key={i} style={{position:"absolute",
          left:`${icX(age)/IC_VW*100}%`,top:`${(icY(age)-34)/IC_VH*100}%`,
          transform:"translate(-50%,-100%)",font:`700 11.5px ${WUI}`,color:WK.ink,
          background:WK.card,border:`2px solid ${WK.warm}`,borderRadius:7,
          padding:"3px 10px",whiteSpace:"nowrap",zIndex:3}}>
          {label}
        </div>
      ))}
      {/* what-if label + dotted legend */}
      {dPath && (
        <div style={{position:"absolute",right:58,top:8,display:"flex",alignItems:"center",gap:6}}>
          <svg width="26" height="8">
            <line x1="0" y1="4" x2="26" y2="4" stroke={WK.accent}
              strokeWidth="2.4" strokeDasharray="8 5"/>
          </svg>
          <span style={{font:`600 12px ${WUI}`,color:WK.accent}}>{scenario.label}</span>
        </div>
      )}
      {/* age axis labels */}
      {[30,40,50,60,65,70,80,90].map(a=>(
        <div key={a} style={{position:"absolute",left:`${icX(a)/IC_VW*100}%`,bottom:0,
          transform:"translateX(-50%)",font:`500 10px ${WMONO}`,color:WK.faint}}>{a}</div>
      ))}
    </div>
  );
}

// ── stats row with strikethroughs ──────────────────────────────────────────
function ICStats({ scenario }){
  const s = scenario?.stats;
  const stat=(label,bval,sval,warm)=>(
    <WCard key={label} style={{flex:1,padding:"10px 12px"}}>
      <div style={{font:`400 11.5px ${WUI}`,color:WK.mut,marginBottom:5}}>{label}</div>
      <div style={{display:"flex",alignItems:"baseline",gap:5,flexWrap:"nowrap"}}>
        {s && sval!==bval ? (
          <>
            <span style={{font:`400 17px ${WMONO}`,color:WK.faint,textDecoration:"line-through"}}>{bval}</span>
            <span style={{font:`700 20px ${WMONO}`,color:warm?WK.warm:WK.accent}}>{sval}</span>
          </>
        ):(
          <span style={{font:`700 20px ${WMONO}`,color:warm?WK.warm:WK.ink}}>{bval}</span>
        )}
      </div>
    </WCard>
  );
  return (
    <div style={{display:"flex",gap:9,marginTop:8,flexShrink:0}}>
      {stat("Retire at", IC_BASE_STATS.retire, s?.retire)}
      {stat("Income / mo", IC_BASE_STATS.income, s?.income, true)}
      {stat("Nest egg", IC_BASE_STATS.nest, s?.nest)}
      {stat("Left at 90", IC_BASE_STATS.left, s?.left)}
      {s && (
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 8px",flexShrink:0}}>
          <WBtn primary>Make this my plan</WBtn>
          <WBtn>Save</WBtn>
        </div>
      )}
    </div>
  );
}

// ── mode buttons ───────────────────────────────────────────────────────────
const IC_MODES=[
  {k:"life",    l:"Drop life onto timeline"},
  {k:"dials",   l:"Dial your future"},
  {k:"suggest", l:"Horizon suggestions"},
  {k:"askit",   l:"What if…  type your own"},
];
function ICModeBar({mode,setMode,clearScenario}){
  return (
    <div style={{display:"flex",gap:8,margin:"10px 0 0",flexShrink:0}}>
      {IC_MODES.map(({k,l})=>{
        const on=mode===k;
        return <button key={k} onClick={()=>{setMode(on?null:k);if(!on)clearScenario();}}
          style={{flex:1,padding:"9px 12px",borderRadius:10,cursor:"pointer",
            border:`2px solid ${on?WK.accent:WK.line2}`,
            background:on?`${WK.accent}14`:WK.card,
            font:`${on?700:400} 13.5px ${WUI}`,color:on?WK.ink:WK.mut,
            textAlign:"center",transition:"all .12s"}}>{l}</button>;
      })}
    </div>
  );
}

// ── mode panels ────────────────────────────────────────────────────────────
function ICPanelLife({setScenario,lifeEvents,setLifeEvents}){
  const events=[
    {l:"Buy a home",      age:40,scen:"bigTrip"},
    {l:"Kid's college",   age:52,scen:"retire63"},
    {l:"Big trip · $40k", age:70,scen:"bigTrip"},
    {l:"Downsize house",  age:72,scen:"saveMore"},
    {l:"Part-time at 60", age:60,scen:"retire60"},
    {l:"Gift to kids",    age:58,scen:"retire63"},
  ];
  const isPlaced=l=>lifeEvents.some(e=>e.label===l);
  return (
    <WCard style={{padding:14,flexShrink:0}}>
      <div style={{font:`700 14px ${WSKETCH}`,color:WK.ink,marginBottom:8}}>Click to place on your arc</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {events.map(({l,age,scen})=>{
          const placed=isPlaced(l);
          return <button key={l} onClick={()=>{
            if(placed){setLifeEvents(ev=>ev.filter(e=>e.label!==l));}
            else{setLifeEvents(ev=>[...ev,{label:l,age}]);setScenario(IC_SCENARIOS[scen]);}
          }} style={{padding:"6px 13px",borderRadius:999,cursor:"pointer",
            border:`2px solid ${placed?WK.warm:WK.line2}`,
            background:placed?`${WK.warm}14`:"transparent",
            font:`${placed?700:400} 13px ${WUI}`,color:placed?WK.ink:WK.mut}}>
            {placed?"✓  ":""}{l}
          </button>;
        })}
      </div>
      {lifeEvents.length>0 && <div style={{marginTop:8}}>
        <WAnno dir="down">{lifeEvents.length} event{lifeEvents.length>1?"s":""} placed. The dotted line shows cumulative impact on your arc.</WAnno>
      </div>}
    </WCard>
  );
}
function ICPanelDials({setScenario}){
  return (
    <WCard style={{padding:14,display:"flex",alignItems:"center",gap:16,flexShrink:0,flexWrap:"wrap"}}>
      <span style={{font:`700 14px ${WSKETCH}`,color:WK.ink,flexShrink:0}}>Adjust any dial:</span>
      <WStepper label="Retire at" value="65" w={148}/>
      <WStepper label="Extra savings / mo" value="+$0" w={168}/>
      <WStepper label="Monthly spend" value="$6,000" w={168}/>
      <WStepper label="Return rate" value="7%" w={128}/>
      <div style={{display:"flex",gap:8,flexShrink:0}}>
        <button onClick={()=>setScenario(IC_SCENARIOS.retire63)} style={{padding:"9px 18px",borderRadius:9,cursor:"pointer",
          border:`2px solid ${WK.accent}`,background:`${WK.accent}14`,
          font:`700 13.5px ${WUI}`,color:WK.ink}}>Show on arc →</button>
        <WAnno style={{maxWidth:160}}>In hi-fi: arc updates live as you turn each dial.</WAnno>
      </div>
    </WCard>
  );
}
function ICPanelSuggest({setScenario,scenario}){
  const cards=[
    {l:"Retire 2 years earlier", sub:"Save $250/mo more, retire at 63.", scen:"retire63", c:WK.good},
    {l:"Retire at 60",           sub:"5 yrs sooner, income adjusted.",    scen:"retire60", c:WK.warm},
    {l:"Save $300 more / mo",    sub:"Retire at 64, income up $900/mo.",  scen:"saveMore", c:WK.good},
    {l:"Big trip at 70",         sub:"One-off $40k — still funded.",      scen:"bigTrip",  c:WK.accent},
  ];
  return (
    <WCard style={{padding:14,display:"flex",gap:10,flexShrink:0}}>
      {cards.map(({l,sub,scen,c})=>{
        const on=scenario?.path===scen;
        return <button key={l} onClick={()=>setScenario(on?null:IC_SCENARIOS[scen])}
          style={{flex:1,padding:"12px 12px",borderRadius:10,cursor:"pointer",textAlign:"left",
            border:`2px solid ${on?c:WK.line2}`,background:on?`${c}12`:"transparent"}}>
          <span style={{width:9,height:9,borderRadius:999,background:c,display:"block",marginBottom:6}}/>
          <div style={{font:`700 14px ${WSKETCH}`,color:WK.ink,lineHeight:1.05}}>{l}</div>
          <div style={{font:`400 12.5px ${WUI}`,color:WK.mut,marginTop:4,lineHeight:1.3}}>{sub}</div>
        </button>;
      })}
    </WCard>
  );
}
function ICPanelAsk({setScenario}){
  const [answered,setAnswered]=React.useState(false);
  const prompts=["I retire at 60?","I save $300 more/mo?","I take a big trip at 70?","I work part-time from 62?"];
  const runAsk=()=>{setScenario(IC_SCENARIOS.retire60);setAnswered(true);};
  return (
    <WCard style={{padding:14,display:"flex",flexDirection:"column",gap:10,flexShrink:0}}>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <span style={{font:`700 17px ${WSKETCH}`,color:WK.accent,flexShrink:0}}>What if…</span>
        <div style={{flex:1,height:40,borderRadius:8,border:`2px solid ${WK.ink}`,background:WK.card,
          display:"flex",alignItems:"center",paddingLeft:12}}>
          <span style={{font:`400 15px ${WUI}`,color:WK.mut}}>I retire at 60 instead of 65?</span>
          <span style={{width:2,height:18,background:WK.accent,marginLeft:2,opacity:0.6}}/>
        </div>
        <button onClick={runAsk} style={{padding:"9px 18px",borderRadius:9,cursor:"pointer",flexShrink:0,
          border:`2px solid ${WK.accent}`,background:`${WK.accent}14`,
          font:`700 13.5px ${WUI}`,color:WK.ink}}>Show on arc →</button>
      </div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
        <span style={{font:`400 13px ${WUI}`,color:WK.faint,alignSelf:"center"}}>try:</span>
        {prompts.map(p=>(
          <button key={p} onClick={runAsk} style={{padding:"5px 11px",borderRadius:999,cursor:"pointer",
            border:`2px dashed ${WK.line2}`,background:"transparent",
            font:`400 13px ${WUI}`,color:WK.mut}}>{p}</button>
        ))}
      </div>
      {answered && <WAnno dir="down">Dotted line on the arc above shows your what-if. Stats update below. In hi-fi: AI interprets any plain-English question.</WAnno>}
    </WCard>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
function IdeasCombined(){
  const [mode,setMode]=React.useState(null);
  const [scenario,setScenario]=React.useState(null);
  const [lifeEvents,setLifeEvents]=React.useState([]);
  const clearScenario=()=>{setScenario(null);setLifeEvents([]);};
  return (
    <WScreen title="Ideas · Combined (I4+ unified)" w={1340} h={900} pad={false}>
      <div style={{padding:"16px 22px 0",flexShrink:0}}><WNav active="Ideas"/></div>
      <div style={{padding:"4px 22px 0",flexShrink:0}}>
        <WHead title="Your future, explored."
          sub="Pick a mode below — every what-if shows as a dotted line on your arc. Solid = today's plan. Dotted = what changes."/>
      </div>
      <div style={{padding:"0 22px",flexShrink:0}}>
        <ICArcHero scenario={scenario} lifeEvents={lifeEvents.length>0?lifeEvents:null}/>
      </div>
      <div style={{padding:"0 22px",flexShrink:0}}>
        <ICModeBar mode={mode} setMode={setMode} clearScenario={clearScenario}/>
      </div>
      {mode && (
        <div style={{padding:"10px 22px 0",flexShrink:0}}>
          {mode==="life"    && <ICPanelLife setScenario={setScenario} lifeEvents={lifeEvents} setLifeEvents={setLifeEvents}/>}
          {mode==="dials"   && <ICPanelDials setScenario={setScenario}/>}
          {mode==="suggest" && <ICPanelSuggest setScenario={setScenario} scenario={scenario}/>}
          {mode==="askit"   && <ICPanelAsk setScenario={setScenario}/>}
        </div>
      )}
      <div style={{padding:"8px 22px 16px",marginTop:"auto",flexShrink:0}}>
        <ICStats scenario={scenario}/>
      </div>
    </WScreen>
  );
}

Object.assign(window, { IdeasCombined });
