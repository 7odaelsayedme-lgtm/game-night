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
    id: 'snakes',
    status: 'ready',
    category: 'classic',
    minPlayers: 2,
    maxPlayers: 4,
    spectators: true,
    minutes: '5–10',
    name: { ar: 'السلم والثعبان', en: 'Snakes & Ladders' },
    desc: {
      ar: 'ارمِ النرد، اصعد السلالم وتجنّب الثعابين، وأول من يصل المربع 100 يفوز.',
      en: 'Roll, climb ladders, dodge snakes. First to square 100 wins.',
    },
    rules: {
      ar: [
        'من 2 إلى 4 لاعبين، وإذا كنتم أكثر يتفرج الباقون.',
        'في دورك اضغط «ارمِ النرد» وتتحرك قطعتك بعدد النقاط.',
        'إذا وقفت على أسفل سُلّم تصعد لأعلاه، وإذا وقفت على رأس ثعبان تنزل لذيله.',
        'الرقم 6 يعطيك رمية إضافية، بحد أقصى ثلاث ستات متتالية.',
        'يجب الوصول إلى 100 بالضبط؛ الزيادة ترتد للخلف (مثلًا من 99 برمية 2: خطوة إلى 100 ثم ترجع خطوة إلى 99).',
        'الفائز يأخذ نقطة، وفي الجولة التالية يبدأ اللاعب الذي بعده.',
      ],
      en: [
        '2 to 4 players; anyone else watches.',
        'On your turn tap “Roll” and move that many squares.',
        'Land on the foot of a ladder to climb it; land on a snake’s head to slide down.',
        'A 6 gives you another roll, up to three sixes in a row.',
        'You must land on 100 exactly; extra steps bounce back.',
        'The winner gets a point; next round the next player starts.',
      ],
    },
  },
  {
    id: 'spy',
    status: 'ready',
    category: 'social',
    minPlayers: 3,
    maxPlayers: 8,
    minutes: '5–8',
    name: { ar: 'مين الجاسوس؟', en: 'Find the Spy' },
    desc: {
      ar: 'كلكم تعرفون المكان إلا واحد. اسألوا بعض واكشفوه قبل أن يعرف المكان.',
      en: 'Everyone knows the place except one. Ask questions and catch the spy.',
    },
    rules: {
      ar: [
        'كل اللاعبين يرون نفس المكان السري، إلا واحدًا هو الجاسوس ولا يعرف المكان.',
        'بالدور: اختر لاعبًا واكتب له سؤالًا عن المكان، وهو يجيب ثم يسأل غيره.',
        'اسأل بذكاء: سؤال واضح جدًا يكشف المكان للجاسوس، وسؤال غامض جدًا يجعلك مشبوهًا.',
        'بعد انتهاء الأسئلة، أو إذا طلب أكثر من نصفكم التصويت، يصوّت الجميع على المشتبه به.',
        'إذا اتهمتم الجاسوس، تبقى له فرصة أخيرة لتخمين المكان من القائمة.',
        'الجاسوس يستطيع في أي وقت أن يخمّن المكان؛ إن أصاب فاز، وإن أخطأ خسر.',
        'فوز الجاسوس = نقطتان له. فوز البقية = نقطة لكل واحد.',
        'إذا كان المكان غير مناسب، يمكن تغييره مرتين قبل بدء الأسئلة.',
      ],
      en: [
        'Everyone sees the same secret place, except the spy who does not.',
        'Take turns: pick a player and type a question about the place; they answer, then ask someone else.',
        'Too obvious and the spy learns the place; too vague and you look suspicious.',
        'After the questions, or when more than half ask for it, everyone votes.',
        'If you catch the spy, they get one last guess at the place.',
        'The spy may guess the place at any time: right wins, wrong loses.',
        'Spy win = 2 points for the spy. Group win = 1 point each.',
        'If the place is unsuitable, it can be changed twice before questions start.',
      ],
    },
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
