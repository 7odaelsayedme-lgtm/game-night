// لوحة لعبة «ملك العقار» وبطاقاتها — مشتركة بين الخادم والواجهة.
// rent: [بدون بيوت، 1 بيت، 2، 3، 4، برج]
export const GROUP_COLORS = {
  brown: '#9A6B4F', sky: '#5BC0EB', pink: '#E86FB4', orange: '#F08A3C', red: '#E0474C', blue: '#4F6BF7',
};

export const BOARD = [
  { t: 'start', n: ['البداية', 'Start'] },
  { t: 'prop', g: 'brown', n: ['تبوك', 'Tabuk'], price: 60, house: 50, rent: [2, 10, 30, 90, 160, 250] },
  { t: 'chest', n: ['صندوق المفاجآت', 'Surprise box'] },
  { t: 'prop', g: 'brown', n: ['حائل', 'Hail'], price: 60, house: 50, rent: [4, 20, 60, 180, 320, 450] },
  { t: 'tax', n: ['ضريبة', 'Tax'], amount: 100 },
  { t: 'station', n: ['قطار الشمال', 'North train'], price: 200 },
  { t: 'jail', n: ['السجن', 'Jail'] },
  { t: 'prop', g: 'sky', n: ['جازان', 'Jazan'], price: 100, house: 50, rent: [6, 30, 90, 270, 400, 550] },
  { t: 'chance', n: ['حظ', 'Chance'] },
  { t: 'prop', g: 'sky', n: ['نجران', 'Najran'], price: 100, house: 50, rent: [6, 30, 90, 270, 400, 550] },
  { t: 'prop', g: 'sky', n: ['الباحة', 'Al Baha'], price: 120, house: 50, rent: [8, 40, 100, 300, 450, 600] },
  { t: 'prop', g: 'pink', n: ['أبها', 'Abha'], price: 140, house: 100, rent: [10, 50, 150, 450, 625, 750] },
  { t: 'parking', n: ['استراحة', 'Rest stop'] },
  { t: 'prop', g: 'pink', n: ['الطائف', 'Taif'], price: 160, house: 100, rent: [12, 60, 180, 500, 700, 900] },
  { t: 'chance', n: ['حظ', 'Chance'] },
  { t: 'prop', g: 'orange', n: ['الأحساء', 'Al Ahsa'], price: 180, house: 100, rent: [14, 70, 200, 550, 750, 950] },
  { t: 'prop', g: 'orange', n: ['القصيم', 'Qassim'], price: 200, house: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { t: 'station', n: ['قطار الجنوب', 'South train'], price: 200 },
  { t: 'gojail', n: ['إلى السجن', 'Go to jail'] },
  { t: 'prop', g: 'red', n: ['الدمام', 'Dammam'], price: 220, house: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { t: 'prop', g: 'red', n: ['الخبر', 'Khobar'], price: 220, house: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { t: 'prop', g: 'red', n: ['جدة', 'Jeddah'], price: 240, house: 150, rent: [20, 100, 300, 750, 925, 1100] },
  { t: 'prop', g: 'blue', n: ['نيوم', 'NEOM'], price: 350, house: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { t: 'prop', g: 'blue', n: ['الرياض', 'Riyadh'], price: 400, house: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
];

export const JAIL = 6;
export const GO_JAIL = 18;
export const START_CASH = 1500;
export const SALARY = 200;
export const JAIL_FINE = 50;
export const STATION_RENT = [50, 100];
export const MAX_HOUSES = 5; // الخامس = برج
export const MAX_ROUNDS = 15;

export const CHANCE = [
  { k: 'move', to: 0, n: ['تقدّم إلى البداية واستلم 200', 'Advance to Start and collect 200'] },
  { k: 'move', to: 23, n: ['اذهب إلى الرياض', 'Go to Riyadh'] },
  { k: 'move', to: 13, n: ['رحلة إلى الطائف', 'Trip to Taif'] },
  { k: 'station', n: ['اذهب إلى أقرب محطة قطار', 'Go to the nearest train station'] },
  { k: 'back', n3: 3, n: ['ارجع 3 خانات', 'Go back 3 squares'] },
  { k: 'jail', n: ['اذهب إلى السجن مباشرة', 'Go directly to jail'] },
  { k: 'gain', amount: 150, n: ['ربحت مسابقة: استلم 150', 'You won a contest: collect 150'] },
  { k: 'pay', amount: 50, n: ['مخالفة سرعة: ادفع 50', 'Speeding ticket: pay 50'] },
  { k: 'repairs', amount: 25, n: ['صيانة عامة: ادفع 25 عن كل بيت', 'Repairs: pay 25 per house'] },
  { k: 'payEach', amount: 25, n: ['عزمت الجميع: ادفع 25 لكل لاعب', 'You treated everyone: pay 25 to each player'] },
];

export const CHEST = [
  { k: 'gain', amount: 200, n: ['خطأ بنكي لصالحك: استلم 200', 'Bank error in your favor: collect 200'] },
  { k: 'gain', amount: 100, n: ['عيدية: استلم 100', 'Eid gift: collect 100'] },
  { k: 'gain', amount: 50, n: ['بعت أغراضًا قديمة: استلم 50', 'You sold old stuff: collect 50'] },
  { k: 'gain', amount: 20, n: ['استرداد رسوم: استلم 20', 'Fee refund: collect 20'] },
  { k: 'pay', amount: 100, n: ['صيانة السيارة: ادفع 100', 'Car service: pay 100'] },
  { k: 'pay', amount: 50, n: ['رسوم مدرسية: ادفع 50', 'School fees: pay 50'] },
  { k: 'collectEach', amount: 10, n: ['يوم ميلادك: كل لاعب يعطيك 10', 'Your birthday: every player gives you 10'] },
  { k: 'move', to: 0, n: ['تقدّم إلى البداية واستلم 200', 'Advance to Start and collect 200'] },
  { k: 'jail', n: ['اذهب إلى السجن مباشرة', 'Go directly to jail'] },
  { k: 'pay', amount: 150, n: ['تجديد رخصة: ادفع 150', 'License renewal: pay 150'] },
];
