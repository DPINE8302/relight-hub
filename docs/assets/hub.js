'use strict';
fetch('assets/release.json').then(response=>response.ok?response.json():null).then(release=>{if(release)document.querySelector('#app-size').textContent=release.megabytes+' MB';}).catch(()=>{});
