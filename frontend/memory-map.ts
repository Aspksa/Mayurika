type MemoryNode={id:number;content:string;status:string;cluster_id:number|null};
type MemoryCluster={id:number;members:number[];size:number};
type MemoryLink={source_id:number;target_id:number;relation:string;score:number;status:string};
type Point={x:number;y:number;sector:number;node:MemoryNode};
const TAU=Math.PI*2;
export function setupMemoryMap(canvas:HTMLCanvasElement,detail:HTMLElement){
 const ctx=canvas.getContext("2d");
 if(!ctx)return {reload:async()=>{}};
 let nodes:MemoryNode[]=[],links:MemoryLink[]=[],clusters:MemoryCluster[]=[],points:Point[]=[];
 let scale=1,offsetX=0,offsetY=0,dragging=false,lastX=0,lastY=0,moved=false;
 let selected:number|null=null;
 let nextBefore:number|null=null,loading=false;
 let autoPages=0,autoLoadFailed=false;
 const AUTO_PAGE_LIMIT=4;
 let animationStart=0;
 let renderQueued=false,layoutDirty=true,layoutWidth=0,layoutHeight=0;
 let pixelWidth=0,pixelHeight=0;
 let sectorPoints:Point[][]=Array.from({length:8},()=>[]);
 let pointLookup=new Map<number,Point>();
 let contourPaths:Path2D[]=[];
 let sectorSummaries:{x:number;y:number;count:number}[]=[];
 function scheduleDraw(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;draw();});}
 const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const hex=(x:number,y:number,size:number)=>{ctx!.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/6;const px=x+Math.cos(a)*size,py=y+Math.sin(a)*size;if(i===0)ctx!.moveTo(px,py);else ctx!.lineTo(px,py);}ctx!.closePath();};
 function layout(w:number,h:number){
  const cx=w/2,cy=h/2,r=Math.min(w,h)*.36;
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const groups:MemoryNode[][]=[];
  const included=new Set<number>();
  for(const cluster of clusters){
   const members=cluster.members.map(id=>byId.get(id)).filter((n):n is MemoryNode=>Boolean(n));
   if(members.length>1){groups.push(members);members.forEach(n=>included.add(n.id));}
  }
  for(const node of nodes)if(!included.has(node.id))groups.push([node]);
  // Stable deterministic order; groups stay together within one of eight sectors.
  groups.sort((a,b)=>Math.min(...a.map(n=>n.id))-Math.min(...b.map(n=>n.id)));
  // Reserve an empty honeycomb cell between independent groups.
  // The placement remains deterministic as pages are added.
  const buckets:{node:MemoryNode;slot:number}[][]=Array.from({length:8},()=>[]);
  const cursor=Array(8).fill(0) as number[];
  for(const group of groups){
   const sector=group[0].id%8;
   if(cursor[sector]>0)cursor[sector]+=2;
   for(const node of group){
    buckets[sector].push({node,slot:cursor[sector]});
    cursor[sector]++;
   }
  }
  const maxSlots=Math.max(1,...cursor);
  const pitch=Math.max(4,Math.min(12,r*.65/(Math.sqrt(maxSlots)+1)));
  points=[];
  for(let sector=0;sector<8;sector++){
   const a=-Math.PI/2+(sector+.5)*Math.PI/4;
   const ux=Math.cos(a),uy=Math.sin(a),vx=-uy,vy=ux;
   const centerX=cx+ux*r*.52,centerY=cy+uy*r*.52;
   for(const entry of buckets[sector]){
    const i=entry.slot;
    let q=0,t=0;
    if(i>0){
     let ring=1,remaining=i-1;
     while(remaining>=6*ring){remaining-=6*ring;ring++;}
     q=ring;
     const dirs=[[0,-1],[-1,0],[-1,1],[0,1],[1,0],[1,-1]];
     for(let step=0;step<remaining;step++){const d=dirs[Math.floor(step/ring)];q+=d[0];t+=d[1];}
    }
    const x=(q+t/2)*pitch*1.5,y=t*pitch*Math.sqrt(3)*.86;
    points.push({x:centerX+vx*x+ux*y,y:centerY+vy*x+uy*y,sector,node:entry.node});
   }
  }
  sectorPoints=Array.from({length:8},()=>[]);
  pointLookup=new Map();
  for(const point of points){sectorPoints[point.sector].push(point);pointLookup.set(point.node.id,point);}
  sectorSummaries=sectorPoints.map(members=>({
   count:members.length,
   x:members.length?members.reduce((sum,p)=>sum+p.x,0)/members.length:0,
   y:members.length?members.reduce((sum,p)=>sum+p.y,0)/members.length:0
  }));
  contourPaths=[];
  const lookup=pointLookup;
  // Build contours once per layout, not on every Canvas frame.
  for(const cluster of clusters){
   const members=cluster.members.map(id=>lookup.get(id)).filter((p):p is Point=>Boolean(p));
   if(members.length<2)continue;
   const ordered=members.map(p=>({x:p.x,y:p.y})).sort((a,b)=>a.x-b.x||a.y-b.y);
   const cross=(o:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number})=>
    (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
   const lower:typeof ordered=[],upper:typeof ordered=[];
   for(const p of ordered){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
   for(let i=ordered.length-1;i>=0;i--){const p=ordered[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
   const hull=lower.slice(0,-1).concat(upper.slice(0,-1));
   const centerX=members.reduce((sum,p)=>sum+p.x,0)/members.length;
   const centerY=members.reduce((sum,p)=>sum+p.y,0)/members.length;
   const path=new Path2D();
   if(hull.length<3){
    const first=members[0],last=members[members.length-1];
    const dx=last.x-first.x,dy=last.y-first.y,length=Math.max(1,Math.hypot(dx,dy));
    const nx=-dy/length*9,ny=dx/length*9;
    path.moveTo(first.x+nx,first.y+ny);path.lineTo(last.x+nx,last.y+ny);
    path.lineTo(last.x-nx,last.y-ny);path.lineTo(first.x-nx,first.y-ny);
   }else{
    hull.forEach((p,i)=>{
     const dx=p.x-centerX,dy=p.y-centerY,length=Math.max(1,Math.hypot(dx,dy));
     const x=p.x+dx/length*9,y=p.y+dy/length*9;
     if(i===0)path.moveTo(x,y);else path.lineTo(x,y);
    });
   }
   path.closePath();
   contourPaths.push(path);
  }
 }
 function draw(){
  const rect=canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);
  if(!rect.width||!rect.height)return;
  const width=Math.round(rect.width*d),height=Math.round(rect.height*d);
  if(width!==pixelWidth||height!==pixelHeight){canvas.width=width;canvas.height=height;pixelWidth=width;pixelHeight=height;layoutDirty=true;}
  ctx!.setTransform(d,0,0,d,0,0);ctx!.clearRect(0,0,rect.width,rect.height);
  if(layoutDirty||layoutWidth!==rect.width||layoutHeight!==rect.height){layout(rect.width,rect.height);layoutDirty=false;layoutWidth=rect.width;layoutHeight=rect.height;}
  ctx!.save();ctx!.translate(offsetX,offsetY);ctx!.translate(rect.width/2,rect.height/2);
  ctx!.scale(scale,scale);ctx!.translate(-rect.width/2,-rect.height/2);
  const cx=rect.width/2,cy=rect.height/2,r=Math.min(rect.width,rect.height)*.36;
  ctx!.strokeStyle="rgba(190,145,70,.22)";ctx!.lineWidth=1;
  for(let ring=1;ring<=7;ring++){ctx!.beginPath();ctx!.arc(cx,cy,r*ring/7,0,TAU);ctx!.stroke();}
  for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2;ctx!.beginPath();ctx!.moveTo(cx,cy);ctx!.lineTo(cx+Math.cos(a)*r*1.08,cy+Math.sin(a)*r*1.08);ctx!.stroke();}
  const groups=sectorPoints;
  for(let i=0;i<groups.length;i++){
   const count=groups[i].length;if(!count)continue;
   const a=-Math.PI/2+(i+.5)*Math.PI/4;
   const gx=cx+Math.cos(a)*r*.57,gy=cy+Math.sin(a)*r*.57;
   ctx!.beginPath();ctx!.arc(gx,gy,Math.min(48,14+Math.sqrt(count)*4),0,TAU);
   ctx!.fillStyle="rgba(160,111,44,.045)";ctx!.fill();
   ctx!.strokeStyle="rgba(208,157,76,.13)";ctx!.stroke();
  }
  const left=(0-rect.width/2-offsetX)/scale+rect.width/2-16;
  const right=(rect.width-rect.width/2-offsetX)/scale+rect.width/2+16;
  const top=(0-rect.height/2-offsetY)/scale+rect.height/2-16;
  const bottom=(rect.height-rect.height/2-offsetY)/scale+rect.height/2+16;
  const lookup=pointLookup;
  ctx!.fillStyle="rgba(209,163,82,.065)";
  ctx!.strokeStyle="rgba(238,191,99,.38)";
  ctx!.lineWidth=1;
  for(const path of contourPaths){ctx!.fill(path);ctx!.stroke(path);}
  for(const link of links){
   if(scale<.8&&points.length>160)continue;
   if(scale<.8&&link.status!=="accepted")continue;
   const a=lookup.get(link.source_id),b=lookup.get(link.target_id);
   if(!a||!b)continue;
   if(Math.max(a.x,b.x)<left||Math.min(a.x,b.x)>right||
      Math.max(a.y,b.y)<top||Math.min(a.y,b.y)>bottom)continue;
   ctx!.strokeStyle=link.relation==="possible_conflict"?"rgba(235,90,84,.78)":"rgba(211,169,95,.42)";
   ctx!.lineWidth=link.status==="accepted"?1.8:1;
   ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.lineTo(b.x,b.y);ctx!.stroke();
  }
  const aggregate=scale<.8&&points.length>160;
  if(aggregate){
   for(let sector=0;sector<8;sector++){
    const summary=sectorSummaries[sector];
    if(!summary.count)continue;
    const {x,y}=summary;
    const radius=Math.min(26,8+Math.sqrt(summary.count)*1.8);
    ctx!.beginPath();ctx!.arc(x,y,radius,0,TAU);
    ctx!.fillStyle="rgba(202,155,72,.27)";ctx!.fill();
    ctx!.strokeStyle="#cba363";ctx!.lineWidth=1;ctx!.stroke();
    ctx!.fillStyle="#f4dbac";ctx!.font="12px system-ui";ctx!.textAlign="center";ctx!.textBaseline="middle";
    ctx!.fillText(String(summary.count),x,y);
   }
  }
  for(const p of points){
   if(aggregate)break;
   if(p.x<left||p.x>right||p.y<top||p.y>bottom)continue;
   const active=p.node.id===selected;
   const elapsed=reducedMotion?1:Math.min(1,(performance.now()-animationStart)/700);
   const size=(active?8:5.2)*(.5+.5*elapsed);
   ctx!.fillStyle=p.node.status==="verified"?"#e8b955":p.node.status==="disputed"?"#bb514b":"#695336";
   ctx!.strokeStyle=active?"#ffe5a1":"rgba(228,187,107,.78)";ctx!.lineWidth=active?1.8:.8;
   hex(p.x,p.y,size);ctx!.fill();ctx!.stroke();
  }
  ctx!.fillStyle="#f6d79a";ctx!.beginPath();ctx!.arc(cx,cy,7,0,TAU);ctx!.fill();
  ctx!.restore();
  if(!reducedMotion&&performance.now()-animationStart<700){
   scheduleDraw();
  }
 }
 function pointer(event:PointerEvent){
  const rect=canvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left-rect.width/2-offsetX)/scale+rect.width/2,
          y:(event.clientY-rect.top-rect.height/2-offsetY)/scale+rect.height/2};
 }
 canvas.addEventListener("pointerdown",e=>{dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener("pointermove",e=>{
  if(!dragging)return;
  const dx=e.clientX-lastX,dy=e.clientY-lastY;
  if(Math.abs(dx)+Math.abs(dy)>1)moved=true;
  offsetX+=dx;offsetY+=dy;lastX=e.clientX;lastY=e.clientY;scheduleDraw();
 });
 canvas.addEventListener("pointerup",e=>{
  if(!dragging)return;
  dragging=false;
  if(moved)return;
  const q=pointer(e);
  let closest:{p:Point;dist:number}|undefined;
  for(const p of points){
   const dist=Math.hypot(p.x-q.x,p.y-q.y);
   if(!closest||dist<closest.dist)closest={p,dist};
  }
  if(!(scale<.8&&points.length>160)&&closest&&closest.dist<13/scale){
   selected=closest.p.node.id;
   detail.replaceChildren();
   const heading=document.createElement("strong");heading.textContent="Воспоминание #"+selected+" · "+closest.p.node.status;
   const body=document.createElement("p");body.textContent=closest.p.node.content;
   detail.append(heading,body);
  }else{selected=null;detail.textContent="Нажмите на узел, чтобы открыть воспоминание";}
  scheduleDraw();
 });
 canvas.addEventListener("pointercancel",()=>{dragging=false;});
 canvas.addEventListener("wheel",e=>{
  e.preventDefault();
  const previous=scale;
  scale=Math.max(.5,Math.min(5,scale*(e.deltaY<0?1.12:.89)));
  scheduleDraw();
  // Only one extra page per deliberate zoom-in step, bounded to four automatic pages.
  if(scale>previous&&scale>=1.4&&nextBefore!==null&&!loading&&!autoLoadFailed&&autoPages<AUTO_PAGE_LIMIT){
   autoPages++;
   void fetchPage(true,true);
  }
 },{passive:false});
 new ResizeObserver(()=>{layoutDirty=true;scheduleDraw();}).observe(canvas);
 function rebuildClusters(){
  const parent=new Map(nodes.map(n=>[n.id,n.id]));
  function root(id:number):number{
   let current=id;
   while(parent.get(current)!==current){
    const next=parent.get(current);
    if(next===undefined)break;
    current=next;
   }
   return current;
  }
  for(const link of links){
   if(link.status!=="accepted"||link.relation!=="related")continue;
   if(!parent.has(link.source_id)||!parent.has(link.target_id))continue;
   const a=root(link.source_id),b=root(link.target_id);
   if(a!==b)parent.set(Math.max(a,b),Math.min(a,b));
  }
  const grouped=new Map<number,number[]>();
  for(const node of nodes){
   const key=root(node.id),members=grouped.get(key)||[];
   members.push(node.id);grouped.set(key,members);
  }
  clusters=[...grouped.entries()].filter(([,members])=>members.length>1)
   .map(([id,members])=>({id,members:members.sort((a,b)=>a-b),size:members.length}));
  const memberships=new Map(clusters.flatMap(c=>c.members.map(id=>[id,c.id] as const)));
  for(const node of nodes)node.cluster_id=memberships.get(node.id)??null;
 }
 const more=document.querySelector<HTMLButtonElement>("#map-more");
 function updateMore(){if(more){more.hidden=nextBefore===null;more.disabled=loading;more.textContent=loading?"Загрузка…":"Загрузить ещё соты";}}
 async function fetchPage(append:boolean,automatic=false){
  if(loading)return;
  loading=true;updateMore();
  try{
   const before=append?nextBefore:null;
   const response=await fetch("/api/memory/map?limit=200"+(before!==null?"&before="+before:""));
   if(!response.ok)throw new Error("Карта памяти недоступна");
   const data=await response.json();
   const incoming:MemoryNode[]=data.nodes||[];
   if(!append){nodes=incoming;links=data.links||[];}
   else{
    const existing=new Set(nodes.map(n=>n.id));
    nodes.push(...incoming.filter(n=>!existing.has(n.id)));
    const known=new Set(links.map(l=>l.source_id+":"+l.target_id+":"+l.relation));
    for(const link of (data.links||[]) as MemoryLink[]){
     const key=link.source_id+":"+link.target_id+":"+link.relation;
     if(!known.has(key)){links.push(link);known.add(key);}
    }
   }
   rebuildClusters();
   nextBefore=typeof data.next_before==="number"?data.next_before:null;
   animationStart=performance.now();layoutDirty=true;
   if(selected!==null&&!nodes.some(n=>n.id===selected)){selected=null;detail.textContent="";}
   scheduleDraw();
  }catch{
   if(automatic)autoLoadFailed=true;
   else detail.textContent="Не удалось загрузить карту памяти";
  }
  finally{loading=false;updateMore();}
 }
 if(more)more.addEventListener("click",()=>{void fetchPage(true);});
 async function reload(){autoPages=0;autoLoadFailed=false;await fetchPage(false);}
 void reload();
 return {reload};
}
