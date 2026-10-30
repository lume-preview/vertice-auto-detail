/* Login demonstrativo. Esta credencial e PUBLICA e nao concede acesso
   as rotas administrativas reais /api/admin do D1. */
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const form=$("admin-login-form"), username=$("admin-username"), password=$("admin-password");
  const fill=$("admin-fill-demo"), error=$("admin-login-error"), submit=$("admin-login-submit");
  if (!form||!username||!password||!fill||!error||!submit) return;
  const showError=message=>{error.textContent=message;error.hidden=!message;};
  fill.addEventListener("click",()=>{username.value="admin";password.value="1234";showError("");submit.focus();});
  username.addEventListener("input",()=>showError(""));
  password.addEventListener("input",()=>showError(""));
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if (!username.value.trim()||!password.value) {showError("Preencha o usuário e a senha.");return;}
    if (username.value.trim()!=="admin"||password.value!=="1234") {
      showError("Usuário ou senha incorretos.");password.value="";return;
    }
    submit.disabled=true;showError("");
    try {
      const response=await fetch("/api/demo/login",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username:"admin",password:"1234"})
      });
      const result=await response.json();
      if (!response.ok||!result.success) throw new Error(result.error||"Não foi possível iniciar a demonstração.");
      window.location.assign("dashboard.html");
    }catch(e){showError(e.message||"Falha de conexão com a demonstração.");}
    finally{submit.disabled=false;}
  });
});