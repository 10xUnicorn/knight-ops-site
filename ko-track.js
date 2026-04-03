// Knight Ops Analytics Tracker — lightweight, privacy-friendly
(function(){
  var EP='https://trpnlkntvulkjerevngm.supabase.co/functions/v1/track';
  var vid=localStorage.getItem('ko_vid');
  if(!vid){vid='v_'+Math.random().toString(36).substr(2,12)+Date.now().toString(36);localStorage.setItem('ko_vid',vid);}
  var sid='s_'+Math.random().toString(36).substr(2,8)+Date.now().toString(36);
  var start=Date.now();
  var params=new URLSearchParams(location.search);

  function send(events){
    try{navigator.sendBeacon(EP,JSON.stringify(events));}
    catch(e){fetch(EP,{method:'POST',body:JSON.stringify(events),headers:{'Content-Type':'application/json'},keepalive:true}).catch(function(){});}
  }

  // Pageview
  send({
    event_type:'pageview',
    page_path:location.pathname,
    page_title:document.title,
    referrer:document.referrer||null,
    utm_source:params.get('utm_source')||null,
    utm_medium:params.get('utm_medium')||null,
    utm_campaign:params.get('utm_campaign')||null,
    session_id:sid,
    visitor_id:vid,
    screen_width:screen.width
  });

  // Track clicks on buttons, links, CTAs
  document.addEventListener('click',function(e){
    var t=e.target.closest('a,button,[onclick]');
    if(!t)return;
    var label=t.textContent.trim().substring(0,100);
    var href=t.href||t.getAttribute('onclick')||'';
    send({
      event_type:'click',
      page_path:location.pathname,
      click_target:(label+'|'+href).substring(0,200),
      session_id:sid,
      visitor_id:vid
    });
  });

  // Session duration on unload
  function endSession(){
    var dur=Math.round((Date.now()-start)/1000);
    if(dur<1)return;
    send({
      event_type:'session_end',
      page_path:location.pathname,
      duration_seconds:dur,
      session_id:sid,
      visitor_id:vid
    });
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')endSession();});
  window.addEventListener('pagehide',endSession);
})();
