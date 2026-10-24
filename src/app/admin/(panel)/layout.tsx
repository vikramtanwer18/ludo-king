import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { navCounts } from "@/server/adminWallet";
import { logoutAction } from "../actions";
import AdminNav from "@/components/admin/AdminNav";
import { LogoMark } from "@/components/ui";
import { APP } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const counts = await navCounts();

  const signOut = (
    <form action={logoutAction}>
      <button className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
        <LogOut size={16} /> Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-screen bg-ink p-5">
        <Link href="/admin" className="flex items-center gap-2.5 text-white">
          <LogoMark />
          <span className="font-display font-bold text-lg leading-tight">{APP.name}<br /><span className="text-white/60 text-sm font-medium">Admin</span></span>
        </Link>
        <AdminNav counts={counts} />
        <div className="mt-auto space-y-3">
          <div className="text-white">
            <p className="font-medium">{admin.name}</p>
            <p className="text-sm text-white/60 truncate">{admin.email}</p>
          </div>
          {signOut}
          <Link href="/" className="block text-sm text-white/60 hover:text-white">Open player app</Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="lg:hidden bg-ink text-white sticky top-0 z-30">
          <div className="flex items-center gap-2 px-4 h-14">
            <LogoMark size={26} />
            <span className="font-display font-bold">Admin</span>
            <span className="ml-auto">{signOut}</span>
          </div>
          <AdminNav counts={counts} mobile />
        </header>
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
