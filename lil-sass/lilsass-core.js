/* =====================================================================
   Lil' Sass — Build Preview config
   ONE build (adult account + child profiles + choose-your-guide).
   Christie's only real choice is the DESIGN DIRECTION.
   ===================================================================== */
(function (global) {
'use strict';

/* ---------------------------------------------------------------
   THE BUILD — decided, not a menu.
   --------------------------------------------------------------- */
const BUILD = {
  name: 'The Lil’ Sass Platform',
  summary: 'A grown-up holds the account. Each child has their own profile, own shelf and own cape. ' +
           'Every child picks who they create with — Lil’ Sass, Lil’ Artie, Mrs. Moo or Mr. OG — and ' +
           'Sass always makes the introduction to Mrs. Moo, so she stays the through-line in every story.',
  why: [
    ['Reaches every child, not just young girls',
     'Four guides with their own voices means boys, older kids and quieter kids all have someone who feels like theirs.'],
    ['Families and classrooms work from day one',
     'One grown-up with several children is the same shape a teacher needs. It unlocks family plans and the school tier without a rebuild.'],
    ['It is the only version that is legally correct anyway',
     'An adult-held account with child profiles underneath is required for kids-privacy rules and Apple’s Kids Category. Building it any other way means redoing it later.']
  ],
  screens: ['grownup','profiles','childHome','guide','chat','mooIntro','cape','generating','book','delivered']
};

/* ---------------------------------------------------------------
   DESIGN DIRECTIONS — layout + palette + type together.
   One choice, three complete directions.
   --------------------------------------------------------------- */
const DIRECTIONS = {
  picture: {
    code:'picture', name:'Picture Book', tagline:'The art does the talking',
    blurb:'Illustration fills the screen, words stay few, and every button is big enough for small hands. ' +
          'The closest thing to holding one of your books.',
    bestFor:'Ages 5–8, pre-readers, and a grown-up reading alongside.',
    layoutNote:'Full-bleed art · very large tap targets · minimal text',
    swatch:['#EAF4FE','#E8442A','#5B3FA8'],
    atmosphere:'clouds',
    vars:{
      '--bg':'linear-gradient(180deg,#F4FAFF 0%,#E4F1FD 46%,#EFF7FF 100%)',
      '--screen':'linear-gradient(180deg,#EAF6FF 0%,#D8ECFD 100%)',
      '--ink':'#28304A','--ink-soft':'#5A648A','--card':'#FFFFFF',
      '--accent':'#E8442A','--accent-2':'#F26430','--support':'#5B3FA8',
      '--support-soft':'#EDE7FA','--line':'#E5EDF8','--chip':'#FFFFFF',
      '--radius':'22px','--radius-lg':'34px','--bubble':'#FFFFFF',
      '--shadow':'0 6px 18px rgba(40,48,74,.10)',
      '--tab':'rgba(255,255,255,.94)','--onaccent':'#FFFFFF',
      '--artscale':'1.22','--btnpad':'17px','--basefont':'14px','--h1':'22px'
    }
  },
  deck: {
    code:'deck', name:'Adventure Deck', tagline:'Collect, unlock, come back',
    blurb:'Everything sits on cards you can flick through, with badges for the emotions you have befriended ' +
          'and a shelf that visibly fills up. More energy, more reason to return.',
    bestFor:'Ages 8–12 using it on their own, and the strongest for sharing.',
    layoutNote:'Card decks · badges and streaks · sunset palette',
    swatch:['#FFF3E8','#FF6B35','#00A6A6'],
    atmosphere:'sun',
    vars:{
      '--bg':'linear-gradient(180deg,#FFF6EC 0%,#FFE8D6 50%,#FFF1E4 100%)',
      '--screen':'linear-gradient(180deg,#FFF0E0 0%,#FFD9BC 100%)',
      '--ink':'#3A2318','--ink-soft':'#8A6A55','--card':'#FFFDFB',
      '--accent':'#FF6B35','--accent-2':'#FF9142','--support':'#00A6A6',
      '--support-soft':'#DDF5F4','--line':'#F4DFCC','--chip':'#FFFDFB',
      '--radius':'14px','--radius-lg':'22px','--bubble':'#FFFDFB',
      '--shadow':'0 6px 18px rgba(120,70,40,.14)',
      '--tab':'rgba(255,253,251,.96)','--onaccent':'#FFFFFF',
      '--artscale':'0.92','--btnpad':'13px','--basefont':'13px','--h1':'19px'
    }
  },
  calm: {
    code:'calm', name:'Bedtime Calm', tagline:'Quiet, close, unhurried',
    blurb:'The conversation leads and the room dims around it. Warm lamplight, soft stars, nothing competing ' +
          'for attention while a child says something hard out loud.',
    bestFor:'The bedtime ritual, heavier emotions, and reading together at the end of the day.',
    layoutNote:'Conversation-forward · dusk palette · low stimulation',
    swatch:['#1B1734','#FFB55C','#8B6BD9'],
    atmosphere:'stars',
    vars:{
      '--bg':'linear-gradient(180deg,#191531 0%,#241D45 55%,#1B1734 100%)',
      '--screen':'linear-gradient(180deg,#2A2250 0%,#1E1940 100%)',
      '--ink':'#F4EFFF','--ink-soft':'#B6ABD6','--card':'#332A5E',
      '--accent':'#FFB55C','--accent-2':'#FFC97E','--support':'#8B6BD9',
      '--support-soft':'#3D3370','--line':'#443A78','--chip':'#3D3370',
      '--radius':'20px','--radius-lg':'30px','--bubble':'#3D3370',
      '--shadow':'0 8px 24px rgba(0,0,0,.35)',
      '--tab':'rgba(42,34,80,.96)','--onaccent':'#2A2250',
      '--artscale':'1.0','--btnpad':'15px','--basefont':'13.5px','--h1':'20px'
    }
  }
};

const GUIDES = [
  { id:'sass',  name:'Lil’ Sass',  role:'The brave one', line:'Big feelings deserve big adventures.' },
  { id:'artie', name:'Lil’ Artie', role:'The quiet one', line:'Sometimes it helps to say it out loud.' },
  { id:'moo',   name:'Mrs. Moo',   role:'The healer',    line:'It’s your birthright to feel.' },
  { id:'og',    name:'Mr. OG',     role:'The mentor',    line:'You don’t get rid of it. You give it somewhere to go.' }
];

const CAPES = [
  { k:'red', hex:'#E8442A', label:'Red' }, { k:'purple', hex:'#5B3FA8', label:'Purple' },
  { k:'teal', hex:'#0FA3A3', label:'Teal' }, { k:'gold', hex:'#F5B301', label:'Gold' },
  { k:'pink', hex:'#E64A8D', label:'Pink' }
];

const SCRIPT = [
  { from:'guide', t:'{NAME}! Okay — what feeling has been the loudest lately?', chips:['Angry','Sad','Lonely'] },
  { from:'me',    t:'Kind of angry. My best friend moved away.' },
  { from:'guide', t:'Oof. That’s a big one. Where do you feel the angry — hot in your chest, or buzzy in your hands?', chips:['Hot in my chest','Buzzy hands','I don’t know'] },
  { from:'me',    t:'Hot in my chest. And I don’t want to talk to anybody.' },
  { from:'guide', t:'Thank you for telling me that. Angry usually shows up when something mattered a whole lot. Your friend mattered.', chips:['Yeah… she did','Tell me more'] },
  { from:'me',    t:'Yeah… she did.' },
  { from:'guide', t:'Then let’s put that in a story where you’re the hero. Ready to meet someone?', chips:['Yes! ✨'], go:'mooIntro' }
];

const PAGES = [
  { txt:'{NAME}’s chest was hot as a summer sidewalk. Her best friend’s house was empty now, and nobody seemed to notice but her.' },
  { txt:'“Whoa there,” said Lil’ Sass, rolling up in a spray of glitter. “That’s a <b>big</b> feeling you’re carrying.”' },
  { txt:'Mrs. Moo knelt down and held out a cape. “Angry shows up when something <b>mattered</b>,” she said. “Your friend mattered.”' },
  { txt:'So {NAME} skated. Fast, then faster, until the hot in her chest turned into wind on her face.' },
  { txt:'Mr. OG smiled from the rail. “You didn’t get rid of it, kid. You gave it somewhere to <b>go</b>.”' },
  { txt:'That night {NAME} whispered it out loud: “I miss her.” And the words felt lighter than they had all week.' }
];

/* ---------------------------------------------------------------
   ONE dashboard, blended. Colour follows the chosen direction.
   --------------------------------------------------------------- */
const DASHBOARD = {
  name: 'Your Creator Dashboard',
  blurb: 'Everything that matters on one screen, and only five things in the sidebar so it never gets heavy.',
  nav: ['Overview','Children','Adventures','Classrooms','Settings'],
  kpis: [
    { n:'312',   l:'Children creating', d:'▲ 48 this month' },
    { n:'$1,247',l:'Monthly recurring', d:'▲ $221 this month' },
    { n:'96',    l:'Story Club families' },
    { n:'486',   l:'Books created' },
    { n:'14',    l:'Classrooms',        d:'▲ 3 this month' },
    { n:'$0.92', l:'AI cost per book',  d:'▼ $0.11' }
  ]
};

/* ---------------------------------------------------------------
   PRICING — rebuilt for the family + classroom build
   --------------------------------------------------------------- */
const PRICING = {
  headline: 'First book free. Families subscribe. Classrooms buy seats.',
  reasoning: 'Every book costs real money to make (about $0.92 in AI), so nothing here is unlimited — each ' +
             'tier includes a generous allowance and extra adventures are a small add-on. That keeps the ' +
             'margin healthy no matter how enthusiastic a family gets. The classroom tier is priced against ' +
             'what it actually costs to serve 30 children for a year, not plucked from the air.',
  costPerBook: 0.92,
  tiers: [
    { name:'First Adventure', price:'Free', unit:'', detail:'One complete personalised book. No card asked for.',
      margin:'Costs ~$0.92 — this is the marketing', hero:true },
    { name:'Story Club', price:'$12.99', unit:'/mo', detail:'One child · 2 adventures a month · full library',
      margin:'$10.70 net after AI + fees' },
    { name:'Family Plan', price:'$24.99', unit:'/mo', detail:'Up to 4 children · 2 adventures each · shared shelf',
      margin:'$16.40 net', hero:true },
    { name:'Extra adventure', price:'$4.99', unit:'each', detail:'Any plan, any time, no commitment',
      margin:'$3.90 net' },
    { name:'Printed keepsake', price:'$34.99', unit:'each', detail:'Hardcover of their own book, shipped',
      margin:'~$18 net · zero inventory' },
    { name:'Classroom monthly', price:'$97', unit:'/mo', detail:'Up to 30 children · 1 adventure each a month · teacher view',
      margin:'$62 net · $1,164/yr if they stay', hero:true },
    { name:'Classroom annual', price:'$899', unit:'/yr', detail:'Same thing paid up front · two months free',
      margin:'$540 net after 360 books' },
    { name:'School', price:'$2,990', unit:'/yr', detail:'Up to 6 classrooms · 180 children',
      margin:'$1,800 net' },
    { name:'Practitioner', price:'$39', unit:'/mo', detail:'Therapists and counsellors · up to 15 active children',
      margin:'$27 net' }
  ],
  affiliate: {
    rate: '30% for 12 months, then 10% for as long as they stay',
    why: 'Market standard for a consumer app is 20–30% for the first year, and the few programs that pay ' +
         'lifetime drop to 10–20%. This is generous enough to attract real partners, keeps rewarding them ' +
         'for retention, and stops permanently giving away a third of your best customers. Printed books excluded.'
  },
  notes: [
    'The Family Plan is the one to push: 92% more revenue than a single child, for about $5 more cost to serve.',
    'Nothing is sold as "unlimited". At $0.92 a book, an unlimited tier would earn LESS per family than the tier below it.',
    'Do not publish classroom pricing at launch. Sell the first five by conversation, then put it on the site.',
    'Annual options ($249 family, $129 single) capture the gift-giver and cut churn.',
    'Offer classrooms $97/mo as the default and $899/yr as the discount. Most teachers cannot get a lump ' +
      'sum past a school budget, but $97 still sits under the usual discretionary limit — and a classroom ' +
      'that stays all year on monthly pays $1,164 instead of $899. Monthly is easier to sell AND worth 29% ' +
      'more; the annual price is what you offer when they ask for a deal. $97 also makes the annual look ' +
      'like a much stronger deal (over three months free instead of two).'
  ]
};

global.LILSASS = { BUILD, DIRECTIONS, GUIDES, CAPES, SCRIPT, PAGES, DASHBOARD, PRICING };
})(window);
