// سجل الألعاب الجاهزة على الخادم. لإضافة لعبة جديدة: أنشئ ملفها هنا وأضفها للقائمة،
// وغيّر حالتها في shared/catalog.js إلى 'ready'.
import tictactoe from './tictactoe.js';

export const GAME_MODULES = {
  [tictactoe.id]: tictactoe,
};
