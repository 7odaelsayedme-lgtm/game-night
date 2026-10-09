// سجل الألعاب الجاهزة على الخادم. لإضافة لعبة جديدة: أنشئ ملفها هنا وأضفها للقائمة،
// وغيّر حالتها في shared/catalog.js إلى 'ready'.
import tictactoe from './tictactoe.js';
import snakes from './snakes.js';
import spy from './spy.js';
import connect4 from './connect4.js';
import majority from './majority.js';
import colors from './colors.js';
import shayeb from './shayeb.js';
import aqar from './aqar.js';

export const GAME_MODULES = Object.fromEntries(
  [tictactoe, snakes, spy, connect4, majority, colors, shayeb, aqar].map((m) => [m.id, m]),
);
