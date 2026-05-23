// Knight Ops Unified Analytics Tracker v2
// Sends to track-visitor (fingerprinted, scored, auto-lead-linked)
// + legacy site_analytics for backward compatibility
(function(){
  var TV='https://trpnlkntvulkjerevngm.supabase.co/functions/v1/track-visitor';
  var LEGACY='https://trpnlkntvulkjerevngm.supabase.co/functions/v1/track';
  var SITE_ID='2d787b9e-b9d4-4367-b2c7-5464e9dfa833';

  // ── Canvas fingerprint (stable across sessions, no cookies needed) ──
  function fp(){
    try{
      var c=document.createElement('canvas'),x=c.getContext('2d');
      c.width=200;c.height=50;
      x.textBaseline='top';
      x.font='14px Arial';
      x.fillText('KO-fp-v1',2,2);
      var d=c.toDataURL();
      var s=screen.width+'x'+screen.height+':'+screen.colorDepth;
      var t=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
      var l=navigator.language||'';
      var p=navigator.platform||'';
      var raw=d+s+t+l+p;
      var h=0;
      for(var i=0;i<raw.length;i++){h=((h<<5)-h)+raw.charCodeAt(i);h|=0;}
      return 'ko_'+(h>>>0).toString(36);
    }catch(e){
      // Fallback to localStorage if canvas blocked
      var vid=localStorage.getItem('ko_vid');
      if(!vid){vid='v_'+Math.random().toString(36).substr(2,12)+Date.now().toString(36);localStorage.setItem('ko_vid',vid);}
      return vid;
    }
  }

  var FP=fp();
  var SID='s_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
  var startTime=Date.now();
  var maxScroll=0;
  var sentPageview=false;

  // UTM params
  var params=new URLSearchParams(location.search);
  var U={
    source:params.get('utm_source')||'',
    medium:params.get('utm_medium')||'',
    campaign:params.get('utm_campaign')||'',
    term:params.get('utm_term')||'',
    content:params.get('utm_content')||''
  };

  // Device type
  function devType(){
    var w=window.innerWidth;
    if(w<768)return'mobile';
    if(w<1024)return'tablet';
    return'desktop';
  }

  // ── Send to track-visitor (primary) ──
  function send(type,data){
    var body={
      site_id:SITE_ID,
      fingerprint:FP,
      session_id:SID,
      event_type:type,
      page_url:location.href,
      page_title:document.title,
      page_path:location.pathname,
      referrer:document.referrer||'',
      utm_source:U.source,
      utm_medium:U.medium,
      utm_campaign:U.campaign,
      event_data:data||{},
      device_type:devType(),
      browser:navigator.userAgent,
      screen_resolution:screen.width+'x'+screen.height,
      language:navigator.language||'',
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||''
    };
    try{navigator.sendBeacon(TV,JSON.stringify(body));}
    catch(e){fetch(TV,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},keepalive:true}).catch(function(){});}
  }

  // ── Send to legacy site_analytics (backward compat) ──
  function sendLegacy(evt){
    try{navigator.sendBeacon(LEGACY,JSON.stringify(evt));}
    catch(e){fetch(LEGACY,{method:'POST',body:JSON.stringify(evt),headers:{'Content-Type':'application/json'},keepalive:true}).catch(function(){});}
  }

  // ── Pageview ──
  if(!sentPageview){
    send('pageview',{});
    sendLegacy({
      event_type:'pageview',
      page_path:location.pathname,
      page_title:document.title,
      referrer:document.referrer||null,
      utm_source:U.source||null,
      utm_medium:U.medium||null,
      utm_campaign:U.campaign||null,
      session_id:SID,
      visitor_id:FP,
      screen_width:screen.width
    });
    sentPageview=true;
  }

  // ── Click tracking (CTA detection) ──
  document.addEventListener('click',function(e){
    var el=e.target.closest('a,button,[data-track],[onclick]');
    if(!el)return;
    var tag=el.tagName.toLowerCase();
    var text=(el.innerText||'').trim().substring(0,100);
    var href=el.getAttribute('href')||'';
    var id=el.id||'';
    var cls=el.className||'';
    var isCta=false;
    if(href.match(/\/(book|apply|assess|audit|blueprint|roundtable|speed-to-value|command-center|pricing)/)||
       href.match(/calendly|stripe|checkout/i)||
       text.match(/book|apply|start|get started|schedule|contact|buy|purchase|enroll|join|sign up|register/i))isCta=true;
    send(isCta?'cta_click':'click',{element:tag,text:text,href:href,id:id,class:cls});
    sendLegacy({
      event_type:'click',
      page_path:location.pathname,
      click_target:(text+'|'+href).substring(0,200),
      session_id:SID,
      visitor_id:FP
    });
  },true);

  // ── Scroll depth ──
  var scrollTimer;
  window.addEventListener('scroll',function(){
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(function(){
      var h=document.documentElement.scrollHeight-window.innerHeight;
      var pct=h>0?Math.round((window.scrollY/h)*100):0;
      if(pct>maxScroll){
        maxScroll=pct;
        if(pct%25===0&&pct>0)send('scroll',{depth_pct:pct});
      }
    },300);
  });

  // ── Form field capture (identity extraction for auto-lead) ──
  document.addEventListener('change',function(e){
    var el=e.target;
    if(!el||!el.tagName)return;
    var tag=el.tagName.toLowerCase();
    if(tag!=='input'&&tag!=='textarea'&&tag!=='select')return;
    var type=(el.getAttribute('type')||'text').toLowerCase();
    if(type==='password'||type==='hidden'||type==='file')return;
    var name=el.getAttribute('name')||el.getAttribute('id')||el.getAttribute('placeholder')||'';
    var val=el.value||'';
    // Don't capture credit card or SSN patterns
    if(val.match(/^\d{13,19}$/)||val.match(/^\d{3}-\d{2}-\d{4}$/))return;
    send('form_input',{field_name:name,field_value:val,field_type:type,form_id:(el.form&&el.form.id)||''});
  },true);

  // ── Form submit ──
  document.addEventListener('submit',function(e){
    var form=e.target;
    if(!form||form.tagName!=='FORM')return;
    var data={};
    var inputs=form.querySelectorAll('input,textarea,select');
    inputs.forEach(function(el){
      var type=(el.getAttribute('type')||'text').toLowerCase();
      if(type==='password'||type==='hidden'||type==='file')return;
      var name=el.getAttribute('name')||el.getAttribute('id')||'';
      if(name)data[name]=el.value||'';
    });
    send('form_submit',{form_id:form.id||'',form_action:form.action||'',fields:data});
  },true);

  // ── Time on page + scroll depth on exit ──
  function sendExit(){
    var secs=Math.round((Date.now()-startTime)/1000);
    if(secs<1)return;
    send('time_on_page',{seconds:secs,max_scroll_pct:maxScroll});
    sendLegacy({
      event_type:'session_end',
      page_path:location.pathname,
      duration_seconds:secs,
      session_id:SID,
      visitor_id:FP
    });
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')sendExit();});
  window.addEventListener('pagehide',sendExit);

  // ── SPA navigation support ──
  var origPush=history.pushState;
  history.pushState=function(){
    origPush.apply(this,arguments);
    sentPageview=false;
    startTime=Date.now();
    maxScroll=0;
    setTimeout(function(){send('pageview',{});sentPageview=true;},100);
  };
})();
