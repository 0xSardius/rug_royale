import { DuelView } from "./duel-view";

export default async function DuelPage({ params }: PageProps<"/duel/[address]">) {
  const { address } = await params;
  return <DuelView address={address} />;
}
