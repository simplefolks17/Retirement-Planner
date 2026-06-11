// frames-graph.jsx — hero graph, rebuilt from scratch.
// Five distinct chart paradigms, all with:
//   • inset plot (start/end ages never clip)
//   • no floating "horizon marker" — destination lives inside the chart
//   • Arc concept: milestone stops (First Million, Second Million, Retire, For Life)
//   • Columns: good(green)=accumulate vs warm=retirement — always high-contrast
//   • GraphHome: built-in 5-way toggle strip
// Load AFTER frames-pastel.jsx (which sets window.PALS).

const GFONT = "'DM Sans', system-ui, sans-serif";
const GMONO = "'IBM Plex Mono', ui-monospace, monospace";
const GPALS = window.PALS;

// ── data model ───────────────────────────────────────────────────────────────
const AGE0=30, AGE1=90, RET=65, VW=1200, VMAX=3.5e6;
// Piecewise-linear balance anchors
const ANCH=[
  [30,165000],[35,340000],[40,575000],[45,890000],[50,1280000],[55,1775000],
  [60,2380000],[65,3050000],[70,3210000],[75,3050000],[80,2640000],[85,2080000],[90,1400000],
];
function balAt(age){
  if(age<=AGE0) return ANCH[0][1];
  if(age>=AGE1) return ANCH[ANCH.length-1][1];
  for(let i=0;i<ANCH.length-1;i++){
    const [a0,v0]=ANCH[i],[a1,v1]=ANCH[i+1];
    if(age>=a0&&age<=a1) return v0+(v1-v0)*(age-a0)/(a1-a0);
  }
  return ANCH[ANCH.length-1][1];
}
function contribAt(age){ const a=Math.min(age,RET); return 165000+900000*((a-AGE0)/(RET-AGE0)); }
function growthAt(age){ return Math.max(0,balAt(age)-contribAt(age)); }
// Find age when balance first crosses target going up
function crossAge(target){
  for(let a=AGE0;a<AGE1;a++){
    if(balAt(a)<target&&balAt(a+1)>=target)
      return Math.round(a+(target-balAt(a))/(balAt(a+1)-balAt(a)));
  }
  return AGE1;
}
const money=n=>n>=1e6?`$${(n/1e6).toFixed(n%1e6===0?0:1)}M`:`$${Math.round(n/1e3)}k`;

