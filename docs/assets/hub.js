'use strict';
fetch('assets/release.json').then(response=>response.ok?response.json():null).then(release=>{
  if(!release) return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el&&value!=null)el.textContent=value;};
  set('app-size',release.megabytes+' MB');
  if(!release.windows) return;
  const windows=release.windows;
  set('windows-version',windows.version);
  Object.entries(windows.assets||{}).forEach(([key,asset])=>{
    set('windows-'+key+'-size',asset.megabytes+' MB');
    document.querySelectorAll('[data-windows-asset="'+key+'"]').forEach(link=>{
      link.href='https://github.com/DPINE8302/relight-hub/releases/download/'+windows.tag+'/'+asset.file;
    });
  });
}).catch(()=>{});
