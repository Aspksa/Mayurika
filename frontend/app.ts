import {setupMemoryMap} from "./memory-map.js";
const canvas=document.querySelector<HTMLCanvasElement>("#memory-map")!;
const map=setupMemoryMap(canvas,document.querySelector<HTMLElement>("#map-detail")!);
const status=document.querySelector<HTMLElement>("#status")!;
const messages=document.querySelector<HTMLElement>("#messages")!;
const results=document.querySelector<HTMLElement>("#results")!;
async function refresh(){
  try{
    const health=await fetch("/api/health").then(r=>r.json());
    status.textContent=health.ok?"SQLite активна · "+health.memory_count+" записей":"Ошибка API";
    await map.reload();
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
  let incompleteReply:HTMLElement|null=null;
  try{
    const response=await fetch("/api/chat/stream",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({content,conversation_id:currentConversation})});
    if(!response.ok){
      const data=await response.json();throw new Error(data.error||"Ошибка чата");
    }
    if(!response.body)throw new Error("Потоковый ответ недоступен");
    appendChat("assistant","");
    incompleteReply=chatLog.lastElementChild as HTMLElement;
    const answer=incompleteReply.querySelector("p") as HTMLParagraphElement;
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer="",finished=false;
    while(true){
      const chunk=await reader.read();if(chunk.done)break;
      buffer+=decoder.decode(chunk.value,{stream:true});
      const lines=buffer.split("\n");buffer=lines.pop()||"";
      for(const line of lines){
        if(!line.trim())continue;
        const event=JSON.parse(line);
        if(event.type==="delta"){answer.textContent+=event.text;chatLog.scrollTop=chatLog.scrollHeight;}
        if(event.type==="error"){throw new Error(event.error||"Ошибка генерации");}
        if(event.type==="done"){currentConversation=event.conversation_id;finished=true;}
      }
    }
    if(!finished)throw new Error("Соединение прервано до сохранения ответа");
    incompleteReply=null;
    messages.textContent="";await loadConversations();await refresh();
  }catch(err){
    messages.textContent=err instanceof Error?err.message:"Ошибка соединения";
    chatInput.value=content;
    // Remove incomplete assistant output so it cannot be mistaken for a saved answer.
    if(incompleteReply)incompleteReply.remove();
  }finally{sendChat.disabled=false;}
});
loadConversations();

const pendingList=document.querySelector<HTMLElement>("#pending-list")!;
async function loadPending(){
  pendingList.textContent="Загрузка…";
  try{
    const response=await fetch("/api/memory/pending");
    if(!response.ok)throw new Error("Не удалось загрузить записи");
    const data=await response.json();
    pendingList.replaceChildren();
    for(const item of data.results||[]){
      const card=document.createElement("div");card.className="pending-card";
      const content=document.createElement("p");content.textContent=item.content;
      const source=document.createElement("small");source.textContent=item.sources||"Источник не указан";
      card.append(content,source);
      for(const [label,action] of [["Подтвердить","verified"],["Оспорить","disputed"],["Архив","archived"]]){
        const button=document.createElement("button");button.type="button";button.textContent=label;
        button.addEventListener("click",async()=>{
          button.disabled=true;
          try{
            const response=await fetch("/api/memory/review",{method:"POST",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({id:item.id,status:action})});
            if(!response.ok)throw new Error("Не удалось изменить статус");
            await loadPending();await refresh();
          }catch(error){messages.textContent=error instanceof Error?error.message:"Ошибка";button.disabled=false;}
        });
        card.append(button);
      }
      pendingList.append(card);
    }
    if(!data.results?.length)pendingList.textContent="Новых записей для проверки нет";
  }catch(error){pendingList.textContent=error instanceof Error?error.message:"Ошибка";}
}
document.querySelector<HTMLButtonElement>("#load-pending")!.addEventListener("click",loadPending);

const relationsList=document.querySelector<HTMLElement>("#relations-list")!;
async function loadRelations(){
  relationsList.textContent="Загрузка…";
  try{
    const response=await fetch("/api/memory/relations");
    if(!response.ok)throw new Error("Не удалось загрузить связи");
    const data=await response.json();
    relationsList.replaceChildren();
    for(const item of data.relations||[]){
      const card=document.createElement("div");card.className="pending-card";
      const heading=document.createElement("strong");
      heading.textContent=(item.relation==="possible_conflict"?"Возможное противоречие":"Похожие сведения")+" · "+Math.round(item.score*100)+"% · "+item.status;
      const left=document.createElement("p");left.textContent=item.source_content;
      const right=document.createElement("p");right.textContent=item.target_content;
      card.append(heading,left,right);
      if(item.status==="suggested"){
        for(const [label,status] of [["Принять связь","accepted"],["Отклонить","rejected"]]){
          const button=document.createElement("button");button.type="button";button.textContent=label;
          button.addEventListener("click",async()=>{
            button.disabled=true;
            try{
              const response=await fetch("/api/memory/relations/review",{method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({id:item.id,status})});
              if(!response.ok)throw new Error("Не удалось обновить связь");
              await loadRelations();
            }catch(error){messages.textContent=error instanceof Error?error.message:"Ошибка";button.disabled=false;}
          });
          card.append(button);
        }
      }
      relationsList.append(card);
    }
    if(!data.relations?.length)relationsList.textContent="Связи пока не найдены";
  }catch(error){relationsList.textContent=error instanceof Error?error.message:"Ошибка";}
}
document.querySelector<HTMLButtonElement>("#load-relations")!.addEventListener("click",loadRelations);
