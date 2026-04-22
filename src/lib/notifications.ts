import "server-only";
import { prisma } from "@/lib/prisma";
import type { NotificationType, Prisma } from "@prisma/client";

type CreateArgs = {
  userId: string;
  type: NotificationType;
  message: string;
  actionPrimary?: string | null;
  actionSecondary?: string | null;
  actionPayload?: Prisma.InputJsonValue | null;
};

export async function createNotification(args: CreateArgs) {
  return prisma.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      message: args.message,
      actionPrimary: args.actionPrimary ?? null,
      actionSecondary: args.actionSecondary ?? null,
      actionPayload: args.actionPayload ?? undefined,
    },
  });
}
