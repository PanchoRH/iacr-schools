const $=(s,e=document)=>e.querySelector(s);
const escapeHtml=(s="")=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function schoolCard(s, upcoming=false){
  const hasImage=Boolean(s.image);
  const isWebsite=s.imageType==='website';
  const mediaLabel=s.mediaLabel||'School website';
  const linkLabel=s.linkLabel||'Explore school';
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
    '<a class="school-media'+(hasImage?' has-image':'')+(isWebsite?' is-website':'')+'" href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+escapeHtml(linkLabel+': '+s.title)+'">'+
      '<span class="media-fallback" aria-hidden="true"><span>'+escapeHtml(s.city)+'</span><span>'+escapeHtml(linkLabel)+' ↗</span></span>'+media+
      (isWebsite?'<span class="website-bar" aria-hidden="true"><span class="browser-dots">● ● ●</span>'+escapeHtml(mediaLabel)+'</span>':'')+
    '</a>'+
    '<div class="school-body">'+
      '<div class="school-kicker"><span class="school-year">'+escapeHtml(s.year)+'</span><span>'+escapeHtml(s.city)+', '+escapeHtml(s.country)+'</span></div>'+
      '<h3>'+escapeHtml(s.title)+'</h3>'+
      '<div class="meta">'+escapeHtml(s.dates)+'</div>'+
      (s.note?'<p class="school-note">'+escapeHtml(s.note)+'</p>':'')+
      '<div class="card-actions"><a class="visit" href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(linkLabel)+' <span aria-hidden="true">↗</span></a>'+
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

function updateSectionNavigation(){
  document.querySelectorAll('.nav-links a[href^="index.html#"]').forEach(link=>{
    if(new URL(link.href).hash===window.location.hash){
      link.setAttribute('aria-current','location');
    }else{
      link.removeAttribute('aria-current');
    }
  });
}
window.addEventListener('hashchange',updateSectionNavigation);
updateSectionNavigation();

async function init(){
  const response=await fetch('schools.json?v=20261007-review');
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

  const grid=$('#schoolGrid'), search=$('#search'), year=$('#yearFilter');
  const continent=$('#continentFilter'), country=$('#countryFilter');
  const years=[...new Set(past.map(s=>s.year))].sort((a,b)=>b-a);
  const continents=[...new Set(past.map(s=>s.continent).filter(Boolean))].sort();
  year.innerHTML+=years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
  continent.innerHTML+=continents.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');

  const updateCountries=()=>{
    const selected=country.value;
    const countries=[...new Set(past.filter(s=>!continent.value||s.continent===continent.value).map(s=>s.country))].sort();
    country.innerHTML='<option value="">All countries</option>'+countries.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');
    country.value=countries.includes(selected)?selected:'';
  };

  const render=()=>{
    const q=search.value.trim().toLowerCase();
    const rows=past.filter(s=>
      (!q||(`${s.title} ${s.city} ${s.country} ${s.continent||''} ${s.year}`).toLowerCase().includes(q))&&
      (!year.value||String(s.year)===year.value)&&
      (!continent.value||s.continent===continent.value)&&
      (!country.value||s.country===country.value));
    grid.innerHTML=rows.length?rows.map(s=>schoolCard(s,false)).join(''):'<p class="quiet">No schools match these filters.</p>';
    $('#resultCount').textContent=rows.length+' school'+(rows.length===1?'':'s');
  };

  [search,year,country].forEach(el=>el.addEventListener('input',render));
  continent.addEventListener('input',()=>{updateCountries();render();});
  updateCountries();
  render();
}
init();
