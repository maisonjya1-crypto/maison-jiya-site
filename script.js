// Version CMS : charge les produits depuis data/products.json (éditable dans /admin)
// + mini-panier, recherche, tri, checkout WhatsApp.
const state = {
  products: [], // sera chargé dynamiquement
  cart: JSON.parse(localStorage.getItem("mj_cart") || "[]"),
  searchQuery: ""
};

const fmt = (n)=> `${n.toLocaleString("fr-MA")} DH`;

function cardTemplate(p){
  const badge = p.bestseller ? `<span class="badge">Best-seller</span>` : "";
  return `
  <article class="card" data-id="${p.id}" data-gender="${p.gender}" data-title="${p.title.toLowerCase()}" data-tags="${p.tags.join(" ").toLowerCase()}">
    <div class="img"><img src="${p.image}" alt="${p.title}"></div>
    <div class="body">
      <h3>${p.title}</h3>
      <p>${p.description}</p>
      <div class="price-row">
        <span class="price">${fmt(p.price)}</span>
        <div class="actions">
          ${badge}
          <button class="btn add-btn" data-id="${p.id}">Ajouter</button>
        </div>
      </div>
    </div>
  </article>`;
}

function miniItemTemplate(item){
  const p = state.products.find(x=>x.id===item.id);
  return `
  <div class="mini-cart__item">
    <img src="${p.image}" alt="${p.title}" style="width:64px;height:64px;object-fit:cover;border-radius:8px">
    <div>
      <div style="font-weight:700">${p.title}</div>
      <div class="muted">${fmt(p.price)}</div>
      <div class="qty">
        <button class="icon-btn qty-minus" data-id="${item.id}">−</button>
        <span>${item.qty}</span>
        <button class="icon-btn qty-plus" data-id="${item.id}">+</button>
      </div>
    </div>
    <button class="icon-btn remove" data-id="${item.id}">✕</button>
  </div>`;
}

// Load products JSON, then render
async function loadProducts(){
  try{
    const res = await fetch("data/products.json", {cache:"no-store"});
    const json = await res.json();
    state.products = Array.isArray(json.products) ? json.products : [];
  }catch(e){
    // Fallback au cas où (ne devrait pas arriver en prod)
    state.products = [
      {id:"H001", title:"Sub Noire", price: 249, gender:"homme", image:"assets/montre_homme_noire.jpg", bestseller:true, description:"Boîtier acier, cadran noir profond, style intemporel.", tags:["noire","acier","classique"]},
      {id:"H002", title:"Argent Sport", price: 229, gender:"homme", image:"assets/montre_homme_argent.jpg", bestseller:false, description:"Lunette sport, bracelet acier, look audacieux.", tags:["argent","sport","acier"]},
      {id:"H003", title:"Green Marine", price: 259, gender:"homme", image:"assets/montre_homme_verte.jpg", bestseller:true, description:"Tonalité verte, allure distinctive, étanche.", tags:["verte","marine","étanche"]},
      {id:"F001", title:"Golden Grace", price: 219, gender:"femme", image:"assets/montre_femme_doree.jpg", bestseller:true, description:"Finition dorée élégante, finesse au poignet.", tags:["dorée","élégante","fine"]},
      {id:"F002", title:"Rose Chic", price: 199, gender:"femme", image:"assets/montre_femme_rose.jpg", bestseller:false, description:"Teinte rose, sophistication moderne.", tags:["rose","chic","moderne"]},
      {id:"F003", title:"Argent Élégance", price: 189, gender:"femme", image:"assets/montre_femme_argent.jpg", bestseller:false, description:"Minimaliste et lumineuse pour tous les jours.", tags:["argent","minimaliste","quotidien"]},
    ];
  }
}

function mount(){
  document.getElementById("year").textContent = new Date().getFullYear();
  renderAll();
  bindGlobalEvents();
}

async function start(){
  await loadProducts();
  mount();
}
document.addEventListener("DOMContentLoaded", start);

function renderAll(){
  const best = state.products.filter(p=>p.bestseller);
  document.getElementById("bestGrid").innerHTML = best.map(cardTemplate).join("");

  const homme = state.products.filter(p=>p.gender==="homme");
  const femme = state.products.filter(p=>p.gender==="femme");
  document.getElementById("hommeGrid").innerHTML = homme.map(cardTemplate).join("");
  document.getElementById("femmeGrid").innerHTML = femme.map(cardTemplate).join("");

  applySearchFilter();
  updateCartCount();
}

function applySearchFilter(){
  const q = state.searchQuery.trim().toLowerCase();
  const cards = Array.from(document.querySelectorAll(".card"));
  if(!q){
    cards.forEach(c=>c.style.display="");
    return;
  }
  cards.forEach(c=>{
    const hay = (c.dataset.title + " " + c.dataset.tags).toLowerCase();
    c.style.display = hay.includes(q) ? "" : "none";
  });
}

