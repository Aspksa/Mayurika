type MemoryNode={id:number;content:string;status:string};
type MemoryLink={source_id:number;target_id:number;relation:string;score:number;status:string};
type Point={x:number;y:number;node:MemoryNode};
const TAU=Math.PI*2;
export function setupMemoryMap(canvas:HTMLCanvasElement,detail:HTMLElement){
 const ctx=canvas.getContext("2d");
 if(!ctx)return {reload:async()=>{}};
 let nodes:MemoryNode[]=[],links:MemoryLink[]=[],points:Point[]=[];
 let scale=1,offsetX=0,offsetY=0,dragging=false,lastX=0,lastY=0,moved=false;
 let selected:number|null=null;
 let animationFrame=0,animationStart=0;
 const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const hex=(x:number,y:number,size:number)=>{ctx!.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/6;const px=x+Math.cos(a)*size,py=y+Math.sin(a)*size;if(i===0)ctx!.moveTo(px,py);else ctx!.lineTo(px,py);}ctx!.closePath();};
 function layout(w:number,h:number){
  const cx=w/2,cy=h/2,r=Math.max(70,Math.min(w,h)*.36);
  points=nodes.map((node,i)=>{
   const sector=i%8,layer=Math.floor(i/8);
   const ring=Math.floor(Math.sqrt(layer));
   const slot=layer-ring*ring;
   const angle=-Math.PI/2+(sector+.5)*Math.PI/4+(slot-ring)*.045;
   const radius=r*(.14+.79*Math.sqrt((layer+1)/(Math.ceil(nodes.length/8)+1)));
   return {x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius,node};
  });
 }
 function draw(){
  const rect=canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);
  if(!rect.width||!rect.height)return;
  canvas.width=Math.round(rect.width*d);canvas.height=Math.round(rect.height*d);
  ctx!.setTransform(d,0,0,d,0,0);ctx!.clearRect(0,0,rect.width,rect.height);
  layout(rect.width,rect.height);
  ctx!.save();ctx!.translate(offsetX,offsetY);ctx!.translate(rect.width/2,rect.height/2);
  ctx!.scale(scale,scale);ctx!.translate(-rect.width/2,-rect.height/2);
  const cx=rect.width/2,cy=rect.height/2,r=Math.min(rect.width,rect.height)*.36;
  ctx!.strokeStyle="rgba(190,145,70,.22)";ctx!.lineWidth=1;
  for(let ring=1;ring<=7;ring++){ctx!.beginPath();ctx!.arc(cx,cy,r*ring/7,0,TAU);ctx!.stroke();}
  for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2;ctx!.beginPath();ctx!.moveTo(cx,cy);ctx!.lineTo(cx+Math.cos(a)*r*1.08,cy+Math.sin(a)*r*1.08);ctx!.stroke();}
  const lookup=new Map(points.map(p=>[p.node.id,p]));
  for(const link of links){
   const a=lookup.get(link.source_id),b=lookup.get(link.target_id);
   if(!a||!b)continue;
   ctx!.strokeStyle=link.relation==="possible_conflict"?"rgba(235,90,84,.78)":"rgba(211,169,95,.42)";
   ctx!.lineWidth=link.status==="accepted"?1.8:1;
   ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.lineTo(b.x,b.y);ctx!.stroke();
  }
  for(const p of points){
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
   cancelAnimationFrame(animationFrame);animationFrame=requestAnimationFrame(draw);
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
  offsetX+=dx;offsetY+=dy;lastX=e.clientX;lastY=e.clientY;draw();
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
  draw();
 });
 canvas.addEventListener("pointercancel",()=>{dragging=false;});
 canvas.addEventListener("wheel",e=>{
  e.preventDefault();scale=Math.max(.5,Math.min(5,scale*(e.deltaY<0?1.12:.89)));draw();
 },{passive:false});
 new ResizeObserver(draw).observe(canvas);
 async function reload(){
  try{
   const response=await fetch("/api/memory/map");
   if(!response.ok)throw new Error("Карта памяти недоступна");
   const data=await response.json();const incoming:MemoryNode[]=data.nodes||[];
   if(incoming.length!==nodes.length||incoming.some((n,i)=>n.id!==nodes[i]?.id))animationStart=performance.now();
   nodes=incoming;links=data.links||[];
   if(selected!==null&&!nodes.some(n=>n.id===selected)){selected=null;detail.textContent="";}
   draw();
  }catch{detail.textContent="Не удалось загрузить карту памяти";}
 }
 void reload();
 return {reload};
}
