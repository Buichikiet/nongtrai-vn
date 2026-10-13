'use strict';
/* Bot Discord Nông Trại: /setup all, ticket, điểm danh, báo cáo, role dễ thương */
const fs = require('fs'), path = require('path');
const { CUTE_TITLES } = require('./catalog');

module.exports = function start(ctx) {
  const {
    Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
    Events, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
    OverwriteType
  } = require('discord.js');

  const E = process.env;
  const list = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const OWNER_IDS = list(E.DISCORD_OWNER_IDS), ADMIN_IDS = list(E.DISCORD_ADMIN_IDS);
  const INVITE = E.DISCORD_INVITE || 'https://discord.gg/TZRfuhbqJA';
  const SETUP_F = path.join(ctx.DATA || path.join(__dirname, 'data'), 'discord-setup.json');
  const LV = { player: 0, vip: 1, mod: 2, admin: 3, owner: 4 };

  let setup = { guildId: '', channels: {}, roles: {}, cats: {} };
  try { setup = Object.assign(setup, JSON.parse(fs.readFileSync(SETUP_F, 'utf8'))); } catch (e) { /* mới */ }
  if (ctx.initialSetup) setup = Object.assign(setup, ctx.initialSetup);
  const saveSetup = () => {
    try { fs.writeFileSync(SETUP_F, JSON.stringify(setup, null, 2)); } catch (e) { /* bỏ */ }
    if (ctx.saveSetup) ctx.saveSetup(setup);
  };

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
      .concat((!ctx.privileged || ctx.privileged.content) ? [GatewayIntentBits.MessageContent] : [])
      .concat((!ctx.privileged || ctx.privileged.members) ? [GatewayIntentBits.GuildMembers] : []),
    partials: [Partials.Channel]
  });

  const cuteChoices = Object.entries(CUTE_TITLES).map(([id, t]) => ({ name: t.e + ' ' + t.n, value: id }));
  const permChoices = ['player', 'vip', 'mod', 'admin', 'owner'].map(r => ({ name: r, value: r }));
  const code = o => o.setName('ma').setDescription('Mã người chơi (6 ký tự)').setRequired(true);

  const defs = [
    new SlashCommandBuilder().setName('setup').setDescription('Cài đặt server Discord cho game')
      .addSubcommand(s => s.setName('all').setDescription('Tự tạo role, kênh, ticket, điểm danh, thông báo'))
      .addSubcommand(s => s.setName('role').setDescription('Tạo/cập nhật các role game + 15 role dễ thương'))
      .addSubcommand(s => s.setName('ticket').setDescription('Tạo panel ticket hỗ trợ')),
    new SlashCommandBuilder().setName('lock').setDescription('[Mod] Khoá kênh chat').addStringOption(o => o.setName('lydo').setDescription('Lý do')),
    new SlashCommandBuilder().setName('unlock').setDescription('[Mod] Mở khoá kênh'),
    new SlashCommandBuilder().setName('baocao').setDescription('Tố cáo người chơi / gửi đơn cho admin')
      .addStringOption(o => o.setName('noidung').setDescription('Nội dung tố cáo').setRequired(true))
      .addStringOption(o => o.setName('ma').setDescription('Mã người chơi (nếu có)')),
    new SlashCommandBuilder().setName('diemdanh').setDescription('Điểm danh bằng mã người chơi trong game (tự động +1 Lv)').addStringOption(code),
    new SlashCommandBuilder().setName('caprole').setDescription('[Admin] Cấp role dễ thương (chỉ admin)')
      .addUserOption(o => o.setName('thanhvien').setDescription('Thành viên Discord').setRequired(true))
      .addStringOption(o => o.setName('role').setDescription('Role dễ thương').setRequired(true).addChoices(...cuteChoices.slice(0, 25))),
    new SlashCommandBuilder().setName('lienket').setDescription('Liên kết Discord với tài khoản game').addStringOption(o => o.setName('ma').setDescription('Mã 6 số / mã người chơi').setRequired(true)),
    new SlashCommandBuilder().setName('xu').setDescription('[Admin] Cộng/trừ xu').addStringOption(code).addIntegerOption(o => o.setName('soluong').setDescription('Số xu (âm = trừ)').setRequired(true)),
    new SlashCommandBuilder().setName('vatpham').setDescription('[Admin] Tặng vật phẩm').addStringOption(code)
      .addStringOption(o => o.setName('loai').setDescription('Loại').setRequired(true).addChoices(
        { name: 'Hạt giống', value: 'seed' }, { name: 'Nông sản', value: 'crop' }, { name: 'Nội thất', value: 'furn' },
        { name: 'Hàng hóa', value: 'good' }, { name: 'Quần áo', value: 'cloth' }, { name: 'Giày', value: 'shoe' }, { name: 'Balo', value: 'bag' }))
      .addStringOption(o => o.setName('id').setDescription('ID vật phẩm').setRequired(true))
      .addIntegerOption(o => o.setName('soluong').setDescription('Số lượng').setRequired(true)),
    new SlashCommandBuilder().setName('thu').setDescription('[Admin] Gửi thư vào hòm thư').addStringOption(code)
      .addStringOption(o => o.setName('tieude').setDescription('Tiêu đề').setRequired(true))
      .addStringOption(o => o.setName('noidung').setDescription('Nội dung').setRequired(true))
      .addIntegerOption(o => o.setName('xu').setDescription('Xu đính kèm')),
    new SlashCommandBuilder().setName('role').setDescription('[Owner] Cấp quyền trong game').addStringOption(code)
      .addStringOption(o => o.setName('role').setDescription('Role quyền').setRequired(true).addChoices(...permChoices)),
    new SlashCommandBuilder().setName('danhhieu').setDescription('[Admin] Cấp danh hiệu dễ thương trong game').addStringOption(code)
      .addStringOption(o => o.setName('title').setDescription('Danh hiệu').setRequired(true).addChoices(...cuteChoices)),
    new SlashCommandBuilder().setName('kick').setDescription('[Mod] Đá người chơi').addStringOption(code),
    new SlashCommandBuilder().setName('ban').setDescription('[Admin] Khóa tài khoản').addStringOption(code),
    new SlashCommandBuilder().setName('unban').setDescription('[Admin] Mở khóa tài khoản').addStringOption(code),
    new SlashCommandBuilder().setName('mute').setDescription('[Mod] Cấm chat (0 = bỏ cấm)').addStringOption(code).addIntegerOption(o => o.setName('phut').setDescription('Số phút').setRequired(true)),
    new SlashCommandBuilder().setName('thongbao').setDescription('[Admin] Thông báo toàn server game').addStringOption(o => o.setName('noidung').setDescription('Nội dung').setRequired(true)),
    new SlashCommandBuilder().setName('thongtin').setDescription('[Mod] Xem thông tin người chơi').addStringOption(code),
    new SlashCommandBuilder().setName('online').setDescription('Xem ai đang online'),
    new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng cấp độ'),
    new SlashCommandBuilder().setName('huongdan').setDescription('Hướng dẫn chơi & link tải game'),
    // ====== LỆNH TẶNG / CẤP LEVEL ======
    new SlashCommandBuilder().setName('level').setDescription('[Admin] Đặt Level cho người chơi (1-99)')
      .addStringOption(code)
      .addIntegerOption(o => o.setName('level').setDescription('Level muốn đặt (1-99)').setRequired(true).setMinValue(1).setMaxValue(99)),
    new SlashCommandBuilder().setName('levelup').setDescription('[Mod] Tặng thêm Level cho người chơi')
      .addStringOption(code)
      .addIntegerOption(o => o.setName('soluong').setDescription('Số Level muốn tặng').setRequired(true).setMinValue(1).setMaxValue(99))
  ].map(c => c.toJSON());

  function actorRole(i) {
    let r = 'player';
    const up = x => { if (LV[x] > LV[r]) r = x; };
    if (OWNER_IDS.includes(i.user.id)) up('owner');
    if (ADMIN_IDS.includes(i.user.id)) up('admin');
    const roles = i.member && i.member.roles && i.member.roles.cache;
    if (roles) {
      if (setup.roles.owner && roles.has(setup.roles.owner)) up('owner');
      if (setup.roles.admin && roles.has(setup.roles.admin)) up('admin');
      if (setup.roles.mod && roles.has(setup.roles.mod)) up('mod');
      if (E.DISCORD_ADMIN_ROLE_ID && roles.has(E.DISCORD_ADMIN_ROLE_ID)) up('admin');
      if (E.DISCORD_MOD_ROLE_ID && roles.has(E.DISCORD_MOD_ROLE_ID)) up('mod');
    }
    try { up(ctx.roleOfDiscord(i.user.id)); } catch (e) { /* bỏ */ }
    return r;
  }
  const need = (i, lv) => (LV[actorRole(i)] || 0) >= lv;

  async function ensureRole(guild, key, name, color, hoist) {
    if (setup.roles[key]) {
      const ex = guild.roles.cache.get(setup.roles[key]);
      if (ex) return ex;
    }
    const found = guild.roles.cache.find(r => r.name === name);
    if (found) { setup.roles[key] = found.id; return found; }
    const role = await guild.roles.create({ name, color, hoist: !!hoist, mentionable: false, reason: 'Nông Trại setup' });
    setup.roles[key] = role.id;
    return role;
  }
  async function ensureCat(guild, key, name) {
    if (setup.cats[key]) {
      const ex = guild.channels.cache.get(setup.cats[key]);
      if (ex) return ex;
    }
    const found = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
    if (found) { setup.cats[key] = found.id; return found; }
    const cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: 'Nông Trại setup' });
    setup.cats[key] = cat.id;
    return cat;
  }
  async function ensureText(guild, key, name, parent, topic, staffOnly) {
    if (setup.channels[key]) {
      const ex = guild.channels.cache.get(setup.channels[key]);
      if (ex) return ex;
    }
    const found = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
    if (found) { setup.channels[key] = found.id; return found; }
    const staff = setup.roles.staff || setup.roles.admin;
    const overwrites = [
      { id: guild.id, type: OverwriteType.Role, deny: staffOnly ? [PermissionFlagsBits.ViewChannel] : [PermissionFlagsBits.MentionEveryone] }
    ];
    if (staffOnly && staff) {
      overwrites.push({ id: staff, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    if (setup.roles.admin) overwrites.push({ id: setup.roles.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] });
    if (setup.roles.owner) overwrites.push({ id: setup.roles.owner, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Administrator] });
    const ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parent && parent.id, topic, permissionOverwrites: overwrites, reason: 'Nông Trại setup' });
    setup.channels[key] = ch.id;
    return ch;
  }

  async function setupRoles(guild) {
    await ensureRole(guild, 'owner', '👑 OWNER', 0xe0457b, true);
    await ensureRole(guild, 'admin', '🛡️ ADMIN', 0xe03a3a, true);
    await ensureRole(guild, 'mod', '🔧 MOD', 0x2fa36b, true);
    await ensureRole(guild, 'vip', '💎 VIP', 0x9b5de5, true);
    await ensureRole(guild, 'staff', '📋 Staff', 0x5865f2, true);
    await ensureRole(guild, 'member', '🌱 Nông Dân', 0x7fe0b5, false);
    for (const [id, t] of Object.entries(CUTE_TITLES)) {
      await ensureRole(guild, 'cute_' + id, t.e + ' ' + t.n, parseInt(t.c.slice(1), 16) || 0xffb7d5, true);
    }
    saveSetup();
  }

  async function postTicketPanel(ch) {
    const emb = new EmbedBuilder().setColor(0xff8fb1).setTitle('🎫 Hỗ trợ Nông Trại')
      .setDescription('Bấm nút bên dưới để mở ticket. Admin **Bùi Chí Kiệt** và staff sẽ trả lời tại kênh riêng.\nDùng cho: lỗi game, mất đồ, xin hỗ trợ, góp ý.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('Mở ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );
    await ch.send({ embeds: [emb], components: [row] });
  }
  async function postCheckinPanel(ch) {
    const emb = new EmbedBuilder().setColor(0x7fe0b5).setTitle('📅 Điểm danh mỗi ngày')
      .setDescription('1. Vào game → copy **mã người chơi** 6 ký tự\n2. Bấm nút **Điểm danh** hoặc gõ `/diemdanh ma:XXXXXX`\n\nThưởng: **xu + giày + 1 Level** gửi vào hòm thư trong game.\nMỗi tài khoản 1 lần/ngày.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('checkin_modal').setLabel('Điểm danh').setStyle(ButtonStyle.Success).setEmoji('🎁')
    );
    await ch.send({ embeds: [emb], components: [row] });
  }
  async function postGuide(ch) {
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0xffd86b).setTitle('📖 Hướng dẫn chơi Nông Trại Vui Vẻ')
        .setDescription([
          '**Đăng nhập:** Google hoặc Discord ở sảnh — dữ liệu lưu theo tài khoản, đổi máy vẫn vào được.',
          '**Trồng trọt:** Chạm ô đất → xới → gieo hạt → tưới → thu hoạch.',
          '**Shop:** Cô Mía (hạt), Bác Mộc (nội thất), Chị Thời Trang (quần áo), Anh Bánh Xe (xe LED), Balo VIP.',
          '**Điểm danh:** Trong game hoặc kênh Discord — nhận xu, giày & 1 Level.',
          '**Bạn bè:** Gửi mã 6 ký tự cho bạn bè.',
          '**Ủng hộ:** MB Bank `00180599999998` — BUI CHI KIET',
          '**Admin:** Bùi Chí Kiệt',
          '**Discord:** ' + INVITE
        ].join('\n'))]
    });
  }
  async function postDownload(ch) {
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x79b8ff).setTitle('📱 Tải / chơi game')
        .setDescription('Mở trang game trên điện thoại → **Thêm vào màn hình chính** (PWA) để chơi như app.\nPC: mở trình duyệt vào địa chỉ server.\nHướng dẫn chi tiết: trang `/huong-dan.html` và `/tai-game.html` trên web game.')]
    });
  }

  async function setupAll(guild) {
    setup.guildId = guild.id;
    await setupRoles(guild);
    const catGame = await ensureCat(guild, 'game', '🌱 NÔNG TRẠI');
    const catSup = await ensureCat(guild, 'support', '🎫 HỖ TRỢ');
    const catAdm = await ensureCat(guild, 'admin', '🛡️ ADMIN');
    const thongbao = await ensureText(guild, 'thongbao', 'thong-bao', catGame, 'Thông báo game', false);
    await thongbao.permissionOverwrites.edit(guild.id, { SendMessages: false, ViewChannel: true });
    const diemdanh = await ensureText(guild, 'diemdanh', 'diem-danh', catGame, 'Điểm danh nhận quà', false);
    const chat = await ensureText(guild, 'chat', 'chat-the-gioi', catGame, 'Cầu nối chat với game', false);
    const huongdan = await ensureText(guild, 'huongdan', 'huong-dan', catGame, 'Hướng dẫn chơi', false);
    const taigame = await ensureText(guild, 'taigame', 'tai-game', catGame, 'Tải / cài game', false);
    const donate = await ensureText(guild, 'donate', 'ung-ho', catGame, 'Ủng hộ admin', false);
    const ticket = await ensureText(guild, 'ticket', 'tao-ticket', catSup, 'Mở ticket hỗ trợ', false);
    await ensureCat(guild, 'tickets', '📩 TICKET ĐANG MỞ');
    const baocao = await ensureText(guild, 'baocao', 'bao-cao', catAdm, 'Đơn tố cáo', true);
    const login = await ensureText(guild, 'login', 'dang-nhap', catAdm, 'Log đăng nhập thành viên', true);
    const staff = await ensureText(guild, 'staff', 'staff-chat', catAdm, 'Chat staff', true);
    saveSetup();
    await postTicketPanel(ticket);
    await postCheckinPanel(diemdanh);
    await postGuide(huongdan);
    await postDownload(taigame);
    await donate.send({
      embeds: [new EmbedBuilder().setColor(0xff8fb1).setTitle('💖 Ủng hộ Nông Trại')
        .setDescription('**MB Bank** `00180599999998`\n**BUI CHI KIET**\nCảm ơn bạn đã ủng hộ admin Bùi Chí Kiệt!')
        .setImage('https://img.vietqr.io/image/MB-00180599999998-compact2.png?accountName=BUI%20CHI%20KIET&addInfo=UNG%20HO%20NONG%20TRAI')]
    });
    await thongbao.send({ embeds: [new EmbedBuilder().setColor(0xff6f9a).setTitle('🌱 Server Nông Trại đã setup xong!')
      .setDescription('Chào mừng đến Nông Trại Vui Vẻ — Admin **Bùi Chí Kiệt**.\nVào Discord: ' + INVITE + '\nĐăng nhập Google/Discord trong game để lưu data.')] });
    return { thongbao, diemdanh, chat, huongdan, taigame, donate, ticket, baocao, login, staff };
  }

  async function openTicket(i) {
    const guild = i.guild;
    const catId = setup.cats.tickets;
    const name = ('ticket-' + i.user.username).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
    const exist = guild.channels.cache.find(c => c.parentId === catId && c.topic === 'ticket:' + i.user.id);
    if (exist) return i.reply({ content: 'Bạn đã có ticket: <#' + exist.id + '>', ephemeral: true });
    const staff = setup.roles.staff || setup.roles.admin;
    const ch = await guild.channels.create({
      name, type: ChannelType.GuildText, parent: catId || undefined, topic: 'ticket:' + i.user.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        ...(staff ? [{ id: staff, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }] : []),
        ...(setup.roles.admin ? [{ id: setup.roles.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }] : [])
      ]
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Nhận đơn').setStyle(ButtonStyle.Success).setEmoji('✋'),
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Đóng ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );
    await ch.send({
      content: `<@${i.user.id}> ${staff ? '<@&' + staff + '>' : ''}`,
      embeds: [new EmbedBuilder().setColor(0x7fe0b5).setTitle('Ticket mới')
        .setDescription('Mô tả vấn đề tại đây. Staff bấm **Nhận đơn** rồi trả lời. Đóng khi xong.')],
      components: [row]
    });
    await i.reply({ content: '✅ Đã mở ticket: <#' + ch.id + '>', ephemeral: true });
  }

  async function doCheckin(i, ma) {
    const r = ctx.checkinByCode ? ctx.checkinByCode(ma, i.user.id) : { ok:false, msg:'Chưa hỗ trợ' };
    return (r.ok ? '✅ ' : '❌ ') + r.msg;
  }

  // ====== SỰ KIỆN ======
  client.once(Events.ClientReady, async c => {
    console.log('════════════════════════════════════════');
    console.log('⭐⭐⭐⭐⭐ BOT DISCORD ĐÃ ONLINE ⭐⭐⭐⭐⭐');
    console.log('🤖 Tag:', c.user.tag);
    console.log('🆔 Bot ID:', c.user.id);
    console.log('📋 Số guild:', c.guilds.cache.size);
    console.log('📋 Guild IDs:', c.guilds.cache.map(g => g.id).join(', '));
    console.log('👥 Tổng user:', c.users.cache.size);
    console.log('════════════════════════════════════════');
    try {
      const rest = new REST({ version: '10' }).setToken(E.DISCORD_TOKEN);
      const gid = E.DISCORD_GUILD_ID || setup.guildId;
      const route = gid ? Routes.applicationGuildCommands(c.user.id, gid) : Routes.applicationCommands(c.user.id);
      await rest.put(route, { body: defs });
      console.log('✅ Đã đăng ký', defs.length, 'lệnh slash tại', gid ? 'guild ' + gid : 'global');
    } catch (e) { console.error('❌ Lỗi đăng ký lệnh:', e.message); }
  });

  client.on(Events.GuildMemberAdd, async m => {
    try {
      if (setup.roles.member) await m.roles.add(setup.roles.member, 'Thành viên mới Nông Trại');
      const ch = setup.channels.thongbao && await client.channels.fetch(setup.channels.thongbao).catch(() => null);
      if (ch) await ch.send({ content: `🌸 Chào mừng **${m.user.username}** vào nông trại! Hãy đọc <#${setup.channels.huongdan || ''}> và điểm danh tại <#${setup.channels.diemdanh || ''}>`, allowedMentions: { parse: [] } });
    } catch (e) { /* bỏ */ }
  });

  client.on(Events.InteractionCreate, async i => {
    console.log('📥 Interaction:', i.type, i.commandName || i.customId || 'unknown', '| user:', i.user?.username, '| guild:', i.guild?.name);
    try {
      if (!i.isButton() && !i.isModalSubmit() && !i.deferred && !i.replied && i.isChatInputCommand()) {
        try { await i.deferReply({ ephemeral: true }); } catch (e) { /* bỏ */ }
      }

      if (i.isButton()) {
        if (i.customId === 'ticket_open') return openTicket(i);
        if (i.customId === 'ticket_claim') {
          if (!need(i, 2)) return i.reply({ content: 'Chỉ staff/mod nhận đơn.', ephemeral: true });
          await i.reply({ content: `✋ **${i.user.username}** đã nhận ticket này.` });
          return;
        }
        if (i.customId === 'ticket_close') {
          if (!need(i, 2) && !(i.channel.topic || '').includes(i.user.id)) return i.reply({ content: 'Không đủ quyền đóng.', ephemeral: true });
          await i.reply('🔒 Đóng ticket sau 3s...');
          setTimeout(() => i.channel.delete('Đóng ticket').catch(() => {}), 3000);
          return;
        }
        if (i.customId === 'report_claim') {
          if (!need(i, 2)) return i.reply({ content: 'Chỉ staff nhận đơn tố cáo.', ephemeral: true });
          await i.update({ content: i.message.content + `\n✅ **${i.user.username}** đã nhận đơn.`, components: [] }).catch(() => i.reply({ content: 'Đã nhận đơn.', ephemeral: true }));
          return;
        }
        if (i.customId === 'checkin_modal') {
          const modal = new ModalBuilder().setCustomId('checkin_form').setTitle('Điểm danh Nông Trại');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('ma').setLabel('Mã người chơi 6 ký tự').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8)
          ));
          return i.showModal(modal);
        }
      }
      if (i.isModalSubmit() && i.customId === 'checkin_form') {
        if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
        const msg = await doCheckin(i, i.fields.getTextInputValue('ma'));
        return i.editReply(msg);
      }
      if (!i.isChatInputCommand()) return;
      const n = i.commandName, g = k => i.options.get(k) && i.options.get(k).value;
      if (n === 'setup') {
        if (!need(i, 4) && !i.memberPermissions.has(PermissionFlagsBits.Administrator)) {
          return i.editReply({ content: '❌ Chỉ Owner/Admin server dùng /setup' });
        }
        const sub = i.options.getSubcommand();
        if (sub === 'role') { await setupRoles(i.guild); return i.editReply('✅ Đã setup role (quyền + 15 role dễ thương). Dùng `/caprole` để cấp — chỉ admin.'); }
        if (sub === 'ticket') {
          const ch = setup.channels.ticket ? await i.guild.channels.fetch(setup.channels.ticket) : i.channel;
          await postTicketPanel(ch);
          return i.editReply('✅ Đã gửi panel ticket.');
        }
        await setupAll(i.guild);
        return i.editReply('✅ **Setup all xong!** Đã tạo role, kênh thông báo, điểm danh, hướng dẫn, tải game, ủng hộ, ticket, báo cáo, log đăng nhập.');
      }
      const actor = { role: actorRole(i), label: 'Discord:' + i.user.username };
      let msg;

      // ====== LỆNH LEVEL ======
      if (n === 'level') {
        const r = ctx.adminDo(actor, 'setlevel', { target: g('ma'), amount: g('level') });
        msg = (r.ok ? '✅ ' : '❌ ') + r.msg;
      } else if (n === 'levelup') {
        const r = ctx.adminDo(actor, 'addlevel', { target: g('ma'), amount: g('soluong') });
        msg = (r.ok ? '✅ ' : '❌ ') + r.msg;
      }
      // ====== CÁC LỆNH KHÁC ======
      else if (n === 'lock') {
        if (!need(i, 2)) msg = '❌ Cần MOD+';
        else {
          await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: false });
          await i.channel.send('🔒 Kênh đã khoá' + (g('lydo') ? ' — ' + g('lydo') : '') + ' bởi **' + i.user.username + '**');
          msg = '✅ Đã khoá kênh';
        }
      } else if (n === 'unlock') {
        if (!need(i, 2)) msg = '❌ Cần MOD+';
        else {
          await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: null });
          await i.channel.send('🔓 Kênh đã mở lại.');
          msg = '✅ Đã mở kênh';
        }
      } else if (n === 'baocao') {
        const chId = setup.channels.baocao;
        if (!chId) { msg = '❌ Chưa /setup all'; }
        else {
          const ch = await client.channels.fetch(chId);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('report_claim').setLabel('Nhận đơn tố cáo').setStyle(ButtonStyle.Primary).setEmoji('📥'));
          await ch.send({
            embeds: [new EmbedBuilder().setColor(0xe03a3a).setTitle('🚨 Đơn tố cáo mới')
              .addFields(
                { name: 'Người gửi', value: `${i.user.tag} (${i.user.id})` },
                { name: 'Mã mục tiêu', value: String(g('ma') || '(không có)') },
                { name: 'Nội dung', value: String(g('noidung')).slice(0, 1000) }
              ).setTimestamp()],
            components: [row]
          });
          msg = '✅ Đã gửi tố cáo cho admin. Staff sẽ nhận đơn tại kênh báo cáo.';
        }
      } else if (n === 'diemdanh') {
        msg = await doCheckin(i, g('ma'));
      } else if (n === 'caprole') {
        if (!need(i, 3)) msg = '❌ Chỉ ADMIN+ mới cấp role dễ thương';
        else {
          const user = i.options.getUser('thanhvien');
          const tid = g('role');
          const rid = setup.roles['cute_' + tid];
          const t = CUTE_TITLES[tid];
          if (!rid) msg = '❌ Chưa /setup role';
          else {
            const mem = await i.guild.members.fetch(user.id);
            await mem.roles.add(rid, 'Admin cấp role dễ thương');
            const linked = ctx.setTitleByDiscord ? ctx.setTitleByDiscord(user.id, tid) : null;
            msg = `✅ Đã cấp ${t.e} **${t.n}** cho ${user.username}` + (linked ? ' (đã đồng bộ vào game)' : ' (chưa liên kết game)');
          }
        }
      } else if (n === 'lienket') {
        const u = ctx.linkDiscord ? ctx.linkDiscord(g('ma'), i.user.id) : null;
        if (u && setup.roles.member) {
          try { await i.member.roles.add(setup.roles.member); } catch (e) { /* */ }
          if (u.role === 'vip' && setup.roles.vip) try { await i.member.roles.add(setup.roles.vip); } catch (e) { /* */ }
        }
        msg = u ? `✅ Đã liên kết **${u.name}** [${u.code}]` : '❌ Mã sai hoặc hết hạn. Vào Cài đặt / sảnh game copy mã.';
      } else if (n === 'huongdan') {
        msg = '📖 Đọc kênh hướng dẫn trong server, hoặc mở `/huong-dan.html` trên web game.\nDiscord: ' + INVITE;
      } else if (n === 'online') {
        const o = ctx.online();
        msg = `🟢 Online **${o.length}**\n` + (o.slice(0, 25).map(p => `• ${p.name} [${p.code}] Lv.${p.lv}`).join('\n') || '(không có ai)');
      } else if (n === 'top') {
        msg = '🏆 **Top**\n' + ctx.top(10).map((p, k) => `${k + 1}. ${p.name} — Lv.${p.lv} — ${p.coins.toLocaleString('vi')} xu`).join('\n');
      } else {
        const map = {
          xu: ['coins', { target: g('ma'), amount: g('soluong') }],
          vatpham: ['item', { target: g('ma'), item: g('loai') + ':' + g('id'), amount: g('soluong') }],
          thu: ['mail', { target: g('ma'), title: g('tieude'), text: g('noidung'), amount: g('xu') }],
          role: ['setrole', { target: g('ma'), role: g('role') }],
          danhhieu: ['settitle', { target: g('ma'), title: g('title') }],
          kick: ['kick', { target: g('ma') }], ban: ['ban', { target: g('ma') }], unban: ['unban', { target: g('ma') }],
          mute: ['mute', { target: g('ma'), minutes: g('phut') }],
          thongbao: ['announce', { text: g('noidung') }],
          thongtin: ['info', { target: g('ma') }]
        }[n];
        if (!map) { msg = '❌ Lệnh không hỗ trợ'; }
        else {
          const r = ctx.adminDo(actor, map[0], map[1]);
          msg = (r.ok ? '✅ ' : '❌ ') + r.msg;
        }
      }
      if (i.deferred || i.replied) await i.editReply({ content: msg || 'OK', allowedMentions: { parse: [] } });
      else await i.reply({ content: msg || 'OK', ephemeral: true, allowedMentions: { parse: [] } });
    } catch (e) {
      console.error('❌ Lỗi xử lý interaction:', e);
      try { if (i.deferred || i.replied) await i.editReply('❌ Lỗi: ' + e.message); else await i.reply({ content: '❌ ' + e.message, ephemeral: true }); } catch (x) { /* */ }
    }
  });

  const chatCh = () => setup.channels.chat || E.DISCORD_CHAT_CHANNEL_ID || '';
  client.on(Events.MessageCreate, m => {
    const ch = chatCh();
    if (!ch || m.author.bot || m.channelId !== ch || !m.content) return;
    ctx.chatFromDiscord((m.member && m.member.displayName) || m.author.username, m.content);
  });

  const post = async (id, text, extra) => {
    if (!id) return;
    try {
      const ch = await client.channels.fetch(id);
      await ch.send(Object.assign({ content: String(text).slice(0, 1900), allowedMentions: { parse: [] } }, extra || {}));
    } catch (e) { /* bỏ */ }
  };
  ctx.setBridge({
    chat: (name, role, text) => post(chatCh(), `${role && role !== 'player' ? '[' + role + '] ' : ''}**${name}**: ${text}`),
    announce: text => post(setup.channels.thongbao || chatCh(), '📢 **Thông báo game:** ' + text),
    login: (u, method) => post(setup.channels.login, `🔐 **${u.name}** [${u.code}] đăng nhập bằng **${method}** — ${u.email || u.sub}\nRole: ${u.role}${u.title ? ' • ' + u.title : ''}`),
    checkin: (u, msg) => post(setup.channels.diemdanh, `🎁 **${u.name}** [${u.code}] ${msg}`)
  });
  ctx.getSetup = () => setup;

  // ====== LOG DEBUG SHARD / WEBSOCKET ======
  client.on(Events.Error, e => console.error('🤖 Discord client error:', e.message));
  client.on(Events.Warn, w => console.warn('🤖 Discord warn:', w));
  client.on(Events.ShardError, e => console.error('🤖 Discord shard error:', e.message));
  client.on(Events.ShardDisconnect, (ev, id) => console.warn('🤖 Shard', id, 'mất kết nối, code', ev && ev.code));
  client.on(Events.ShardReconnecting, id => console.log('🔄 Shard', id, 'đang kết nối lại...'));
  client.on(Events.ShardResume, (id, replayed) => console.log('▶️ Shard', id, 'resumed,', replayed, 'events'));
  client.on(Events.ShardReady, id => console.log('🔗 Shard', id, 'READY!'));
  client.on(Events.Debug, m => {
    if (/Gateway|WebSocket|Connecting|Handshake|Identifying|Session/i.test(m)) {
      console.log('🐛', m.slice(0, 200));
    }
  });

  console.log('════════════════════════════════════════');
  console.log('🤖 Đang đăng nhập bot Discord...');
  console.log('🔑 Token dài:', E.DISCORD_TOKEN ? E.DISCORD_TOKEN.length : 0, 'ký tự');
  console.log('📡 Intents:', client.options.intents.toArray().join(', '));
  console.log('════════════════════════════════════════');

  // ====== LOGIN VỚI AUTO-RETRY ======
  let retry = 0;
  function tryLogin() {
    client.login(E.DISCORD_TOKEN)
      .then(() => console.log('✅ client.login() resolved! Bot Discord đang chạy.'))
      .catch(e => {
        console.error('❌ Bot Discord KHÔNG đăng nhập được:', e.message);
        if (e.message.includes('disallowed intents')) {
          console.error('👉 Bật Message Content Intent + Server Members Intent tại https://discord.com/developers/applications');
        }
        if (e.message.includes('TokenInvalid')) {
          console.error('👉 Token sai — Reset Token trong Developer Portal → Bot');
        }
        retry++;
        if (retry < 3) {
          console.log(`🔁 Thử lại login lần ${retry}/3 sau 5 giây...`);
          setTimeout(tryLogin, 5000);
        } else {
          console.error('❌ Đã thử login 3 lần, bỏ cuộc.');
        }
      });
  }
  tryLogin();
};
