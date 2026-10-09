// سجل الألعاب الجاهزة على الخادم. لإضافة لعبة جديدة: أنشئ ملفها هنا وأضفها للقائمة،
// وغيّر حالتها في shared/catalog.js إلى 'ready'.
import tictactoe from './tictactoe.js';
import snakes from './snakes.js';
import spy from './spy.js';
import connect4 from './connect4.js';
import majority from './majority.js';

export const GAME_MODULES = {
  [tictactoe.id]: tictactoe,
  [snakes.id]: snakes,
  [spy.id]: spy,
  [connect4.id]: connect4,
  [majority.id]: majority,
};
