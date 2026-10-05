import type { ReactNode } from "react";
import { Card, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Skeleton className="h-12 w-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-3 bg-muted">
      <h2 className="text-xl font-black uppercase">{title}</h2>
      <p className="max-w-prose text-sm">{body}</p>
      {action}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-3 bg-rug text-rug-foreground">
      <h2 className="text-xl font-black uppercase">Couldn&apos;t load</h2>
      <p className="max-w-prose text-sm">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </Card>
  );
}
