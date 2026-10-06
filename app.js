
const $=(s,e=document)=>e.querySelector(s);
const escapeHtml=(s="")=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function card(s){
  const hasPhoto=Boolean(s.image);
  const media=hasPhoto
    ? '<img loading="lazy" src="'+escapeHtml(s.image)+'" alt="'+escapeHtml(s.imageAlt||s.title)+'">'
    : '';
  const credit=s.imageCredit?'<div class="photo-credit">'+escapeHtml(s.imageCredit)+(s.imageLicense?' · '+escapeHtml(s.imageLicense):'')+'</div>':'';
  return '<article class="school-card">'+
    '<div class="school-media '+(hasPhoto?'has-photo':'')+'">'+media+'<div class="school-year">'+s.year+'</div></div>'+
    '<div class="school-body"><div><h3>'+escapeHtml(s.title)+'</h3>'+
    '<div class="meta">'+escapeHtml(s.dates)+' · '+escapeHtml(s.city)+', '+escapeHtml(s.country)+'</div>'+credit+'</div>'+
    '<div class="card-actions"><a class="visit" href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">School website ↗</a>'+
    '<span class="badge">'+(hasPhoto?'photo':'photo wanted')+'</span></div></div></article>';
}

async function init(){
  const response=await fetch('schools.json');
  const schools=await response.json();
  schools.sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title));
  const grid=$('#schoolGrid'), search=$('#search'), year=$('#yearFilter'), country=$('#countryFilter');
  const years=[...new Set(schools.map(s=>s.year))].sort((a,b)=>b-a);
  const countries=[...new Set(schools.map(s=>s.country))].sort();
  year.innerHTML+=[...years].map(y=>'<option value="'+y+'">'+y+'</option>').join('');
  country.innerHTML+=countries.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');
  const render=()=>{
    const q=search.value.trim().toLowerCase();
    const rows=schools.filter(s=>
      (!q||(`${s.title} ${s.city} ${s.country} ${s.year}`).toLowerCase().includes(q))&&
      (!year.value||String(s.year)===year.value)&&
      (!country.value||s.country===country.value));
    grid.innerHTML=rows.length?rows.map(card).join(''):'<div class="feature" style="grid-column:1/-1;text-align:center">No schools match these filters.</div>';
    $('#resultCount').textContent=rows.length+' school'+(rows.length===1?'':'s');
  };
  [search,year,country].forEach(el=>el.addEventListener('input',render));
  $('#schoolCount').textContent=schools.length;
  render();
}
init();
