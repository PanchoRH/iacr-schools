const $=(s,e=document)=>e.querySelector(s);
const escapeHtml=(s="")=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function schoolCard(s, upcoming=false){
  const hasPhoto=Boolean(s.image);
  const media=hasPhoto
    ? '<img loading="lazy" src="'+escapeHtml(s.image)+'" alt="'+escapeHtml(s.imageAlt||s.title)+'">'
    : '';
  const credit=s.imageCredit
    ? '<div class="photo-credit">'+escapeHtml(s.imageCredit)+(s.imageLicense?' · '+escapeHtml(s.imageLicense):'')+'</div>'
    : '';
  return '<article class="school-card'+(upcoming?' upcoming-card':'')+'">'+
    '<div class="school-media '+(hasPhoto?'has-photo':'')+'">'+media+
      '<div class="school-year">'+s.year+'</div>'+
    '</div>'+
    '<div class="school-body">'+
      '<div><h3>'+escapeHtml(s.title)+'</h3>'+
      '<div class="meta">'+escapeHtml(s.dates)+' · '+escapeHtml(s.city)+', '+escapeHtml(s.country)+'</div>'+credit+'</div>'+
      '<div class="card-actions"><a class="visit" href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">School website ↗</a>'+
      (upcoming?'<span class="badge upcoming-badge">Upcoming</span>':'')+
      '</div>'+
    '</div></article>';
}

async function init(){
  const response=await fetch('schools.json');
  const schools=await response.json();
  schools.sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title));

  const upcoming=schools.filter(s=>s.status==='upcoming');
  const past=schools.filter(s=>s.status!=='upcoming');

  const upcomingGrid=$('#upcomingGrid');
  if(upcomingGrid){
    upcomingGrid.innerHTML=upcoming.length
      ? upcoming.map(s=>schoolCard(s,true)).join('')
      : '<p class="quiet">No upcoming schools are listed.</p>';
  }

  const grid=$('#schoolGrid'), search=$('#search'), year=$('#yearFilter'), country=$('#countryFilter');
  const years=[...new Set(past.map(s=>s.year))].sort((a,b)=>b-a);
  const countries=[...new Set(past.map(s=>s.country))].sort();
  year.innerHTML+=[...years].map(y=>'<option value="'+y+'">'+y+'</option>').join('');
  country.innerHTML+=countries.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');

  const render=()=>{
    const q=search.value.trim().toLowerCase();
    const rows=past.filter(s=>
      (!q||(`${s.title} ${s.city} ${s.country} ${s.year}`).toLowerCase().includes(q))&&
      (!year.value||String(s.year)===year.value)&&
      (!country.value||s.country===country.value));
    grid.innerHTML=rows.length?rows.map(s=>schoolCard(s,false)).join(''):'<p class="quiet">No schools match these filters.</p>';
    $('#resultCount').textContent=rows.length+' school'+(rows.length===1?'':'s');
  };

  [search,year,country].forEach(el=>el.addEventListener('input',render));
  render();
}
init();
