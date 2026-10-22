import { router } from "@/server/trpc/trpc";
import { roastRouter } from "./roast";
import { cuppingRouter } from "./cupping";
import { subscriptionRouter } from "./subscription";

export const appRouter = router({
  roast: roastRouter,
  cupping: cuppingRouter,
  subscription: subscriptionRouter,
});

export type AppRouter = typeof appRouter;
