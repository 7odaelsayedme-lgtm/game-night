// سجل واجهات الألعاب الجاهزة. كل لعبة جديدة تُضاف هنا بعد إضافتها في الخادم.
import tictactoe from './tictactoe.js';
import snakes from './snakes.js';
import spy from './spy.js';
import connect4 from './connect4.js';
import majority from './majority.js';

export const RENDERERS = { tictactoe, snakes, spy, connect4, majority };
