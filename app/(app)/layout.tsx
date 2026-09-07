import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header session={session.user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
