import { searchFlightOffers } from "@/modules/search/service";
import { getDatabase } from "@/server/db";
import { handleRouteError, ok } from "@/server/http/responses";
import { SystemClock, createFlightSearchProvider } from "@/server/integrations";

const clock = new SystemClock();
const flightSearch = createFlightSearchProvider();

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const result = await searchFlightOffers({ db: getDatabase(), flightSearch, clock }, params);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
