/* =====================================================================
   Lil' Sass — Build Preview Engine
   Drives 3 structures x 3 styles x {mobile, desktop} + 3 dashboards
   from config. Shared by the private preview page and the public vote page.
   ===================================================================== */
(function (global) {
'use strict';

/* ---------------------------------------------------------------
   STYLES — genuinely different moods, not recolours
   --------------------------------------------------------------- */
const STYLES = {
  '1': {
    code: '1', name: 'Storybook Sky', tagline: 'Bright, open, hopeful',
    blurb: 'Soft daylight blues, drifting clouds, generous rounded shapes. Closest to the books you already have on the shelf.',
    bestFor: 'Feels like Lil’ Sass already does. The safest, most on-brand choice.',
    swatch: ['#EAF4FE', '#E8442A', '#5B3FA8'],
    vars: {
      '--bg': 'linear-gradient(180deg,#F4FAFF 0%,#E4F1FD 46%,#EFF7FF 100%)',
      '--screen': 'linear-gradient(180deg,#EAF6FF 0%,#D8ECFD 100%)',
      '--ink': '#28304A', '--ink-soft': '#5A648A', '--card': '#FFFFFF',
      '--accent': '#E8442A', '--accent-2': '#F26430', '--support': '#5B3FA8',
      '--support-soft': '#EDE7FA', '--line': '#E5EDF8', '--chip': '#FFFFFF',
      '--radius': '18px', '--radius-lg': '32px', '--bubble': '#FFFFFF',
      '--shadow': '0 6px 18px rgba(40,48,74,.10)',
      '--font': "'Nunito','Baloo 2','Segoe UI',system-ui,sans-serif",
      '--tab': 'rgba(255,255,255,.94)', '--onaccent': '#FFFFFF'
    },
    atmosphere: 'clouds'
  },
  '2': {
    code: '2', name: 'Venice Beach Rink', tagline: 'Sunset, motion, energy',
    blurb: 'Boardwalk sunset palette, badge and sticker motifs, a little skate-culture movement in the layout.',
    bestFor: 'Reads a bit older and more energetic. Strongest for 8–12s and for sharing.',
    swatch: ['#FFF3E8', '#FF6B35', '#00A6A6'],
    vars: {
      '--bg': 'linear-gradient(180deg,#FFF6EC 0%,#FFE8D6 50%,#FFF1E4 100%)',
      '--screen': 'linear-gradient(180deg,#FFF0E0 0%,#FFD9BC 100%)',
      '--ink': '#3A2318', '--ink-soft': '#8A6A55', '--card': '#FFFDFB',
      '--accent': '#FF6B35', '--accent-2': '#FF9142', '--support': '#00A6A6',
      '--support-soft': '#DDF5F4', '--line': '#F4DFCC', '--chip': '#FFFDFB',
      '--radius': '14px', '--radius-lg': '26px', '--bubble': '#FFFDFB',
      '--shadow': '0 6px 18px rgba(120,70,40,.14)',
      '--font': "'Nunito','Baloo 2','Segoe UI',system-ui,sans-serif",
      '--tab': 'rgba(255,253,251,.96)', '--onaccent': '#FFFFFF'
    },
    atmosphere: 'sun'
  },
  '3': {
    code: '3', name: 'Cozy Bedtime', tagline: 'Calm, safe, close',
    blurb: 'Deep dusk indigo and plum with warm lamplight, soft stars and cream cards. Quiet rather than busy.',
    bestFor: 'The gentlest fit for hard feelings, and the most natural for reading with a grown-up at night.',
    swatch: ['#1B1734', '#FFB55C', '#8B6BD9'],
    vars: {
      '--bg': 'linear-gradient(180deg,#191531 0%,#241D45 55%,#1B1734 100%)',
      '--screen': 'linear-gradient(180deg,#2A2250 0%,#1E1940 100%)',
      '--ink': '#F4EFFF', '--ink-soft': '#B6ABD6', '--card': '#332A5E',
      '--accent': '#FFB55C', '--accent-2': '#FFC97E', '--support': '#8B6BD9',
      '--support-soft': '#3D3370', '--line': '#443A78', '--chip': '#3D3370',
      '--radius': '20px', '--radius-lg': '34px', '--bubble': '#3D3370',
      '--shadow': '0 8px 24px rgba(0,0,0,.35)',
      '--font': "'Nunito','Baloo 2','Segoe UI',system-ui,sans-serif",
      '--tab': 'rgba(42,34,80,.96)', '--onaccent': '#2A2250'
    },
    atmosphere: 'stars'
  }
};

/* ---------------------------------------------------------------
   STRUCTURES
   --------------------------------------------------------------- */
const STRUCTURES = {
  A: {
    code: 'A', name: 'The Guided Journey', tagline: 'One path, start to finish',
    blurb: 'Lil’ Sass walks every child down the same warm path: arrive at the rink, share who you are, talk about the feeling, meet Mrs. Moo, choose your cape, watch your book get written, keep it forever.',
    bestFor: 'Fastest to launch and the least to explain. Best for the youngest readers with a grown-up alongside.',
    tradeoff: 'Every child gets the same experience. Less room for older kids or boys to feel it was made for them.',
    phase: 'Ships in Phase 1',
    screens: ['welcome','identity','chat','mooIntro','cape','generating','book','delivered']
  },
  B: {
    code: 'B', name: 'Choose Your Guide', tagline: 'Every child picks their buddy',
    blurb: 'The child chooses who co-creates with them — Lil’ Sass, Lil’ Artie, Mrs. Moo or Mr. OG — and each guide has their own voice. Sass still makes the introduction to Mrs. Moo, so she stays the through-line in every story.',
    bestFor: 'Widens the audience well beyond young girls. This is the structure you asked for on our call.',
    tradeoff: 'A little more to build and four voices to write, but it is the same engine underneath.',
    phase: 'Ships in Phase 1',
    screens: ['welcome','identity','guide','chat','mooIntro','cape','generating','book','delivered']
  },
  C: {
    code: 'C', name: 'The Family Rink', tagline: 'One grown-up, many children',
    blurb: 'A parent, teacher or practitioner holds the account and each child has their own profile, shelf, cape and emotional history. Grown-ups can start a session together and revisit any child’s journey.',
    bestFor: 'Unlocks schools and practitioners, and supports the parent-and-child-together moment you described.',
    tradeoff: 'The biggest build of the three. Best introduced once the core journey is proven.',
    phase: 'Phase 1 core + Phase 2 classrooms',
    screens: ['grownup','profiles','childHome','chat','mooIntro','cape','generating','book','shelf']
  }
};

const GUIDES = [
  { id:'sass',  name:'Lil’ Sass',  role:'The brave one',   line:'Big feelings deserve big adventures.',        tone:'playful, bold' },
  { id:'artie', name:'Lil’ Artie', role:'The quiet one',   line:'Sometimes it helps to say it out loud.',      tone:'gentle, thoughtful' },
  { id:'moo',   name:'Mrs. Moo',   role:'The healer',      line:'It’s your birthright to feel.',               tone:'warm, grandmotherly' },
  { id:'og',    name:'Mr. OG',     role:'The mentor',      line:'You don’t get rid of it. You give it somewhere to go.', tone:'wise, steady' }
];

const CAPES = [
  { k:'red',    hex:'#E8442A', label:'Red' },
  { k:'purple', hex:'#5B3FA8', label:'Purple' },
  { k:'teal',   hex:'#0FA3A3', label:'Teal' },
  { k:'gold',   hex:'#F5B301', label:'Gold' },
  { k:'pink',   hex:'#E64A8D', label:'Pink' }
];

/* Conversation script — shared, guide name swapped in */
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
   DASHBOARDS (private to Christie)
   --------------------------------------------------------------- */
const DASHBOARDS = {
  A: {
    code:'A', name:'Creator Command', tagline:'Simple and clear',
    blurb:'Everything on one screen, nothing to learn. Pairs with The Guided Journey.',
    nav:['Overview','Readers','Books','Settings'],
    kpis:[
      {n:'312',   l:'Total users',      d:'▲ 48 this month'},
      {n:'$1,247',l:'Monthly recurring',d:'▲ $221 this month'},
      {n:'96',    l:'Story Club members'},
      {n:'486',   l:'Books created'},
      {n:'41',    l:'Copies ordered'},
      {n:'Anger', l:'Top emotion'}
    ],
    panels:['recent','flags','affiliate']
  },
  B: {
    code:'B', name:'Story Intelligence', tagline:'Insight, not just numbers',
    blurb:'Shows which guide actually drives retention, how emotions trend, and what each book costs you. Pairs with Choose Your Guide.',
    nav:['Overview','Guides','Emotions','Readers','Settings'],
    kpis:[
      {n:'312',   l:'Total users',      d:'▲ 48 this month'},
      {n:'$1,247',l:'Monthly recurring',d:'▲ $221 this month'},
      {n:'$0.92', l:'AI cost / book',   d:'▼ $0.11 vs last mo'},
      {n:'93%',   l:'Gross margin'},
      {n:'96',    l:'Story Club members'},
      {n:'5.1%',  l:'Monthly churn'}
    ],
    panels:['guides','emotions','signals','flags']
  },
  C: {
    code:'C', name:'Community & Classrooms', tagline:'Built for seats and schools',
    blurb:'Licences, rosters, educators and families. Runs the school and practitioner tier. Pairs with The Family Rink.',
    nav:['Overview','Classrooms','Families','Seats','Settings'],
    kpis:[
      {n:'312',  l:'Total users',   d:'▲ 48 this month'},
      {n:'$3,890',l:'Monthly recurring',d:'▲ $612 this month'},
      {n:'14',   l:'Classrooms',    d:'▲ 3 this month'},
      {n:'418',  l:'Seats in use'},
      {n:'2',    l:'Renewals due',  d:'next 30 days'},
      {n:'Grief',l:'Top emotion'}
    ],
    panels:['classrooms','seats','flags']
  }
};

/* ---------------------------------------------------------------
   PRICING — recommendation, revenue-maximising
   --------------------------------------------------------------- */
const PRICING = {
  recommended: 'ladder',
  costPerBook: 0.92,
  models: [
    {
      id:'ladder', name:'The Story Club Ladder', badge:'Recommended',
      pitch:'First book free, then three tiers. Recurring revenue, natural ascension, and it can ship in Phase 1 with nothing but Stripe.',
      why:'Highest lifetime value of the four. The free book creates emotional investment before any ask, and the tiers let a family self-select instead of being sold.',
      tiers:[
        {name:'First Adventure', price:0,     unit:'free',  detail:'One complete personalised book. No card.', margin:'−$0.92 (acquisition cost)'},
        {name:'Story Club',      price:12.99, unit:'/mo',   detail:'2 new adventures a month + full library', margin:'$10.47 net after AI + Stripe'},
        {name:'Story Club Plus', price:17.99, unit:'/mo',   detail:'5 adventures + share a story with a friend', margin:'$12.87 net'},
        {name:'Unlimited',       price:24.99, unit:'/mo',   detail:'Unlimited adventures + gift books', margin:'$16.66 net at 8 books'}
      ],
      note:'Annual at $99 (Story Club) captures the gift-giver and cuts churn.'
    },
    {
      id:'packs', name:'Adventure Packs', badge:null,
      pitch:'No subscription. Buy books in bundles: 1 for $9.99, 3 for $24.99, 10 for $69.99.',
      why:'Lower resistance for people allergic to subscriptions, and grandparents buy packs as gifts. But revenue is lumpy and lifetime value is roughly a third of the ladder.',
      tiers:[
        {name:'Single book',  price:9.99,  unit:'once', detail:'One personalised adventure', margin:'$8.78 net'},
        {name:'3-pack',       price:24.99, unit:'once', detail:'Three adventures',           margin:'$21.48 net'},
        {name:'10-pack',      price:69.99, unit:'once', detail:'Ten adventures, best value', margin:'$58.55 net'}
      ],
      note:'Best used as a fallback offer at cancellation, not as the primary model.'
    },
    {
      id:'hybrid', name:'Free Book, Then Choose', badge:'Highest conversion',
      pitch:'Free first book, then the family picks: subscribe, or buy a pack. Both offers on one screen.',
      why:'Converts the widest slice of people because nobody is forced into a commitment. Slightly more to build and it softens subscription take-up, so total revenue lands just under the pure ladder.',
      tiers:[
        {name:'First Adventure', price:0,     unit:'free', detail:'One complete book, no card', margin:'−$0.92'},
        {name:'Story Club',      price:12.99, unit:'/mo',  detail:'Recurring, best value',      margin:'$10.47 net'},
        {name:'Or a 3-pack',     price:24.99, unit:'once', detail:'No commitment',              margin:'$21.48 net'}
      ],
      note:'Recommended as a month-3 test against the pure ladder, not at launch.'
    },
    {
      id:'seats', name:'Classrooms & Practitioners', badge:'Highest per-relationship',
      pitch:'$349/yr per classroom (up to 30 children) and $29/mo for therapists and counsellors.',
      why:'Most revenue per relationship and the lowest support load. Needs Structure C and a small admin layer, so it is a Phase 2 unlock — but it is the tier that turns this into an institution.',
      tiers:[
        {name:'Classroom',    price:349, unit:'/yr',  detail:'Up to 30 children, teacher dashboard', margin:'$310 net'},
        {name:'Practitioner', price:29,  unit:'/mo',  detail:'Therapists, counsellors, coaches',     margin:'$24 net'},
        {name:'School',       price:1490,unit:'/yr',  detail:'Up to 6 classrooms',                   margin:'$1,340 net'}
      ],
      note:'Do not price this publicly at launch. Sell the first five by conversation, then publish.'
    }
  ]
};

global.LILSASS = { STYLES, STRUCTURES, GUIDES, CAPES, SCRIPT, PAGES, DASHBOARDS, PRICING };

})(window);
