import { CreateDuelForm, type CreatePrefill } from "./create-form";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CreateArenaDuelPage({ searchParams }: PageProps<"/arena/create">) {
  const sp = await searchParams;
  const initial: CreatePrefill = {
    arena: one(sp.arena),
    window: one(sp.window),
    entry: one(sp.entry),
    opponent: one(sp.opponent),
  };
  return <CreateDuelForm initial={initial} />;
}
