import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Return a pack with its sample list + current-user ownership status. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/shop/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const packId = Number(id);
  if (!Number.isInteger(packId)) {
    return NextResponse.json({ error: "invalid pack" }, { status: 400 });
  }

  const pack = await prisma.shopPack.findUnique({
    where: { id: packId },
    include: {
      sampleList: {
        orderBy: { orderIdx: "asc" },
        select: { id: true, name: true, duration: true, audioUrl: true },
      },
    },
  });
  if (!pack) return NextResponse.json({ error: "pack not found" }, { status: 404 });

  const owned = await prisma.userPack.findUnique({
    where: { userId_packId: { userId: session.user.id, packId: pack.id } },
    select: { userId: true },
  });

  return NextResponse.json({ pack, owned: !!owned });
}
