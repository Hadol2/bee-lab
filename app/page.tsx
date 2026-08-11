import QuizApp from "./quiz-app";
import { auth } from "../lib/auth/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  return (
    <QuizApp
      initialUser={user ? { displayName: user.name || user.email || "회원" } : null}
    />
  );
}
