// Login and setup read the database and cookies on every request, so never prerender them.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
