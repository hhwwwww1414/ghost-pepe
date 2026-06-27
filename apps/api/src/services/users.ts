import { prisma } from '@ghostpepe/db';

export interface UpsertUserInput {
  telegramId: bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
}

/** Upsert a Telegram user + telegram_accounts record. */
export async function upsertUser(input: UpsertUserInput) {
  const user = await prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: {
      username: input.username ?? undefined,
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      languageCode: input.languageCode ?? undefined,
    },
    create: {
      telegramId: input.telegramId,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      languageCode: input.languageCode ?? null,
      status: 'active',
    },
  });
  await prisma.telegramAccount.upsert({
    where: { userId: user.id },
    update: { username: input.username ?? undefined, languageCode: input.languageCode ?? undefined },
    create: { userId: user.id, telegramId: input.telegramId, username: input.username ?? null, languageCode: input.languageCode ?? null },
  });
  return user;
}

export async function findUserByTelegramId(telegramId: bigint) {
  return prisma.user.findUnique({ where: { telegramId } });
}
