const $=(s,e=document)=>e.querySelector(s);
const escapeHtml=(s="")=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function schoolCard(s, upcoming=false){
  const hasImage=Boolean(s.image);
  const isWebsite=s.imageType==='website';
  const media=hasImage
    ? '<img loading="lazy" decoding="async" src="'+escapeHtml(s.image)+'" alt="'+escapeHtml(s.imageAlt||s.title)+'">'
    : '';
  const source=s.imageCredit
    ? (s.imageSource?'<a href="'+escapeHtml(s.imageSource)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.imageCredit)+'</a>':escapeHtml(s.imageCredit))
    : '';
  const license=s.imageLicense
    ? ' · '+(s.imageLicenseUrl?'<a href="'+escapeHtml(s.imageLicenseUrl)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.imageLicense)+'</a>':escapeHtml(s.imageLicense))
    : '';
  const credit=source?'<div class="photo-credit">'+source+license+'</div>':'';
  return '<article class="school-card'+(upcoming?' upcoming-card':'')+'">'+
    '<a class="school-media'+(hasImage?' has-image':'')+(isWebsite?' is-website':'')+'" href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Visit '+escapeHtml(s.title)+' website">'+
      '<span class="media-fallback" aria-hidden="true"><span>'+escapeHtml(s.city)+'</span><span>School website ↗</span></span>'+media+
      (isWebsite?'<span class="website-bar" aria-hidden="true"><span class="browser-dots">● ● ●</span>School website</span>':'')+
    '</a>'+
    '<div class="school-body">'+
      '<div class="school-kicker"><span class="school-year">'+escapeHtml(s.year)+'</span><span>'+escapeHtml(s.city)+', '+escapeHtml(s.country)+'</span></div>'+
      '<h3>'+escapeHtml(s.title)+'</h3>'+
      '<div class="meta">'+escapeHtml(s.dates)+'</div>'+
      '<div class="card-actions"><a class="visit" href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">Explore school <span aria-hidden="true">↗</span></a>'+
      (upcoming?'<span class="badge upcoming-badge">Upcoming</span>':'')+
      '</div>'+credit+
    '</div></article>';
}

// Keep the school link usable if an external photograph becomes unavailable.
document.addEventListener('error',event=>{
  const image=event.target;
  if(!(image instanceof HTMLImageElement)||!image.closest('.school-media')) return;
  const media=image.closest('.school-media');
  media.classList.remove('has-image','is-website');
  media.querySelector('.website-bar')?.remove();
  image.remove();
},true);

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
