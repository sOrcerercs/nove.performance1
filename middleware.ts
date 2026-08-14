import { NextResponse, type NextRequest } from 'next/server'

/**
 * Copies the query string into a request header so layouts can read it.
 *
 * Next does not pass `searchParams` to layouts, and the sidebar renders in the
 * layout while showing the same department percentages the page does. Without
 * this the two would compute from different ranges and disagree on the same
 * URL. A header is the only per-request channel a layout can read.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-search-params', request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Excludes only Next's own static assets, image optimisation and the
  // favicon — this still runs on every page, `/api/*` route, server-action
  // POST, `_next/data` request and anything under `public/`, not "only the
  // pages". Harmless everywhere it runs beyond the pages that actually render
  // this layout; narrowing further risks excluding a page by accident.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
