import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import ShopGrid from "./ShopGrid";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const me = await requireUser();

  const [packs, ownedIds] = await Promise.all([
    prisma.shopPack.findMany({ orderBy: { id: "asc" } }),
    prisma.userPack
      .findMany({ where: { userId: me.id }, select: { packId: true } })
      .then((rows) => new Set(rows.map((r) => r.packId))),
  ]);

  const data = packs.map((p) => ({
    id: p.id,
    name: p.name,
    genre: p.genre,
    samples: p.samples,
    price: p.price,
    icon: p.icon,
    isNew: p.isNew,
    unlockLvl: p.unlockLvl,
    owned: ownedIds.has(p.id),
  }));

  return (
    <AppShell active="shop" showFriends showRooms>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
          <ShopGrid packs={data} userLevel={me.level} userCurrency={me.currency} />
        </div>
      </Sketch>
    </AppShell>
  );
}
