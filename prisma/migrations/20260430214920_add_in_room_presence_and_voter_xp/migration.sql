-- AlterTable
ALTER TABLE "BattleResult" ADD COLUMN     "voterXp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "extendedSec" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RoomPlayer" ADD COLUMN     "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "RoomPlayer_roomId_lastPingAt_idx" ON "RoomPlayer"("roomId", "lastPingAt");