// ── SVG path helpers ─────────────────────────────────────────────────────────
function smoothPath(pts){
  if(pts.length<2) return '';
  let d=`M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
function rangeAges(step=1){ const r=[]; for(let a=AGE0;a<=AGE1;a+=step) r.push(a); return r; }

// ── shared scales ────────────────────────────────────────────────────────────
function makeScales(H,pad){
  const top=pad.t, bot=H-pad.b;
  const xOf=a=>pad.l+(a-AGE0)/(AGE1-AGE0)*(VW-pad.l-pad.r);
  const yOf=v=>top+(1-v/VMAX)*(bot-top);
  return {xOf,yOf,top,bot,H,pad};
}
const pct=(n,total)=>`${(n/total)*100}%`;

// ── shared sub-components ────────────────────────────────────────────────────
function GridLines({t,s,vals=[1e6,2e6,3e6]}){
  return <g>{vals.map((gv,i)=>(
    <line key={i} x1={s.pad.l} x2={VW-s.pad.r} y1={s.yOf(gv)} y2={s.yOf(gv)}
      stroke={t.ink} strokeWidth="1" opacity="0.07" strokeDasharray="2 7"/>
  ))}</g>;
}
function AxisOverlay({t,s,ages=[30,40,50,60,65,70,80,90],vals=[1e6,2e6,3e6],moments={30:"Today",65:"Retire"}}){
  return <React.Fragment>
    {vals.map((gv,i)=>(
      <div key={i} style={{position:"absolute",left:pct(s.pad.l-12,VW),top:pct(s.yOf(gv),s.H),
        transform:"translate(-100%,-50%)",font:`600 10px ${GMONO}`,color:t.faint,whiteSpace:"nowrap"}}>
        {money(gv)}
      </div>
    ))}
    {ages.map(a=>{
      const m=moments[a];
      return <div key={a} style={{position:"absolute",left:pct(s.xOf(a),VW),
        bottom:pct(s.pad.b-28,s.H),transform:"translateX(-50%)",whiteSpace:"nowrap"}}>
        {m
          ? <span style={{font:`700 10.5px ${GFONT}`,color:a===RET?t.accent:t.good,
              background:a===RET?`${t.accent}18`:`${t.good}18`,
              border:`1px solid ${a===RET?`${t.accent}44`:`${t.good}44`}`,
              borderRadius:999,padding:"2px 9px"}}>{m} · {a}</span>
          : <span style={{font:`600 10px ${GMONO}`,color:t.faint}}>{a}</span>}
      </div>;
    })}
  </React.Fragment>;
}
function EndTag({t,s,x,y,head,sub,anchorRight}){
  return <div style={{position:"absolute",left:pct(x,VW),top:pct(y,s.H),
    transform:`translate(${anchorRight?"-100%":"0"},-50%)`,
    marginLeft:anchorRight?-14:14,
    background:t.surf,border:`1px solid ${t.line2}`,borderRadius:11,padding:"7px 12px",
    boxShadow:"0 4px 16px rgba(0,0,0,.11)",whiteSpace:"nowrap",zIndex:2}}>
    <div style={{font:`700 13px ${GMONO}`,color:t.warm}}>{head}</div>
    <div style={{font:`500 10.5px ${GFONT}`,color:t.mut,marginTop:1}}>{sub}</div>
  </div>;
}
function GBox({t,H,children,bg}){
  return <div style={{position:"relative",width:"100%",height:H,borderRadius:16,overflow:"hidden",
    border:`1px solid ${t.line}`,background:bg||t.surf}}>
    {children}
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
//  CONCEPT 1 · THE ARC + MILESTONE STOPS  (combines original #1 + #7)
//  Honest full-life arc with celebratory milestone pills along the journey.
// ════════════════════════════════════════════════════════════════════════════
function GArcStations({t,gid="arcstn",H=320,glow=true}){
  const pad={l:62,r:92,t:38,b:46};
  const s=makeScales(H,pad);
  const pts=rangeAges(1).map(a=>[s.xOf(a),+s.yOf(balAt(a)).toFixed(1)]);
  const line=smoothPath(pts);
  const area=line+` L ${VW-pad.r} ${s.bot} L ${pad.l} ${s.bot} Z`;

  const m1=crossAge(1e6); // ≈ 46
  const m2=crossAge(2e6); // ≈ 57

  // stops rendered as pills (age 90 → EndTag separately)
  // above=true → pill sits above the dot; above=false → below
  // targetVal overrides balAt(age) so milestones show the exact round number
  const stops=[
    {age:30,  label:"Today",          above:true,  ck:"good"},
    {age:m1,  label:"First Million",  above:true,  ck:"accent", targetVal:1e6},
    {age:m2,  label:"Second Million", above:false, ck:"accent", targetVal:2e6},
    {age:RET, label:"Retire",         above:false, ck:"accent"},
  ];

  return <GBox t={t} H={H}>
    <svg width="100%" viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none"
      style={{display:"block",height:H}}>
      <defs>
        <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor={t.good}  stopOpacity="0.20"/>
          <stop offset="55%" stopColor={t.accent} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={t.warm}  stopOpacity="0.24"/>
        </linearGradient>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor={t.good}/>
          <stop offset="55%" stopColor={t.accent}/>
          <stop offset="100%" stopColor={t.warm}/>
        </linearGradient>
        {glow&&<filter id={`${gid}-gf`} x="-5%" y="-60%" width="110%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={t.accent} floodOpacity="0.30"/>
        </filter>}
      </defs>
      {/* retirement-years warm wash */}
      <rect x={s.xOf(RET)} y={s.top}
        width={VW-s.pad.r-s.xOf(RET)} height={s.bot-s.top}
        fill={t.warm} opacity="0.055"/>
      <GridLines t={t} s={s}/>
      <path d={area} fill={`url(#${gid}-f)`}/>
      <path d={line} fill="none" stroke={`url(#${gid}-l)`}
        strokeWidth="3" strokeLinecap="round"
        filter={glow?`url(#${gid}-gf)`:undefined}/>
      {/* retirement dashed line */}
      <line x1={s.xOf(RET)} x2={s.xOf(RET)} y1={s.top-2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.40"/>
      {/* connector stubs */}
      {stops.map(({age,ck,above})=>{
        const cx=s.xOf(age), cy=s.yOf(balAt(age)), len=20;
        return <line key={`ln-${age}`}
          x1={cx} x2={cx}
          y1={above ? cy-5.5 : cy+5.5}
          y2={above ? cy-len : cy+len}
          stroke={t[ck]} strokeWidth="1" opacity="0.38"/>;
      })}
      {/* milestone dots */}
      {stops.map(({age,ck})=>(
        <circle key={age} cx={s.xOf(age)} cy={s.yOf(balAt(age))}
          r={age===RET?5.5:4.5} fill={t.surf} stroke={t[ck]} strokeWidth="2.5"/>
      ))}
      {/* age-90 end dot */}
      <circle cx={s.xOf(90)} cy={s.yOf(balAt(90))}
        r="4.5" fill={t.surf} stroke={t.warm} strokeWidth="2.5"/>
    </svg>
    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
      <AxisOverlay t={t} s={s} ages={[40,50,55,70,80]} moments={{}}/>
      {/* milestone pills */}
      {stops.map(({age,label,above,ck,targetVal})=>{
        const c=t[ck];
        const cx=s.xOf(age), cy=s.yOf(balAt(age));
        // age 30 left-aligns so pill doesn't clip the left edge
        const xShift=age===30?"0%":"-50%";
        const yTop=above ? cy-28 : cy+28;
        const yShift=above?"-100%":"0%";
        return <div key={age} style={{
          position:"absolute",
          left:pct(cx,VW),
          top:pct(yTop,H),
          transform:`translate(${xShift},${yShift})`,
          whiteSpace:"nowrap"
        }}>
          <div style={{
            display:"inline-block",
            background:t.surf,
            border:`1.5px solid ${c}50`,
            borderRadius:9,
            padding:"4px 10px",
            boxShadow:"0 2px 10px rgba(0,0,0,.09)"
          }}>
            <div style={{font:`500 9.5px ${GFONT}`,color:t.mut,letterSpacing:"0.03em",marginBottom:1}}>{label}</div>
            <div style={{font:`600 12px ${GMONO}`,color:c}}>{money(targetVal!=null?targetVal:balAt(age))}</div>
          </div>
        </div>;
      })}
      <EndTag t={t} s={s} x={s.xOf(90)} y={s.yOf(balAt(90))}
        head={`${money(balAt(90))} at 90`} sub="still covered, for life" anchorRight/>
    </div>
  </GBox>;
}

// ════════════════════════════════════════════════════════════════════════════
//  CONCEPT 2 · STACKED SOURCES — what you put in vs what the market earned
// ════════════════════════════════════════════════════════════════════════════
function GStacked({t,gid="stk",H=320}){
  const pad={l:62,r:92,t:34,b:46};
  const s=makeScales(H,pad);
  const ages=rangeAges(1);
  const cPts=ages.map(a=>[s.xOf(a),+s.yOf(contribAt(a)).toFixed(1)]);
  const tPts=ages.map(a=>[s.xOf(a),+s.yOf(balAt(a)).toFixed(1)]);
  const cLine=smoothPath(cPts);
  const tLine=smoothPath(tPts);
  const cArea=cLine+` L ${VW-pad.r} ${s.bot} L ${pad.l} ${s.bot} Z`;
  // growth band: from total path down to contrib path
  const gArea=tLine+
    ` L ${s.xOf(AGE1)} ${s.yOf(contribAt(AGE1))} `+
    cPts.slice().reverse().map(p=>`L ${p[0]} ${p[1]}`).join(" ")+" Z";
  return <GBox t={t} H={H}>
    <svg width="100%" viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none"
      style={{display:"block",height:H}}>
      <defs>
        <linearGradient id={`${gid}-wf`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={t.warm} stopOpacity="0.52"/>
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.16"/>
        </linearGradient>
      </defs>
      <GridLines t={t} s={s}/>
      {/* growth band */}
      <path d={gArea} fill={`url(#${gid}-wf)`}/>
      {/* contributions band */}
      <path d={cArea} fill={t.good} fillOpacity="0.20"/>
      <path d={cLine} fill="none" stroke={t.good} strokeWidth="1.8" opacity="0.60"/>
      {/* total line */}
      <path d={tLine} fill="none" stroke={t.accent} strokeWidth="2.6" strokeLinecap="round"/>
      <line x1={s.xOf(RET)} x2={s.xOf(RET)} y1={s.top-2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.40"/>
      <circle cx={s.xOf(RET)} cy={s.yOf(balAt(RET))} r="5"
        fill={t.accent} stroke={t.surf} strokeWidth="2"/>
      <circle cx={s.xOf(30)} cy={s.yOf(balAt(30))} r="4"
        fill={t.good} stroke={t.surf} strokeWidth="2"/>
    </svg>
    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
      <AxisOverlay t={t} s={s}/>
      <div style={{position:"absolute",left:pct(s.pad.l+10,VW),top:13,display:"flex",gap:14}}>
        {[["Market growth",t.warm],["Your contributions",t.good]].map(([l,c],i)=>(
          <span key={i} style={{display:"flex",alignItems:"center",gap:6,
            font:`600 10.5px ${GFONT}`,color:t.mut}}>
            <span style={{width:10,height:10,borderRadius:3,background:c,opacity:0.80}}/>{l}
          </span>
        ))}
      </div>
      <EndTag t={t} s={s} x={s.xOf(90)} y={s.yOf(balAt(90))}
        head={`${money(growthAt(90))} earned`}
        sub={`on ${money(contribAt(90))} saved`} anchorRight/>
    </div>
  </GBox>;
}

// ════════════════════════════════════════════════════════════════════════════
//  CONCEPT 3 · DECADE COLUMNS — green accumulate / warm retire, always readable
// ════════════════════════════════════════════════════════════════════════════
function GColumns({t,gid="col",H=320}){
  const pad={l:62,r:42,t:40,b:46};
  const s=makeScales(H,pad);
  const ages=rangeAges(5);
  const bw=Math.min(50,(VW-pad.l-pad.r)/ages.length*0.58);
  return <GBox t={t} H={H}>
    <svg width="100%" viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none"
      style={{display:"block",height:H}}>
      <defs>
        <linearGradient id={`${gid}-acc`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={t.good} stopOpacity="0.72"/>
          <stop offset="100%" stopColor={t.good} stopOpacity="0.18"/>
        </linearGradient>
        <linearGradient id={`${gid}-ret`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={t.warm} stopOpacity="0.78"/>
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.18"/>
        </linearGradient>
      </defs>
      <GridLines t={t} s={s}/>
      {ages.map(a=>{
        const x=s.xOf(a), y=s.yOf(balAt(a));
        const isRetire=a===RET, isPost=a>RET;
        const fillId=isPost||isRetire?`url(#${gid}-ret)`:`url(#${gid}-acc)`;
        const capCol=isPost||isRetire?t.warm:t.good;
        return <g key={a}>
          <rect x={x-bw/2} y={y} width={bw} height={s.bot-y} rx="5" fill={fillId}
            stroke={isRetire?t.warm:"none"} strokeWidth={isRetire?1.5:0}/>
          {/* solid top cap — thicker on retire bar */}
          <rect x={x-bw/2} y={y} width={bw} height={isRetire?6:4} rx="2.5"
            fill={capCol} opacity={isRetire?1:0.88}/>
        </g>;
      })}
      {/* dashed retire marker */}
      <line x1={s.xOf(RET)} x2={s.xOf(RET)} y1={s.top-4} y2={s.bot}
        stroke={t.warm} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.35"/>
    </svg>
    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
      <AxisOverlay t={t} s={s} ages={ages} moments={{30:"Today",65:"Retire"}}/>
      {/* value labels on key bars */}
      {[30,65,90].map(a=>(
        <div key={a} style={{
          position:"absolute",
          left:pct(s.xOf(a),VW),
          top:pct(s.yOf(balAt(a)),H),
          transform:"translate(-50%,-155%)",
          font:`700 11px ${GMONO}`,
          color:a>=RET?t.warm:t.good,
          whiteSpace:"nowrap"
        }}>{money(balAt(a))}</div>
      ))}
      {/* legend */}
      <div style={{position:"absolute",left:pct(s.pad.l+10,VW),top:13,display:"flex",gap:14}}>
        {[["Accumulation",t.good],["Retirement",t.warm]].map(([l,c],i)=>(
          <span key={i} style={{display:"flex",alignItems:"center",gap:6,
            font:`600 10.5px ${GFONT}`,color:t.mut}}>
            <span style={{width:10,height:10,borderRadius:3,background:c,opacity:0.85}}/>{l}
          </span>
        ))}
      </div>
    </div>
  </GBox>;
}

// ════════════════════════════════════════════════════════════════════════════
//  CONCEPT 4 · CONFIDENCE BAND — expected line inside a lean↔strong cone
// ════════════════════════════════════════════════════════════════════════════
function GBand({t,gid="bnd",H=320}){
  const pad={l:62,r:92,t:34,b:46};
  const s=makeScales(H,pad);
  const ages=rangeAges(1);
  const spread=a=>(a-AGE0)/(AGE1-AGE0)*0.30;
  const up=a=>Math.min(VMAX*0.97,balAt(a)*(1+spread(a)));
  const lo=a=>balAt(a)*(1-spread(a)*0.92);
  const upPts=ages.map(a=>[s.xOf(a),+s.yOf(up(a)).toFixed(1)]);
  const loPts=ages.map(a=>[s.xOf(a),+s.yOf(lo(a)).toFixed(1)]);
  const midPts=ages.map(a=>[s.xOf(a),+s.yOf(balAt(a)).toFixed(1)]);
  const coneArea=smoothPath(upPts)+" L "+
    loPts.slice().reverse().map(p=>p.join(" ")).join(" L ")+" Z";
  return <GBox t={t} H={H}>
    <svg width="100%" viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none"
      style={{display:"block",height:H}}>
      <GridLines t={t} s={s}/>
      <path d={coneArea} fill={t.accent} fillOpacity="0.11"/>
      <path d={smoothPath(upPts)} fill="none" stroke={t.accent}
        strokeWidth="1.2" strokeDasharray="4 5" opacity="0.38"/>
      <path d={smoothPath(loPts)} fill="none" stroke={t.accent}
        strokeWidth="1.2" strokeDasharray="4 5" opacity="0.38"/>
      <path d={smoothPath(midPts)} fill="none" stroke={t.accent}
        strokeWidth="3" strokeLinecap="round"/>
      <line x1={s.xOf(RET)} x2={s.xOf(RET)} y1={s.top-2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.40"/>
      <circle cx={s.xOf(RET)} cy={s.yOf(balAt(RET))} r="5"
        fill={t.accent} stroke={t.surf} strokeWidth="2"/>
      <circle cx={s.xOf(30)} cy={s.yOf(balAt(30))} r="4.5"
        fill={t.good} stroke={t.surf} strokeWidth="2"/>
    </svg>
    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
      <AxisOverlay t={t} s={s}/>
      <div style={{position:"absolute",left:pct(s.xOf(78),VW),
        top:pct(s.yOf(up(78)),H),transform:"translate(-50%,-125%)",
        font:`600 9.5px ${GFONT}`,color:t.mut}}>strong market</div>
      <div style={{position:"absolute",left:pct(s.xOf(78),VW),
        top:pct(s.yOf(lo(78)),H),transform:"translate(-50%,44%)",
        font:`600 9.5px ${GFONT}`,color:t.mut}}>lean market</div>
      <EndTag t={t} s={s} x={s.xOf(90)} y={s.yOf(balAt(90))}
        head="Even lean: covered" sub="across 9 in 10 markets" anchorRight/>
    </div>
  </GBox>;
}

// ════════════════════════════════════════════════════════════════════════════
//  CONCEPT 5 · JOURNEY STATIONS — pure route/stop form (ring stations)
// ════════════════════════════════════════════════════════════════════════════
function GStations({t,gid="stn",H=320}){
  const pad={l:58,r:92,t:50,b:46};
  const s=makeScales(H,pad);
  const pts=rangeAges(1).map(a=>[s.xOf(a),+s.yOf(balAt(a)).toFixed(1)]);
  const line=smoothPath(pts);
  const area=line+` L ${VW-pad.r} ${s.bot} L ${pad.l} ${s.bot} Z`;
  const m1=crossAge(1e6), m2=crossAge(2e6);
  const stops=[
    {age:30,  label:"Today",    above:false, ck:"good"},
    {age:m1,  label:"$1M",      above:true,  ck:"accent"},
    {age:m2,  label:"$2M",      above:false, ck:"accent"},
    {age:RET, label:"Retire",   above:true,  ck:"accent"},
    {age:90,  label:"For Life", above:false, ck:"warm"},
  ];
  return <GBox t={t} H={H}>
    <svg width="100%" viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none"
      style={{display:"block",height:H}}>
      <defs>
        <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor={t.good}  stopOpacity="0.16"/>
          <stop offset="55%" stopColor={t.accent} stopOpacity="0.20"/>
          <stop offset="100%" stopColor={t.warm}  stopOpacity="0.16"/>
        </linearGradient>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor={t.good}/>
          <stop offset="55%" stopColor={t.accent}/>
          <stop offset="100%" stopColor={t.warm}/>
        </linearGradient>
      </defs>
      <GridLines t={t} s={s}/>
      <path d={area} fill={`url(#${gid}-f)`}/>
      <path d={line} fill="none" stroke={`url(#${gid}-l)`}
        strokeWidth="2.6" strokeLinecap="round"/>
      {/* station rings */}
      {stops.map(({age,ck})=>(
        <circle key={age} cx={s.xOf(age)} cy={s.yOf(balAt(age))}
          r="7.5" fill={t.surf} stroke={t[ck]} strokeWidth="3"/>
      ))}
      {/* inner dots */}
      {stops.map(({age,ck})=>(
        <circle key={`i-${age}`} cx={s.xOf(age)} cy={s.yOf(balAt(age))}
          r="3" fill={t[ck]}/>
      ))}
    </svg>
    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
      <AxisOverlay t={t} s={s} ages={[40,50,60,70,80]} moments={{}}/>
      {stops.map(({age,label,above,ck})=>{
        const c=t[ck];
        const cx=s.xOf(age), cy=s.yOf(balAt(age));
        // clamp horizontal so first/last labels don't clip edges
        const xAlign=age===30?"0%":age===90?"-100%":"-50%";
        return <div key={age} style={{
          position:"absolute",
          left:pct(cx,VW),
          top:pct(cy,H),
          transform:`translate(${xAlign},${above?"-175%":"60%"})`,
          display:"flex",flexDirection:"column",alignItems:age===30?"flex-start":age===90?"flex-end":"center",
          gap:2, whiteSpace:"nowrap"
        }}>
          <span style={{
            font:`700 11px ${GFONT}`,color:t.ink,background:t.surf,
            border:`1px solid ${c}50`,borderRadius:999,
            padding:"3px 11px",boxShadow:"0 1px 4px rgba(0,0,0,.08)"
          }}>{label}</span>
          <span style={{font:`600 10px ${GMONO}`,color:c}}>{money(balAt(age))}</span>
        </div>;
      })}
    </div>
  </GBox>;
}

// ── concept registry (the 4 active views) ────────────────────────────────────
// Stations removed — its milestone idea is now fully absorbed into Arc.
const GRAPHS={
  arc:      {name:"Arc",       comp:GArcStations,blurb:"The honest full-life arc with milestone stops — climb through your first and second million, retire, then sustain. The destination is a calm labelled end-point."},
  stacked:  {name:"Sources",   comp:GStacked,    blurb:"Splits balance into what you contributed vs what the market earned. Makes compound growth the visible hero."},
  columns:  {name:"Decades",   comp:GColumns,    blurb:"Discrete five-year bars in two clearly distinct phases: green for accumulation, warm for retirement. Readable across every palette and theme."},
  band:     {name:"Scenarios", comp:GBand,       blurb:"Expected line inside a lean↔strong cone. Honest about uncertainty — even the lean scenario keeps you covered across 9 in 10 markets."},
};
const GRAPH_KEYS=["arc","stacked","columns","band"];

// ── GraphCard (design-canvas exploration) ────────────────────────────────────
function GraphCard({t=GPALS.apricot.light,which="arc",H=340}){
  const g=GRAPHS[which];
  if(!g) return null;
  return <div style={{width:"100%",background:t.bg,fontFamily:GFONT,padding:24,
    display:"flex",flexDirection:"column",gap:14,boxSizing:"border-box"}}>
    <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:16}}>
      <span style={{font:`700 16px ${GFONT}`,color:t.ink,letterSpacing:"-0.01em"}}>{g.name}</span>
      <span style={{font:`500 11.5px ${GMONO}`,color:t.faint}}>concept</span>
    </div>
    <g.comp t={t} gid={`card-${which}`} H={H}/>
    <div style={{font:`400 12.5px ${GFONT}`,color:t.mut,lineHeight:1.5,textWrap:"pretty"}}>{g.blurb}</div>
  </div>;
}

// ── chrome helpers ────────────────────────────────────────────────────────────
function GLogo({t}){
  return <div style={{display:"flex",alignItems:"center",gap:10}}>
    <span style={{width:18,height:18,borderRadius:6,background:`${t.good}22`,
      border:`1px solid ${t.good}55`,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{width:7,height:7,borderRadius:999,background:t.good}}/>
    </span>
    <span style={{font:`700 14px ${GFONT}`,color:t.ink}}>Horizon</span>
  </div>;
}
function GOnTrack({t}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",
    borderRadius:999,border:`1px solid ${t.good}55`,background:`${t.good}18`}}>
    <span style={{width:8,height:8,borderRadius:999,background:t.good}}/>
    <span style={{font:`600 12px ${GFONT}`,color:t.good}}>On track</span>
  </span>;
}
function GStat({t,label,val,accent,warm}){
  return <div style={{flex:1,background:warm?`${t.warm}12`:t.surf,
    border:`1px solid ${warm?`${t.warm}40`:t.line}`,borderRadius:13,padding:15}}>
    <div style={{font:`500 11px ${GFONT}`,color:warm?t.warm:t.mut,marginBottom:9}}>{label}</div>
    <div style={{font:`500 23px ${GMONO}`,color:accent,letterSpacing:"-0.01em"}}>{val}</div>
  </div>;
}

// ── GraphHome — full home screen with 5-way chart toggle ─────────────────────
function GraphHome({t,which="arc",w=1240,h=820}){
  const [activeKey,setActiveKey]=React.useState(which);
  const g=GRAPHS[activeKey]||GRAPHS.arc;
  return <div style={{width:w,height:h,background:t.bg,fontFamily:GFONT,
    display:"flex",flexDirection:"column",overflow:"hidden"}}>
    {/* nav */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"14px 28px",borderBottom:`1px solid ${t.line}`}}>
      <GLogo t={t}/>
      <div style={{display:"flex",gap:4}}>
        {["Plan","Ideas","The numbers","Settings"].map((x,i)=>(
          <div key={x} style={{padding:"6px 13px",borderRadius:8,
            background:i===0?t.surf2:"transparent",
            border:i===0?`1px solid ${t.line2}`:"1px solid transparent"}}>
            <span style={{font:`${i===0?600:500} 12.5px ${GFONT}`,color:i===0?t.ink:t.faint}}>{x}</span>
          </div>
        ))}
      </div>
      <GOnTrack t={t}/>
    </div>
    {/* main content */}
    <div style={{flex:1,padding:"20px 28px 18px",display:"flex",flexDirection:"column",minHeight:0}}>
      {/* headline row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{font:`600 28px ${GFONT}`,color:t.ink,letterSpacing:"-0.025em",lineHeight:1.1}}>
            On track to retire at 65.</div>
          <div style={{font:`500 14px ${GFONT}`,color:t.mut,marginTop:7}}>
            Work optional, <span style={{color:t.accent,fontWeight:700}}>golf course</span> mandatory.</div>
        </div>
        <div style={{width:210,paddingTop:5}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{font:`600 12px ${GFONT}`,color:t.ink}}>78% there</span>
            <span style={{font:`600 11.5px ${GFONT}`,color:t.good}}>↗ gaining</span>
          </div>
          <div style={{height:7,borderRadius:6,background:t.line,overflow:"hidden"}}>
            <div style={{height:"100%",width:"78%",background:`linear-gradient(90deg,${t.good},${t.warm})`}}/>
          </div>
        </div>
      </div>
      {/* chart area */}
      <div style={{flex:"1 1 0",display:"flex",flexDirection:"column",minHeight:0}}>
        {/* toggle strip */}
        <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",gap:1,padding:"3px",borderRadius:10,background:t.line}}>
            {GRAPH_KEYS.map(k=>{
              const on=activeKey===k;
              return <button key={k} onClick={()=>setActiveKey(k)} style={{
                padding:"4px 13px",borderRadius:7,border:"none",cursor:"pointer",
                background:on?t.surf2:"transparent",
                font:`${on?600:500} 12px ${GFONT}`,
                color:on?t.ink:t.mut,
                boxShadow:on?"0 1px 4px rgba(0,0,0,.10)":"none",
                transition:"all .12s"
              }}>{GRAPHS[k].name}</button>;
            })}
          </div>
        </div>
        {/* chart — keyed so it fully remounts on tab switch */}
        <div style={{flex:1,minHeight:0}}>
          <g.comp key={activeKey} t={t} gid={`home-${activeKey}`} H={280}/>
        </div>
      </div>
      {/* stats row */}
      <div style={{display:"flex",gap:10,marginTop:14}}>
        <GStat t={t} label="You keep / mo" val="$2,140" accent={t.good}/>
        <GStat t={t} label="Retire at" val="65" accent={t.ink}/>
        <GStat t={t} label="Income for life" val="$8,200" accent={t.warm} warm/>
        <GStat t={t} label="Left at 90" val="$1.4M" accent={t.ink}/>
      </div>
    </div>
  </div>;
}

// ── Playground ────────────────────────────────────────────────────────────────
function GraphPlayground(){
  const autoMode=(new Date().getHours()>=7&&new Date().getHours()<18)?"light":"dark";
  const [palKey,setPalKey]=React.useState("apricot");
  const [pref,setPref]=React.useState("light");
  const mode=pref==="auto"?autoMode:pref;
  const t=GPALS[palKey][mode];
  const seg=(cur,val,label,set)=>{const on=cur===val;
    return <button key={val} onClick={()=>set(val)} style={{padding:"6px 12px",borderRadius:8,
      border:"none",background:on?t.surf:"transparent",
      boxShadow:on?"0 1px 3px rgba(0,0,0,.16)":"none",cursor:"pointer",
      font:`600 12px ${GFONT}`,color:on?t.ink:t.faint}}>{label}</button>;
  };
  const wrap=(label,kids)=><div style={{display:"flex",alignItems:"center",gap:8}}>
    <span style={{font:`600 10px ${GFONT}`,color:t.faint,letterSpacing:"0.08em",textTransform:"uppercase"}}>{label}</span>
    <div style={{display:"flex",gap:2,padding:3,borderRadius:10,background:t.bg,border:`1px solid ${t.line}`}}>{kids}</div>
  </div>;
  return <div style={{width:1280,height:900,background:t.bg,fontFamily:GFONT,
    display:"flex",flexDirection:"column",overflow:"hidden",transition:"background .3s"}}>
    <div style={{display:"flex",alignItems:"center",gap:16,padding:"11px 22px",
      background:t.surf2,borderBottom:`1px solid ${t.line}`,flexWrap:"wrap"}}>
      <span style={{font:`600 11.5px ${GFONT}`,color:t.mut}}>Palette</span>
      <div style={{display:"flex",gap:7}}>
        {Object.keys(GPALS).map(k=>{const on=palKey===k;
          return <button key={k} onClick={()=>setPalKey(k)} title={GPALS[k].name}
            style={{width:22,height:22,borderRadius:999,padding:0,cursor:"pointer",
              background:GPALS[k].swatch,
              border:`2px solid ${on?t.ink:"transparent"}`,
              boxShadow:`0 0 0 2px ${t.surf2}`}}/>;
        })}
      </div>
      <div style={{flex:1}}/>
      {wrap("Theme",[seg(pref,"light","Light",setPref),seg(pref,"dark","Dark",setPref),seg(pref,"auto","Auto",setPref)])}
    </div>
    <div style={{flex:1,minHeight:0}}>
      <GraphHome t={t} w={1280} h={848}/>
    </div>
  </div>;
}

// ── exports ───────────────────────────────────────────────────────────────────
Object.assign(window,{
  GRAPHS,GRAPH_KEYS,
  GArcStations,GStacked,GColumns,GBand,GStations,
  GraphCard,GraphHome,GraphPlayground,
  balAt,crossAge,contribAt,growthAt,money,
  GFONT,GMONO,GPALS,pct,
  makeScales,smoothPath,rangeAges,
  GridLines,AxisOverlay,EndTag,GBox,
  GStat,GLogo,GOnTrack
});
