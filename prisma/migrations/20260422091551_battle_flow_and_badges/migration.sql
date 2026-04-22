/*
  Warnings:

  - You are about to drop the column `status` on the `Room` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "RoomPhase" AS ENUM ('LOBBY', 'REVEAL', 'PRODUCTION', 'UPLOAD', 'VOTING', 'RESULTS', 'CANCELLED');

-- DropIndex
DROP INDEX "Room_status_privacy_idx";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionPayload" JSONB;

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "status",
ADD COLUMN     "phase" "RoomPhase" NOT NULL DEFAULT 'LOBBY',
ADD COLUMN     "phaseEndsAt" TIMESTAMP(3),
ADD COLUMN     "revealSec" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "samples" JSONB,
ADD COLUMN     "uploadSec" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "votingSec" INTEGER NOT NULL DEFAULT 60;

-- DropEnum
DROP TYPE "RoomStatus";

-- CreateTable
CREATE TABLE "BattleResult" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "trackScore" INTEGER NOT NULL DEFAULT 0,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT,
    "unlockLvl" INTEGER,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" TEXT NOT NULL,
    "badgeId" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateIndex
CREATE INDEX "BattleResult_userId_createdAt_idx" ON "BattleResult"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BattleResult_roomId_userId_key" ON "BattleResult"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- CreateIndex
CREATE INDEX "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");

-- CreateIndex
CREATE INDEX "Room_phase_privacy_idx" ON "Room"("phase", "privacy");

-- AddForeignKey
ALTER TABLE "BattleResult" ADD CONSTRAINT "BattleResult_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleResult" ADD CONSTRAINT "BattleResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