function sortGrid(gridId, sortValue){
  const grid = document.getElementById(gridId);
  const cards = Array.from(grid.children);
  cards.sort((a,b)=>{
    const pa = parseFloat(a.querySelector(".price").textContent.replace(/\D/g,""));
    const pb = parseFloat(b.querySelector(".price").textContent.replace(/\D/g,""));
    if(sortValue==="price-asc") return pa - pb;
    if(sortValue==="price-desc") return pb - pa;
    return 0;
  });
  grid.innerHTML = "";
  cards.forEach(c=>grid.appendChild(c));
}

function persistCart(){ localStorage.setItem("mj_cart", JSON.stringify(state.cart)); }
function updateCartCount(){
  const count = state.cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById("cartCount").textContent = count;
}
function addToCart(id){
  const found = state.cart.find(i=>i.id===id);
  if(found) found.qty += 1; else state.cart.push({id, qty:1});
  persistCart(); updateCartCount(); openMiniCart(); renderMiniCart();
}
function changeQty(id, delta){
  const i = state.cart.findIndex(x=>x.id===id);
  if(i>-1){
    state.cart[i].qty += delta;
    if(state.cart[i].qty<=0) state.cart.splice(i,1);
    persistCart(); updateCartCount(); renderMiniCart();
  }
}
function removeFromCart(id){
  const i = state.cart.findIndex(x=>x.id===id);
  if(i>-1){ state.cart.splice(i,1); persistCart(); updateCartCount(); renderMiniCart(); }
}
function calcTotal(){
  return state.cart.reduce((sum, item)=>{
    const p = state.products.find(x=>x.id===item.id);
    return sum + p.price*item.qty;
  }, 0);
}
function renderMiniCart(){
  const wrap = document.getElementById("miniCartItems");
  if(state.cart.length===0){
    wrap.innerHTML = `<p class="muted">Votre panier est vide.</p>`;
  } else {
    wrap.innerHTML = state.cart.map(miniItemTemplate).join("");
  }
  document.getElementById("miniCartTotal").textContent = fmt(calcTotal());
}
const miniCartEl = document.getElementById("miniCart");
const overlayEl = document.getElementById("overlay");
function openMiniCart(){
  miniCartEl.classList.add("open");
  overlayEl.classList.add("show");
  miniCartEl.setAttribute("aria-hidden","false");
}
function closeMiniCart(){
  miniCartEl.classList.remove("open");
  overlayEl.classList.remove("show");
  miniCartEl.setAttribute("aria-hidden","true");
}
function checkoutWhatsApp(){
  if(state.cart.length===0){ alert("Votre panier est vide."); return; }
  const lines = state.cart.map(item=>{
    const p = state.products.find(x=>x.id===item.id);
    return `• ${p.title} x${item.qty} — ${fmt(p.price*item.qty)}`;
  });
  const total = fmt(calcTotal());
  const message = encodeURIComponent(
    "Bonjour, je souhaite commander :\\n" + lines.join("\\n") + "\\nTotal : " + total + "\\nNom:\\nAdresse:\\nTéléphone:"
  );
  const phone = "212600000000"; // <-- Remplacez par votre numéro sans "+"
  const url = `https://wa.me/${phone}?text=${message}`;
  window.open(url, "_blank");
}
function bindGlobalEvents(){
  document.addEventListener("click", (e)=>{
    const add = e.target.closest(".add-btn");
    if(add){ addToCart(add.dataset.id); }
    if(e.target.matches("#cartBtn")){ openMiniCart(); }
    if(e.target.matches("#closeMiniCart") || e.target===overlayEl){ closeMiniCart(); }
    const minus = e.target.closest(".qty-minus");
    if(minus){ changeQty(minus.dataset.id, -1); }
    const plus = e.target.closest(".qty-plus");
    if(plus){ changeQty(plus.dataset.id, +1); }
    const remove = e.target.closest(".remove");
    if(remove){ removeFromCart(remove.dataset.id); }
    if(e.target.matches("#checkoutBtn")){ checkoutWhatsApp(); }
    if(e.target.matches("#searchBtn")){ state.searchQuery = document.getElementById("searchInput").value; applySearchFilter(); }
  });
  document.getElementById("searchInput").addEventListener("input", (e)=>{
    state.searchQuery = e.target.value;
    applySearchFilter();
  });
  document.getElementById("hommeSort").addEventListener("change", (e)=> sortGrid("hommeGrid", e.target.value));
  document.getElementById("femmeSort").addEventListener("change", (e)=> sortGrid("femmeGrid", e.target.value));
}
