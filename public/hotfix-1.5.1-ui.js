(()=>{
  'use strict';
  const VERSION='1.5.1';
  let scheduled=false;
  function apply(){
    scheduled=false;
    document.documentElement.dataset.deskHotfix=VERSION;
    for(const chip of document.querySelectorAll('.version-chip')){
      const text='Wersja '+VERSION;
      if(chip.textContent!==text)chip.textContent=text;
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(apply);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
