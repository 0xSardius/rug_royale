import { DuelRoom } from "./duel-room";

export default async function ArenaDuelPage({ params }: PageProps<"/arena/duel/[pot]">) {
  const { pot } = await params;
  return <DuelRoom address={pot} />;
}
