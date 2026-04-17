"use client";

import { useEffect, useState } from "react";
import { api, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter } from "next/navigation";

type UserRow = { id: string; username: string; globalRole: string };

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    api<{ users: UserRow[] }>("/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e) => handleApiAuthNavigation(router, e));
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Admin — users" />
        <div className="p-6 overflow-x-auto glass m-6">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="p-2">User</th>
                <th className="p-2">Role</th>
                <th className="p-2">Set role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-800/80">
                  <td className="p-2">{u.username}</td>
                  <td className="p-2">{u.globalRole}</td>
                  <td className="p-2">
                    <select
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                      defaultValue={u.globalRole}
                      onChange={async (e) => {
                        await api(`/admin/users/${u.id}/role`, {
                          method: "PATCH",
                          body: JSON.stringify({ globalRole: e.target.value }),
                        });
                        setUsers((prev) =>
                          prev.map((x) => (x.id === u.id ? { ...x, globalRole: e.target.value } : x))
                        );
                      }}
                    >
                      {["viewer", "officer", "evidence_tech", "command_staff", "super_admin"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
