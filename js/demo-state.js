/* LUME AGENDA - ETAPA 3 / sincronizacao de demonstracao isolada.
   A sessao D1 e identificada por cookie HttpOnly, nao por localStorage.
   Em Live Server, a versao local continua disponivel apenas para visualizacao.
*/
(function () {
  "use strict";
  const KEY = "lume-agenda-demo-v1";
  const EVENT = "lume-demo-updated";
  const defaults = {
    capacity: 1, interval: 60,
    weekly: [
      {day:0,open:false,start:"08:00",end:"13:00"},
      ...[1,2,3,4,5].map(day=>({day,open:true,start:"07:00",end:"17:00"})),
      {day:6,open:true,start:"08:00",end:"13:00"}
    ],
    services: [
      {id:"lavagem-detalhada",name:"Lavagem detalhada",price:120,duration:120,active:true},
      {id:"polimento-tecnico",name:"Polimento técnico",price:350,duration:240,active:true},
      {id:"higienizacao-interna",name:"Higienização interna",price:250,duration:180,active:true},
      {id:"vitrificacao",name:"Vitrificação",price:600,duration:360,active:true},
      {id:"limpeza-motor",name:"Limpeza de motor",price:100,duration:60,active:true},
      {id:"revitalizacao-farois",name:"Revitalização de faróis",price:150,duration:120,active:true}
    ], blocks:[],bookings:[]
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const online = !["localhost","127.0.0.1"].includes(location.hostname) &&
    location.protocol === "https:";
  let state = copy(defaults), version = null, initialized = false;
  let pending = Promise.resolve();
  let lastError = "";
  const update = () => window.dispatchEvent(new CustomEvent(EVENT));
  function sanitize(original) {
    const safe=copy(original);
    safe.bookings=(safe.bookings || []).map(b=>({
      ...b,name:"Cliente demonstrativo",phone:"00000000000",
      vehicle:"Veículo demonstrativo",notes:""
    }));
    return safe;
  }
  function cacheRead() {
    try {
      const data=JSON.parse(localStorage.getItem(KEY)||"null");
      if (data?.version===1 && data.state && Array.isArray(data.state.bookings)) return data.state;
    } catch (_) { /* cache ausente */ }
    return null;
  }
  function cacheWrite() {
    try { localStorage.setItem(KEY,JSON.stringify({version:1,state})); } catch (_) { /* armazenamento opcional */ }
    update();
  }
  async function api(path, method="GET", data) {
    const response=await fetch(path,{
      method,credentials:"same-origin",cache:"no-store",
      headers:{...(data ? {"Content-Type":"application/json"}:{})},
      ...(data ? {body:JSON.stringify(data)}:{})
    });
    let body={};
    try { body=await response.json(); } catch (_) { /* servidor indisponivel */ }
    if (!response.ok || body.success===false) {
      const error=new Error(body.error || `Erro de comunicacao (${response.status}).`);
      error.status=response.status;
      throw error;
    }
    return body;
  }
  async function loadRemote(allowCreate=true) {
    let result;
    try { result=await api("/api/demo/state"); }
    catch (e) {
      if (allowCreate && e.status===401) {
        await api("/api/demo/start","POST",{});
        result=await api("/api/demo/state");
      } else throw e;
    }
    state=copy(result.data);
    version=result.version;
    cacheWrite();
    lastError="";
    return copy(state);
  }
  const boot=(async()=>{
    if (!online) {
      state=copy(cacheRead()||defaults);
      initialized=true; update(); return;
    }
    try { await loadRemote(true); }
    catch (error) { lastError=error.message; console.error("Lume D1:",error); }
    initialized=true;
  })();
  function emitError(message) {
    lastError=message;
    console.error("Lume Agenda:",message);
    window.dispatchEvent(new CustomEvent("lume-demo-sync-error",{detail:{message}}));
  }
  function getState(){return copy(state);}
  function saveState(original){
    // UI legada: atualiza imediatamente, mas exige retorno do servidor para confirmar.
    const safe=sanitize(original);
    if (!online) {
      state=safe;cacheWrite();return true;
    }
    if (version===null) { emitError("Sem conexão com o D1. Alterações não foram salvas.");return false; }
    state=safe;cacheWrite();
    pending=pending.then(async()=>{
      const result=await api("/api/demo/state","PUT",{state:safe,version});
      version=result.version;
    }).catch(async error=>{
      emitError(error.status===409
        ? "Outra aba alterou a demonstração. Os dados serão recarregados. Repita sua ação."
        : "Não foi possível salvar no Cloudflare: " + error.message);
      try { await loadRemote(false); } catch (_) { /* conservar mensagem de erro */ }
    });
    return true;
  }
  async function saveStateAsync(original){
    const safe=sanitize(original);
    if (!online) { state=safe;cacheWrite();return true; }
    if(version===null) throw new Error("Não foi possível conectar ao banco D1.");
    await pending;
    try {
      const result=await api("/api/demo/state","PUT",{state:safe,version});
      version=result.version;
      state=safe;cacheWrite();
      return true;
    } catch(e) {
      if(e.status===409) await loadRemote(false);
      throw e;
    }
  }
  async function resetAsync(){
    await pending;
    if(!online){
      state=copy(defaults);localStorage.removeItem(KEY);update();return true;
    }
    const result=await api("/api/demo/reset","POST",{confirm:"RESTAURAR"});
    version=result.version;
    await loadRemote(false);
    return true;
  }
  function reset(){
    if(!online){state=copy(defaults);localStorage.removeItem(KEY);update();return true;}
    emitError("Use resetAsync para restaurar a sessão online.");return false;
  }
  async function refresh(){
    await pending;
    if(online) await loadRemote(false);
    else {state=copy(cacheRead()||defaults);update();}
    return getState();
  }
  window.addEventListener("storage",event=>{
    if(event.key===KEY && !online){state=copy(cacheRead()||defaults);update();}
    if(event.key===KEY && online) refresh().catch(e=>emitError(e.message));
  });
  if(online) setInterval(()=>{
    if(!initialized || version===null) return;
    refresh().catch(e=>console.warn("Sincronização:",e.message));
  },20000);
  window.LumeDemo=Object.freeze({
    getState,saveState,saveStateAsync,reset,resetAsync,ready:()=>boot,
    refresh,KEY,EVENT, get online(){return online;},get lastError(){return lastError;}
  });
})();