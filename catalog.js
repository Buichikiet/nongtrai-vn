'use strict';
/* Danh mục dùng chung server + (copy ID sang client) */
const CUTE_TITLES = {
  bunny:     { e: '🐰', n: 'Thỏ Con',     c: '#ff9ec4' },
  peach:     { e: '🍑', n: 'Đào Ngọt',    c: '#ff8a6b' },
  star:      { e: '⭐', n: 'Sao Mai',     c: '#ffd24a' },
  candy:     { e: '🍬', n: 'Kẹo Bông',    c: '#ffb3e0' },
  flower:    { e: '🌸', n: 'Hoa Nhài',    c: '#ffb7d5' },
  moon:      { e: '🌙', n: 'Ánh Trăng',   c: '#c9d7ff' },
  honey:     { e: '🍯', n: 'Mật Ong',     c: '#f0b429' },
  cloud:     { e: '☁️', n: 'Mây Hồng',    c: '#ffd0e8' },
  fairy:     { e: '🧚', n: 'Tiên Tí Hon', c: '#d4b5ff' },
  kitten:    { e: '🐱', n: 'Mèo Bông',    c: '#ffc4a8' },
  sunflower: { e: '🌻', n: 'Hướng Dương', c: '#ffcc33' },
  cupcake:   { e: '🧁', n: 'Bánh Kem',    c: '#ff8fb1' },
  sparkle:   { e: '✨', n: 'Lấp Lánh',    c: '#ffe066' },
  strawberry:{ e: '🍓', n: 'Dâu Tây',     c: '#ff5a7a' },
  angel:     { e: '👼', n: 'Thiên Thần',  c: '#fff4c4' }
};

const CLOTHES = ['c_pink','c_mint','c_star','c_maid','c_hoodie','c_kimono','c_suit','c_fairy','c_gamer','c_vip','c_led'];
const SHOES   = ['s_white','s_boot','s_sneaker','s_led','s_checkin'];
const BAGS    = ['b_basic','b_star','b_led','b_vip','b_bunny'];
const CROP_IDS = ['carrot','wheat','tomato','corn','straw','pumpkin','sun','egg','melon','grape','peach'];
const FURN_IDS = ['flw','plant','chair','ted','tree','lamp','sofa','mirror','bed','tv','tent','fount','carou','ferris'];
const GOOD_IDS = ['silk','tea','pot','honey','gem'];
const ROLE_LV  = { player: 0, vip: 1, mod: 2, admin: 3, owner: 4 };

module.exports = { CUTE_TITLES, CLOTHES, SHOES, BAGS, CROP_IDS, FURN_IDS, GOOD_IDS, ROLE_LV };
