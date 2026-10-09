// قائمة الألعاب المشتركة بين الخادم والواجهة.
// status: 'ready' = قابلة للعب الآن، 'soon' = قريبًا (تظهر للعرض فقط ولا يمكن تشغيلها).

export const CATEGORIES = {
  classic: { ar: 'كلاسيكية', en: 'Classic' },
  social: { ar: 'جماعية', en: 'Social' },
  quick: { ar: 'سريعة', en: 'Quick' },
  party: { ar: 'رسم وكلمات', en: 'Draw & words' },
};

export const GAMES = [
  {
    id: 'tictactoe',
    status: 'ready',
    category: 'classic',
    minPlayers: 2,
    maxPlayers: 2,
    spectators: true,
    minutes: '1–2',
    name: { ar: 'إكس أو', en: 'Tic-Tac-Toe' },
    desc: {
      ar: 'ثلاث علامات في صف واحد وتكسب. إذا كنتم أكثر من اثنين، الفائز يبقى والباقون يتناوبون.',
      en: 'Three in a row wins. More than two of you? Winner stays, the rest take turns.',
    },
    rules: {
      ar: [
        'لاعبان: واحد يلعب X والآخر O، ويبدأ X دائمًا.',
        'المس أي مربع فارغ في دورك فقط.',
        'أول من يكوّن ثلاث علامات في صف أو عمود أو قُطر يفوز بنقطة.',
        'إذا امتلأت اللوحة بلا فائز فهي تعادل.',
        'في الجولة التالية يبدأ الخاسر، وإذا كان هناك منتظرون يدخل أولهم مكان الخاسر.',
      ],
      en: [
        'Two players: one is X, the other is O. X always starts.',
        'Tap any empty square, only on your turn.',
        'First to get three in a row, column or diagonal wins a point.',
        'A full board with no winner is a draw.',
        'Next round the loser starts; if others are waiting, the next in line replaces the loser.',
      ],
    },
  },
  {
    id: 'snakes', status: 'soon', category: 'classic', minPlayers: 2, maxPlayers: 4, minutes: '5–10',
    name: { ar: 'السلم والثعبان', en: 'Snakes & Ladders' },
    desc: { ar: 'ارمِ النرد، اصعد السلالم وتجنّب الثعابين حتى المربع 100.', en: 'Roll, climb ladders, dodge snakes, reach 100.' },
  },
  {
    id: 'spy', status: 'soon', category: 'social', minPlayers: 3, maxPlayers: 8, minutes: '5–8',
    name: { ar: 'مين الجاسوس؟', en: 'Find the Spy' },
    desc: { ar: 'كلكم تعرفون المكان إلا واحد. اسألوا واكشفوه قبل أن يكشفكم.', en: 'Everyone knows the place except one. Find the spy.' },
  },
  {
    id: 'connect4', status: 'soon', category: 'classic', minPlayers: 2, maxPlayers: 2, minutes: '3–5',
    name: { ar: 'أربعة في صف', en: 'Connect Four' },
    desc: { ar: 'أسقط أقراصك وكوّن أربعة متتالية قبل خصمك.', en: 'Drop discs and connect four first.' },
  },
  {
    id: 'majority', status: 'soon', category: 'social', minPlayers: 3, maxPlayers: 8, minutes: '3–5',
    name: { ar: 'رأي الأغلبية', en: 'Guess the Majority' },
    desc: { ar: 'سؤال بخيارين: اختر ما سيختاره أكثركم، لا ما تفضّله أنت.', en: 'Pick what most of the group will pick.' },
  },
  {
    id: 'reaction', status: 'soon', category: 'quick', minPlayers: 2, maxPlayers: 8, minutes: '1–2',
    name: { ar: 'أسرع ردّة فعل', en: 'Reaction Challenge' },
    desc: { ar: 'انتظر الإشارة الخضراء ثم المس الشاشة أسرع من الجميع.', en: 'Wait for green, then tap faster than everyone.' },
  },
  {
    id: 'bluff', status: 'soon', category: 'party', minPlayers: 3, maxPlayers: 8, minutes: '5–8',
    name: { ar: 'صادق ولا كذّاب؟', en: 'Truth or Bluff' },
    desc: { ar: 'اكتب جوابًا مزيفًا مقنعًا وخمّن الجواب الصحيح بين أكاذيب أصحابك.', en: 'Write a convincing fake answer and spot the real one.' },
  },
  {
    id: 'draw', status: 'soon', category: 'party', minPlayers: 3, maxPlayers: 8, minutes: '5–10',
    name: { ar: 'ارسم وخمّن', en: 'Draw & Guess' },
    desc: { ar: 'واحد يرسم والباقون يخمّنون الكلمة قبل انتهاء الوقت.', en: 'One draws, everyone else guesses.' },
  },
];

export const getGameMeta = (id) => GAMES.find((g) => g.id === id) || null;
