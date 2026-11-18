const canvas=document.querySelector<HTMLCanvasElement>("#memory-map")!;
const ctx=canvas.getContext("2d")!;
const status=document.querySelector<HTMLElement>("#status")!;
const messages=document.querySelector<HTMLElement>("#messages")!;
const results=document.querySelector<HTMLElement>("#results")!;
let events:{id:number;kind:string}[]=[];
function draw(){
  const rect=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(rect.width*d);canvas.height=Math.round(rect.height*d);
  ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,rect.width,rect.height);
  const cx=rect.width/2,cy=rect.height/2,r=Math.min(rect.width,rect.height)*.33;
  ctx.strokeStyle="#755c31";ctx.lineWidth=1;
  for(let ring=1;ring<=4;ring++){ctx.beginPath();ctx.arc(cx,cy,r*ring/4,0,Math.PI*2);ctx.stroke();}
  for(let sector=0;sector<8;sector++){
    const a=sector*Math.PI/4-Math.PI/2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*r*1.13,cy+Math.sin(a)*r*1.13);ctx.stroke();
  }
  const count=Math.min(events.length,100);
  for(let i=0;i<count;i++){
    const a=(i%8)*Math.PI/4-Math.PI/2+(Math.floor(i/8)%3-1)*.1;
    const radius=r*(.22+.7*(Math.floor(i/8)+1)/13);
    const x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius;
    ctx.fillStyle="#d6ad65";ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle="#f6d79a";ctx.beginPath();ctx.arc(cx,cy,7,0,Math.PI*2);ctx.fill();
}
new ResizeObserver(draw).observe(canvas);
async function refresh(){
  try{
    const health=await fetch("/api/health").then(r=>r.json());
    status.textContent=health.ok?"SQLite активна · "+health.memory_count+" записей":"Ошибка API";
    const payload=await fetch("/api/events").then(r=>r.json());
    events=payload.events||[];draw();
  }catch{status.textContent="API недоступен";}
}
document.querySelector<HTMLFormElement>("#memory-form")!.addEventListener("submit",async e=>{
  e.preventDefault();const field=document.querySelector<HTMLTextAreaElement>("#memory-input")!;
  const response=await fetch("/api/memory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:field.value})});
  const data=await response.json();messages.textContent=response.ok?"Сохранено как неподтверждённая запись #"+data.id:data.error;
  if(response.ok)field.value="";await refresh();
});
document.querySelector<HTMLFormElement>("#search-form")!.addEventListener("submit",async e=>{
  e.preventDefault();const q=document.querySelector<HTMLInputElement>("#search-input")!.value;
  const data=await fetch("/api/memory/search?q="+encodeURIComponent(q)).then(r=>r.json());
  results.replaceChildren();
  for(const item of data.results||[]){const div=document.createElement("div");div.textContent=item.content+" · "+item.status;results.append(div);}
  if(!data.results?.length)results.textContent="Ничего не найдено";
});
refresh();

const chatLog=document.querySelector<HTMLElement>("#chat-log")!;
const chatForm=document.querySelector<HTMLFormElement>("#chat-form")!;
const chatInput=document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendChat=document.querySelector<HTMLButtonElement>("#send-chat")!;
const conversationSelect=document.querySelector<HTMLSelectElement>("#conversations")!;
let currentConversation:string|null=null;
function appendChat(role:string,content:string){
  const item=document.createElement("div");item.className="chat-message";
  const heading=document.createElement("strong");heading.textContent=role==="user"?"Вы":"Mayurika";
  const body=document.createElement("p");body.textContent=content;
  item.append(heading,body);chatLog.append(item);chatLog.scrollTop=chatLog.scrollHeight;
}
async function loadConversations(){
  try{
    const data=await fetch("/api/conversations").then(r=>r.json());
    conversationSelect.replaceChildren();
    const blank=document.createElement("option");blank.value="";blank.textContent="Новый диалог";conversationSelect.append(blank);
    for(const c of data.conversations||[]){
      const option=document.createElement("option");option.value=c.id;option.textContent=c.title;
      conversationSelect.append(option);
    }
    conversationSelect.value=currentConversation||"";
  }catch{messages.textContent="Не удалось загрузить историю диалогов";}
}
conversationSelect.addEventListener("change",async()=>{
  currentConversation=conversationSelect.value||null;chatLog.replaceChildren();
  if(!currentConversation)return;
  try{
    const data=await fetch("/api/chat/history?id="+encodeURIComponent(currentConversation)).then(r=>r.json());
    for(const m of data.messages||[])appendChat(m.role,m.content);
  }catch{messages.textContent="Не удалось открыть диалог";}
});
document.querySelector<HTMLButtonElement>("#new-chat")!.addEventListener("click",()=>{
  currentConversation=null;conversationSelect.value="";chatLog.replaceChildren();messages.textContent="";
});
chatForm.addEventListener("submit",async e=>{
  e.preventDefault();const content=chatInput.value.trim();if(!content||sendChat.disabled)return;
  sendChat.disabled=true;appendChat("user",content);chatInput.value="";messages.textContent="Mayurika отвечает…";
  try{
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({content,conversation_id:currentConversation})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Ошибка чата");
    currentConversation=data.conversation_id;appendChat("assistant",data.answer);
    messages.textContent="";await loadConversations();await refresh();
  }catch(err){
    messages.textContent=err instanceof Error?err.message:"Ошибка соединения";
    chatInput.value=content;
  }finally{sendChat.disabled=false;}
});
loadConversations();
