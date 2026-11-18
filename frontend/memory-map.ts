type MemoryNode={id:number;content:string;status:string;cluster_id:number|null};
type MemoryCluster={id:number;members:number[];size:number};
type MemoryLink={source_id:number;target_id:number;relation:string;score:number;status:string};
type Point={x:number;y:number;node:MemoryNode};
const TAU=Math.PI*2;
export function setupMemoryMap(canvas:HTMLCanvasElement,detail:HTMLElement){
 const ctx=canvas.getContext("2d");
 if(!ctx)return {reload:async()=>{}};
 let nodes:MemoryNode[]=[],links:MemoryLink[]=[],clusters:MemoryCluster[]=[],points:Point[]=[];
 let scale=1,offsetX=0,offsetY=0,dragging=false,lastX=0,lastY=0,moved=false;
 let selected:number|null=null;
 let animationStart=0;
 let renderQueued=false,layoutDirty=true,layoutWidth=0,layoutHeight=0;
 let pixelWidth=0,pixelHeight=0;
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
  const buckets:MemoryNode[][]=Array.from({length:8},()=>[]);
  for(const group of groups){
   const sector=group[0].id%8;
   buckets[sector].push(...group);
  }
  const maxCount=Math.max(1,...buckets.map(b=>b.length));
  const pitch=Math.max(5,Math.min(12,r*.78/(Math.sqrt(maxCount)+1)));
  points=[];
  for(let sector=0;sector<8;sector++){
   const a=-Math.PI/2+(sector+.5)*Math.PI/4;
   const ux=Math.cos(a),uy=Math.sin(a),vx=-uy,vy=ux;
   const centerX=cx+ux*r*.52,centerY=cy+uy*r*.52;
   for(let i=0;i<buckets[sector].length;i++){
    // Hexagonal spiral: each ring has six times its radius cells.
    let q=0,t=0;
    if(i>0){
     let ring=1,remaining=i-1;
     while(remaining>=6*ring){remaining-=6*ring;ring++;}
     q=ring;t=0;
     const dirs=[[0,-1],[-1,0],[-1,1],[0,1],[1,0],[1,-1]];
     for(let step=0;step<remaining;step++){const d=dirs[Math.floor(step/ring)];q+=d[0];t+=d[1];}
    }
    const x=(q+t/2)*pitch*1.5,y=t*pitch*Math.sqrt(3)*.86;
    points.push({x:centerX+vx*x+ux*y,y:centerY+vy*x+uy*y,node:buckets[sector][i]});
   }
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
  const groups=Array.from({length:8},(_,i)=>points.filter(p=>p.node.id%8===i));
  for(let i=0;i<groups.length;i++){
   const count=groups[i].length;if(!count)continue;
   const a=-Math.PI/2+(i+.5)*Math.PI/4;
   const gx=cx+Math.cos(a)*r*.57,gy=cy+Math.sin(a)*r*.57;
   ctx!.beginPath();ctx!.arc(gx,gy,Math.min(48,14+Math.sqrt(count)*4),0,TAU);
   ctx!.fillStyle="rgba(160,111,44,.045)";ctx!.fill();
   ctx!.strokeStyle="rgba(208,157,76,.13)";ctx!.stroke();
  }
  const lookup=new Map(points.map(p=>[p.node.id,p]));
  for(const cluster of clusters){
   const members=cluster.members.map(id=>lookup.get(id)).filter((p):p is Point=>Boolean(p));
   if(members.length<2)continue;
   const mx=members.reduce((sum,p)=>sum+p.x,0)/members.length;
   const my=members.reduce((sum,p)=>sum+p.y,0)/members.length;
   const radius=Math.max(15,...members.map(p=>Math.hypot(p.x-mx,p.y-my)+9));
   ctx!.beginPath();ctx!.arc(mx,my,radius,0,TAU);
   ctx!.fillStyle="rgba(209,163,82,.055)";ctx!.fill();
   ctx!.strokeStyle="rgba(238,191,99,.4)";ctx!.lineWidth=1;ctx!.stroke();
  }
  for(const link of links){
   const a=lookup.get(link.source_id),b=lookup.get(link.target_id);
   if(!a||!b)continue;
   ctx!.strokeStyle=link.relation==="possible_conflict"?"rgba(235,90,84,.78)":"rgba(211,169,95,.42)";
   ctx!.lineWidth=link.status==="accepted"?1.8:1;
   ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.lineTo(b.x,b.y);ctx!.stroke();
  }
  const left=(0-rect.width/2-offsetX)/scale+rect.width/2-16;
  const right=(rect.width-rect.width/2-offsetX)/scale+rect.width/2+16;
  const top=(0-rect.height/2-offsetY)/scale+rect.height/2-16;
  const bottom=(rect.height-rect.height/2-offsetY)/scale+rect.height/2+16;
  for(const p of points){
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
  const closest=points.map(p=>({p,dist:Math.hypot(p.x-q.x,p.y-q.y)})).sort((a,b)=>a.dist-b.dist)[0];
  if(closest&&closest.dist<13/scale){
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
  e.preventDefault();scale=Math.max(.5,Math.min(5,scale*(e.deltaY<0?1.12:.89)));scheduleDraw();
 },{passive:false});
 new ResizeObserver(()=>{layoutDirty=true;scheduleDraw();}).observe(canvas);
 async function reload(){
  try{
   const response=await fetch("/api/memory/map");
   if(!response.ok)throw new Error("Карта памяти недоступна");
   const data=await response.json();const incoming:MemoryNode[]=data.nodes||[];
   if(incoming.length!==nodes.length||incoming.some((n,i)=>n.id!==nodes[i]?.id))animationStart=performance.now();
   nodes=incoming;links=data.links||[];clusters=data.clusters||[];layoutDirty=true;
   if(selected!==null&&!nodes.some(n=>n.id===selected)){selected=null;detail.textContent="";}
   scheduleDraw();
  }catch{detail.textContent="Не удалось загрузить карту памяти";}
 }
 void reload();
 return {reload};
}
