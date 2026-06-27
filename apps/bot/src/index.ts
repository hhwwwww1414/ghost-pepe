import { Bot, InlineKeyboard, type Context } from 'grammy';
import { getConfig, loadEnv } from '@ghostpepe/config';
import { formatBytes } from '@ghostpepe/shared';
import { api } from './api-client.js';

loadEnv();
const cfg = getConfig();

if (!cfg.TELEGRAM_BOT_TOKEN || cfg.TELEGRAM_BOT_TOKEN.startsWith('000000')) {
  // Mock mode: no real token. The API + admin still work; bot stays idle.
  // eslint-disable-next-line no-console
  console.log('[bot] TELEGRAM_BOT_TOKEN not set — bot runs in mock/idle mode. Set it in .env.local to go live.');
  // Keep the process alive so docker-compose doesn't flap.
  setInterval(() => undefined, 1 << 30);
} else {
  startBot();
}

function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💳 Купить подписку', 'buy').row()
    .text('📋 Моя подписка', 'sub').text('📱 Устройства', 'devices').row()
    .text('🔌 Подключить устройство', 'connect').row()
    .text('ℹ️ Инструкция', 'help').text('🆘 Поддержка', 'support');
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU');
}

async function startBot(): Promise<void> {
  const bot = new Bot(cfg.TELEGRAM_BOT_TOKEN);

  bot.command('start', async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(`Добро пожаловать в ${cfg.APP_NAME}!\n\nВыберите действие:`, { reply_markup: mainMenu() });
  });

  bot.command('terms', (ctx) => ctx.reply('Правила сервиса: используйте VPN законно. Возвраты по запросу в поддержку.'));

  bot.callbackQuery('support', (ctx) => ctx.answerCallbackQuery().then(() => ctx.reply(`Поддержка: ${cfg.HAPP_SUPPORT_URL}`)));
  bot.callbackQuery('help', (ctx) =>
    ctx.answerCallbackQuery().then(() =>
      ctx.reply('1. Купите подписку.\n2. Откройте «Подключить устройство».\n3. Нажмите кнопку своей платформы — подписка импортируется в Happ.'),
    ),
  );

  // ── Buy: list plans ──────────────────────────────────────────────────────
  bot.callbackQuery('buy', async (ctx) => {
    await ctx.answerCallbackQuery();
    const plans = await api.plans();
    const kb = new InlineKeyboard();
    for (const p of plans) {
      kb.text(`${p.title} — ${p.starsPrice} ⭐`, `plan:${p.code}`).row();
    }
    await ctx.reply('Выберите тариф:', { reply_markup: kb });
  });

  // ── Buy: create + send Stars invoice ─────────────────────────────────────
  bot.callbackQuery(/^plan:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const planCode = ctx.match[1]!;
    const telegramId = BigInt(ctx.from!.id);
    await ensureUser(ctx);
    const intent = await api.createIntent(telegramId, planCode);
    // Telegram Stars: currency XTR, empty provider token.
    await ctx.api.sendInvoice(
      ctx.chat!.id,
      intent.title,
      intent.description,
      intent.invoicePayload,
      cfg.STARS_CURRENCY, // 'XTR'
      intent.prices,
      { provider_token: cfg.STARS_PROVIDER_TOKEN }, // empty string for Stars
    );
  });

  // pre_checkout — must answer within 10s (docs 06 §13.1).
  bot.on('pre_checkout_query', async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    try {
      const { ok } = await api.preCheckout(payload);
      await ctx.answerPreCheckoutQuery(ok, ok ? undefined : 'Счёт недействителен. Создайте новый.');
    } catch {
      await ctx.answerPreCheckoutQuery(false, 'Ошибка проверки платежа.');
    }
  });

  // successful_payment — the ONLY place access is granted.
  bot.on('message:successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    const telegramId = BigInt(ctx.from!.id);
    const result = await api.successful({
      telegramId,
      invoicePayload: sp.invoice_payload,
      telegramPaymentChargeId: sp.telegram_payment_charge_id,
      providerPaymentChargeId: sp.provider_payment_charge_id ?? null,
      rawUpdate: sp,
    });
    const kb = new InlineKeyboard().url('🔌 Подключить устройство', result.importPageUrl);
    await ctx.reply('✅ Оплата прошла! Подписка активирована.\n\nНажмите кнопку ниже, чтобы подключить устройство:', { reply_markup: kb });
  });

  // ── My subscription ──────────────────────────────────────────────────────
  bot.callbackQuery('sub', async (ctx) => {
    await ctx.answerCallbackQuery();
    const sub = await api.subscription(BigInt(ctx.from!.id));
    if (!sub.hasSubscription) {
      return ctx.reply('У вас пока нет подписки.', { reply_markup: new InlineKeyboard().text('💳 Купить подписку', 'buy') });
    }
    const used = BigInt(sub.trafficUsedBytes ?? '0');
    const limit = BigInt(sub.trafficLimitBytes ?? '0');
    const traffic = limit > 0n ? `${formatBytes(used)} из ${formatBytes(limit)}` : `${formatBytes(used)} (безлимит)`;
    const kb = new InlineKeyboard()
      .url('🔌 Подключить устройство', sub.importPageUrl ?? cfg.PUBLIC_BASE_URL).row()
      .text('📱 Устройства', 'devices').text('💳 Продлить', 'buy');
    await ctx.reply(
      `Статус: ${sub.status}\nТариф: ${sub.plan}\nДействует до: ${fmtDate(sub.expiresAt)}\nИспользовано: ${traffic}\nУстройства: ${sub.deviceCount} из ${sub.deviceLimit}`,
      { reply_markup: kb },
    );
  });

  bot.callbackQuery('connect', async (ctx) => {
    await ctx.answerCallbackQuery();
    const sub = await api.subscription(BigInt(ctx.from!.id));
    if (!sub.hasSubscription || !sub.importPageUrl) {
      return ctx.reply('Сначала купите подписку.', { reply_markup: new InlineKeyboard().text('💳 Купить подписку', 'buy') });
    }
    await ctx.reply('Откройте страницу подключения и выберите своё устройство:', {
      reply_markup: new InlineKeyboard().url('🔌 Открыть страницу подключения', sub.importPageUrl),
    });
  });

  // ── Devices ──────────────────────────────────────────────────────────────
  bot.callbackQuery('devices', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = BigInt(ctx.from!.id);
    const devices = await api.devices(telegramId);
    if (devices.length === 0) return ctx.reply('Нет подключённых устройств.');
    const kb = new InlineKeyboard();
    let text = `Устройства: ${devices.filter((d) => d.status === 'active').length} из 5\n\n`;
    devices.forEach((d, i) => {
      text += `${i + 1}. ${d.name} • ${d.status === 'active' ? 'активно' : d.status} • ${d.lastSeenAt ? fmtDate(d.lastSeenAt) : 'не подключалось'}\n`;
      if (d.status === 'active') kb.text(`Отключить: ${d.name}`, `disable:${d.id}`).row();
    });
    await ctx.reply(text, { reply_markup: kb });
  });

  bot.callbackQuery(/^disable:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const deviceId = ctx.match[1]!;
    const kb = new InlineKeyboard().text('Да, отключить', `disable_yes:${deviceId}`).text('Отмена', 'devices');
    await ctx.reply('Вы точно хотите отключить устройство? VPN на нём перестанет работать.', { reply_markup: kb });
  });

  bot.callbackQuery(/^disable_yes:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const deviceId = ctx.match[1]!;
    await api.disableDevice(BigInt(ctx.from!.id), deviceId);
    await ctx.reply('Устройство отключено.');
  });

  async function ensureUser(ctx: Context): Promise<void> {
    if (!ctx.from) return;
    await api.upsertUser({
      telegramId: BigInt(ctx.from.id),
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null,
      lastName: ctx.from.last_name ?? null,
      languageCode: ctx.from.language_code ?? null,
    });
  }

  bot.catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[bot] error', err.error);
  });

  await bot.api.setMyCommands([
    { command: 'start', description: 'Открыть меню' },
    { command: 'terms', description: 'Правила сервиса' },
  ]);

  await bot.start({ onStart: (i) => console.log(`[bot] @${i.username} started (polling)`) });
}
