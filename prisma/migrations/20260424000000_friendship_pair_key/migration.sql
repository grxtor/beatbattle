ALTER TABLE "Friendship" ADD COLUMN "pairKey" TEXT;

UPDATE "Friendship"
SET "pairKey" =
  CASE
    WHEN "requesterId" < "addresseeId" THEN "requesterId" || ':' || "addresseeId"
    ELSE "addresseeId" || ':' || "requesterId"
  END;

DELETE FROM "Friendship" f
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "pairKey"
      ORDER BY
        CASE status
          WHEN 'ACCEPTED' THEN 0
          WHEN 'PENDING' THEN 1
          ELSE 2
        END,
        "createdAt"
    ) AS rn
  FROM "Friendship"
) d
WHERE f.id = d.id AND d.rn > 1;

ALTER TABLE "Friendship" ALTER COLUMN "pairKey" SET NOT NULL;

CREATE UNIQUE INDEX "Friendship_pairKey_key" ON "Friendship"("pairKey");
