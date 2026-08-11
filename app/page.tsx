import QuizApp from "./quiz-app";
import { getChatGPTUser } from "./chatgpt-auth";

export default async function Home() {
  const user = await getChatGPTUser();
  return <QuizApp initialUser={user ? { displayName: user.displayName } : null} />;
}
